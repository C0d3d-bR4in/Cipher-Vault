# 🔐 CipherVault

> Client-side file encryption • Zero-knowledge • No server uploads

CipherVault is a privacy-focused, browser-based encryption toolkit that allows users to securely encrypt and decrypt files directly in their browser. All cryptographic operations are performed client-side — no files are uploaded to any server.

---

## 🚀 Features

### 🔒 Encrypt
- AES-256-GCM file encryption
- Password-based key derivation
- Secure encrypted file download
- 100% in-browser processing

### 🔓 Decrypt
- Unlock `.vault` files using password
- Integrity verification via GCM authentication
- Zero server interaction

### 🧪 Advanced Lab
- Steganography module
- Challenge mode
- Multi-layer encryption
- Experimental cryptographic tools

### 📝 Text Vault
- Encrypted notepad
- Write → Lock → Download
- Decrypt later with password

### 🗂 Dual Vault (CVLT v2)
- Dual-container encryption
- Plausible deniability architecture
- Hidden secure compartment
- Designed for advanced threat scenarios

---

## 🛡 Security Model

CipherVault is built with a zero-knowledge architecture.

- AES-256-GCM encryption
- PBKDF2 / Argon2-based key derivation (configurable)
- Random salt and IV per encryption
- Authenticated encryption (tamper protection)
- No telemetry
- No tracking
- No server uploads

All cryptographic operations are performed using the Web Crypto API inside the browser.

---

## 🧠 How It Works

1. Select a file to encrypt or decrypt
2. Enter your secret password
3. Processing happens entirely in-browser
4. Download the processed file

---

## 🏗 Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Web Crypto API
- Client-side Blob processing
- Static architecture (no backend required)

---

## 📦 Installation Guide

CipherVault runs as a static website.

### Option 1: Clone and Run Locally

```bash
git clone https://github.com/yourusername/ciphervault.git
cd ciphervault

Then simply open:

```bash
index.html

Or use a local server (recommended):

npx serve .
Option 2: Deploy to Static Hosting

CipherVault works on:

GitHub Pages

Vercel

Netlify

Cloudflare Pages

Any static hosting provider

No server configuration required.

📁 Project Structure
ciphervault/
│
├── index.html
├── encrypt.html
├── decrypt.html
├── advanced-lab/
├── text-vault/
├── dual-vault/
├── assets/
│   ├── css/
│   ├── js/
│   └── icons/
└── README.md
⚠️ Important Notes

If password is lost, encrypted files cannot be recovered.

Always verify file integrity after decryption.

For maximum security:

Use strong passwords (12+ characters)

Avoid reusing passwords

Store backups securely

🔍 Threat Model Overview

CipherVault protects against:

Cloud storage breaches

Server-side compromise

Passive network surveillance

Unauthorized file inspection

CipherVault does NOT protect against:

Malware on your device

Keyloggers

Weak passwords

Physical device compromise

🧪 Advanced Features Overview
Steganography

Hide encrypted data inside image files.

Multi-Layer Encryption

Apply multiple encryption layers for high-security scenarios.

Plausible Deniability

Dual Vault allows decoy and hidden vault containers.

🤝 Contributing

Contributions are welcome.

Fork the repository

Create feature branch

Commit changes

Open Pull Request

📜 License

MIT License

👤 Author

Developed by [MD Sakibul Islam Sheikh]

⭐ Support

If you find this project useful, consider starring the repository.
