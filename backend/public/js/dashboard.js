let serverData = [];

// Load server status
async function loadServers() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        if (data.success) {
            serverData = data.servers;
            displayServersTable(data.servers);
            updateStats(data.servers);
        }
    } catch (error) {
        console.error('Error loading servers:', error);
        document.getElementById('serversTable').innerHTML = 
            '<div class="error-message">Failed to load servers</div>';
    }
}

// Group servers by customer
function groupByCustomer(servers) {
    const groups = {};
    servers.forEach(server => {
        const customer = server.customer || 'Unknown';
        if (!groups[customer]) {
            groups[customer] = [];
        }
        groups[customer].push(server);
    });
    return groups;
}

// Display servers in Excel-like table format
function displayServersTable(servers) {
    const container = document.getElementById('serversTable');
    
    if (!servers || servers.length === 0) {
        container.innerHTML = '<div class="loading">No servers configured</div>';
        return;
    }
    
    const customerGroups = groupByCustomer(servers);
    
    let tableHTML = '<table class="servers-table">';
    
    // Table header
    tableHTML += `
        <thead>
            <tr>
                <th>Server Name</th>
                <th>URL</th>
                <th>Status</th>
                <th>Response</th>
                <th>SSL OK</th>
                <th>SSL Expires</th>
                <th>Days Left</th>
                <th>Last Checked</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    // Generate rows for each customer group
    for (const [customer, customerServers] of Object.entries(customerGroups)) {
        // Customer group header
        tableHTML += `
            <tr class="customer-group-header">
                <td colspan="9">
                    <div class="customer-name">
                        <span>
                            <strong>${escapeHtml(customer)}</strong>
                            <span class="customer-count">(${customerServers.length} server${customerServers.length !== 1 ? 's' : ''})</span>
                        </span>
                        <button class="test-customer-btn" onclick="testCustomerServers('${escapeHtml(customer)}')">
                            🔍 Test All ${escapeHtml(customer)}
                        </button>
                    </div>
                </td>
            </tr>
        `;
        
        // Server rows
        customerServers.forEach(server => {
            const statusClass = server.is_online ? 
                (server.ssl_days_remaining !== null && server.ssl_days_remaining <= 30 ? 'warning' : 'online') : 
                'offline';
            
            const statusText = server.is_online ? 
                (server.ssl_days_remaining !== null && server.ssl_days_remaining <= 30 ? 'SSL Warning' : 'Online') : 
                'Offline';
            
            const sslValid = server.ssl_valid === 1 ? 'Yes' : server.ssl_valid === 0 ? 'No' : 'N/A';
            const sslClass = server.ssl_valid === 1 ? 'ssl-yes' : server.ssl_valid === 0 ? 'ssl-no' : '';
            
            tableHTML += `
                <tr data-server-url="${escapeHtml(server.server_url)}">
                    <td class="server-name-cell">${escapeHtml(server.server_name)}</td>
                    <td class="server-url-cell">
                        <a href="${escapeHtml(server.server_url)}" target="_blank" rel="noopener noreferrer" title="Click to open ${escapeHtml(server.server_url)}">
                            ${escapeHtml(server.server_url)}
                        </a>
                    </td>
                    <td class="status-cell">
                        <span class="status-dot ${statusClass}"></span>
                        <span class="status-text ${statusClass}">${statusText}</span>
                    </td>
                    <td class="response-time-cell">${server.response_time ? server.response_time + ' ms' : 'N/A'}</td>
                    <td class="ssl-cell ${sslClass}">${sslValid}</td>
                    <td class="date-cell">${server.ssl_expires_at ? new Date(server.ssl_expires_at).toLocaleDateString() : 'N/A'}</td>
                    <td class="date-cell">${server.ssl_days_remaining !== null ? server.ssl_days_remaining + ' days' : 'N/A'}</td>
                    <td class="date-cell">${new Date(server.checked_at).toLocaleString()}</td>
                    <td class="action-cell">
                        <button class="btn-test-small" onclick="testServer('${escapeHtml(server.server_url)}', this)">
                            Test
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    
    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

// Test all servers for a specific customer
async function testCustomerServers(customer) {
    const customerServers = serverData.filter(s => (s.customer || 'Unknown') === customer);
    
    if (customerServers.length === 0) return;
    
    // Find the button and update its state
    const buttons = document.querySelectorAll('.test-customer-btn');
    let targetButton = null;
    buttons.forEach(btn => {
        if (btn.textContent.includes(customer)) {
            targetButton = btn;
        }
    });
    
    if (targetButton) {
        const originalText = targetButton.innerHTML;
        targetButton.disabled = true;
        targetButton.innerHTML = '⏳ Testing...';
        
        try {
            // Test all servers in this customer group sequentially
            for (const server of customerServers) {
                await fetch(`/api/status/check/${encodeURIComponent(server.server_url)}`, {
                    method: 'POST'
                });
            }
            
            targetButton.innerHTML = '✅ Complete!';
            setTimeout(() => {
                loadServers();
                targetButton.innerHTML = originalText;
                targetButton.disabled = false;
            }, 1000);
        } catch (error) {
            console.error('Test failed:', error);
            targetButton.innerHTML = '❌ Error';
            setTimeout(() => {
                targetButton.innerHTML = originalText;
                targetButton.disabled = false;
            }, 2000);
        }
    }
}

// Update statistics
function updateStats(servers) {
    const total = servers.length;
    const online = servers.filter(s => s.is_online === 1).length;
    const offline = servers.filter(s => s.is_online === 0).length;
    const sslWarnings = servers.filter(s => 
        s.ssl_days_remaining !== null && s.ssl_days_remaining <= 30 && s.ssl_days_remaining > 0
    ).length;
    
    document.getElementById('totalServers').textContent = total;
    document.getElementById('onlineServers').textContent = online;
    document.getElementById('offlineServers').textContent = offline;
    document.getElementById('sslWarnings').textContent = sslWarnings;
}

// Test individual server
async function testServer(serverUrl, button) {
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '⏳';
    
    try {
        const response = await fetch(`/api/status/check/${encodeURIComponent(serverUrl)}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            button.innerHTML = '✅';
            setTimeout(() => {
                loadServers(); // Reload all servers to get updated status
            }, 500);
        } else {
            button.innerHTML = '❌';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Test failed:', error);
        button.innerHTML = '❌';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
    }
}

// Refresh all servers
async function refreshAll() {
    const button = document.getElementById('refreshBtn');
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '⏳ Checking...';
    
    try {
        const response = await fetch('/api/status/check-all', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            button.innerHTML = '✅ Complete!';
            setTimeout(() => {
                loadServers();
                button.innerHTML = originalText;
                button.disabled = false;
            }, 1000);
        } else {
            button.innerHTML = '❌ Failed';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Refresh failed:', error);
        button.innerHTML = '❌ Error';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadServers();
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshAll);
    }
    
    // Auto-refresh every 30 seconds
    setInterval(loadServers, 30000);
});
