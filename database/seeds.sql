-- Seed initial superadmin user
-- Password: admin123 (CHANGE THIS IN PRODUCTION!)
-- Bcrypt hash with 12 rounds

-- Note: The password hash below is for 'admin123'
-- Generate new hash in production with: bcrypt.hash('your-password', 12)

INSERT INTO users (username, email, password_hash, role, active)
VALUES (
    'admin',
    'admin@docgen.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5jtRKL.HvJi1K', -- admin123
    'superadmin',
    true
);

-- Verify the insert
SELECT 
    id,
    username,
    email,
    role,
    active,
    created_at
FROM users
WHERE username = 'admin';
