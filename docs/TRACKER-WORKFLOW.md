# Tracker workflow — disk vs project knowledge vs chat

One-time reference so the question doesn't recur.

## Three surfaces, three purposes

**Local disk (`docs/*-TRACKER.md`)** — source of truth.
- Lives next to code, committed with code, has timestamped backups
- Single writable surface from this session
- Authoritative — if disk and project knowledge disagree, disk wins

**Project Knowledge (Claude Project)** — searchable cache.
- Read-only from Claude's side this session
- Searched via `project_knowledge_search` in future sessions
- Updated by you uploading the disk file manually
- Lets future sessions access tracker history without you pasting it into context

**Chat artifacts (this conversation)** — staging area.
- Where Claude composes patches before they land on disk
- Not durable beyond the conversation
- After applying to disk, the artifact becomes redundant

## When to update each

| Event | Disk | Project Knowledge |
|---|---|---|
| Claude writes a tracker patch | Apply backup + replace | — |
| End of a phase (H1, H2, H3, etc.) | Already current | Re-upload latest disk version |
| End of a tracker (H6 close, R9 close) | Already current | Re-upload final version |
| Mid-phase finding added to chat | Folded into next disk patch | Wait for disk patch |

## Why disk first, project knowledge later

If Claude wrote directly to project knowledge:
- Each tracker patch would require manual upload anyway (Claude can't write there)
- Disk wouldn't get updated, breaking the rule-zero backup workflow
- Code commits wouldn't include tracker changes — tracker would drift from code state
- Multiple Claude sessions could disagree on tracker state with no canonical source

Disk-first means:
- Backups are automatic and timestamped per the rule-zero workflow
- Tracker version-controlled alongside the code it describes
- Project knowledge gets the stable version (after each phase), not every micro-patch
- One canonical file, multiple readable copies

## Practical schedule

- **After each tracker patch from Claude:** backup + apply to disk. Don't upload to project knowledge yet.
- **After H1 of W-HIERARCHY closes:** project knowledge upload (optional but recommended)
- **After H6 (W-HIERARCHY close):** project knowledge upload
- **After R1 of W-ROLES-DELEGATION closes:** project knowledge upload
- **After R9 (W-ROLES-DELEGATION close):** project knowledge upload

Roughly: upload to project knowledge when phases close, not on every patch.

## What the artifacts in this conversation are for

When Claude writes a tracker artifact in chat, it's for **disk application only**. It's not meant to live in the conversation as a reference; once applied to disk, it's served from there. If a future session needs the tracker, search it via `project_knowledge_search` (if uploaded) or paste from disk.

This keeps the conversation context lean and the disk file authoritative.