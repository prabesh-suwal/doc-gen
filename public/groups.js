// Groups Management
let currentGroups = [];

/**
 * Load groups from API
 */
async function loadGroups(includeInactive = false) {
    try {
        const url = `/api/groups${includeInactive ? '?includeInactive=true' : ''}`;
        const response = await auth.fetch(url);
        currentGroups = await response.json();
        renderGroups();
    } catch (error) {
        console.error('Failed to load groups:', error);
        showToast('Failed to load groups', 'error');
    }
}

/**
 * Render groups grid
 */
function renderGroups() {
    const grid = document.getElementById('groups-grid');
    if (!grid) return;

    if (currentGroups.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <h3>No Groups Yet</h3>
                <p>Create your first group to organize templates</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = currentGroups.map(group => `
        <div class="group-card ${!group.isActive ? 'inactive' : ''}">
            <div class="group-header">
                <h3>${escapeHtml(group.name)}</h3>
                <span class="badge ${group.isActive ? 'badge-success' : 'badge-secondary'}">
                    ${group.isActive ? 'Active' : 'Inactive'}
                </span>
            </div>
            ${group.description ? `<p class="group-description">${escapeHtml(group.description)}</p>` : ''}
            <div class="group-stats">
                <span class="stat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    ${group.templateCount || 0} templates
                </span>
            </div>
            <div class="group-actions" data-role-required="superadmin">
                <button class="btn btn-sm btn-secondary" onclick="editGroup('${group.id}')">
                    ✏️ Edit
                </button>
                <button class="btn btn-sm ${group.isActive ? 'btn-warning' : 'btn-success'}" 
                        onclick="toggleGroup('${group.id}')">
                    ${group.isActive ? '🚫 Disable' : '✅ Enable'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteGroup('${group.id}')">
                    🗑️ Delete
                </button>
            </div>
        </div>
    `).join('');

    // Hide action buttons for non-superadmin users
    const user = auth.getUser();
    if (user && user.role !== 'superadmin') {
        document.querySelectorAll('[data-role-required="superadmin"]').forEach(el => {
            el.style.display = 'none';
        });
    }
}

/**
 * Show create/edit group modal
 */
function showGroupModal(groupId = null) {
    const modal = document.getElementById('groupModal');
    const title = document.getElementById('groupModalTitle');
    const nameInput = document.getElementById('groupName');
    const descInput = document.getElementById('groupDescription');
    const saveBtn = document.getElementById('saveGroupBtn');

    if (groupId) {
        const group = currentGroups.find(g => g.id === groupId);
        if (!group) return;

        title.textContent = 'Edit Group';
        nameInput.value = group.name;
        descInput.value = group.description || '';
        saveBtn.onclick = () => saveGroup(groupId);
    } else {
        title.textContent = 'Create Group';
        nameInput.value = '';
        descInput.value = '';
        saveBtn.onclick = () => saveGroup();
    }

    modal.style.display = 'flex';
}

/**
 * Save group (create or update)
 */
async function saveGroup(groupId = null) {
    const nameInput = document.getElementById('groupName');
    const descInput = document.getElementById('groupDescription');
    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    if (!name) {
        showToast('Group name is required', 'error');
        return;
    }

    try {
        showLoading(groupId ? 'Updating group...' : 'Creating group...');

        const url = groupId ? `/api/groups/${groupId}` : '/api/groups';
        const method = groupId ? 'PUT' : 'POST';

        const response = await auth.fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save group');
        }

        hideLoading();
        document.getElementById('groupModal').style.display = 'none';
        showToast(`Group ${groupId ? 'updated' : 'created'} successfully`, 'success');
        await loadGroups();
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

/**
 * Edit group
 */
function editGroup(groupId) {
    showGroupModal(groupId);
}

/**
 * Toggle group active status
 */
async function toggleGroup(groupId) {
    const group = currentGroups.find(g => g.id === groupId);
    if (!group) return;

    const action = group.isActive ? 'disable' : 'enable';
    if (!confirm(`Are you sure you want to ${action} this group?`)) {
        return;
    }

    try {
        showLoading(`${action === 'disable' ? 'Disabling' : 'Enabling'} group...`);

        const response = await auth.fetch(`/api/groups/${groupId}/toggle`, {
            method: 'PATCH',
        });

        if (!response.ok) {
            throw new Error('Failed to toggle group');
        }

        hideLoading();
        showToast(`Group ${action}d successfully`, 'success');
        await loadGroups();
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

/**
 * Delete group
 */
async function deleteGroup(groupId) {
    const group = currentGroups.find(g => g.id === groupId);
    if (!group) return;

    if (!confirm(`Are you sure you want to delete "${group.name}"? This action cannot be undone.`)) {
        return;
    }

    try {
        showLoading('Deleting group...');

        const response = await auth.fetch(`/api/groups/${groupId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete group');
        }

        hideLoading();
        showToast('Group deleted successfully', 'success');
        await loadGroups();
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}
