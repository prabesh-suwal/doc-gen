# DocGen Deployment Guide

## Prerequisites
- Linux server (Ubuntu 20.04+ recommended)
- Node.js 18+ installed
- PostgreSQL 14+ installed and running
- LibreOffice installed (for PDF conversion)
- OnlyOffice Document Server (optional, for in-browser editing)

---

## Step 1: Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install LibreOffice
sudo apt install -y libreoffice

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
```

---

## Step 2: Setup PostgreSQL Database

```bash
# Switch to postgres user
sudo -u postgres psql

# In psql shell:
CREATE DATABASE docgen;
CREATE USER docgen_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE docgen TO docgen_user;
\q
```

---

## Step 3: Transfer Application Files

```bash
# On your local machine, create a deployment package
cd /home/prabesh/1work/doc-gen
tar -czvf docgen.tar.gz dist/ public/ package.json package-lock.json .env.example

# Transfer to server
scp docgen.tar.gz user@your-server:/opt/
```

---

## Step 4: Setup Application on Server

```bash
# On the server
cd /opt
tar -xzvf docgen.tar.gz
mkdir -p docgen && mv dist public package*.json .env.example docgen/
cd docgen

# Install production dependencies
npm ci --omit=dev

# Create directories
mkdir -p storage/templates output tmp/onlyoffice-editing
```

---

## Step 5: Configure Environment

```bash
# Copy and edit .env
cp .env.example .env
nano .env
```

**Update these values in `.env`:**
```env
# Server
PORT=3000
HOST=0.0.0.0
BASE_URL=http://your-server-ip:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=docgen
DB_USER=docgen_user
DB_PASSWORD=your_secure_password

# JWT (generate secure random strings!)
JWT_ACCESS_SECRET=generate-a-64-char-random-string
JWT_REFRESH_SECRET=generate-another-64-char-random-string

# OnlyOffice (if using)
ONLYOFFICE_ENABLED=true
ONLYOFFICE_URL=http://your-server-ip:8080
ONLYOFFICE_CALLBACK_URL=http://your-server-ip:3000/api/editor/callback
```

---

## Step 6: Setup Process Manager (PM2)

```bash
# Install PM2
sudo npm install -g pm2

# Start application
pm2 start dist/index.js --name docgen

# Save PM2 configuration
pm2 save

# Setup auto-start on boot
pm2 startup
# Run the command it outputs
```

---

## Step 7: Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/docgen
```

**Nginx config:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/docgen /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 8: Setup OnlyOffice (Optional)

```bash
# Using Docker
docker run -d --name onlyoffice \
  -p 8080:80 \
  -v /app/onlyoffice/data:/var/www/onlyoffice/Data \
  onlyoffice/documentserver
```

---

## Step 9: Verify Deployment

```bash
# Check if running
pm2 status

# Check logs
pm2 logs docgen

# Test health endpoint
curl http://localhost:3000/health
```

---

## Quick Reference Commands

| Action | Command |
|--------|---------|
| View logs | `pm2 logs docgen` |
| Restart app | `pm2 restart docgen` |
| Stop app | `pm2 stop docgen` |
| View status | `pm2 status` |
| Update app | See "Updating" section below |

---

## Updating the Application

```bash
# On local machine
npm run build
tar -czvf docgen-update.tar.gz dist/ public/

# On server
cd /opt/docgen
pm2 stop docgen
tar -xzvf docgen-update.tar.gz
pm2 restart docgen
```
