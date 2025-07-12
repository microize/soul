# Secret Interaction Tracking

The Secret Interaction Tracking feature provides comprehensive logging of all user interactions, tool calls, and model input/output within Soul CLI sessions. This feature is **enabled by default** and designed for debugging, audit trails, usage analysis, and understanding interaction flows.

## Overview

Secret tracking captures complete interaction chains including:
- **User Questions**: Full user input with contextual information
- **Tool Calls**: All tool executions with parameters, results, and timing
- **Model I/O**: Complete model inputs and outputs with metadata
- **Session Context**: Git branch, model used, working directory, and mode

All data is stored locally in structured JSON files with automatic rotation and cleanup.

> **📝 Note**: Secret tracking is **enabled by default**. You can disable it at any time using the methods described below.

## Managing Secret Tracking

Secret tracking is **enabled by default**. You can control it using these methods:

### Method 1: Environment Variable

Override the default setting with an environment variable:

```bash
# Explicitly enable (default behavior)
export SOUL_SECRET_TRACKING=true
soul

# Disable secret tracking
export SOUL_SECRET_TRACKING=false
soul

# Windows (PowerShell)
$env:SOUL_SECRET_TRACKING="false"
soul

# Windows (Command Prompt)
set SOUL_SECRET_TRACKING=false
soul
```

### Method 2: Runtime Toggle

Enable/disable tracking during an active Soul CLI session:

```bash
# Enable secret tracking
/secret on

# Disable secret tracking
/secret off

# Check current status
/secret status
```

### Method 3: Configuration File

Override the default in your Soul CLI configuration:

```json
{
  "secretTracking": {
    "enabled": false,  // Explicitly disable (default is true)
    "maxFileSize": 50,
    "maxDays": 30,
    "bufferSize": 10
  }
}
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable secret tracking |
| `outputDirectory` | `.soul-cache` | Directory to store tracking files |
| `maxFileSize` | `50` | Maximum file size in MB before rotation |
| `maxDays` | `30` | Number of days to retain tracking files |
| `bufferSize` | `10` | Number of interactions to buffer before writing |

## Output Format

### File Location

Tracking data is stored in:
```
.soul-cache/secret-tracking-{sessionId}.json
```

Example:
```
.soul-cache/secret-tracking-20250112-143052-abc123.json
```

### File Structure

Each file contains an array of interaction chains:

```json
[
  {
    "id": "1736693452000-abc123def",
    "startTime": "2025-01-12T14:30:52.000Z",
    "endTime": "2025-01-12T14:30:55.123Z",
    "status": "completed",
    "userInteraction": {
      "id": "1736693452000-abc123def",
      "timestamp": "2025-01-12T14:30:52.000Z",
      "type": "user_question",
      "sessionId": "20250112-143052-abc123",
      "content": "Create a new React component for user profile",
      "context": {
        "gitBranch": "feature/user-profile",
        "model": "gemini-2.0-flash-exp",
        "workingDirectory": "/home/user/my-project",
        "shellMode": false
      }
    },
    "modelInputs": [
      {
        "id": "1736693452001-def456ghi",
        "timestamp": "2025-01-12T14:30:52.001Z",
        "type": "model_input",
        "sessionId": "20250112-143052-abc123",
        "parentInteractionId": "1736693452000-abc123def",
        "content": "Create a new React component for user profile",
        "metadata": {
          "model": "gemini-2.0-flash-exp",
          "systemPrompt": false
        }
      }
    ],
    "toolCalls": [
      {
        "id": "1736693453000-ghi789jkl",
        "timestamp": "2025-01-12T14:30:53.000Z",
        "type": "tool_call",
        "sessionId": "20250112-143052-abc123",
        "parentInteractionId": "1736693452000-abc123def",
        "toolName": "write_file",
        "parameters": {
          "file_path": "src/components/UserProfile.tsx",
          "content": "import React from 'react';\n\ninterface UserProfileProps {\n  user: {\n    name: string;\n    email: string;\n  };\n}\n\nexport const UserProfile: React.FC<UserProfileProps> = ({ user }) => {\n  return (\n    <div className=\"user-profile\">\n      <h2>{user.name}</h2>\n      <p>{user.email}</p>\n    </div>\n  );\n};"
        },
        "result": {
          "success": true,
          "message": "File created successfully"
        },
        "duration": 45,
        "sequence": 1
      }
    ],
    "modelOutputs": [
      {
        "id": "1736693455000-jkl012mno",
        "timestamp": "2025-01-12T14:30:55.000Z",
        "type": "model_output",
        "sessionId": "20250112-143052-abc123",
        "parentInteractionId": "1736693452000-abc123def",
        "content": {
          "type": "gemini",
          "text": "I've created a new React component for the user profile..."
        },
        "metadata": {
          "model": "gemini-2.0-flash-exp"
        }
      }
    ]
  }
]
```

## Status Commands

### Check Tracking Status

```bash
/secret status
```

Output when enabled:
```
🔍 Secret Interaction Tracking

Status: 🟢 Enabled
Output Directory: .soul-cache
Max File Size: 50MB
Max Age: 30 days
Buffer Size: 10 interactions

Files are stored as: secret-tracking-{sessionId}.json
Each file contains complete interaction chains with:
• User questions with context (git branch, model, directory)
• Tool calls with parameters, results, and execution order
• Model inputs and outputs with metadata
• Timestamps and duration tracking

Environment variable: SOUL_SECRET_TRACKING=true
Use '/secret off' to disable tracking
```

Output when disabled:
```
🔍 Secret Interaction Tracking

Status: 🔴 Disabled

Secret tracking is disabled by user configuration.
To re-enable secret tracking:
• Use '/secret on' command
• Remove SOUL_SECRET_TRACKING=false environment variable
• Remove or change secretTracking: { enabled: false } in config
```

## Data Analysis Examples

### Python Analysis Script

```python
import json
import pandas as pd
from datetime import datetime

def analyze_secret_tracking(file_path):
    """Analyze secret tracking data"""
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Extract tool usage statistics
    tools_used = []
    for interaction in data:
        for tool_call in interaction.get('toolCalls', []):
            tools_used.append({
                'tool_name': tool_call['toolName'],
                'duration': tool_call.get('duration', 0),
                'timestamp': tool_call['timestamp'],
                'success': 'error' not in tool_call
            })
    
    df = pd.DataFrame(tools_used)
    
    # Most used tools
    print("Most Used Tools:")
    print(df['tool_name'].value_counts())
    
    # Average execution time by tool
    print("\nAverage Execution Time by Tool (ms):")
    print(df.groupby('tool_name')['duration'].mean().sort_values(ascending=False))
    
    # Success rate by tool
    print("\nSuccess Rate by Tool:")
    print(df.groupby('tool_name')['success'].mean().sort_values(ascending=False))

# Usage
analyze_secret_tracking('.soul-cache/secret-tracking-20250112-143052-abc123.json')
```

### Bash Analysis Script

```bash
#!/bin/bash

# Extract all tool names used
jq -r '.[] | .toolCalls[]? | .toolName' .soul-cache/secret-tracking-*.json | sort | uniq -c | sort -nr

# Find longest running interactions
jq -r '.[] | select(.endTime and .startTime) | {id: .id, duration: (((.endTime | fromdateiso8601) - (.startTime | fromdateiso8601)) * 1000)} | "\(.duration)ms - \(.id)"' .soul-cache/secret-tracking-*.json | sort -nr | head -10

# Count tool calls per interaction
jq -r '.[] | {id: .id, tool_count: (.toolCalls | length)} | "\(.tool_count) tools - \(.id)"' .soul-cache/secret-tracking-*.json | sort -nr
```

## Security and Privacy

### Data Storage
- **Local Only**: All tracking data is stored locally on your machine
- **No Remote Transmission**: Data never leaves your system
- **User Control**: Complete control over enabling/disabling tracking

### Data Retention
- **Automatic Cleanup**: Files older than `maxDays` are automatically deleted
- **Size Limits**: Files are rotated when they exceed `maxFileSize`
- **Manual Cleanup**: You can manually delete tracking files at any time

### Sensitive Information
- **Code Content**: Tool parameters may contain your code and file contents
- **User Input**: All user questions and commands are logged
- **System Context**: Working directory, git branch, and model information is captured

**⚠️ Important**: Be cautious when sharing tracking files as they contain your complete interaction history.

## File Management

### Manual Cleanup

```bash
# Remove all tracking files
rm .soul-cache/secret-tracking-*.json

# Remove files older than 7 days
find .soul-cache -name "secret-tracking-*.json" -mtime +7 -delete

# Check file sizes
ls -lh .soul-cache/secret-tracking-*.json
```

### Backup Important Sessions

```bash
# Backup a specific session
cp .soul-cache/secret-tracking-20250112-143052-abc123.json ~/backups/

# Archive all tracking files
tar -czf soul-tracking-backup-$(date +%Y%m%d).tar.gz .soul-cache/secret-tracking-*.json
```

## Troubleshooting

### Tracking Not Working

1. **Check Status**: Run `/secret status` to verify configuration
2. **Permissions**: Ensure write permissions to `.soul-cache` directory
3. **Disk Space**: Check available disk space for tracking files
4. **Environment**: Verify `SOUL_SECRET_TRACKING` environment variable

### Large Files

If tracking files become too large:

1. **Reduce Buffer Size**: Set smaller `bufferSize` in configuration
2. **Lower File Size Limit**: Reduce `maxFileSize` for more frequent rotation
3. **Shorter Retention**: Decrease `maxDays` for faster cleanup

### Debug Mode

Enable debug mode to see tracking-related messages:

```bash
soul --debug
```

Look for messages starting with `[DEBUG] Secret tracking` or `Secret tracking error`.

## Best Practices

### Development Workflow
- Secret tracking is enabled by default for complete session coverage
- Disable only when concerned about disk space or performance
- Use short retention periods for temporary analysis
- Consider disabling in CI/CD environments where tracking data isn't needed

### Performance
- Monitor file sizes in long-running sessions
- Use appropriate buffer sizes (default: 10 interactions)
- Consider disabling for performance-critical operations

### Analysis
- Export data periodically for analysis
- Use structured queries with `jq` for quick insights
- Create custom analysis scripts for specific use cases

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Soul CLI Analysis
on: [push]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Soul CLI with tracking
        run: |
          # Tracking is enabled by default
          soul "Analyze this codebase and suggest improvements"
      
      - name: Analyze tracking data
        run: |
          # Upload tracking files as artifacts
          jq '.[] | {tools: [.toolCalls[]?.toolName], duration: .endTime}' .soul-cache/secret-tracking-*.json > analysis.json
      
      - name: Upload tracking data
        uses: actions/upload-artifact@v4
        with:
          name: soul-tracking-data
          path: .soul-cache/secret-tracking-*.json
```

## FAQ

### Q: Does secret tracking affect performance?
A: Minimal impact. Tracking is asynchronous and uses buffered writes. You may notice slightly larger log files.

### Q: Can I track multiple Soul CLI sessions?
A: Yes, each session gets its own file with a unique session ID.

### Q: How do I share analysis without sensitive data?
A: Create filtered exports that remove file contents and personal information:

```bash
jq 'map({id, status, toolCalls: [.toolCalls[]? | {toolName, duration, sequence}]})' tracking-file.json > sanitized-analysis.json
```

### Q: Can I customize the output format?
A: The JSON format is fixed, but you can process it with any JSON tool for custom formats.

### Q: Is tracking compatible with MCP servers?
A: Yes, tool calls to MCP servers are tracked like any other tool.

## Support

For issues or questions about secret tracking:

1. Check the debug output with `soul --debug`
2. Verify file permissions and disk space
3. Review the tracking status with `/secret status`
4. Report issues with sanitized tracking data if needed

Remember to remove sensitive information before sharing tracking files for support purposes.