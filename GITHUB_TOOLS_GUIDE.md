# GitHub Tools Integration Guide

## Overview

Guard Bot Engine now supports importing and executing real code directly from GitHub repositories with high precision. Instead of simulating tool execution, the system actually runs the code in sandboxed environments.

## Supported Languages

- **JavaScript** - Node.js execution with timeout protection
- **Python** - Native Python 3 execution with subprocess isolation
- **Bash** - Shell script execution with environment variable injection
- **Go** - Compiled Go program execution

## Features

### 1. Automatic Tool Discovery
The system automatically:
- Detects file language from extension (.js, .py, .sh, .go)
- Extracts metadata from code comments (JSDoc/docstrings)
- Validates code security before importing
- Calculates file hash to detect changes

### 2. Real Code Execution
Tools are executed with:
- Actual runtime (not simulation)
- 120-second timeout by default (configurable per tool)
- Parameter passing via function arguments
- Output capture and result formatting
- Execution time tracking

### 3. Security & Sandboxing
- Code security analysis before import
- Dangerous pattern detection
- Timeout enforcement
- Subprocess isolation
- Checksum verification for updates

### 4. Execution Caching
- Input-based result caching (60 minutes default)
- Cache invalidation on code changes
- Statistics tracking (success rate, execution time)

## How to Use

### Method 1: Import Code from GitHub (UI)

1. Open **Settings** → **Add Tools** dialog
2. Click **"Import Code"** tab
3. Enter repository URL: `https://github.com/owner/repo`
4. Enter file path: `src/tools/my-tool.js`
5. (Optional) Give it a custom name
6. Click **"Import from GitHub"**
7. Tool appears in your tools list ready to execute

### Method 2: Using AI Chat Commands

You can ask the AI to:
- Import tools: "استيراد أداة من GitHub"
- Execute tools: "قم بتنفيذ my-tool مع الهدف example.com"
- List tools: "عرض الأدوات المستوردة"

### Method 3: Direct API Call

```bash
curl -X POST http://localhost:3000/api/tools/import-github \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "repoUrl": "https://github.com/owner/repo",
    "filePath": "src/tools/scanner.js",
    "customName": "my-scanner"
  }'
```

## Tool Format

### JavaScript Example

```javascript
/**
 * @description Scan for open ports using nmap-like logic
 * @param {string} target - Target IP or domain
 * @param {string} ports - Ports to scan (comma-separated)
 * @returns {object} Scan results
 * @timeout 30000
 */

const net = require('net');

async function scanPorts(target, ports) {
  const portList = ports.split(',').map(p => parseInt(p));
  const results = [];
  
  for (const port of portList) {
    const socket = new net.Socket();
    const isOpen = await new Promise((resolve) => {
      socket.setTimeout(2000);
      socket.on('connect', () => resolve(true));
      socket.on('error', () => resolve(false));
      socket.connect(port, target);
    });
    results.push({ port, open: isOpen });
  }
  
  return { target, ports: results };
}

// Execute and return result
const result = await scanPorts(target, ports);
result;
```

### Python Example

```python
"""
@description: Extract emails from website content
@param target: Website URL to scan
@returns: List of extracted emails
@timeout: 60000
"""

import re
import requests

def extract_emails(target):
    try:
        response = requests.get(target, timeout=10)
        emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', response.text)
        return {"success": True, "emails": list(set(emails)), "target": target}
    except Exception as e:
        return {"success": False, "error": str(e)}

result = extract_emails(target)
```

### Bash Example

```bash
#!/bin/bash
# @description: DNS enumeration tool
# @param domain: Domain to enumerate
# @returns: DNS records

nslookup $domain
dig +short $domain ANY
nslookup -type=MX $domain
```

### Go Example

```go
// @description: Fast port scanner using Go concurrency
// @param target: Target IP or hostname
// @param ports: Comma-separated ports
// @timeout: 45000

package main

import (
  "fmt"
  "net"
  "strconv"
  "strings"
  "time"
)

func scanPort(host string, port int) bool {
  address := fmt.Sprintf("%s:%d", host, port)
  conn, err := net.DialTimeout("tcp", address, 2*time.Second)
  if err != nil {
    return false
  }
  conn.Close()
  return true
}

func main() {
  // Parse ports
  portList := strings.Split(ports, ",")
  results := make([]map[string]interface{}, 0)
  
  for _, p := range portList {
    port, _ := strconv.Atoi(p)
    open := scanPort(target, port)
    results = append(results, map[string]interface{}{
      "port": port,
      "open": open,
    })
  }
  
  // Output results
  fmt.Println(results)
}
```

## Tool Metadata

Tools support optional metadata in comments:

- `@description` - What the tool does
- `@param` - Parameter name, type, and description
- `@returns` - Return type and description
- `@timeout` - Execution timeout in milliseconds (default: 120000)

## Execution in Chat

Ask the AI to execute imported tools:

```
قم بتنفيذ port-scanner على 192.168.1.1 مع المنافذ 22,80,443
```

The AI will:
1. Recognize the tool
2. Call `execute_github_tool` with proper parameters
3. Display formatted results
4. Show execution statistics

## Database Schema

### github_tools table
- `id` - Unique identifier
- `name` - Tool name
- `description` - Tool description
- `repo_url` - GitHub repository URL
- `repo_owner` - GitHub username
- `repo_name` - Repository name
- `file_path` - File path in repository
- `language` - Programming language
- `source_code` - Full source code
- `code_hash` - SHA256 hash of code
- `metadata` - JSONB with params, returns, timeout
- `is_verified` - Security verification status
- `created_at` / `updated_at` - Timestamps

### execution_logs table
- Tracks every tool execution
- Stores input parameters
- Stores output results
- Records execution time
- Tracks success/failure/timeout status

### tool_cache table
- Caches execution results
- Input hash-based lookup
- TTL-based expiration (default 60 minutes)

## Security Considerations

1. **Code Analysis**: Dangerous patterns are detected before import
2. **Timeouts**: All executions have enforced timeouts
3. **Subprocess Isolation**: Each execution runs in isolated process
4. **No Network Restrictions**: Tools have full network access
5. **No File Restrictions**: Tools can read/write files within Deno/OS permissions

## Performance

- **Caching**: Results cached for 60 minutes by default
- **Execution Time**: Most tools complete in < 5 seconds
- **Concurrent**: Multiple tools can execute simultaneously
- **Memory**: Each execution limited to available system memory

## Troubleshooting

### Import Fails
- Verify GitHub repo is public
- Check file path is correct
- Ensure file exists on specified branch (default: main)

### Execution Times Out
- Increase `@timeout` in tool code
- Check for infinite loops
- Verify network connectivity for external requests

### Wrong Results
- Check parameter format matches tool expectation
- Verify JSON in params string is valid
- Review tool code for dependencies

## API Endpoints

### Import Tool
```
POST /api/tools/import-github
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "repoUrl": "https://github.com/owner/repo",
  "filePath": "src/tools/tool.js",
  "customName": "optional-name"
}
```

### Execute Tool
```
POST /api/tools/execute
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "toolId": "uuid",
  "params": {"target": "example.com"},
  "useCache": true,
  "cacheTtl": 60
}
```

### List Tools
```
GET /api/tools/import-github
Authorization: Bearer TOKEN
```

### Get Tool Info
```
GET /api/tools/execute?toolId=uuid
Authorization: Bearer TOKEN
```

## Advanced Usage

### Custom Tool Repository

Create your own tools repository:

```
my-security-tools/
├── src/
│   ├── scanners/
│   │   ├── port-scanner.js
│   │   ├── dns-enum.py
│   │   └── subdomain-finder.go
│   ├── exploits/
│   │   └── sqli-detector.js
│   └── utils/
│       └── helper.sh
└── README.md
```

Share the repository URL with your team, and anyone can import tools directly!

### Tool Composition

Create tools that call other tools:

```javascript
// meta-scanner.js
// Combines multiple tools for comprehensive analysis

async function metaScan(target) {
  const results = {
    target,
    dns: await executeTool('dns-enum', {domain: target}),
    ports: await executeTool('port-scanner', {target}),
    tech: await executeTool('tech-detect', {url: `http://${target}`}),
  };
  return results;
}

result = metaScan(target);
```

## Best Practices

1. **Keep tools focused** - One tool, one job
2. **Error handling** - Always wrap in try-catch
3. **Timeout awareness** - Set appropriate timeouts
4. **Parameter validation** - Check inputs before use
5. **Clear documentation** - Use @description and @param comments
6. **Test locally** - Test tools before importing
7. **Share improvements** - Update tools in shared repos

## Support

For issues, feature requests, or tool contributions:
- Check existing tools in your organization
- Test tools in development first
- Report bugs with execution logs
- Share new tools with the community
