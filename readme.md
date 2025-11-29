IoT Monitoring & Control Dashboard (Skripsi)
Proyek ini adalah platform IoT berbasis web yang memungkinkan pengguna untuk memantau data sensor dan mengontrol aktuator secara real-time. Sistem ini dibangun menggunakan Node.js (Backend), MySQL (Database), dan HTML/JS Native (Frontend).

📋 Prasyarat (System Requirements)
Sebelum memulai, pastikan laptop/server Anda (Lubuntu/Ubuntu) sudah terinstall paket berikut:

Node.js & NPM (Runtime JavaScript)

MySQL Server (Database)

Git (Version Control)

Jika belum, jalankan perintah ini di terminal:

```bash
sudo apt update
sudo apt install nodejs npm mysql-server git -y
```

🚀 Langkah Instalasi (Dari Awal)
Ikuti langkah-langkah ini secara berurutan.

Ambil kode program dari GitHub ke komputer lokal Anda.

```bash
cd ~/Documents
git clone https://github.com/agateboy/skripsi.git
cd skripsi
```

IoT Monitoring & Control Dashboard

Deskripsi
Proyek ini adalah platform IoT berbasis web untuk memantau data sensor dan mengontrol aktuator secara real-time. Backend dibuat dengan Node.js, database menggunakan MySQL, dan frontend berupa file HTML/JavaScript statis.

Prasyarat
- **Node.js & NPM:** runtime JavaScript
- **MySQL Server:** database
- **Git:** version control

Jika belum terpasang (Ubuntu/Lubuntu), jalankan:

```bash
sudo apt update
sudo apt install nodejs npm mysql-server git -y
```

Instalasi (Singkat)
1. Clone repository:

```bash
cd ~/Documents
git clone https://github.com/agateboy/skripsi.git
cd skripsi
```

2. Install dependencies backend:

```bash
npm install
```

Setup Database (MySQL)
Masuk ke MySQL sebagai root lalu jalankan perintah SQL berikut.

```sql
-- 1. Buat database
CREATE DATABASE IF NOT EXISTS skripsi_iot_db;

-- 2. Buat user (samakan dengan konfigurasi di index.js)
CREATE USER IF NOT EXISTS 'agate'@'localhost' IDENTIFIED WITH mysql_native_password BY '1@#$Ajasaru';
GRANT ALL PRIVILEGES ON skripsi_iot_db.* TO 'agate'@'localhost';
FLUSH PRIVILEGES;

-- 3. Gunakan database
USE skripsi_iot_db;

-- 4. Tabel users
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel devices
CREATE TABLE IF NOT EXISTS devices (
    device_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 6. Tabel sensor_data
CREATE TABLE IF NOT EXISTS sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    value VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- 7. Tabel widgets
CREATE TABLE IF NOT EXISTS widgets (
    widget_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    device_id INT NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    widget_type ENUM('graph','gauge','toggle') NOT NULL,
    data_type ENUM('float','integer','boolean') NOT NULL,
    current_value VARCHAR(255) DEFAULT 'false',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
ALTER TABLE devices ADD COLUMN public_slug VARCHAR(100) UNIQUE DEFAULT NULL;
ALTER TABLE `widgets` MODIFY COLUMN `widget_type` ENUM('graph', 'gauge', 'toggle', 'slider') NOT NULL;
);

-- Keluar
EXIT;
```

Catatan konfigurasi IP
- Jika hanya diakses dari mesin yang sama, gunakan `localhost`.
- Jika ingin diakses dari perangkat lain di jaringan, ganti alamat backend di `login.html`, `register.html`, dan `dashboard.html` dari `http://localhost:3001` menjadi `http://<IP_LAPTOP>:3001` (misal `http://192.168.1.10:3001`).

Menjalankan Aplikasi
Anda biasanya membutuhkan dua terminal terpisah.

- Backend (API server):

```bash
# dari folder proyek
node index.js
```

Periksa log untuk pesan seperti `Server berjalan...` dan `Successfully connected to skripsi_iot_db!`.

- Frontend (layanan file statis):

```bash
# dari folder proyek
npx http-server -p 3000 -c-1
```

- Akses UI di browser:

```text
http://localhost:3000/login.html
```

Simulasi Data (tanpa ESP32)
Kirim data palsu ke endpoint API untuk menguji real-time update (ganti `MASUKKAN_API_KEY_DISINI`):

```bash
curl -X POST http://localhost:3001/api/data \
    -H "Content-Type: application/json" \
    -H "x-api-key: MASUKKAN_API_KEY_DISINI" \
    -d '{"sensor_type":"suhu","value":28.5}'
```

Troubleshooting (Masalah Umum)
- Error `connect ECONNREFUSED ::1:3306`: MySQL mungkin mencoba koneksi IPv6. Pastikan pada `index.js` host MySQL diatur ke `127.0.0.1` bukan `localhost`.
- Error `Client does not support authentication`: ubah plugin auth MySQL untuk user:

```sql
ALTER USER 'agate'@'localhost' IDENTIFIED WITH mysql_native_password BY '1@#$Ajasaru';
```
- Halaman web kosong / fetch gagal: pastikan backend (`node index.js`) berjalan tanpa error.

Kontak & Catatan
- File utama backend: `index.js`
- File frontend: file HTML/JS di root proyek (`login.html`, `dashboard.html`, dll.)

Jika mau, saya bisa:
- Menjalankan aplikasi dan memverifikasi koneksi (jika Anda ingin saya jalankan perintah), atau
- Menambahkan contoh konfigurasi `env` bila `index.js` memakai variabel lingkungan.

Terima kasih — semoga dokumentasi ini lebih mudah diikuti.