// OnlyOffice Editor Integration
let editorInstance = null;
let currentDocumentId = null;
let currentJsonData = null; // Store JSON data for test rendering


/**
 * Initialize OnlyOffice editor
 */
async function initializeEditor() {
    try {
        // Create a new document session
        const response = await auth.fetch('/api/editor/create', {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error('Failed to create editor session');
        }

        const { documentId } = await response.json();
        currentDocumentId = documentId;

        // Get editor configuration
        const configResponse = await auth.fetch(`/api/editor/config/${documentId}`);
        if (!configResponse.ok) {
            throw new Error('Failed to get editor configuration');
        }

        const config = await configResponse.json();

        // Hide placeholder
        const placeholder = document.getElementById('editorPlaceholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        // Calculate explicit height for OnlyOffice (it doesn't work well with percentages)
        const container = document.getElementById('editorContainer');
        const containerHeight = container.offsetHeight;

        // Override config height with explicit pixels
        config.height = containerHeight + 'px';

        console.log('Initializing OnlyOffice with height:', config.height);

        // Initialize OnlyOffice DocumentEditor
        editorInstance = new DocsAPI.DocEditor("editorContainer", config);

        console.log('OnlyOffice editor initialized:', documentId);
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

    // Clear previous inputs
    nameInput.value = '';
    tagsInput.value = '';
    document.getElementById('saveTemplateGroupInput').value = '';

    // Clear selected groups
    clearSaveTemplateGroups();

    // Load groups for autocomplete
    console.log('About to load groups for save template...');
    await loadGroupsForSaveTemplate();
    console.log('Groups loaded');

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
}

/**
 * Show save template modal
 */
async function showSaveTemplateModal() {
    console.log('showSaveTemplateModal called');
    const modal = document.getElementById('saveTemplateModal');
    const nameInput = document.getElementById('templateNameInput');

    // Clear previous values
    nameInput.value = '';
    document.getElementById('saveTemplateGroupInput').value = '';
    document.getElementById('saveTemplateGroupId').value = '';
    document.getElementById('templateTagsInput').value = '';

    // Clear selected groups
    clearSaveTemplateGroups();

    // Load groups for autocomplete
    console.log('About to load groups...');
    await loadGroupsForSaveTemplate();
    console.log('Groups loaded, showing modal');

    modal.style.display = 'flex';
    nameInput.focus();
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

        showToast(`Template "${templateName}" saved successfully!`, 'success');

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
 * Display variables in suggestions panel
 */
function displayVariables(variables) {
    const panel = document.getElementById('variableSuggestions');
    const list = document.getElementById('variablesList');

    // Clear existing
    list.innerHTML = '';

    if (variables.length === 0) {
        list.innerHTML = '<p style="color: #718096; font-size: 14px; text-align: center; padding: 24px 0;">No variables found</p>';
        return;
    }

    // Add variables
    variables.forEach(variable => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 8px 12px; background: #f7fafc; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s;';

        const syntax = variable.type === 'loop'
            ? `\${${variable.path}}...\${${variable.endPath}}`
            : `\${${variable.path}}`;

        const icon = variable.type === 'loop' ? '🔁' : '📋';

        item.innerHTML = `
            <div style="flex: 1; overflow: hidden;">
                <div style="font-family: 'Courier New', monospace; font-size: 13px; color: #2d3748; font-weight: 600;">${icon} ${syntax}</div>
                <div style="font-size: 11px; color: #718096; margin-top: 2px;">${variable.type} ${variable.sample ? `• ${variable.sample.substring(0, 30)}${variable.sample.length > 30 ? '...' : ''}` : ''}</div>
            </div>
            <button class="copy-btn" style="padding: 4px 8px; background: #4299e1; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">Copy</button>
        `;

        // Copy button handler
        const copyBtn = item.querySelector('.copy-btn');
        copyBtn.addEventListener('click', function (e) {
            e.stopPropagation();

            // Create temporary textarea for copying (works without HTTPS)
            const textArea = document.createElement('textarea');
            textArea.value = syntax;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();

            try {
                const successful = document.execCommand('copy');

                if (successful) {
                    // Visual feedback
                    this.textContent = '✓ Copied!';
                    this.style.background = '#48bb78';

                    console.log('Copied:', syntax);

                    // Reset after 2 seconds
                    setTimeout(() => {
                        this.textContent = 'Copy';
                        this.style.background = '#4299e1';
                    }, 2000);
                } else {
                    throw new Error('Copy failed');
                }
            } catch (err) {
                console.error('Copy error:', err);
                this.textContent = '✗ Failed';
                this.style.background = '#e53e3e';

                setTimeout(() => {
                    this.textContent = 'Copy';
                    this.style.background = '#4299e1';
                }, 2000);
            } finally {
                document.body.removeChild(textArea);
            }
        });

        // Hover effect
        item.addEventListener('mouseenter', () => {
            item.style.background = '#edf2f7';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = '#f7fafc';
        });

        list.appendChild(item);
    });

    // Show panel
    panel.style.display = 'block';
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
});
