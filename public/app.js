/**
 * DocGen - Document Template Engine UI
 * Main Application JavaScript
 */

// API Base URL
const API_BASE = '';

// State
const state = {
    currentView: 'render',
    selectedFile: null,
    selectedTemplateId: null,
    templates: [],
    mode: 'upload', // 'upload' or 'select'
};

// DOM Elements
const elements = {
    // Views
    renderView: document.getElementById('render-view'),
    templatesView: document.getElementById('templates-view'),
    usersView: document.getElementById('users-view'),
    auditView: document.getElementById('audit-view'),
    historyView: document.getElementById('history-view'),
    editorView: document.getElementById('editor-view'),
    docsView: document.getElementById('docs-view'),

    // Navigation
    navItems: document.querySelectorAll('.nav-item'),

    // Template modes
    uploadMode: document.getElementById('upload-mode'),
    selectMode: document.getElementById('select-mode'),
    toggleBtns: document.querySelectorAll('.toggle-btn'),
    uploadTab: document.getElementById('upload-tab'),
    selectTab: document.getElementById('select-tab'),

    // Dropzone
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),
    browseBtn: document.getElementById('browse-btn'),
    fileInfo: document.getElementById('file-info'),
    fileName: document.getElementById('file-name'),
    fileSize: document.getElementById('file-size'),
    removeFile: document.getElementById('remove-file'),
    fileUpload: document.getElementById('file-upload'),

    // Template select
    templateSelectList: document.getElementById('template-select-list'),
    templateSelect: document.getElementById('template-select'),

    // JSON Editor
    jsonEditor: document.getElementById('json-editor'),
    formatJsonBtn: document.getElementById('format-json'),
    jsonError: document.getElementById('json-error'),

    // Operations
    tablePageBreaking: document.getElementById('table-page-breaking'),
    longTableSplit: document.getElementById('long-table-split'),
    repeatTableHeader: document.getElementById('repeat-table-header'),

    // Render
    renderBtn: document.getElementById('render-btn'),

    // Templates view
    templatesGrid: document.getElementById('templates-grid'),
    emptyTemplates: document.getElementById('empty-templates'),
    uploadTemplateBtn: document.getElementById('upload-template-btn'),
    uploadFirstBtn: document.getElementById('upload-first-btn'),

    // Modal
    uploadModal: document.getElementById('upload-modal'),
    modalDropzone: document.getElementById('modal-dropzone'),
    modalFileInput: document.getElementById('modal-file-input'),
    modalBrowseBtn: document.getElementById('modal-browse-btn'),
    modalClose: document.querySelector('.modal-close'),

    // Loading
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),

    // Toast
    toastContainer: document.getElementById('toast-container'),
};

/**
 * Load groups for upload dropdown
 */
let uploadGroups = [];

async function loadGroupsForUpload() {
    try {
        console.log('Loading groups for upload autocomplete...');
        const response = await auth.fetch('/api/groups/active');
        uploadGroups = await response.json();
        console.log('Loaded upload groups:', uploadGroups);
        setupUploadGroupAutocomplete();
    } catch (error) {
        console.error('Failed to load groups:', error);
        uploadGroups = [];
    }
}

/**
 * Setup upload group autocomplete
 */
let uploadAutocompleteInitialized = false;

function setupUploadGroupAutocomplete() {
    const input = document.getElementById('templateGroupInput');
    const dropdown = document.getElementById('groupDropdown');
    const hiddenInput = document.getElementById('templateGroupSelect');

    if (!input || !dropdown || !hiddenInput || uploadAutocompleteInitialized) {
        return;
    }

    uploadAutocompleteInitialized = true;
    let selectedIndex = -1;

    // Show dropdown on focus
    input.addEventListener('focus', () => {
        filterUploadGroups(input.value);
    });

    // Filter as user types
    input.addEventListener('input', (e) => {
        selectedIndex = -1;
        filterUploadGroups(e.target.value);
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateUploadSelection(items, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateUploadSelection(items, selectedIndex);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            items[selectedIndex].click();
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function filterUploadGroups(query) {
    const filtered = uploadGroups.filter(group =>
        group.name.toLowerCase().includes(query.toLowerCase())
    );

    console.log('Filtering upload groups with query:', query, 'Found:', filtered.length);
    renderUploadGroupDropdown(filtered);
}

function renderUploadGroupDropdown(groups) {
    const dropdown = document.getElementById('groupDropdown');
    const input = document.getElementById('templateGroupInput');

    if (!dropdown) return;

    // Get already selected group IDs
    const selectedIds = getSelectedGroupIds();

    // Filter out already selected groups
    const availableGroups = groups.filter(g => !selectedIds.includes(g.id));

    if (availableGroups.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-empty">No more groups available</div>';
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = availableGroups.map(group => `
        <div class="autocomplete-item" data-id="${group.id}" data-name="${escapeHtml(group.name)}">
            ${escapeHtml(group.name)}
        </div>
    `).join('');

    dropdown.style.display = 'block';
    console.log('Upload dropdown displayed with', availableGroups.length, 'groups');

    // Add click handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            addGroupTag(item.dataset.id, item.dataset.name);
            input.value = '';
            dropdown.style.display = 'none';
        });
    });
}

// Store selected groups
let selectedGroups = [];

function getSelectedGroupIds() {
    return selectedGroups.map(g => g.id);
}

function addGroupTag(id, name) {
    // Check if already added
    if (selectedGroups.find(g => g.id === id)) {
        return;
    }

    selectedGroups.push({ id, name });
    renderGroupTags();
    updateHiddenGroupInput();
}

function removeGroupTag(id) {
    selectedGroups = selectedGroups.filter(g => g.id !== id);
    renderGroupTags();
    updateHiddenGroupInput();
}

function renderGroupTags() {
    const container = document.getElementById('selectedGroupsTags');
    if (!container) return;

    if (selectedGroups.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = selectedGroups.map(group => `
        <span class="group-tag">
            ${escapeHtml(group.name)}
            <button type="button" class="group-tag-remove" onclick="removeGroupTag('${group.id}')">&times;</button>
        </span>
    `).join('');
}

function updateHiddenGroupInput() {
    const hiddenInput = document.getElementById('templateGroupSelect');
    if (hiddenInput) {
        hiddenInput.value = JSON.stringify(selectedGroups.map(g => g.id));
    }
}

function updateUploadSelection(items, selectedIndex) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });

    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

function clearSelectedGroups() {
    selectedGroups = [];
    renderGroupTags();
    updateHiddenGroupInput();
}

// Upload template button
document.getElementById('upload-template-btn')?.addEventListener('click', async () => {
    // Clear previous selections and load groups
    clearSelectedGroups();
    await loadGroupsForUpload();
    document.getElementById('upload-modal').style.display = 'flex';
});

document.getElementById('upload-first-btn')?.addEventListener('click', async () => {
    await loadGroupsForUpload();
    document.getElementById('upload-modal').style.display = 'flex';
});

// Upload form
document.getElementById('upload-form')?.addEventListener('submit', handleUpload);

// Close modals
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.modal').style.display = 'none';
    });
});

// Confirm upload button
document.getElementById('confirmUploadBtn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('upload-name');
    const fileInput = document.getElementById('upload-file');

    const name = nameInput.value.trim();
    const file = fileInput.files[0];

    if (!name) {
        showToast('Please enter a template name', 'error');
        return;
    }

    if (!file) {
        showToast('Please select a .docx file', 'error');
        return;
    }

    try {
        showLoading('Uploading template...');

        const formData = new FormData();
        formData.append('template', file);
        formData.append('name', name);

        // Get group IDs from hidden input (JSON array)
        if (selectedGroups.length > 0) {
            const groupIds = selectedGroups.map(g => g.id);
            console.log('Sending group IDs:', groupIds);
            formData.append('groupIds', JSON.stringify(groupIds));
        }

        // Get tags
        const tagsValue = document.getElementById('upload-tags').value;
        if (tagsValue) {
            const tags = tagsValue.split(',').map(t => t.trim()).filter(Boolean);
            formData.append('tags', JSON.stringify(tags));
        }

        const response = await auth.fetch('/api/templates', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showToast('Template uploaded successfully!', 'success');
            document.getElementById('upload-modal').style.display = 'none';

            // Clear form
            nameInput.value = '';
            fileInput.value = '';
            document.getElementById('upload-tags').value = '';
            clearSelectedGroups();

            // Reload templates
            loadTemplates();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Failed to upload template', 'error');
    } finally {
        hideLoading();
    }
});

// ============================================
// Navigation
// ============================================

function switchView(viewName) {
    state.currentView = viewName;

    // Update nav items
    elements.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Hide all views
    Object.values(elements).forEach((el) => {
        if (el && el.classList && el.classList.contains('view')) {
            el.classList.remove('active');
        }
    });

    // Also hide groups-view explicitly
    const groupsView = document.getElementById('groups-view');
    if (groupsView) {
        groupsView.style.display = 'none';
        groupsView.classList.remove('active');
    }

    // Show selected view
    switch (viewName) {
        case 'render':
            elements.renderView.classList.add('active');
            loadTemplatesForSelect(); // Load templates for the select dropdown
            break;
        case 'templates':
            elements.templatesView.classList.add('active');
            loadTemplates();
            break;
        case 'groups':
            const groupsView = document.getElementById('groups-view');
            if (groupsView) {
                groupsView.style.display = 'block';
                groupsView.classList.add('active');
                if (typeof loadGroups === 'function') {
                    loadGroups();
                }
            }
            break;
        case 'editor':
            elements.editorView.classList.add('active');
            // Initialize OnlyOffice editor
            if (typeof initializeEditor === 'function') {
                initializeEditor();
            }
            break;
        case 'users':
            elements.usersView.classList.add('active');
            loadUsers();
            break;
        case 'audit':
            elements.auditView.classList.add('active');
            loadAuditLogs();
            break;
        case 'history':
            elements.historyView.classList.add('active');
            loadRenderHistory();
            break;
        case 'docs':
            elements.docsView.classList.add('active');
            break;
    }
}

elements.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(item.dataset.view);
    });
});

// ============================================
// Template Mode Toggle
// ============================================

function switchTemplateMode(mode) {
    state.mode = mode;

    elements.toggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    elements.uploadMode.classList.toggle('active', mode === 'upload');
    elements.selectMode.classList.toggle('active', mode === 'select');

    if (mode === 'select') {
        loadTemplatesForSelect();
    }
}

elements.toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        switchTemplateMode(btn.dataset.mode);
    });
});

// ============================================
// File Upload (Dropzone)
// ============================================

function setupDropzone(dropzone, fileInput, onFile) {
    // Click to browse
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag and drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');

        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.docx')) {
            onFile(file);
        } else {
            showToast('Please upload a DOCX file', 'error');
        }
    });

    // File input change
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            onFile(fileInput.files[0]);
        }
    });
}

// Setup main dropzone
setupDropzone(elements.dropzone, elements.fileInput, (file) => {
    state.selectedFile = file;
    state.selectedTemplateId = null;
    showFileInfo(file);
});

// Browse button
elements.browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fileInput.click();
});

function showFileInfo(file) {
    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    elements.dropzone.hidden = true;
    elements.fileInfo.hidden = false;
}

function hideFileInfo() {
    state.selectedFile = null;
    elements.dropzone.hidden = false;
    elements.fileInfo.hidden = true;
    elements.fileInput.value = '';
}

elements.removeFile.addEventListener('click', hideFileInfo);

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================
// Template Selection
// ============================================

async function loadTemplatesForSelect() {
    try {
        const response = await fetch(`${API_BASE}/api/templates`);
        const data = await response.json();

        if (data.success && data.templates.length > 0) {
            renderTemplateSelectList(data.templates);
        } else {
            elements.templateSelectList.innerHTML = '<p class="empty-state">No templates saved yet. Upload a template first.</p>';
        }
    } catch (error) {
        elements.templateSelectList.innerHTML = '<p class="empty-state">Failed to load templates</p>';
    }
}

function renderTemplateSelectList(templates) {
    elements.templateSelectList.innerHTML = templates.map(t => `
    <div class="template-select-item ${state.selectedTemplateId === t.id ? 'selected' : ''}" data-id="${t.id}">
      <div class="file-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      </div>
      <div class="file-details">
        <span class="file-name">${escapeHtml(t.filename)}</span>
        <span class="file-size">${formatFileSize(t.size)}</span>
      </div>
    </div>
  `).join('');

    // Add click handlers
    elements.templateSelectList.querySelectorAll('.template-select-item').forEach(item => {
        item.addEventListener('click', () => {
            state.selectedTemplateId = item.dataset.id;
            state.selectedFile = null;

            elements.templateSelectList.querySelectorAll('.template-select-item').forEach(i => {
                i.classList.toggle('selected', i.dataset.id === state.selectedTemplateId);
            });
        });
    });
}

// ============================================
// JSON Editor
// ============================================

elements.formatJsonBtn.addEventListener('click', () => {
    try {
        const json = JSON.parse(elements.jsonEditor.value);
        elements.jsonEditor.value = JSON.stringify(json, null, 2);
        elements.jsonError.hidden = true;
    } catch (error) {
        elements.jsonError.textContent = 'Invalid JSON: ' + error.message;
        elements.jsonError.hidden = false;
    }
});

function validateJson() {
    const value = elements.jsonEditor.value.trim();
    if (!value) return { valid: true, data: {} };

    try {
        const data = JSON.parse(value);
        elements.jsonError.hidden = true;
        return { valid: true, data };
    } catch (error) {
        elements.jsonError.textContent = 'Invalid JSON: ' + error.message;
        elements.jsonError.hidden = false;
        return { valid: false, data: null };
    }
}

// ============================================
// Render Document
// ============================================

elements.renderBtn.addEventListener('click', async () => {
    // Validate JSON
    const { valid, data } = validateJson();
    if (!valid) {
        showToast('Please fix the JSON errors', 'error');
        return;
    }

    // Check template
    if (state.mode === 'upload' && !state.selectedFile) {
        showToast('Please upload a template file', 'error');
        return;
    }

    if (state.mode === 'select' && !state.selectedTemplateId) {
        showToast('Please select a template', 'error');
        return;
    }

    // Get output format
    const outputFormat = document.querySelector('input[name="output-format"]:checked').value;

    // Collect operations
    const operations = {
        tablePageBreaking: elements.tablePageBreaking?.checked || false,
        longTableSplit: elements.longTableSplit?.checked || false,
        repeatTableHeader: elements.repeatTableHeader?.checked || false
    };

    // Show loading
    showLoading('Generating document...');

    try {
        let response;

        if (state.mode === 'upload') {
            // One-time render with file upload
            const formData = new FormData();
            formData.append('template', state.selectedFile);
            formData.append('data', JSON.stringify(data));
            formData.append('operations', JSON.stringify(operations));
            formData.append('result', outputFormat);

            response = await auth.fetch(`${API_BASE}/api/render`, {
                method: 'POST',
                body: formData,
            });
        } else {
            // Render from stored template
            response = await auth.fetch(`${API_BASE}/api/render/${state.selectedTemplateId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data,
                    operations,
                    result: outputFormat,
                }),
            });
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate document');
        }

        // Download the file
        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `document.${outputFormat}`;

        if (contentDisposition) {
            const match = contentDisposition.match(/filename="(.+)"/);
            if (match) filename = match[1];
        }

        downloadBlob(blob, filename);
        showToast('Document generated successfully!', 'success');

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
});

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// Templates Management
// ============================================

async function loadTemplates() {
    try {
        const response = await auth.fetch(`${API_BASE}/api/templates`);
        if (!response.ok) throw new Error('Failed to load templates');

        const data = await response.json();
        state.templates = data.templates;

        renderTemplatesGrid(state.templates); // Assuming renderTemplatesGrid is the correct function to call here
        if (state.templates.length > 0) {
            elements.emptyTemplates.hidden = true;
            elements.templatesGrid.hidden = false;
        } else {
            elements.emptyTemplates.hidden = false;
            elements.templatesGrid.hidden = true;
        }
    } catch (error) {
        console.error('Error loading templates:', error);
        elements.templateSelectList.innerHTML = `
            <div class="no-templates">
                <p>Failed to load templates</p>
            </div>
        `;
    }
}

function renderTemplatesGrid(templates) {
    elements.templatesGrid.innerHTML = templates.map(t => `
    <div class="template-card" data-id="${t.id}">
      <div class="template-card-header">
        <div class="file-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <div class="template-card-info">
          <div class="template-card-name">${escapeHtml(t.filename)}</div>
          <div class="template-card-meta">${formatFileSize(t.size)} • ${formatDate(t.createdAt)}</div>
        </div>
      </div>
      <div class="template-card-actions">
        <button class="btn btn-secondary use-btn" data-id="${t.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Use
        </button>
        <button class="btn btn-ghost delete-btn" data-id="${t.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
      </div>
    </div>
  `).join('');

    // Add event listeners
    elements.templatesGrid.querySelectorAll('.use-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedTemplateId = btn.dataset.id;
            state.mode = 'select';
            switchView('render');
            switchTemplateMode('select');
        });
    });

    elements.templatesGrid.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteTemplate(btn.dataset.id));
    });
}

async function deleteTemplate(id) {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/templates/${id}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            showToast('Template deleted', 'success');
            loadTemplates();
        } else {
            throw new Error('Failed to delete template');
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// ============================================
// Upload Modal
// ============================================

function showUploadModal() {
    elements.uploadModal.hidden = false;
}

function hideUploadModal() {
    elements.uploadModal.hidden = true;
    elements.modalFileInput.value = '';
}

elements.uploadTemplateBtn?.addEventListener('click', showUploadModal);
elements.uploadFirstBtn?.addEventListener('click', showUploadModal);
elements.modalClose?.addEventListener('click', hideUploadModal);

elements.uploadModal?.addEventListener('click', (e) => {
    if (e.target === elements.uploadModal) {
        hideUploadModal();
    }
});

// Setup modal dropzone
if (elements.modalDropzone && elements.modalFileInput) {
    setupDropzone(elements.modalDropzone, elements.modalFileInput, async (file) => {
        // This callback now needs to call handleUpload or a similar function
        // For simplicity, we'll adapt it to use the new upload logic
        const fileInput = document.getElementById('template-file'); // Assuming this is the input for the modal
        const groupSelect = document.getElementById('upload-group');
        const tagsInput = document.getElementById('upload-tags');

        // Simulate setting the file to the input for handleUpload to pick it up
        // This might require a more robust solution depending on how handleUpload is triggered
        // For now, we'll pass the file directly to a modified upload function
        await uploadTemplateWithDetails(file, groupSelect.value, tagsInput.value);
        hideUploadModal();
    });

    elements.modalBrowseBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.modalFileInput.click();
    });
}

// New function to handle upload with group and tags
async function uploadTemplateWithDetails(file, name) {
    showLoading('Uploading template...');

    try {
        console.log(file, name);
        debugger;

        const formData = new FormData();
        formData.append('template', file);
        formData.append('name', name);

        // Get group IDs from hidden input (JSON array)
        const groupIdsJson = document.getElementById('selectedGroupsTags').value;
        if (groupIdsJson) {
            formData.append('groupIds', groupIdsJson);
        }

        // Get tags
        const tagsValue = document.getElementById('upload-tags').value;
        if (tagsValue) {
            const tags = tagsValue.split(',').map(t => t.trim()).filter(Boolean);
            formData.append('tags', JSON.stringify(tags));
        }

        const response = await auth.fetch(`${API_BASE}/api/templates`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to upload template');
        }

        showToast('Template uploaded successfully!', 'success');
        loadTemplates();

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// The original uploadTemplate function is replaced by uploadTemplateWithDetails
// If there's a form submission for upload, it should call this new function.
// Assuming a form with id 'upload-form' and a submit button.
document.getElementById('upload-form')?.addEventListener('submit', async function handleUpload(e) {
    e.preventDefault();

    const fileInput = document.getElementById('template-file');
    const groupSelect = document.getElementById('upload-group');
    const tagsInput = document.getElementById('upload-tags');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Please select a file', 'error');
        return;
    }

    await uploadTemplateWithDetails(file, groupSelect.value, tagsInput.value);

    // Clear form fields after successful upload
    hideUploadModal(); // Assuming this also clears the modal
    fileInput.value = '';
    groupSelect.value = '';
    tagsInput.value = '';
});


// ============================================
// Loading Overlay
// ============================================

function showLoading(text = 'Loading...') {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.hidden = false;
}

function hideLoading() {
    elements.loadingOverlay.hidden = true;
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    };

    toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

    elements.toastContainer.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// Utilities
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Check API status
    fetch(`${API_BASE}/health`)
        .then(res => res.json())
        .then(() => {
            document.querySelector('.status-dot').style.background = 'var(--accent-success)';
        })
        .catch(() => {
            document.querySelector('.status-dot').style.background = 'var(--accent-error)';
            document.querySelector('.status-indicator span').textContent = 'API Disconnected';
        });

    // Load initial data
    loadTemplatesForSelect();
});
