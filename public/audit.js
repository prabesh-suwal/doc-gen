// Audit Log Functions
async function loadAuditLogs() {
    try {
        const limit = 100;
        const response = await auth.fetch(`/api/audit-logs?limit=${limit}`);

        if (!response.ok) throw new Error('Failed to load audit logs');

        const data = await response.json();
        displayAuditLogs(data.logs);
    } catch (error) {
        console.error('Error loading audit logs:', error);
        document.getElementById('auditLogsTableBody').innerHTML = `
            <tr>
                <td colspan="6" style="padding: 32px; text-align: center; color: #e53e3e;">
                    Failed to load audit logs: ${error.message}
                </td>
            </tr>
        `;
    }
}

function displayAuditLogs(logs) {
    const tbody = document.getElementById('auditLogsTableBody');

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 32px; text-align: center; color: #718096;">
                    No audit logs found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px; font-size: 13px; color: #718096;">
                ${new Date(log.created_at).toLocaleString()}
            </td>
            <td style="padding: 12px; font-weight: 500;">
                ${log.username || 'System'}
            </td>
            <td style="padding: 12px;">
                <span style="
                    padding: 4px 12px;
                    background: ${getActionColor(log.action)};
                    color: white;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                ">${log.action.replace(/_/g, ' ')}</span>
            </td>
            <td style="padding: 12px; color: #718096; font-size: 13px;">
                ${log.resource_type || '-'}
            </td>
            <td style="padding: 12px; color: #718096; font-size: 13px;">
                ${log.ip_address || '-'}
            </td>
            <td style="padding: 12px; color: #718096; font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
                ${log.details ? JSON.stringify(log.details) : '-'}
            </td>
        </tr>
    `).join('');
}

function getActionColor(action) {
    if (action.includes('login') || action.includes('created')) return '#48bb78';
    if (action.includes('failed') || action.includes('deleted')) return '#e53e3e';
    if (action.includes('updated') || action.includes('refresh')) return '#4299e1';
    if (action.includes('logout')) return '#718096';
    return '#ed8936';
}

function filterAuditLogs() {
    const action = document.getElementById('filterAction').value;
    const username = document.getElementById('filterUsername').value.toLowerCase();

    const rows = document.querySelectorAll('#auditLogsTableBody tr');

    rows.forEach(row => {
        const actionCell = row.cells[2]?.textContent.toLowerCase() || '';
        const usernameCell = row.cells[1]?.textContent.toLowerCase() || '';

        const matchAction = !action || actionCell.includes(action);
        const matchUsername = !username || usernameCell.includes(username);

        row.style.display = (matchAction && matchUsername) ? '' : 'none';
    });
}
