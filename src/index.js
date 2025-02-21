const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const BEARER_TOKEN = process.env.BEARER_TOKEN; // Ambil token dari .env

// Middleware untuk autentikasi Bearer Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ success: false, message: "Token diperlukan!" });

    const token = authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
    console.log(token, BEARER_TOKEN)
    if (token !== BEARER_TOKEN) return res.status(403).json({ success: false, message: "Token tidak valid!" });

    next(); // Lanjut ke endpoint
};

let qrCodeGlobal = null;
let isAuthenticated = false;

// Inisialisasi client WhatsApp dengan LocalAuth
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    }
});


// Event ketika QR Code muncul (hanya untuk login pertama kali)
client.on('qr', (qr) => {
    console.log('QR Code tersedia. Scan untuk login.');
    qrCodeGlobal = qr;
    isAuthenticated = false;
});

// Event saat bot berhasil login
client.on('ready', () => {
    console.log('Bot WhatsApp sudah siap!');
    qrCodeGlobal = null; // Reset QR setelah login
    isAuthenticated = true;
});

// Event saat autentikasi berhasil
client.on('authenticated', () => {
    console.log('Autentikasi berhasil!');
    isAuthenticated = true;
});

client.on('disconnected', (reason) => {
    console.log('Client terputus:', reason);
    isAuthenticated = false;
    client.destroy();
    client.initialize();
});


// Event saat autentikasi gagal
client.on('auth_failure', (msg) => {
    console.error('Autentikasi gagal:', msg);
    qrCodeGlobal = null;
    isAuthenticated = false;
});

// Endpoint untuk mendapatkan QR Code (tampilkan dalam bentuk gambar base64)
app.get('/get-qr', authenticateToken, async (req, res) => {
    if (!qrCodeGlobal) {
        return res.status(400).json({ success: false, message: 'QR Code tidak tersedia atau sudah login.' });
    }

    const qrImage = await qrcode.toDataURL(qrCodeGlobal);
    res.json({ success: true, qr: qrImage });
});

// Endpoint untuk cek status login
app.get('/status', authenticateToken, (req, res) => {
    res.json({ success: true, message: isAuthenticated ? 'Bot sudah terhubung' : 'Belum login' });
});

// Endpoint untuk mengirim pesan
app.post('/send-message', authenticateToken, async (req, res) => {
    const { number, message } = req.body;
    const chatId = `${number}@c.us`;

    try {
        await client.sendMessage(chatId, message);
        res.json({ success: true, message: 'Pesan terkirim!' });
    } catch (error) {
        res.json({ success: false, error: error.toString() });
    }
});

app.get('/logout', authenticateToken, async (req, res) => {
    try {
        await client.logout();
        isAuthenticated = false;
        qrCodeGlobal = null;
        res.json({ success: true, message: 'Bot berhasil logout. Silakan restart untuk mendapatkan QR baru.' });
    } catch (error) {
        res.json({ success: false, message: 'Gagal logout.', error: error.toString() });
    }
});


// Jalankan server sebelum inisialisasi client
app.listen(3000, '0.0.0.0', () => {
    console.log('Server berjalan di http://0.0.0.0:3000');
    client.initialize();
});