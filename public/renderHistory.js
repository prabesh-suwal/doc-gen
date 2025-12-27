// Render History Functions
async function loadRenderHistory() {
    try {
        const limit = 100;
        const response = await auth.fetch(`/api/render-history/all?limit=${limit}`);

        if (!response.ok) throw new Error('Failed to load render history');

        const data = await response.json();
        displayRenderHistory(data.renders);
    } catch (error) {
        console.error('Error loading render history:', error);
        document.getElementById('renderHistoryTableBody').innerHTML = `
            <tr>
                <td colspan="7" style="padding: 32px; text-align: center; color: #e53e3e;">
                    Failed to load render history: ${error.message}
                </td>
            </tr>
        `;
    }
}

function displayRenderHistory(renders) {
    const tbody = document.getElementById('renderHistoryTableBody');

    if (!renders || renders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 48px; text-align: center; color: #718096;">
                    <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
                    <div style="font-weight: 600; margin-bottom: 4px;">No render history found</div>
                    <div style="font-size: 14px; opacity: 0.8;">Render operations will appear here</div>
                </td>
            </tr>
        `;
        // Reset stats
        document.getElementById('totalRenders').textContent = '0';
        document.getElementById('successRenders').textContent = '0';
        document.getElementById('failedRenders').textContent = '0';
        document.getElementById('avgDuration').textContent = '-';
        return;
    }

    // Calculate stats
    const total = renders.length;
    const successful = renders.filter(r => r.status === 'success').length;
    const failed = renders.filter(r => r.status === 'failure').length;
    const durations = renders.filter(r => r.duration_ms).map(r => r.duration_ms);
    const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    // Update stats
    document.getElementById('totalRenders').textContent = total;
    document.getElementById('successRenders').textContent = successful;
    document.getElementById('failedRenders').textContent = failed;
    document.getElementById('avgDuration').textContent = avgDuration > 0 ? avgDuration + 'ms' : '-';

    // Render table
    tbody.innerHTML = renders.map(render => `
        <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" 
            onmouseover="this.style.background='#f7fafc'" 
            onmouseout="this.style.background='white'">
            <td style="padding: 14px 12px; font-size: 13px; color: #718096;">
                ${new Date(render.created_at).toLocaleString()}
            </td>
            <td style="padding: 14px 12px; font-weight: 500; color: #4a5568; font-family: monospace; font-size: 12px;">
                ${render.user_id ? render.user_id.substring(0, 8) + '...' : '-'}
            </td>
            <td style="padding: 14px 12px; color: #2d3748; font-weight: 500;">
                ${render.template_name || 'Unknown'}
            </td>
            <td style="padding: 14px 12px;">
                <span style="
                    padding: 6px 14px;
                    background: ${getFormatColor(render.output_format)};
                    color: white;
                    border-radius: 14px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                ">${render.output_format}</span>
            </td>
            <td style="padding: 14px 12px;">
                <span style="
                    padding: 6px 14px;
                    background: ${render.status === 'success' ? '#48bb78' : '#e53e3e'};
                    color: white;
                    border-radius: 14px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                ">${render.status === 'success' ? '✓' : '✗'} ${render.status}</span>
            </td>
            <td style="padding: 14px 12px; color: #718096; font-size: 13px; font-family: monospace;">
                ${render.duration_ms ? render.duration_ms + 'ms' : '-'}
            </td>
            <td style="padding: 14px 12px; color: #718096; font-size: 13px; font-weight: 500;">
                ${render.file_size ? formatFileSize(render.file_size) : '-'}
            </td>
        </tr>
    `).join('');
}

function getFormatColor(format) {
    const colors = {
        'docx': '#4299e1',
        'pdf': '#e53e3e',
        'html': '#ed8936'
    };
    return colors[format] || '#718096';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function filterRenderHistory() {
    const status = document.getElementById('filterStatus').value;
    const template = document.getElementById('filterTemplate').value.toLowerCase();

    const rows = document.querySelectorAll('#renderHistoryTableBody tr');

    rows.forEach(row => {
        const statusCell = row.cells[4]?.textContent.toLowerCase() || '';
        const templateCell = row.cells[2]?.textContent.toLowerCase() || '';

        const matchStatus = !status || statusCell.includes(status);
        const matchTemplate = !template || templateCell.includes(template);

        row.style.display = (matchStatus && matchTemplate) ? '' : 'none';
    });
}
