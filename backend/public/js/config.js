// Load current configuration
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        if (data.success && data.config) {
            // SMTP Settings
            if (data.config.smtp) {
                document.getElementById('smtpHost').value = data.config.smtp.host || '';
                document.getElementById('smtpPort').value = data.config.smtp.port || 25;
                document.getElementById('smtpFrom').value = data.config.smtp.from || '';
                document.getElementById('smtpFromName').value = data.config.smtp.fromName || '';
                document.getElementById('smtpTo').value = data.config.smtp.to || '';
            }
            
            // API Settings
            if (data.config.api) {
                document.getElementById('apiPort').value = data.config.api.port || 3000;
                document.getElementById('apiBaseUrl').value = data.config.api.baseUrl || '';
            }
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
}

// Save SMTP settings
document.getElementById('smtpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const messageDiv = document.getElementById('smtpMessage');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    
    try {
        const smtpConfig = {
            host: document.getElementById('smtpHost').value,
            port: parseInt(document.getElementById('smtpPort').value),
            from: document.getElementById('smtpFrom').value,
            fromName: document.getElementById('smtpFromName').value,
            to: document.getElementById('smtpTo').value
        };
        
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ smtp: smtpConfig })
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageDiv.className = 'success-message';
            messageDiv.textContent = 'SMTP settings saved successfully!';
            messageDiv.style.display = 'block';
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        } else {
            throw new Error(data.error || 'Failed to save settings');
        }
    } catch (error) {
        messageDiv.className = 'error-message';
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
    }
});

// Save API settings
document.getElementById('apiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const messageDiv = document.getElementById('apiMessage');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    
    try {
        const apiConfig = {
            port: parseInt(document.getElementById('apiPort').value),
            baseUrl: document.getElementById('apiBaseUrl').value
        };
        
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ api: apiConfig })
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageDiv.className = 'success-message';
            messageDiv.textContent = 'API settings saved successfully!';
            messageDiv.style.display = 'block';
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        } else {
            throw new Error(data.error || 'Failed to save settings');
        }
    } catch (error) {
        messageDiv.className = 'error-message';
        messageDiv.textContent = error.message;
        messageDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
    }
});

// Test SMTP connection
document.getElementById('testSmtpBtn').addEventListener('click', async () => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Testing...';
    
    try {
        const response = await fetch('/api/config/test-smtp', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        const messageDiv = document.getElementById('smtpMessage');
        if (data.success) {
            messageDiv.className = 'success-message';
            messageDiv.textContent = '✅ SMTP connection successful!';
        } else {
            messageDiv.className = 'error-message';
            messageDiv.textContent = '❌ SMTP connection failed';
        }
        messageDiv.style.display = 'block';
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    } catch (error) {
        const messageDiv = document.getElementById('smtpMessage');
        messageDiv.className = 'error-message';
        messageDiv.textContent = 'Error testing SMTP: ' + error.message;
        messageDiv.style.display = 'block';
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

// Download servers.csv
document.getElementById('downloadServersBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/servers/download');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'servers.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        alert('Error downloading servers.csv: ' + error.message);
    }
});

// Download template
document.getElementById('downloadTemplateBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/servers/template');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'servers.csv.template';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        alert('Error downloading template: ' + error.message);
    }
});

// Upload servers.csv
document.getElementById('uploadServers').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const messageDiv = document.getElementById('uploadMessage');
    messageDiv.style.display = 'block';
    messageDiv.className = 'loading';
    messageDiv.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/servers/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageDiv.className = 'success-message';
            messageDiv.textContent = `✅ Upload successful! ${data.serversCount} servers loaded. Please restart the container for changes to take effect.`;
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        messageDiv.className = 'error-message';
        messageDiv.textContent = '❌ ' + error.message;
    }
    
    // Reset file input
    e.target.value = '';
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
});
