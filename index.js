const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- Inisialisasi Server (Express + Socket.IO) ---
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');

// Konfigurasi Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // Izinkan semua untuk kemudahan (bisa diganti http://localhost:3000 atau alamat frontend Anda)
        methods: ["GET", "POST"]
    }
});

const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// --- KONEKSI DATABASE ---
// Ganti 'agate' dan '1@#$Ajasaru' dengan user dan password MySQL Anda
const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'agate',
    password: '1@#$Ajasaru',
    database: 'skripsi_iot_db'
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Successfully connected to skripsi_iot_db! 🔌');
});

// --- KUNCI JWT ---
const JWT_SECRET = 'INI_ADAH_KUNCI_RAHASIA_SAYA_UNTUK_SKRIPSI_2025'; // Ganti dengan kunci rahasia Anda sendiri

// --- MIDDLEWARE OTORISASI ---
const autentikasiToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = user;
        next();
    });
};

// (Ini untuk Socket.IO) Daftar user yang sedang online
const userSockets = {}; // { userId: socketId }

// --- ENDPOINT AUTENTIKASI ---

// 1. REGISTER
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ status: 'error', message: 'Username, email, dan password wajib diisi' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)';
        db.query(query, [username, email, hashedPassword], (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ status: 'error', message: 'Username atau Email sudah terdaftar' });
                }
                console.error('Error saat registrasi:', err);
                return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
            }
            res.status(201).json({ status: 'success', message: 'User berhasil terdaftar!' });
        });
    } catch (error) {
        console.error('Error saat hashing password:', error);
        res.status(500).json({ status: 'error', message: 'Server error saat memproses password' });
    }
});

// 2. LOGIN
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan Password wajib diisi' });
    }
    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ message: 'Username atau Password salah' });
        }
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Username atau Password salah' });
        }
        const token = jwt.sign(
            { userId: user.user_id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ message: 'Login berhasil!', token: token });
    });
});

// --- ENDPOINT DEVICES ---

// Mendaftarkan device baru
app.post('/api/devices', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const { device_name } = req.body;
    if (!device_name) {
        return res.status(400).json({ message: 'Nama perangkat wajib diisi' });
    }
    const apiKey = 'skripsi-key-' + Date.now().toString(36) + Math.random().toString(36).substring(2);
    const query = 'INSERT INTO devices (user_id, device_name, api_key) VALUES (?, ?, ?)';
    db.query(query, [userId, device_name, apiKey], (err, results) => {
        if (err) {
            console.error('Error registering device:', err);
            return res.status(500).json({ message: 'Gagal mendaftarkan device' });
        }
        res.status(201).json({ message: 'Device berhasil terdaftar', apiKey: apiKey });
    });
});

// Mengambil daftar device
app.get('/api/devices', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    // PERBAIKAN: Tambahkan 'public_slug' di sini
    const query = 'SELECT device_id, device_name, public_slug FROM devices WHERE user_id = ?';

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching devices:', err);
            return res.status(500).json({ message: 'Gagal mengambil data device' });
        }
        res.json(results);
    });
});

// Menghapus perangkat
app.delete('/api/devices/:id', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const deviceId = req.params.id;
    const query = 'DELETE FROM devices WHERE device_id = ? AND user_id = ?';
    db.query(query, [deviceId, userId], (err, results) => {
        if (err) {
            console.error('Error deleting device:', err);
            return res.status(500).json({ message: 'Gagal menghapus perangkat' });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Perangkat tidak ditemukan' });
        }
        res.status(200).json({ message: 'Perangkat (dan semua data terkait) berhasil dihapus' });
    });
});


// --- ENDPOINT DATA SENSOR ---

// 1. Menerima data (UNTUK ESP32) dan Mengirim Perintah Balik
app.post('/api/data', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const { sensor_type, value } = req.body;
    if (!apiKey || !sensor_type || value == null) {
        return res.status(400).json({ message: 'x-api-key, sensor_type, dan value wajib diisi' });
    }

    // Ambil device_id DAN user_id
    const queryDevice = 'SELECT device_id, user_id FROM devices WHERE api_key = ?';
    db.query(queryDevice, [apiKey], (err, devices) => {
        if (err || devices.length === 0) {
            return res.status(401).json({ message: 'API Key tidak valid' });
        }

        const deviceId = devices[0].device_id;
        const userId = devices[0].user_id;

        // --- INI PERBAIKANNYA ---
        // Simpan data sensor ke database HANYA jika BUKAN "check_command"
        let queryInsert = '';
        // Ganti 'toggle_control' menjadi 'check_command'
        if (sensor_type !== 'check_command') {
            queryInsert = 'INSERT INTO sensor_data (device_id, sensor_type, value) VALUES (?, ?, ?)';
        }
        // --- AKHIR PERBAIKAN ---

        const dbCallback = (errInsert, resultsInsert) => {
            // Hanya log error jika memang ada query insert yang dijalankan
            if (errInsert && queryInsert !== '') {
                console.error('Error saving sensor data:', errInsert);
                // Jangan hentikan proses jika gagal simpan, tetap kirim perintah
            }

            // (REAL-TIME) Push data baru ke Dashboard (jika ada data sensor asli)
            if (queryInsert !== '') { // Hanya push jika BUKAN check_command
                const dataBaru = {
                    device_id: deviceId,
                    sensor_type: sensor_type,
                    value: value,
                    timestamp: new Date().toISOString()
                };

                // Kirim ke semua tab user (room user:<userId>)
                io.to(`user:${userId}`).emit('newData', dataBaru);

                // Juga kirim ke public viewers jika device memiliki public_slug
                db.query('SELECT public_slug FROM devices WHERE device_id = ?', [deviceId], (errSlug, rowsSlug) => {
                    if (!errSlug && rowsSlug && rowsSlug.length > 0 && rowsSlug[0].public_slug) {
                        const publicSlug = rowsSlug[0].public_slug;
                        io.to(`public:${publicSlug}`).emit('publicNewData', dataBaru);
                    }
                });
            }


            // (KONTROL 2 ARAH) Ambil Perintah untuk ESP32 (Ini tetap berjalan)
            const queryCommands = "SELECT sensor_type, current_value FROM widgets WHERE device_id = ? AND widget_type = 'toggle'";
            db.query(queryCommands, [deviceId], (errCmd, commands) => {
                if (errCmd) {
                    console.error('Error fetching commands for ESP32:', errCmd);
                    return res.status(201).json({ message: 'Data check received (no commands)' }); // Respon berbeda untuk check
                }

                // Kirim respons DAN perintah balik ke ESP32
                res.status(201).json({
                    message: (queryInsert !== '') ? 'Data sensor saved' : 'Data check received', // Sesuaikan pesan
                    commands: commands
                });
            });
        };

        // Jalankan query insert hanya jika perlu
        if (queryInsert !== '') {
            db.query(queryInsert, [deviceId, sensor_type, String(value)], dbCallback);
        } else {
            dbCallback(null, null); // Langsung panggil callback jika tidak ada insert
        }

    });
});

// 2. Mengambil data (UNTUK DASHBOARD - 24 jam terakhir)
app.get('/api/data', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const query = `
      SELECT sd.sensor_type, sd.value, sd.timestamp, d.device_id
      FROM sensor_data AS sd
      JOIN devices AS d ON sd.device_id = d.device_id
      WHERE d.user_id = ? AND sd.timestamp >= NOW() - INTERVAL 1 DAY
      ORDER BY sd.timestamp ASC;
    `;
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching data:', err);
            return res.status(500).json({ message: 'Gagal mengambil data' });
        }
        res.json(results);
    });
});

// 3. Mengambil data 2 kolom untuk CSV (Sesuai permintaan terakhir Anda)
app.get('/api/data/device/:id', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const deviceId = req.params.id;

    const query = `
        SELECT sd.timestamp, sd.sensor_type, sd.value
        FROM sensor_data AS sd
        JOIN devices AS d ON sd.device_id = d.device_id
        WHERE sd.device_id = ? AND d.user_id = ?
        ORDER BY sd.timestamp DESC;
    `;
    db.query(query, [deviceId, userId], (err, results) => {
        if (err) {
            console.error('Error fetching device data for CSV:', err);
            return res.status(500).json({ message: 'Gagal mengambil data' });
        }
        res.json(results);
    });
});


// --- ENDPOINT WIDGETS ---

// 1. Membuat widget baru (termasuk toggle)
app.post('/api/widgets', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const { device_id, sensor_type, widget_type, data_type } = req.body;
    if (!device_id || !sensor_type || !widget_type || !data_type) {
        return res.status(400).json({ message: 'Semua field wajib diisi' });
    }

    // Nilai default untuk toggle adalah 'false'
    const defaultValue = (widget_type === 'toggle') ? 'false' : '';

    const query = 'INSERT INTO widgets (user_id, device_id, sensor_type, widget_type, data_type, current_value) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(query, [userId, device_id, sensor_type, widget_type, data_type, defaultValue], (err, results) => {
        if (err) {
            console.error('Error creating widget:', err);
            return res.status(500).json({ message: 'Gagal membuat widget' });
        }
        res.status(201).json({ message: 'Widget berhasil dibuat!', widgetId: results.insertId });
    });
});

// 2. Mengambil semua widget (termasuk current_value)
app.get('/api/widgets', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const query = `
      SELECT w.widget_id, w.device_id, w.sensor_type, w.widget_type,
             w.data_type, w.current_value, d.device_name
      FROM widgets AS w
      JOIN devices AS d ON w.device_id = d.device_id
      WHERE w.user_id = ?;
    `;
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching widgets:', err);
            return res.status(500).json({ message: 'Gagal mengambil widgets' });
        }
        res.json(results);
    });
});

// 3. Menghapus widget
app.delete('/api/widgets/:id', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const widgetId = req.params.id;
    const query = 'DELETE FROM widgets WHERE widget_id = ? AND user_id = ?';
    db.query(query, [widgetId, userId], (err, results) => {
        if (err) {
            console.error('Error deleting widget:', err);
            return res.status(500).json({ message: 'Gagal menghapus widget' });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Widget tidak ditemukan' });
        }
        res.status(200).json({ message: 'Widget berhasil dihapus' });
    });
});


// --- LOGIKA REAL-TIME WEBSOCKET ---
io.on('connection', (socket) => {
    console.log('Seorang user/penonton public terhubung:', socket.id);

    // Terima koneksi jika salah satu tersedia:
    // - token (authenticated user/tab)
    // - slug (public view; tidak perlu token)
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const slug = (socket.handshake.auth && socket.handshake.auth.slug) || (socket.handshake.query && socket.handshake.query.slug);

    let socketUserId = null; // Jika user terautentikasi

    if (!token && !slug) {
        console.log("Koneksi ditolak: Tidak ada token atau slug");
        return socket.disconnect();
    }

    // Jika koneksi public (slug) -> join ke room public:<slug>
    if (slug && !token) {
        const room = `public:${slug}`;
        socket.join(room);
        console.log(`Public viewer bergabung ke ${room} (${socket.id})`);
    }

    // Jika ada token -> verifikasi, simpan user socket dan join ke room user:<userId>
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                console.log("Koneksi ditolak: Token tidak valid");
                return socket.disconnect();
            }

            console.log(`User ${user.username} (ID: ${user.userId}) terhubung`);
            // simpan satu socket ID terakhir (juga menggunakan room untuk multi-tab)
            userSockets[user.userId] = socket.id;
            socketUserId = user.userId;
            socket.join(`user:${user.userId}`);
        });
    }

    // 2. Listener untuk perintah dari Toggle
    socket.on('widgetStateChange', (data) => {
        // data = { widgetId: 123, newState: "true" }

        if (!socketUserId) {
            return console.log("Perintah ditolak: socket tidak terautentikasi");
        }

        const { widgetId, newState } = data;

        // Update nilai di database
        // Kita juga cek user_id untuk keamanan
        const query = "UPDATE widgets SET current_value = ? WHERE widget_id = ? AND user_id = ?";
        db.query(query, [newState, widgetId, socketUserId], (err, results) => {
            if (err || results.affectedRows === 0) {
                return console.log(`Gagal update state untuk widget ${widgetId}`);
            }

            // Sukses update DB: kirim update ke semua browser milik user ini (termasuk yang baru saja mengklik)
            const updateData = {
                widget_id: widgetId,
                current_value: newState
            };

            // Emisi ke room user untuk mendukung multi-tab (user:<userId>)
            io.to(`user:${socketUserId}`).emit('widgetStateUpdated', updateData);

            // --- Juga notifikasi untuk public viewers (jika perangkat punya public_slug)
            // Ambil public_slug dan sensor_type dari widget -> device
            const queryPub = `SELECT d.public_slug, w.sensor_type FROM widgets w JOIN devices d ON w.device_id = d.device_id WHERE w.widget_id = ?`;
            db.query(queryPub, [widgetId], (errPub, pubRows) => {
                if (!errPub && pubRows && pubRows.length > 0) {
                    const { public_slug, sensor_type } = pubRows[0];
                    if (public_slug) {
                        // Kirim event khusus public sehingga public-view bisa update in-place
                        io.to(`public:${public_slug}`).emit('publicWidgetUpdated', { widget_id: widgetId, sensor_type: sensor_type, current_value: newState });
                    }
                } else if (errPub) {
                    console.error('Error fetching public slug for widget update:', errPub);
                }
            });
        });
    });

    // 3. Listener saat disconnect
    socket.on('disconnect', () => {
        console.log('User terputus:', socket.id);
        if (socketUserId) {
            delete userSockets[socketUserId]; // Hapus dari daftar online
        }
    });
});

app.get('/api/public/data', (req, res) => {
    const { username, device_name } = req.query;

    if (!username || !device_name) {
        return res.status(400).json({ message: 'Username dan device_name wajib diisi' });
    }

    // 1. Cari device_id berdasarkan username & device_name
    // Kita perlu JOIN tabel users dan devices
    const queryDevice = `
        SELECT d.device_id, d.device_name
        FROM devices d
        JOIN users u ON d.user_id = u.user_id
        WHERE u.username = ? AND d.device_name = ?
    `;

    db.query(queryDevice, [username, device_name], (err, devices) => {
        if (err) {
            console.error('Error public device lookup:', err);
            return res.status(500).json({ message: 'Server error' });
        }
        if (devices.length === 0) {
            return res.status(404).json({ message: 'Perangkat tidak ditemukan atau user salah' });
        }

        const deviceId = devices[0].device_id;

        // 2. Ambil Widget (untuk tahu tipe grafik apa yang harus ditampilkan)
        const queryWidgets = `
            SELECT sensor_type, widget_type, data_type, current_value 
            FROM widgets 
            WHERE device_id = ?
        `;

        // 3. Ambil Data Sensor (24 jam terakhir)
        const queryData = `
            SELECT sensor_type, value, timestamp 
            FROM sensor_data 
            WHERE device_id = ? AND timestamp >= NOW() - INTERVAL 1 DAY 
            ORDER BY timestamp ASC
        `;

        // Eksekusi query widget & data secara paralel (sederhana)
        db.query(queryWidgets, [deviceId], (errW, widgets) => {
            if (errW) return res.status(500).json({ message: 'Error fetching widgets' });

            db.query(queryData, [deviceId], (errD, sensorData) => {
                if (errD) return res.status(500).json({ message: 'Error fetching data' });

                // Kirim paket lengkap untuk publik
                res.json({
                    device_info: devices[0],
                    widgets: widgets,
                    data: sensorData
                });
            });
        });
    });
});


// --- FITUR SHARE / PUBLIC VIEW ---

// 1. Serve File HTML Public saat URL '/nama_custom' diakses
// Ini membuat URL terlihat profesional: http://ip:3001/kebunku
app.get('/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public-view.html'));
});

// 2. API untuk menyimpan Custom URL (Slug)
app.post('/api/devices/share', autentikasiToken, (req, res) => {
    const userId = req.user.userId;
    const { device_id, custom_slug } = req.body;

    // Validasi format slug (hanya huruf, angka, strip)
    const slugRegex = /^[a-zA-Z0-9-_]+$/;
    if (!slugRegex.test(custom_slug)) {
        return res.status(400).json({ message: 'Nama URL hanya boleh huruf, angka, dan tanda strip (-).' });
    }

    // Update database
    const query = 'UPDATE devices SET public_slug = ? WHERE device_id = ? AND user_id = ?';
    db.query(query, [custom_slug, device_id, userId], (err, results) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: 'Nama URL ini sudah dipakai orang lain. Pilih nama lain.' });
            }
            return res.status(500).json({ message: 'Gagal menyimpan URL.' });
        }
        res.json({ message: 'URL publik berhasil dibuat!', url: `/${custom_slug}` });
    });
});

// 3. API Publik untuk mengambil data berdasarkan Slug
app.get('/api/public/view/:slug', (req, res) => {
    const slug = req.params.slug;

    // Cari device berdasarkan slug
    const queryDevice = 'SELECT device_id, device_name FROM devices WHERE public_slug = ?';

    db.query(queryDevice, [slug], (err, devices) => {
        if (err || devices.length === 0) {
            return res.status(404).json({ message: 'Halaman tidak ditemukan.' });
        }

        const deviceId = devices[0].device_id;
        const deviceName = devices[0].device_name;

        // Ambil Widgets
        const queryWidgets = "SELECT sensor_type, widget_type, data_type, current_value FROM widgets WHERE device_id = ?";

        // Ambil Data Sensor Terakhir (agar grafik tidak kosong)
        const queryData = "SELECT sensor_type, value, timestamp FROM sensor_data WHERE device_id = ? AND timestamp >= NOW() - INTERVAL 1 DAY ORDER BY timestamp ASC";

        db.query(queryWidgets, [deviceId], (errW, widgets) => {
            if (errW) return res.status(500).json({ message: 'Error widgets' });

            db.query(queryData, [deviceId], (errD, sensorData) => {
                if (errD) return res.status(500).json({ message: 'Error data' });

                res.json({
                    device_id: deviceId, // <--- TAMBAHKAN INI
                    device_name: deviceName,
                    widgets: widgets,
                    data: sensorData
                });
            });
        });
    });
});

// --- Jalankan Server ---
server.listen(port, '0.0.0.0', () => {
    console.log(`Server (Express + Socket.IO) berjalan di http://localhost:${port}`);
});
