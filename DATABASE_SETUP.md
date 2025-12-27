# Database Setup Guide

## Prerequisites

- PostgreSQL 12 or higher installed
- Node.js 18 or higher
- npm packages installed

## Step 1: Create Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create the database
CREATE DATABASE docgen;

# Exit psql
\q
```

## Step 2: Run Database Schema

```bash
# Run schema creation
psql -U postgres -d docgen -f database/schema.sql
```

You should see output like:
```
CREATE EXTENSION
CREATE TABLE
CREATE INDEX
...
```

## Step 3: Seed Initial Data

```bash
# Create initial superadmin user
psql -U postgres -d docgen -f database/seeds.sql
```

This creates:
- Username: `admin`
- Password: `admin123`
- Role: `superadmin`

**⚠️ IMPORTANT: Change this password immediately in production!**

## Step 4: Verify Setup

```bash
# Connect to database
psql -U postgres -d docgen

# Check tables
\dt

# You should see:
# - users
# - refresh_tokens
# - templates
# - audit_logs
# - render_history

# Check admin user
SELECT username, email, role, active FROM users;

# Exit
\q
```

## Step 5: Configure Environment (Optional)

Create `.env` file to override defaults:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=docgen
DB_USER=postgres
DB_PASSWORD=postgres
DB_POOL_SIZE=20

# JWT Secrets (CHANGE THESE IN PRODUCTION!)
JWT_ACCESS_SECRET=your-super-secret-access-token-key
JWT_REFRESH_SECRET=your-super-secret-refresh-token-key

# Server
PORT=3000
HOST=0.0.0.0
```

## Step 6: Start the Application

```bash
npm run build
npm run dev
```

Check logs for:
```
✅ Database connected successfully
🗄️  Database initialization successful
📊 Connected to: docgen@localhost:5432
🚀 DOCX Template Engine running at http://0.0.0.0:3000
```

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**: PostgreSQL is not running. Start it:
```bash
# Linux
sudo systemctl start postgresql

# macOS
brew services start postgresql
```

### Authentication Failed

```
Error: password authentication failed for  user "postgres"
```

**Solution**: Update password in config or .env file

### Database Does Not Exist

```
Error: database "docgen" does not exist
```

**Solution**: Create the database first (Step 1)

### Permission Denied

```
ERROR: permission denied to create extension "uuid-ossp"
```

**Solution**: Run as superuser:
```bash
psql -U postgres -d docgen -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
```

## Next Steps

1. Login to web interface with admin/admin123
2. Change admin password via API
3. Create additional users with appropriate roles
4. Test authentication and authorization

## Security Checklist

- [ ] Change default admin password
- [ ] Update JWT secrets in production
- [ ] Use environment variables for all secrets
- [ ] Enable SSL/TLS for database connections
- [ ] Regular backup schedule configured
- [ ] Audit logs monitored

## Database Maintenance

### Backup

```bash
pg_dump -U postgres doc gen > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
psql -U postgres -d docgen < backup_20250126.sql
```

### Clean old refresh tokens

```sql
DELETE FROM refresh_tokens WHERE expires_at < NOW();
```

### View audit statistics

```sql
SELECT action, COUNT(*) as count
FROM audit_logs
GROUP BY action
ORDER BY count DESC;
```
