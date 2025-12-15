# Server Health Monitor

A comprehensive Docker-based server health monitoring system with SSL certificate checking and email alerts.

## Features

✅ **Health Monitoring**
- HTTP/HTTPS endpoint availability checks
- Response time tracking
- Status code monitoring
- Configurable check intervals (default: 5 minutes)

✅ **SSL Certificate Monitoring**
- Certificate expiration tracking
- Validity checks
- Configurable warning thresholds (default: 30 days)
- SSL failure detection

✅ **Smart Email Alerts**
- SMTP-based email notifications (Port 25, no auth)
- Intelligent alert throttling:
  - New alerts: Every 1 hour
  - In Process: Every 24 hours
  - Done/Abort: No more alerts
- Click-to-acknowledge email links
- Beautiful HTML email templates

✅ **Scalable Architecture**
- Supports up to 100+ servers
- Batch processing (10 servers at a time)
- SQLite database for history
- RESTful API
- Docker containerized

## Quick Start

### 1. Prerequisites

- Docker Desktop for Windows 11
- Git (optional)

### 2. Setup Configuration

```bash
cd C:\dockerimages\monitor\data

# Copy example files
copy config.json.example config.json
copy servers.csv.example servers.csv

# Edit config.json with your SMTP settings
notepad config.json
```

**config.json:**
```json
{
  "smtp": {
    "host": "mail.yourcompany.com",
    "port": 25,
    "secure": false,
    "from": "monitor@yourcompany.com",
    "fromName": "Server Health Monitor",
    "to": "admin@yourcompany.com"
  },
  "api": {
    "port": 3000,
    "corsOrigin": "*",
    "baseUrl": "https://monitor.yourcompany.com"
  }
}
```

**Configuration Fields:**
- `smtp.host`: Your SMTP server hostname
- `smtp.port`: SMTP port (typically 25)
- `smtp.from`: Email sender address
- `smtp.fromName`: Sender display name
- `smtp.to`: Additional email recipient (receives all alerts + weekly reports)
- `api.port`: API server port (default: 3000)
- `api.corsOrigin`: CORS origin (default: "*")
- `api.baseUrl`: **Public URL for email links** (e.g., `https://monitor.yourcompany.com`)
  - Used in alert emails for action buttons
  - Used in weekly reports for dashboard link
  - Important if using reverse proxy or public domain mapping

### 3. Configure Servers

Edit `data/servers.csv` with your servers:

```csv
name,url,check_interval,ssl_alert_days,alert_email,enabled
Production API,https://api.example.com,300,30,devops@example.com,true
Main Website,https://www.example.com,300,30,webmaster@example.com,true
```

**CSV Fields:**
- `name`: Friendly server name
- `url`: Full URL including https://
- `check_interval`: Seconds between checks (300 = 5 min)
- `ssl_alert_days`: Alert when SSL expires within X days
- `alert_email`: Email address for alerts
- `enabled`: true/false to enable/disable monitoring

### 4. Build and Run

```bash
cd C:\dockerimages\monitor

# Build the Docker image
docker-compose build

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f
```

### 5. Verify Installation

```bash
# Check if container is running
docker ps

# Test API endpoint
curl http://localhost:3000/api/health

# View server status
curl http://localhost:3000/api/status
```

## API Endpoints

### Health Check
```bash
GET /api/health
```

### Server Status
```bash
# Get all server statuses
GET /api/status

# Get specific server history
GET /api/status/history/:serverUrl

# Manual check for specific server
POST /api/status/check/:serverUrl

# Manual check all servers
POST /api/status/check-all
```

### Alerts
```bash
# Get all alerts
GET /api/alerts

# Get specific alert
GET /api/alerts/:id

# Update alert status (via email link)
GET /api/alerts/:id/status?action=in_process|abort|done

# Update alert status (via API)
POST /api/alerts/:id/status
Body: { "status": "in_process|abort|done" }
```

### Server Management
```bash
# Get server list
GET /api/servers

# Upload new servers CSV
POST /api/servers/upload
Form-data: file=servers.csv

# Download current servers CSV
GET /api/servers/download

# Download CSV template
GET /api/servers/template
```

### Configuration
```bash
# Get config
GET /api/config

# Update config
POST /api/config
Body: { "smtp": {...}, "api": {...} }

# Test SMTP connection
POST /api/config/test-smtp
```

## Alert Status Workflow

### Status Types

1. **🆕 New**
   - Alert just created
   - Email sent immediately
   - Re-alerts every 1 hour

2. **🟡 In Process**
   - Someone is working on it
   - Re-alerts every 24 hours
   - Click link in email to set

3. **⚫ Abort**
   - False alarm / Not an issue
   - No more emails
   - Click link in email to set

4. **🟢 Done**
   - Issue resolved
   - No more emails
   - Click link in email to set

### Email Alert Example

```
Subject: 🔴 ALERT: Production API - Server Offline

Server: Production API
URL: https://api.example.com
Issue: Server is offline
Time: 2025-12-14 11:00:00 UTC

Actions:
[🟡 Mark as In Process] [⚫ Abort] [🟢 Mark as Done]
```

## Monitoring Schedule

- **Health Checks**: Every 5 minutes
- **Alert Processing**: Every 10 minutes
- **Weekly Reports**: Every Monday at 9:00 AM
- **Database Cleanup**: Keeps 30 days of history

## 📊 Weekly Status Reports

The system automatically generates comprehensive weekly reports every Monday at 9:00 AM.

### Report Contents

**CSV File** (saved to `data/reports/weekly-report-YYYY-MM-DD.csv`):
- Server Name
- URL
- Current Status (Online/Offline)
- Response Time (ms)
- SSL Certificate Valid (Yes/No)
- SSL Created Date
- SSL Expiry Date
- Days Until SSL Expires
- Last Check Time
- Uptime % (last 7 days)

**Email**: HTML table with:
- Color-coded server status
- Summary statistics (total, online, offline, SSL warnings)
- Complete SSL certificate details
- 7-day uptime percentages
- CSV attachment

### Report Delivery

- **Email to**: Configured "to" address in `config.json` (or "from" if "to" is empty)
- **Subject**: `📊 Weekly Server Health Report - December 14, 2025`
- **Saved to**: `C:\dockerimages\monitor\data\reports\`
- **Filename**: `weekly-report-YYYY-MM-DD.csv` and `.html`

### Manual Report Generation

Generate a report manually via API:
```bash
# This endpoint will be available in a future update
# For now, reports are generated automatically every Monday at 9 AM
```

## Data Storage

All data is stored in the `./data` directory:

```
data/
├── alerts.db          # SQLite database
├── config.json        # SMTP configuration
├── servers.csv        # Server list
└── uploads/           # Temporary upload directory
```

## Troubleshooting

### Check Container Logs
```bash
docker-compose logs -f
```

### Container Not Starting
```bash
# Check Docker status
docker ps -a

# Rebuild container
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### SMTP Issues
```bash
# Test SMTP connection
curl -X POST http://localhost:3000/api/config/test-smtp
```

### No Alerts Being Sent
1. Check `data/config.json` has correct SMTP settings
2. Verify servers.csv has valid email addresses
3. Check container logs for SMTP errors
4. Test SMTP connection via API

### Database Issues
```bash
# Stop container
docker-compose down

# Remove database (WARNING: Deletes all history)
rm data/alerts.db

# Restart container
docker-compose up -d
```

## Maintenance

### Update Server List
```bash
# Edit servers.csv
notepad data\servers.csv

# Restart container to reload
docker-compose restart
```

### Update Configuration
```bash
# Edit config.json
notepad data\config.json

# Restart container
docker-compose restart
```

### View Database
```bash
# Enter container
docker exec -it server-monitor sh

# Open database
sqlite3 /app/data/alerts.db

# Query alerts
SELECT * FROM alerts WHERE status = 'new';

# Exit
.exit
```

### Backup Data
```bash
# Backup everything
cd C:\dockerimages\monitor
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Or just backup database
copy data\alerts.db data\alerts.db.backup
```

## Docker Commands

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# View logs
docker-compose logs -f

# Rebuild
docker-compose build --no-cache

# Remove everything
docker-compose down -v
```

## Performance

- **100 servers**: ~30 seconds per check cycle
- **Memory usage**: ~100MB
- **CPU usage**: Minimal (only during checks)
- **Disk usage**: ~10MB per month (with 100 servers)

## Security Notes

- No authentication on API (add reverse proxy with auth if needed)
- SMTP port 25 with no auth (ensure network security)
- All data stored locally in container volume
- Email links are publicly accessible (unique IDs provide security)

## Support

For issues or questions:
1. Check container logs
2. Verify configuration files
3. Test SMTP connection
4. Review API responses

## License

MIT

## Version

1.0.0 - Initial Release
