# GitHub Tools - Quick Start

## What's New

Guard Bot Engine can now import and execute real code from GitHub with high precision. No more simulated tool behavior - your tools actually run!

## 5-Minute Setup

### Step 1: Database Migration
The system needs database tables for storing tools and logs. These are created automatically on first use via the migration script.

### Step 2: Deploy Functions
Push the new Supabase function to production:
- `supabase/functions/execute-github-tool/index.ts`

### Step 3: Deploy API Routes
Next.js will automatically pick up:
- `src/app/api/tools/import-github/route.ts`
- `src/app/api/tools/execute/route.ts`

### Step 4: Component Updates
Already deployed with enhanced AddToolDialog.

Done! The system is ready to use.

## Quick Examples

### Example 1: Import a JavaScript Tool

```
1. Open Settings → Add Tools
2. Click "Import Code" tab
3. Paste: https://github.com/your-username/tools
4. Path: src/port-scanner.js
5. Click Import
```

Tool now available to execute!

### Example 2: Execute via Chat

```
Ask the AI:
"قم بتنفيذ port-scanner على example.com مع المنافذ 22,80,443"

The AI will:
- Find the tool
- Execute with parameters
- Show results
```

### Example 3: Direct API Call

```bash
# Import
curl -X POST http://localhost:3000/api/tools/import-github \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "repoUrl": "https://github.com/user/tools",
    "filePath": "src/scanner.js"
  }'

# Execute
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "toolId": "tool-uuid-here",
    "params": {"target": "example.com"}
  }'
```

## Supported Languages

- **JavaScript** (.js, .ts)
- **Python** (.py)
- **Bash** (.sh, .bash)
- **Go** (.go)

## Tool Format Rules

### JavaScript
```javascript
/**
 * @description What it does
 * @param {string} target - Input parameter
 * @returns {object} What it returns
 * @timeout 30000
 */

// Your code here
result = {...};
result;
```

### Python
```python
"""
@description: What it does
@param target: Input parameter
@returns: What it returns
@timeout: 30000
"""

# Your code here
result = {...}
```

### Bash
```bash
#!/bin/bash
# @description: What it does
# @param target: Input parameter

# Your code here
```

### Go
```go
// @description: What it does
// @param target: Input parameter

package main
// Your code here
```

## Supported Metadata

In tool comments, use:

- `@description` - Tool purpose
- `@param` - Parameter documentation
- `@returns` - Return type/description
- `@timeout` - Timeout in milliseconds

Example:
```javascript
/**
 * @description Scan ports on target
 * @param {string} target - IP or domain
 * @param {string} ports - Comma-separated ports
 * @returns {array} Array of open ports
 * @timeout 60000
 */
```

## Key Features

✓ Real code execution (not simulated)
✓ 4 language support
✓ Automatic metadata detection
✓ Security validation
✓ Result caching
✓ Execution logging
✓ Performance tracking
✓ AI chat integration

## Common Tasks

### Create a Tool

```javascript
// my-tool.js
/**
 * @description DNS lookup
 * @param {string} domain - Domain to lookup
 * @returns {object} DNS results
 */

async function dnsLookup(domain) {
  const dns = require('dns').promises;
  const results = await dns.resolve4(domain);
  return { domain, ips: results };
}

result = await dnsLookup(domain);
result;
```

### Import It

1. Push to GitHub
2. Open AddToolDialog
3. Click "Import Code"
4. Enter repo URL and file path
5. Done!

### Execute It

```
"قم بتنفيذ my-tool على google.com"
```

Or via API:
```javascript
POST /api/tools/execute
{
  "toolId": "uuid",
  "params": {"domain": "google.com"}
}
```

### Check Results

Results appear:
- In chat response
- In execution_logs database table
- In tool statistics

## Troubleshooting

### Import Failed
- Check repo is public
- Verify file path is correct
- Make sure file exists on `main` branch

### Execution Timeout
- Increase `@timeout` value
- Check for infinite loops
- Verify network connectivity

### Wrong Results
- Verify parameter format
- Check JSON is valid
- Test tool locally first

## Tips & Tricks

1. **Reuse Code** - Import multiple tools from same repo
2. **Share Repos** - Others can import your tools
3. **Version Control** - Git tracks tool versions
4. **Performance** - Results cached for 60 minutes
5. **Statistics** - Check success rates and times
6. **Combine Tools** - Tools can call other tools
7. **Error Handling** - Use try-catch in all tools

## Testing Workflow

1. Create tool locally
2. Push to GitHub
3. Import via UI
4. Test with simple parameters
5. Check execution_logs for results
6. Refine and push updates
7. Re-import if code hash changes

## Real Examples

### Port Scanner (JavaScript)
```javascript
/**
 * @description Scan open ports
 * @param {string} target - IP/domain
 * @param {string} ports - Comma-separated
 * @returns {array} Open ports
 */

const net = require('net');

async function scan(target, ports) {
  const results = [];
  for (const port of ports.split(',')) {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    const open = await new Promise(r => {
      socket.on('connect', () => r(true));
      socket.on('error', () => r(false));
      socket.connect(parseInt(port), target);
    });
    results.push({port, open});
  }
  return results;
}

result = await scan(target, ports);
```

### DNS Enum (Python)
```python
"""
@description: Enumerate subdomains
@param domain: Domain to enumerate
@returns: List of subdomains
"""

import requests

def enum_dns(domain):
  url = f"https://crt.sh/?q=%.{domain}&output=json"
  try:
    r = requests.get(url, timeout=10)
    certs = r.json()
    domains = set()
    for cert in certs:
      domains.add(cert['name_value'].split('\n')[0])
    return list(domains)
  except:
    return []

result = enum_dns(domain)
```

### Network Info (Bash)
```bash
#!/bin/bash
# @description: Get network info
# @param target: IP or domain

echo "=== Reverse DNS ==="
nslookup -type=PTR $target

echo -e "\n=== A Records ==="
nslookup -type=A $target

echo -e "\n=== MX Records ==="
nslookup -type=MX $target
```

## Performance Expectations

- Import: 1-2 seconds
- First run: 2-10 seconds (depends on tool)
- Cached: <100ms
- Timeout: 120 seconds (default)
- Cache: 60 minutes

## Next Steps

1. Create a test repository with tools
2. Import your first tool
3. Execute it via chat or API
4. Monitor execution logs
5. Share tools with team
6. Build custom security toolkit

## Documentation

For detailed information, see:
- `GITHUB_TOOLS_GUIDE.md` - Full user guide
- `GITHUB_TOOLS_IMPLEMENTATION.md` - Technical details

## Support

Questions? Check the logs:
- Visit `Supabase` → `execution_logs` table
- Check API responses for errors
- Monitor tool statistics for anomalies

Start building!
