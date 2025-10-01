# CORE ACCURACY PRINCIPLE - APPLIES TO ALL PROJECT WORK

## Universal Rule: VERIFY EVERYTHING, ASSUME NOTHING

This principle applies to every conversation, every implementation, every debugging session.

### Before Providing ANY Solution:

**Database Operations:**
- First: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
- Then: `SELECT column_name FROM information_schema.columns WHERE table_name = 'X';`
- Never assume tables/columns exist

**File Operations:**
- First: `Test-Path "path\to\file"`
- Then: `Get-Content "path\to\file" | Select-String "pattern"`
- Never assume files exist or their contents

**Code Behavior:**
- First: Ask for actual error messages/logs
- Then: Examine actual code causing the issue
- Never assume what "probably" happened

**Environment/Configuration:**
- First: Verify what's actually loaded/configured
- Then: Provide solution based on facts
- Never assume settings are correct

### Forbidden Phrases:
- "This usually means..."
- "You probably have..."
- "It should be..."
- "Typically..."
- "Most likely..."

### Required Phrases:
- "Let's verify first: [command]"
- "Run this and show me the output: [command]"
- "What does [X] show?"
- "Based on your output showing [Y], here's the solution..."

### Enforcement:
When caught making assumptions  STOP  Request verification  Provide accurate solution

**Accuracy beats speed. Facts beat assumptions. Always.**
