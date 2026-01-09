// OnlyOffice Editor Integration
let editorInstance = null;
let currentDocumentId = null;
let currentJsonData = null; // Store JSON data for test rendering
let currentOriginalTemplateId = null; // Store original template ID for updates
let currentTemplateName = null; // Store template name for pre-filling save dialog
let currentEditingGroups = []; // Store groups for pre-filling save dialog
let currentEditingTags = []; // Store tags for pre-filling save dialog

/**
 * Wait for DocsAPI to be available (loaded dynamically from config)
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<void>}
 */
function waitForDocsAPI(timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkInterval = 100;

        const check = () => {
            if (typeof DocsAPI !== 'undefined') {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error('OnlyOffice API not available. Please check ONLYOFFICE_URL in your .env configuration.'));
            } else {
                setTimeout(check, checkInterval);
            }
        };
        check();
    });
}
/**
 * Initialize OnlyOffice editor
 * Checks URL for existing document ID (edit mode) or creates new document
 */
async function initializeEditor() {
    try {
        // RESET STATE: Clear all previous session data
        currentJsonData = null;
        allExtractedVariables = [];

        // RESET UI: Clear inputs and lists
        const jsonEditor = document.getElementById('json-editor');
        if (jsonEditor) jsonEditor.value = '';

        const jsonError = document.getElementById('json-error');
        if (jsonError) jsonError.style.display = 'none';

        const variableSearch = document.getElementById('variableSearchInput');
        if (variableSearch) variableSearch.value = '';

        const variablesList = document.getElementById('variablesList');
        if (variablesList) {
            variablesList.innerHTML = '<p style="color: var(--text-muted); font-size: 14px; text-align: center; padding: 24px 0;">Load JSON data to see available variables</p>';
        }

        // Check if we're editing an existing document (set by editTemplate function)
        const existingDocId = window.editingDocumentId;
        console.log('initializeEditor called - existingDocId:', existingDocId);
        console.log('initializeEditor - window.editingSampleData:', window.editingSampleData);

        if (existingDocId) {
            // Edit mode - load existing document
            currentDocumentId = existingDocId;
            console.log('Loading existing document:', existingDocId);

            // Load sample data if available
            if (window.editingSampleData) {
                let sampleData = window.editingSampleData;
                // If sampleData is a string, parse it first
                if (typeof sampleData === 'string') {
                    try {
                        sampleData = JSON.parse(sampleData);
                    } catch (e) {
                        console.log('Sample data is not valid JSON string');
                    }
                }
                currentJsonData = sampleData;
                console.log('Setting currentJsonData:', currentJsonData);

                // Populate JSON editor with sample data
                const jsonEditor = document.getElementById('json-editor');
                console.log('json-editor element found:', !!jsonEditor);
                if (jsonEditor) {
                    jsonEditor.value = JSON.stringify(currentJsonData, null, 2);
                    console.log('JSON editor value set successfully');
                }

                // Auto-extract and display variables from sample data
                try {
                    const variables = extractVariables(currentJsonData);
                    displayVariables(variables);
                    console.log('Auto-displayed', variables.length, 'variables from sample data');
                } catch (e) {
                    console.log('Could not extract variables:', e);
                }

                console.log('Loaded sample data for editing');
            } else {
                console.log('No sample data to load');
                // Show message in variables panel when no JSON data
                const list = document.getElementById('variablesList');
                if (list) {
                    list.innerHTML = '<p style="color: var(--text-muted); font-size: 14px; text-align: center; padding: 24px 0;">Load JSON data to see available variables</p>';
                }
            }

            // Store template name for save dialog
            if (window.editingTemplateName) {
                currentTemplateName = window.editingTemplateName.replace(/\.(docx|doc)$/i, '');
            }

            // Store original template ID for updates
            currentOriginalTemplateId = window.editingOriginalTemplateId || null;

            // Store groups and tags for pre-filling save dialog
            currentEditingGroups = window.editingGroups || [];
            currentEditingTags = window.editingTags || [];

            console.log('Original template ID for updates:', currentOriginalTemplateId);
            console.log('Template name for pre-fill:', currentTemplateName);
            console.log('Groups for pre-fill:', currentEditingGroups);
            console.log('Tags for pre-fill:', currentEditingTags);

            // Clear the editing state
            window.editingDocumentId = null;
            window.editingSampleData = null;
            window.editingTemplateName = null;
            window.editingOriginalTemplateId = null;
            window.editingGroups = null;
            window.editingTags = null;
        } else {
            // Create mode - new document
            const response = await auth.fetch('/api/editor/create', {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to create editor session');
            }

            const { documentId } = await response.json();
            currentDocumentId = documentId;
            console.log('Created new document:', documentId);
        }

        // Get editor configuration
        const configResponse = await auth.fetch(`/api/editor/config/${currentDocumentId}`);
        if (!configResponse.ok) {
            throw new Error('Failed to get editor configuration');
        }

        const config = await configResponse.json();

        // Cleanup existing editor instance
        if (editorInstance) {
            console.log('Destroying existing editor instance');
            try {
                editorInstance.destroyEditor();
            } catch (e) {
                console.warn('Error destroying editor:', e);
            }
            editorInstance = null;
        }

        // Ensure editor container exists
        let container = document.getElementById('editorContainer');
        if (!container) {
            console.log('Recreating editor container');
            const wrapper = document.getElementById('editorWrapper');
            if (wrapper) {
                // Recreate container
                container = document.createElement('div');
                container.id = 'editorContainer';
                container.style.height = '100%';

                // Add placeholder
                const placeholder = document.createElement('div');
                placeholder.id = 'editorPlaceholder';
                placeholder.style.display = 'flex';
                placeholder.style.alignItems = 'center';
                placeholder.style.justifyContent = 'center';
                placeholder.style.height = '100%';
                placeholder.style.color = '#718096';
                placeholder.innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 64px; margin-bottom: 16px;">📝</div>
                        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Loading OnlyOffice Editor...</div>
                        <div style="font-size: 14px; opacity: 0.8;">Please wait while we initialize the editor</div>
                    </div>
                `;

                container.appendChild(placeholder);
                wrapper.innerHTML = ''; // Clear wrapper
                wrapper.appendChild(container);
            } else {
                throw new Error('Editor wrapper not found');
            }
        }

        // Hide placeholder
        const placeholder = document.getElementById('editorPlaceholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        // Calculate explicit height for OnlyOffice
        const containerHeight = container.offsetHeight || 600; // Fallback to 600px if 0
        config.height = containerHeight + 'px';

        console.log('Initializing OnlyOffice with height:', config.height);

        // Wait for DocsAPI to be loaded (dynamically loaded from /api/config)
        await waitForDocsAPI();

        // Initialize OnlyOffice DocumentEditor
        editorInstance = new DocsAPI.DocEditor("editorContainer", config);

        console.log('OnlyOffice editor initialized:', currentDocumentId);
    } catch (error) {
        console.error('Error initializing editor:', error);
        showToast(`Failed to initialize editor: ${error.message}`, 'error');
        switchView('templates');
    }
}

/**
 * Show save template dialog
 */
async function showSaveTemplateDialog() {
    console.log('showSaveTemplateDialog called');
    const modal = document.getElementById('saveTemplateModal');
    const nameInput = document.getElementById('templateNameInput');
    const tagsInput = document.getElementById('templateTagsInput');

    // Pre-fill template name if editing, clear if creating new
    nameInput.value = currentTemplateName || '';

    // Pre-fill tags if editing
    tagsInput.value = (currentEditingTags && currentEditingTags.length > 0)
        ? currentEditingTags.join(', ')
        : '';

    document.getElementById('saveTemplateGroupInput').value = '';

    // Clear selected groups and pre-fill if editing
    clearSaveTemplateGroups();

    // Load groups for autocomplete first
    console.log('About to load groups for save template...');
    await loadGroupsForSaveTemplate();
    console.log('Groups loaded');

    // Pre-fill groups if editing an existing template
    if (currentEditingGroups && currentEditingGroups.length > 0) {
        currentEditingGroups.forEach(group => {
            addSaveTemplateGroupTag(group.id, group.name);
        });
        console.log('Pre-filled groups:', currentEditingGroups.length);
    }

    // Pre-fill sample JSON if available
    const sampleJsonDisplay = document.getElementById('sampleJsonDisplay');
    if (currentJsonData) {
        sampleJsonDisplay.value = JSON.stringify(currentJsonData, null, 2);
    } else {
        sampleJsonDisplay.value = '// No sample JSON data provided';
    }

    // Show modal
    modal.style.display = 'flex';
    nameInput.focus();
    nameInput.select(); // Select all text so user can easily replace if needed
}

/**
 * Show save template modal
 */
async function showSaveTemplateModal() {
    console.log('showSaveTemplateModal called');
    const modal = document.getElementById('saveTemplateModal');
    const nameInput = document.getElementById('templateNameInput');
    const tagsInput = document.getElementById('templateTagsInput');

    // Pre-fill template name if editing, clear if creating new
    nameInput.value = currentTemplateName || '';
    document.getElementById('saveTemplateGroupInput').value = '';
    document.getElementById('saveTemplateGroupId').value = '';

    // Pre-fill tags if editing
    tagsInput.value = (currentEditingTags && currentEditingTags.length > 0)
        ? currentEditingTags.join(', ')
        : '';

    // Clear selected groups and pre-fill if editing
    clearSaveTemplateGroups();

    // Load groups for autocomplete
    console.log('About to load groups...');
    await loadGroupsForSaveTemplate();
    console.log('Groups loaded, showing modal');

    // Pre-fill groups if editing an existing template
    if (currentEditingGroups && currentEditingGroups.length > 0) {
        currentEditingGroups.forEach(group => {
            addSaveTemplateGroupTag(group.id, group.name);
        });
        console.log('Pre-filled groups:', currentEditingGroups.length);
    }

    modal.style.display = 'flex';
    nameInput.focus();
    nameInput.select(); // Select all text so user can easily replace if needed
}

/**
 * Load groups for save template autocomplete
 */
let saveTemplateGroups = [];

async function loadGroupsForSaveTemplate() {
    try {
        console.log('Loading groups for save template autocomplete...');
        const response = await auth.fetch('/api/groups/active');
        saveTemplateGroups = await response.json();
        console.log('Loaded save template groups:', saveTemplateGroups);
        setupSaveTemplateGroupAutocomplete();
    } catch (error) {
        console.error('Failed to load groups:', error);
        saveTemplateGroups = [];
    }
}

/**
 * Setup save template group autocomplete
 */
let saveTemplateAutocompleteInitialized = false;

function setupSaveTemplateGroupAutocomplete() {
    const input = document.getElementById('saveTemplateGroupInput');
    const dropdown = document.getElementById('saveTemplateGroupDropdown');

    if (!input || !dropdown || saveTemplateAutocompleteInitialized) {
        console.log('Save template autocomplete setup skipped:', { input: !!input, dropdown: !!dropdown, initialized: saveTemplateAutocompleteInitialized });
        return;
    }

    saveTemplateAutocompleteInitialized = true;
    let selectedIndex = -1;

    console.log('Setting up save template autocomplete...');

    // Show dropdown on focus
    input.addEventListener('focus', () => {
        console.log('Input focused, filtering groups...');
        filterSaveTemplateGroups(input.value);
    });

    // Filter as user types
    input.addEventListener('input', (e) => {
        selectedIndex = -1;
        filterSaveTemplateGroups(e.target.value);
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSaveTemplateSelection(items, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSaveTemplateSelection(items, selectedIndex);
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

/**
 * Filter and display groups for save template
 */
function filterSaveTemplateGroups(query) {
    const filtered = saveTemplateGroups.filter(group =>
        group.name.toLowerCase().includes(query.toLowerCase())
    );

    console.log('Filtering save template groups with query:', query, 'Found:', filtered.length);
    renderSaveTemplateGroupDropdown(filtered);
}

/**
 * Render save template group dropdown
 */
function renderSaveTemplateGroupDropdown(groups) {
    const dropdown = document.getElementById('saveTemplateGroupDropdown');
    const input = document.getElementById('saveTemplateGroupInput');

    if (!dropdown) return;

    // Get already selected group IDs
    const selectedIds = getSaveTemplateGroupIds();

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
    console.log('Save template dropdown displayed with', availableGroups.length, 'groups');

    // Add click handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            addSaveTemplateGroupTag(item.dataset.id, item.dataset.name);
            input.value = '';
            dropdown.style.display = 'none';
        });
    });
}

// Store selected groups for save template
let saveTemplateSelectedGroups = [];

function getSaveTemplateGroupIds() {
    return saveTemplateSelectedGroups.map(g => g.id);
}

function addSaveTemplateGroupTag(id, name) {
    // Check if already added
    if (saveTemplateSelectedGroups.find(g => g.id === id)) {
        return;
    }

    saveTemplateSelectedGroups.push({ id, name });
    renderSaveTemplateGroupTags();
}

function removeSaveTemplateGroupTag(id) {
    saveTemplateSelectedGroups = saveTemplateSelectedGroups.filter(g => g.id !== id);
    renderSaveTemplateGroupTags();
}

function renderSaveTemplateGroupTags() {
    const container = document.getElementById('saveTemplateSelectedGroupsTags');
    if (!container) return;

    if (saveTemplateSelectedGroups.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = saveTemplateSelectedGroups.map(group => `
        <span class="group-tag">
            ${escapeHtml(group.name)}
            <button type="button" class="group-tag-remove" onclick="removeSaveTemplateGroupTag('${group.id}')">&times;</button>
        </span>
    `).join('');
}

function clearSaveTemplateGroups() {
    saveTemplateSelectedGroups = [];
    renderSaveTemplateGroupTags();
}

/**
 * Update selection highlighting for save template
 */
function updateSaveTemplateSelection(items, selectedIndex) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });

    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

/**
 * Filter and display groups
 */
function filterGroups(query) {
    const filtered = allGroups.filter(group =>
        group.name.toLowerCase().includes(query.toLowerCase())
    );

    console.log('Filtering groups with query:', query, 'Found:', filtered.length);
    renderGroupDropdown(filtered);
}

/**
 * Render group dropdown
 */
function renderGroupDropdown(groups) {
    const dropdown = document.getElementById('groupDropdown');
    const input = document.getElementById('templateGroupInput');
    const hiddenInput = document.getElementById('templateGroupSelect');

    if (!dropdown) return;

    if (groups.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-empty">No groups found</div>';
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = groups.map(group => `
        <div class="autocomplete-item" data-id="${group.id}" data-name="${escapeHtml(group.name)}">
            ${escapeHtml(group.name)}
        </div>
    `).join('');

    dropdown.style.display = 'block';
    console.log('Dropdown displayed with', groups.length, 'groups');

    // Add click handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            input.value = item.dataset.name;
            hiddenInput.value = item.dataset.id;
            dropdown.style.display = 'none';
            console.log('Selected group:', item.dataset.name, 'ID:', item.dataset.id);
        });
    });
}

/**
 * Update selection highlighting
 */
function updateSelection(items, selectedIndex) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });

    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

/**
 * Confirm and save template
 */
async function confirmSaveTemplate() {
    const nameInput = document.getElementById('templateNameInput');
    const templateName = nameInput.value.trim();
    const tagsInput = document.getElementById('templateTagsInput').value;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    if (!templateName) {
        showToast('Please enter a template name', 'error');
        return;
    }

    try {
        showLoading('Saving template...');

        const payload = {
            name: templateName,
            tags: tags,
            sampleData: currentJsonData,
        };

        // Add original template ID if we're updating an existing template
        if (currentOriginalTemplateId) {
            payload.originalTemplateId = currentOriginalTemplateId;
            console.log('Updating existing template:', currentOriginalTemplateId);
        }

        // Add group IDs if any selected
        if (saveTemplateSelectedGroups.length > 0) {
            payload.groupIds = saveTemplateSelectedGroups.map(g => g.id);
            console.log('Sending group IDs:', payload.groupIds);
        }

        // Save the template
        const response = await auth.fetch(`/api/editor/save/${currentDocumentId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save template');
        }

        const result = await response.json();

        // Close modal
        document.getElementById('saveTemplateModal').style.display = 'none';

        // Destroy editor
        if (editorInstance) {
            editorInstance.destroyEditor();
            editorInstance = null;
        }

        currentDocumentId = null;
        currentJsonData = null;
        currentOriginalTemplateId = null;
        currentTemplateName = null;
        currentEditingGroups = [];
        currentEditingTags = [];

        const action = result.isUpdate ? 'updated' : 'created';
        showToast(`Template "${templateName}" ${action} successfully!`, 'success');

        // Navigate to templates view
        switchView('templates');
    } catch (error) {
        console.error('Error saving template:', error);
        showToast(`Failed to save template: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Cancel editor session
 */
async function cancelEditorSession() {
    if (!confirm('Are you sure you want to cancel? Unsaved changes will be lost.')) {
        return;
    }

    try {
        // Destroy editor
        if (editorInstance) {
            editorInstance.destroyEditor();
            editorInstance = null;
        }

        // Delete the document session
        if (currentDocumentId) {
            await auth.fetch(`/api/editor/${currentDocumentId}`, {
                method: 'DELETE',
            });
            currentDocumentId = null;
        }

        switchView('templates');
    } catch (error) {
        console.error('Error canceling editor:', error);
        switchView('templates');
    }
}

/**
 * Test render - preview template with JSON data
 */
async function testRender() {
    if (!currentJsonData) {
        alert('⚠️ Please insert JSON data first!\n\nClick "📋 Insert JSON" button to add sample data.');
        return;
    }

    if (!currentDocumentId) {
        alert('No active document session');
        return;
    }

    try {
        showLoading('Rendering test output...');

        const response = await auth.fetch(`/api/editor/test/${currentDocumentId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: currentJsonData }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Test render failed');
        }

        // Download the rendered file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'test_output.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        hideLoading();
        console.log('Test render completed successfully');

    } catch (error) {
        console.error('Test render error:', error);
        hideLoading();
        alert(`Test render failed: ${error.message}`);
    }
}

/**
 * Extract variables from JSON object
 */
function extractVariables(obj, prefix = '') {
    const vars = [];

    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(value)) {
            // Add loop variable
            vars.push({
                path: `#each ${path}`,
                endPath: `/each`,
                type: 'loop',
                sample: JSON.stringify(value[0], null, 2)
            });

            // Extract variables from array items
            if (value[0] && typeof value[0] === 'object') {
                const itemVars = extractVariables(value[0], path);
                vars.push(...itemVars);
            }
        } else if (typeof value === 'object' && value !== null) {
            // Recursively extract from nested objects
            vars.push(...extractVariables(value, path));
        } else {
            // Simple variable
            vars.push({
                path: path,
                type: typeof value,
                sample: String(value)
            });
        }
    }

    return vars;
}

/**
 * Show JSON data modal
 */
function showJsonDataModal() {
    const modal = document.getElementById('jsonDataModal');
    modal.style.display = 'flex';
    document.getElementById('jsonDataInput').focus();
}

/**
 * Parse JSON and display variables
 */
function parseJsonData() {
    const input = document.getElementById('jsonDataInput').value.trim();
    const errorDiv = document.getElementById('jsonError');

    if (!input) {
        errorDiv.textContent = 'Please enter JSON data';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const data = JSON.parse(input);
        const variables = extractVariables(data);

        // Store JSON data globally for test rendering
        currentJsonData = data;

        // Hide error
        errorDiv.style.display = 'none';

        // Close modal
        document.getElementById('jsonDataModal').style.display = 'none';

        // Show suggestions panel
        displayVariables(variables);

        console.log('JSON data stored for testing');

    } catch (error) {
        errorDiv.textContent = `Invalid JSON: ${error.message}`;
        errorDiv.style.display = 'block';
    }
}

/**
 * Extract variables with context awareness (Root vs Loop)
 */
function extractVariables(obj, prefix = '', context = 'root') {
    const vars = [];

    for (const [key, value] of Object.entries(obj)) {
        // Determine current path segment
        let currentPath;
        if (context === 'root') {
            currentPath = prefix ? `${prefix}.${key}` : key;
        } else {
            // In loop context, use 'this'
            currentPath = prefix ? `${prefix}.${key}` : key;
            // If prefix is empty inside loop, it means it's a direct property of 'this'
            if (!prefix) currentPath = `this.${key}`;
        }

        if (Array.isArray(value)) {
            // 1. Add Loop Start/End Block
            const loopName = context === 'root' ? key : `this.${key}`;
            const loopVar = {
                path: `#each ${loopName}`,
                endPath: `/each`,
                type: 'loop',
                group: context === 'root' ? key : `${prefix}.${key}`, // Group by the array name
                sample: JSON.stringify(value[0], null, 2),
                label: `Loop: ${loopName}`
            };
            vars.push(loopVar);

            // 2. Process Array Items (Recurse into loop context)
            if (value.length > 0 && typeof value[0] === 'object') {
                // Check if any fields in the array items are potential status/type fields for Conditionals
                const conditionalFields = identifyConditionalFields(value);

                conditionalFields.forEach(field => {
                    field.values.forEach(val => {
                        vars.push({
                            path: `#if this.${field.key} == '${val}'`,
                            endPath: `/if`,
                            type: 'conditional',
                            group: context === 'root' ? key : `${prefix}.${key}`,
                            label: `If ${field.key} == '${val}'`,
                            insertText: `\${#if this.${field.key} == '${val}'}\n    \n\${/if}`
                        });
                    });
                });

                // Extract properties of the array items
                // Only take the first item as a schema sample
                const itemVars = extractVariables(value[0], '', 'loop');

                // Add group info to item vars so they stay with their parent loop
                itemVars.forEach(v => {
                    v.group = loopVar.group;
                });
                vars.push(...itemVars);
            }
        } else if (typeof value === 'object' && value !== null) {
            // Nested Object
            const nestedContext = context; // Keep same context
            // For nested objects, we keep building the path: this.owner.name
            // If context is root: bank.address.city
            const nestedVars = extractVariables(value, currentPath.replace(/^this\./, ''), context);

            // Adjust groups for nested
            nestedVars.forEach(v => {
                if (!v.group) v.group = currentPath.split('.')[0]; // Default group
            });

            vars.push(...nestedVars);
        } else {
            // Simple Variable
            vars.push({
                path: currentPath,
                type: 'variable',
                group: currentPath.split('.')[0] === 'this' ? prefix : currentPath.split('.')[0],
                label: currentPath,
                sample: String(value),
                insertText: `\${${currentPath}}`
            });
        }
    }

    return vars;
}

/**
 * Identify fields suitable for #if logic (e.g. enum-like fields)
 */
function identifyConditionalFields(array) {
    if (!array || array.length === 0) return [];

    // Sample first 10 items
    const sample = array.slice(0, 10);
    const keys = Object.keys(sample[0]);
    const candidates = [];

    keys.forEach(key => {
        // Skip objects/arrays
        if (typeof sample[0][key] === 'object') return;

        const values = new Set();
        sample.forEach(item => {
            if (item[key] !== undefined) values.add(String(item[key]));
        });

        // Heuristic: If we have multiple items but few unique values (e.g. < 5), it's a good candidate
        if (values.size > 1 && values.size <= 5) {
            candidates.push({ key, values: Array.from(values) });
        }
    });

    return candidates;
}


/**
 * Global storage for all variables (for filtering)
 */
let allExtractedVariables = [];

/**
 * Group variables by their calculated group property
 */
function groupVariablesByPath(variables) {
    const groups = {};

    variables.forEach(variable => {
        // Use the assigned group or fallback to 'General'
        let groupName = variable.group || 'General';

        // Clean up group name
        if (groupName.startsWith('this.')) groupName = groupName.replace('this.', 'Loop: ');

        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(variable);
    });

    return groups;
}

/**
 * Filter variables by search query
 */
function filterVariables(query) {
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) {
        displayVariables(allExtractedVariables);
        return;
    }

    const filtered = allExtractedVariables.filter(v =>
        v.label.toLowerCase().includes(searchTerm) ||
        (v.sample && v.sample.toLowerCase().includes(searchTerm))
    );

    displayVariables(filtered, true); // true = skip storing to allExtractedVariables
}

/**
 * Display variables in suggestions panel with grouping
 */
function displayVariables(variables, skipStore = false) {
    const panel = document.getElementById('variableSuggestions');
    const list = document.getElementById('variablesList');

    // Store for filtering (unless this is a filtered display)
    if (!skipStore) {
        allExtractedVariables = variables;
    }

    // Clear existing
    list.innerHTML = '';

    if (!variables || variables.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 24px 0;">No variables found</p>';
        panel.style.display = 'block';
        return;
    }

    // Group variables
    const groups = groupVariablesByPath(variables);
    const groupNames = Object.keys(groups).sort();

    groupNames.forEach(groupName => {
        const groupVars = groups[groupName];

        // Create group container
        const groupDiv = document.createElement('div');
        groupDiv.className = 'variable-group';
        groupDiv.style.cssText = 'margin-bottom: 8px;';

        // Group header (collapsible)
        const header = document.createElement('div');
        header.className = 'variable-group-header';
        header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-tertiary); border-radius: 6px; cursor: pointer; user-select: none;';

        // Count types
        const loopCount = groupVars.filter(v => v.type === 'loop').length;
        const condCount = groupVars.filter(v => v.type === 'conditional').length;
        const varCount = groupVars.length - loopCount - condCount;

        header.innerHTML = `
            <span style="font-weight: 600; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                ${groupName} 
            </span>
            <div style="display: flex; gap: 4px; align-items: center;">
                 ${loopCount > 0 ? `<span style="font-size: 10px; padding: 1px 4px; background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border-radius: 4px;">${loopCount} 🔁</span>` : ''}
                 <span style="font-size: 10px; color: var(--text-muted);">▼</span>
            </div>
        `;

        // Group content
        const content = document.createElement('div');
        content.className = 'variable-group-content';
        content.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-top: 6px; padding-left: 8px;';

        // Add variables to group
        // Sort: Variables first, then Conditionals, then Loops
        groupVars.sort((a, b) => {
            const order = { 'variable': 1, 'conditional': 2, 'loop': 3 };
            return order[a.type] - order[b.type];
        });

        groupVars.forEach(variable => {
            const item = createVariableItem(variable);
            content.appendChild(item);
        });

        // Toggle handler
        header.addEventListener('click', () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'flex' : 'none';
            const toggle = header.querySelector('.group-toggle');
            if (toggle) toggle.textContent = isHidden ? '▼' : '▶';
        });

        groupDiv.appendChild(header);
        groupDiv.appendChild(content);
        list.appendChild(groupDiv);
    });

    // Update loops tab (legacy support or repurpose)
    updateLoopsTab();

    // Show panel as flex
    panel.style.display = 'flex';
}



/**
 * Create a single variable item element
 */
function createVariableItem(variable) {
    const item = document.createElement('div');
    item.className = 'variable-item';
    item.style.cssText = 'padding: 8px 10px; background: var(--bg-hover); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.15s; border: 1px solid transparent;';

    // Different visual styles based on type
    let icon, typeColor, typeBg, labelClass;

    if (variable.type === 'loop') {
        icon = '🔁';
        typeColor = '#8b5cf6';
        typeBg = 'rgba(139, 92, 246, 0.1)';
        labelClass = 'font-weight: 600;';
    } else if (variable.type === 'conditional') {
        icon = '⚡';
        typeColor = '#f59e0b';
        typeBg = 'rgba(245, 158, 11, 0.1)';
        labelClass = 'font-style: italic;';
    } else {
        icon = '📝';
        typeColor = '#6366f1';
        typeBg = 'rgba(99, 102, 241, 0.1)';
        labelClass = '';
    }

    // Determine insertion text
    let textToInsert = variable.insertText;
    if (!textToInsert) {
        if (variable.type === 'loop') {
            textToInsert = `\${${variable.path}}\n    \n\${${variable.endPath}}`;
        } else {
            textToInsert = `\${${variable.path}}`;
        }
    }

    item.innerHTML = `
        <div style="flex: 1; overflow: hidden; min-width: 0;">
            <div style="font-family: 'Monaco', 'Consolas', monospace; font-size: 11px; color: var(--accent-primary); font-weight: 500; word-break: break-all;">${icon} ${escapeHtml(variable.label)}</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                <span style="font-size: 10px; padding: 2px 6px; background: ${typeBg}; color: ${typeColor}; border-radius: 3px; font-weight: 500;">${variable.type}</span>
                ${variable.sample ? `<span style="font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${variable.sample.substring(0, 20)}${variable.sample.length > 20 ? '...' : ''}</span>` : ''}
            </div>
        </div>
        <button class="insert-var-btn" style="padding: 4px 8px; background: var(--accent-primary); color: white; border: none; border-radius: 4px; font-size: 10px; cursor: pointer; flex-shrink: 0; font-weight: 500;">Insert</button>
    `;

    // Insert button handler
    const insertBtn = item.querySelector('.insert-var-btn');
    insertBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        insertTextAtCursor(textToInsert);
    });

    // Hover effects
    item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--bg-tertiary)';
        item.style.borderColor = 'var(--border-color)';
    });
    item.addEventListener('mouseleave', () => {
        item.style.background = 'var(--bg-hover)';
        item.style.borderColor = 'transparent';
    });

    // Click on item also inserts
    item.addEventListener('click', function () {
        insertTextAtCursor(textToInsert);
    });

    return item;
}

/**
 * Copy text to clipboard with visual feedback
 */
function copyToClipboard(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            const originalText = button.textContent;
            button.textContent = '✓';
            button.style.background = 'var(--accent-success)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = 'var(--accent-primary)';
            }, 1500);
        }
    } catch (err) {
        console.error('Copy failed:', err);
        button.textContent = '✗';
        button.style.background = 'var(--accent-error)';

        setTimeout(() => {
            button.textContent = 'Copy';
            button.style.background = 'var(--accent-primary)';
        }, 1500);
    } finally {
        document.body.removeChild(textArea);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Save template button
    document.getElementById('saveTemplateBtn')?.addEventListener('click', showSaveTemplateDialog);

    // Insert JSON button
    document.getElementById('insertJsonBtn')?.addEventListener('click', showJsonDataModal);

    // Parse JSON button
    document.getElementById('parseJsonBtn')?.addEventListener('click', parseJsonData);

    // Test render button
    document.getElementById('testRenderBtn')?.addEventListener('click', testRender);

    // Cancel editor button
    document.getElementById('cancelEditorBtn')?.addEventListener('click', cancelEditorSession);

    // Confirm save button
    document.getElementById('confirmSaveBtn')?.addEventListener('click', confirmSaveTemplate);

    // JSON modal close handlers
    const jsonModal = document.getElementById('jsonDataModal');
    jsonModal?.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            jsonModal.style.display = 'none';
        });
    });

    // Close modal on outside click
    jsonModal?.addEventListener('click', (e) => {
        if (e.target === jsonModal) {
            jsonModal.style.display = 'none';
        }
    });

    // Save template modal close handlers
    const modal = document.getElementById('saveTemplateModal');
    const closeButtons = modal?.querySelectorAll('.modal-close');
    closeButtons?.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    });

    // Close modal on outside click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Enter key to save
    document.getElementById('templateNameInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmSaveTemplate();
        }
    });

    // Quick Insert Modal - Ctrl+Space handler
    initQuickInsert();

    // Tab switching for suggestion panel
    initSuggestionTabs();
});

/**
 * Initialize suggestion panel tabs
 */
function initSuggestionTabs() {
    const tabs = document.querySelectorAll('.suggestion-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchSuggestionTab(tabName);
        });
    });

    // Populate static tabs
    populateFormattersTab();
    populateConditionsTab();
}

/**
 * Switch suggestion panel tab
 */
function switchSuggestionTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.suggestion-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
            tab.style.color = 'var(--text-primary)';
            tab.style.borderBottomColor = 'var(--accent-primary)';
        } else {
            tab.classList.remove('active');
            tab.style.color = 'var(--text-muted)';
            tab.style.borderBottomColor = 'transparent';
        }
    });

    // Show/hide content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = content.id === `tab-${tabName}` ? 'block' : 'none';
    });
}

/**
 * Populate formatters tab with available formatters
 */
function populateFormattersTab() {
    const formatters = [
        { name: 'bold', desc: 'Make text bold', example: '${name|bold}' },
        { name: 'upper', desc: 'UPPERCASE text', example: '${name|upper}' },
        { name: 'lower', desc: 'lowercase text', example: '${name|lower}' },
        { name: 'currency', desc: 'Format as money (Rs. 1,00,000)', example: '${amount|currency}' },
        { name: 'number', desc: 'Format number', example: '${value|number:2}' },
        { name: 'percentage', desc: 'As percentage (9.5%)', example: '${rate|percentage}' },
        { name: 'date:DD/MM/YYYY', desc: 'Date format: 02/09/2025', example: '${date|date:DD/MM/YYYY}' },
        { name: 'date:DD MMMM YYYY', desc: 'Date format: 02 September 2025', example: '${date|date:DD MMMM YYYY}' },
        { name: 'date:YYYY-MM-DD', desc: 'ISO date: 2025-09-02', example: '${date|date:YYYY-MM-DD}' },
        { name: 'words', desc: 'Number to words', example: '${amount|words}' },
    ];

    const list = document.getElementById('formattersList');
    if (!list) return;

    list.innerHTML = formatters.map(f => `
        <div class="formatter-item" style="padding: 10px; background: var(--bg-hover); border-radius: 6px; cursor: pointer; transition: all 0.15s;" 
             onclick="copyToClipboard('|${f.name}', this.querySelector('.copy-btn'))">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <code style="color: var(--accent-primary); font-weight: 600; font-size: 12px;">|${f.name}</code>
                <button class="copy-btn" style="padding: 3px 8px; background: var(--accent-primary); color: white; border: none; border-radius: 4px; font-size: 10px; cursor: pointer;">Copy</button>
            </div>
            <div style="font-size: 11px; color: var(--text-muted);">${f.desc}</div>
            <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; font-family: monospace;">${f.example}</div>
        </div>
    `).join('');
}

/**
 * Populate conditions tab with condition templates
 */
function populateConditionsTab() {
    const conditions = [
        {
            name: 'Simple If',
            desc: 'Show content when condition is true',
            syntax: '${#if condition}\n  ...content...\n${/if}',
            copy: '${#if value} ${/if}'
        },
        {
            name: 'If-Else',
            desc: 'Show different content based on condition',
            syntax: '${#if value > 100}\n  Large amount\n${#else}\n  Small amount\n${/if}',
            copy: '${#if value > 0} yes ${#else} no ${/if}'
        },
        {
            name: 'Equals Check',
            desc: 'Check if value equals text',
            syntax: "${#if type == 'Vehicle'}\n  Vehicle collateral\n${/if}",
            copy: "${#if type == 'Value'} matched ${/if}"
        },
        {
            name: 'Greater Than',
            desc: 'Check if number is greater',
            syntax: '${#if amount > 100000}\n  ...content...\n${/if}',
            copy: '${#if amount > 0} positive ${/if}'
        },
        {
            name: 'Boolean Check',
            desc: 'Check true/false value',
            syntax: '${#if isAllowed}\n  Allowed\n${/if}',
            copy: '${#if isActive} active ${/if}'
        },
    ];

    const list = document.getElementById('conditionsList');
    if (!list) return;

    list.innerHTML = conditions.map(c => `
        <div class="condition-item" style="padding: 10px; background: var(--bg-hover); border-radius: 6px; cursor: pointer; transition: all 0.15s;"
             onclick="copyToClipboard(\`${c.copy.replace(/`/g, '\\`')}\`, this.querySelector('.copy-btn'))">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="color: var(--text-primary); font-size: 12px;">🔀 ${c.name}</strong>
                <button class="copy-btn" style="padding: 3px 8px; background: var(--accent-primary); color: white; border: none; border-radius: 4px; font-size: 10px; cursor: pointer;">Copy</button>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">${c.desc}</div>
            <pre style="font-size: 10px; color: var(--accent-primary); margin: 0; white-space: pre-wrap; background: var(--bg-tertiary); padding: 6px; border-radius: 4px;">${c.syntax}</pre>
        </div>
    `).join('');
}

/**
 * Update loops tab based on available arrays in JSON
 */
function updateLoopsTab() {
    const list = document.getElementById('loopsList');
    if (!list) return;

    // Find arrays in allExtractedVariables
    const loops = allExtractedVariables.filter(v => v.type === 'loop');

    if (loops.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px;">No arrays found in JSON data</p>';
        return;
    }

    list.innerHTML = loops.map(loop => {
        const arrayName = loop.path;
        return `
            <div class="loop-item" style="padding: 10px; background: var(--bg-hover); border-radius: 6px; margin-bottom: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <strong style="color: var(--text-primary); font-size: 12px;">🔁 ${arrayName}</strong>
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button onclick="copyToClipboard('\${#each ${arrayName}}', this)" style="padding: 4px 8px; background: var(--accent-success); color: white; border: none; border-radius: 4px; font-size: 10px; cursor: pointer;">Start Loop</button>
                    <button onclick="copyToClipboard('\${/each}', this)" style="padding: 4px 8px; background: var(--accent-error); color: white; border: none; border-radius: 4px; font-size: 10px; cursor: pointer;">End Loop</button>
                </div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 6px;">
                    Place Start and End on same table row for table loops
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Quick Insert Modal - Variable inserter with keyboard navigation
 */
let quickInsertSelectedIndex = 0;
let quickInsertFilteredVars = [];

function initQuickInsert() {
    const modal = document.getElementById('quickInsertModal');
    const searchInput = document.getElementById('quickInsertSearch');

    if (!modal || !searchInput) return;

    // Ctrl+Space to toggle quick insert
    document.addEventListener('keydown', (e) => {
        // Only activate in editor view
        const editorView = document.getElementById('editor-view');
        if (!editorView || !editorView.classList.contains('active')) return;

        if (e.ctrlKey && e.code === 'Space') {
            e.preventDefault();
            toggleQuickInsert();
        }

        // Escape to close
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            hideQuickInsert();
        }
    });

    // Search input handler
    searchInput.addEventListener('input', () => {
        filterQuickInsertVars(searchInput.value);
    });

    // Keyboard navigation in search
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectQuickInsertItem(quickInsertSelectedIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectQuickInsertItem(quickInsertSelectedIndex - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            copySelectedVariable();
        }
    });
}

function toggleQuickInsert() {
    const modal = document.getElementById('quickInsertModal');
    if (modal.style.display === 'none' || modal.style.display === '') {
        showQuickInsert();
    } else {
        hideQuickInsert();
    }
}

function showQuickInsert() {
    const modal = document.getElementById('quickInsertModal');
    const searchInput = document.getElementById('quickInsertSearch');

    modal.style.display = 'block';
    searchInput.value = '';
    searchInput.focus();

    // Populate with all variables
    quickInsertFilteredVars = [...allExtractedVariables];
    quickInsertSelectedIndex = 0;
    renderQuickInsertList();
}

function hideQuickInsert() {
    const modal = document.getElementById('quickInsertModal');
    modal.style.display = 'none';
}

function filterQuickInsertVars(query) {
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) {
        quickInsertFilteredVars = [...allExtractedVariables];
    } else {
        quickInsertFilteredVars = allExtractedVariables.filter(v =>
            v.path.toLowerCase().includes(searchTerm) ||
            (v.sample && v.sample.toLowerCase().includes(searchTerm))
        );
    }

    quickInsertSelectedIndex = 0;
    renderQuickInsertList();
}

function renderQuickInsertList() {
    const list = document.getElementById('quickInsertList');

    if (!quickInsertFilteredVars || quickInsertFilteredVars.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 24px;">No variables found</p>';
        return;
    }

    list.innerHTML = quickInsertFilteredVars.map((v, i) => {
        const syntax = v.type === 'loop'
            ? `\${${v.path}}...\${${v.endPath}}`
            : `\${${v.path}}`;
        const icon = v.type === 'loop' ? '🔁' : '📝';
        const isSelected = i === quickInsertSelectedIndex;

        return `
            <div class="quick-insert-item" data-index="${i}" 
                style="padding: 10px 12px; background: ${isSelected ? 'var(--accent-primary)' : 'var(--bg-hover)'}; 
                       color: ${isSelected ? 'white' : 'var(--text-primary)'};
                       border-radius: 6px; margin-bottom: 4px; cursor: pointer; transition: all 0.1s;">
                <div style="font-family: 'Monaco', 'Consolas', monospace; font-size: 12px; font-weight: 500;">
                    ${icon} ${syntax}
                </div>
                ${v.sample ? `<div style="font-size: 11px; opacity: 0.7; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${v.sample.substring(0, 40)}</div>` : ''}
            </div>
        `;
    }).join('');

    // Add click handlers
    list.querySelectorAll('.quick-insert-item').forEach(item => {
        item.addEventListener('click', () => {
            quickInsertSelectedIndex = parseInt(item.dataset.index);
            copySelectedVariable();
        });

        item.addEventListener('mouseenter', () => {
            quickInsertSelectedIndex = parseInt(item.dataset.index);
            renderQuickInsertList();
        });
    });
}

function selectQuickInsertItem(newIndex) {
    if (quickInsertFilteredVars.length === 0) return;

    // Wrap around
    if (newIndex < 0) newIndex = quickInsertFilteredVars.length - 1;
    if (newIndex >= quickInsertFilteredVars.length) newIndex = 0;

    quickInsertSelectedIndex = newIndex;
    renderQuickInsertList();

    // Scroll selected into view
    const list = document.getElementById('quickInsertList');
    const selected = list.querySelector(`[data-index="${newIndex}"]`);
    if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
    }
}

function copySelectedVariable() {
    if (quickInsertFilteredVars.length === 0) return;

    const variable = quickInsertFilteredVars[quickInsertSelectedIndex];
    let textToInsert = variable.insertText;

    if (!textToInsert) {
        if (variable.type === 'loop') {
            textToInsert = `\${${variable.path}}\n    \n\${${variable.endPath}}`;
        } else {
            textToInsert = `\${${variable.path}}`;
        }
    }

    insertTextAtCursor(textToInsert);
    hideQuickInsert();
}

/**
 * Insert text at current cursor position in editor
 */
function insertTextAtCursor(text) {
    if (editorInstance) {
        // Try OnlyOffice API
        try {
            // PasteHtml works for variable tags too
            editorInstance.executeMethod("PasteHtml", [text]);
        } catch (e) {
            console.error('Failed to insert via API:', e);
            // Fallback to clipboard
            fallbackCopy(text);
        }
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
        document.execCommand('copy');
        showToast(`Copied to clipboard: ${text}`, 'success');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    } finally {
        document.body.removeChild(textArea);
    }
}

// Template Helper Toggle
document.addEventListener('DOMContentLoaded', () => {
    // Use event delegation or check if elements exist (e.g. if editor view is active)
    // But since this is a single page app logic, we can attach listener to body or check on demand.
    // However, the button is in the DOM from start (in index.html).
    // Let's attach safely.
    
    // We can also attach via onclick in HTML, but cleaner here.
    const body = document.body;
    body.addEventListener('click', (e) => {
        const btn = e.target.closest('#toggleHelperBtn');
        if (btn) {
            const panel = document.getElementById('variableSuggestions');
            if (panel) {
                panel.classList.toggle('collapsed');
                
                // Adjust title tooltip
                if (panel.classList.contains('collapsed')) {
                    btn.title = "Expand Helper";
                } else {
                    btn.title = "Collapse Helper";
                }
            }
        }
    });
});
