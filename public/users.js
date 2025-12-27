// User Management Functions
async function loadUsers() {
    try {
        const response = await auth.fetch('/api/users');
        if (!response.ok) throw new Error('Failed to load users');

        const data = await response.json();
        displayUsers(data.users);
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersTableBody').innerHTML = `
            <tr>
                <td colspan="6" style="padding: 32px; text-align: center; color: #e53e3e;">
                    Failed to load users: ${error.message}
                </td>
            </tr>
        `;
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');

    if (!users || users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 32px; text-align: center; color: #718096;">
                    No users found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px; font-weight: 500;">${user.username}</td>
            <td style="padding: 12px; color: #718096;">${user.email}</td>
            <td style="padding: 12px;">
                <span style="
                    padding: 4px 12px;
                    background: ${getRoleColor(user.role)};
                    color: white;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                ">${user.role.toUpperCase()}</span>
            </td>
            <td style="padding: 12px;">
                <span style="
                    padding: 4px 12px;
                    background: ${user.active ? '#48bb78' : '#cbd5e0'};
                    color: white;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                ">${user.active ? 'Active' : 'Inactive'}</span>
            </td>
            <td style="padding: 12px; color: #718096; font-size: 14px;">
                ${new Date(user.created_at).toLocaleDateString()}
            </td>
            <td style="padding: 12px;">
                <button onclick="deleteUser('${user.id}', '${user.username}')" style="
                    padding: 6px 12px;
                    background: #e53e3e;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                ">Delete</button>
            </td>
        </tr>
    `).join('');
}

function getRoleColor(role) {
    const colors = {
        'superadmin': '#9f7aea',
        'manager': '#4299e1',
        'normal': '#48bb78',
        'api': '#ed8936'
    };
    return colors[role] || '#718096';
}

function showCreateUserModal() {
    document.getElementById('createUserModal').style.display = 'flex';
    document.getElementById('newUsername').focus();
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').style.display = 'none';
    document.getElementById('createUserForm').reset();
}

function handleCreateUser(event) {
    event.preventDefault();

    const username = document.getElementById('newUsername').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;

    // Validate password strength
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber) {
        alert('Password must contain at least one uppercase letter, one lowercase letter, and one number');
        return;
    }

    if (password.length < 8) {
        alert('Password must be at least 8 characters long');
        return;
    }

    createUser({ username, email, password, role });
}

async function createUser(userData) {
    try {
        const response = await auth.fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create user');
        }

        closeCreateUserModal();
        alert('✅ User created successfully!');
        loadUsers(); // Reload the list
    } catch (error) {
        alert('❌ Error creating user: ' + error.message);
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }

    try {
        const response = await auth.fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete user');

        alert('User deleted successfully!');
        loadUsers(); // Reload the list
    } catch (error) {
        alert('Error deleting user: ' + error.message);
    }
}
