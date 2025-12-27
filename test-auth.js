#!/usr/bin/env node

/**
 * Test Authentication Flow
 * Quick script to test user login and authentication
 */

const API_URL = 'http://localhost:3000';

async function testAuth() {
    console.log('🧪 Testing Authentication Flow\n');

    try {
        // Test 1: Login with default admin user
        console.log('1️⃣  Testing login with admin/admin123...');
        const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123',
            }),
        });

        if (!loginResponse.ok) {
            const error = await loginResponse.json();
            console.error('❌ Login failed:', error);
            return;
        }

        const { accessToken, refreshToken, user } = await loginResponse.json();
        console.log('✅ Login successful!');
        console.log('   User:', user.username, `(${user.role})`);
        console.log('   Access Token:', accessToken.substring(0, 20) + '...');
        console.log('');

        // Test 2: Get current user info
        console.log('2️⃣  Testing /api/auth/me with access token...');
        const meResponse = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!meResponse.ok) {
            console.error('❌ Failed to get user info');
            return;
        }

        const meData = await meResponse.json();
        console.log('✅ Got user info:', meData.username, meData.email);
        console.log('');

        // Test 3: Refresh token
        console.log('3️⃣  Testing token refresh...');
        const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        if (!refreshResponse.ok) {
            console.error('❌ Token refresh failed');
            return;
        }

        const refreshData = await refreshResponse.json();
        console.log('✅ Token refreshed successfully!');
        console.log('   New  Access Token:', refreshData.accessToken.substring(0, 20) + '...');
        console.log('');

        // Test 4: List users (requires superadmin)
        console.log('4️⃣  Testing /api/users (list users)...');
        const usersResponse = await fetch(`${API_URL}/api/users?limit=5`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!usersResponse.ok) {
            console.error('❌ Failed to list users');
            return;
        }

        const usersData = await usersResponse.json();
        console.log(`✅ Found ${usersData.total} user(s):`);
        usersData.users.forEach((u) => {
            console.log(`   - ${u.username} (${u.role})`);
        });
        console.log('');

        // Test 5: Logout
        console.log('5️⃣  Testing logout...');
        const logoutResponse = await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: refreshData.refreshToken }),
        });

        if (!logoutResponse.ok) {
            console.error('❌ Logout failed');
            return;
        }

        console.log('✅ Logged out successfully!');
        console.log('');

        console.log('✅ All tests passed! Authentication is working correctly.\n');
        console.log('📝 Default admin credentials:');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!\n');
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        console.log('\n💡 Make sure the server is running: npm run dev');
    }
}

// Run test
testAuth();
