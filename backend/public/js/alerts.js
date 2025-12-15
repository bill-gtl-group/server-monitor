let allAlerts = [];
let currentFilter = 'all';

// Load alerts
async function loadAlerts() {
    try {
        const response = await fetch('/api/alerts');
        const data = await response.json();
        
        if (data.success) {
            allAlerts = data.alerts;
            displayAlerts(filterAlerts(allAlerts));
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
        document.getElementById('alertsList').innerHTML = 
            '<div class="error-message">Failed to load alerts</div>';
    }
}

// Filter alerts by status
function filterAlerts(alerts) {
    if (currentFilter === 'all') {
        return alerts;
    }
    return alerts.filter(alert => alert.status === currentFilter);
}

// Display alerts
function displayAlerts(alerts) {
    const container = document.getElementById('alertsList');
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="loading">No alerts found</div>';
        return;
    }
    
    container.innerHTML = alerts.map(alert => {
        const statusEmoji = {
            'new': '🆕',
            'in_process': '🟡',
            'done': '🟢',
            'abort': '⚫'
        };
        
        const issueEmoji = {
            'offline': '🔴',
            'ssl_expiring': '🟡',
            'ssl_failed': '🔴',
            'slow_response': '🟡'
        };
        
        return `
            <div class="alert-item">
                <div class="alert-header">
                    <div class="alert-title">
                        ${issueEmoji[alert.issue_type] || '⚠️'} 
                        ${escapeHtml(alert.server_name)} - ${formatIssueType(alert.issue_type)}
                    </div>
                    <div class="alert-time">
                        ${new Date(alert.created_at).toLocaleString()}
                    </div>
                </div>
                
                <div class="alert-body">
                    <p><strong>Server:</strong> ${escapeHtml(alert.server_url)}</p>
                    <p><strong>Issue:</strong> ${escapeHtml(alert.issue_details)}</p>
                    <p><strong>Status:</strong> ${statusEmoji[alert.status]} ${alert.status.toUpperCase().replace('_', ' ')}</p>
                    <p><strong>Alert Count:</strong> ${alert.alert_count}</p>
                    <p><strong>Last Alerted:</strong> ${new Date(alert.last_alerted_at).toLocaleString()}</p>
                </div>
                
                <div class="alert-actions">
                    ${alert.status !== 'in_process' ? `
                    <button class="btn btn-warning btn-small" onclick="updateAlertStatus('${alert.id}', 'in_process')">
                        🟡 Mark In Process
                    </button>
                    ` : ''}
                    ${alert.status !== 'done' ? `
                    <button class="btn btn-success btn-small" onclick="updateAlertStatus('${alert.id}', 'done')">
                        🟢 Mark Done
                    </button>
                    ` : ''}
                    ${alert.status !== 'abort' ? `
                    <button class="btn btn-secondary btn-small" onclick="updateAlertStatus('${alert.id}', 'abort')">
                        ⚫ Abort
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Update alert status
async function updateAlertStatus(alertId, newStatus) {
    try {
        const response = await fetch(`/api/alerts/${alertId}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Reload alerts
            await loadAlerts();
        } else {
            alert('Failed to update alert status');
        }
    } catch (error) {
        console.error('Error updating alert:', error);
        alert('Error updating alert status');
    }
}

// Format issue type for display
function formatIssueType(type) {
    const typeMap = {
        'offline': 'Server Offline',
        'ssl_expiring': 'SSL Expiring Soon',
        'ssl_failed': 'SSL Certificate Failed',
        'slow_response': 'Slow Response'
    };
    return typeMap[type] || type;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAlerts();
    
    // Filter dropdown
    const filterSelect = document.getElementById('statusFilter');
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            displayAlerts(filterAlerts(allAlerts));
        });
    }
    
    // Auto-refresh every 30 seconds
    setInterval(loadAlerts, 30000);
});
