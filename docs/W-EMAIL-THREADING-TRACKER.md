# W-EMAIL-THREADING Tracker (DEFERRED)

**Started:** 2026-05-14 (deferred at open; not active work)
**Owner:** Shah (sole dev)
**Status:** DEFERRED -- logged for future activation when WALLiam has paying customers doing real outbound at volume AND the asymmetric inbox experience creates friction.

**Spawned from:** W-LEADS-WORKBENCH W4e (2026-05-14). During W4e.8 smoke, founder raised the cohesive-conversation question after observing that workbench is cumulative but recipient inboxes see fragmented threads. Tracker captures the design discussion + scoped paths forward.

---

## Why this exists

W4e ships the workbench Emails tab as the cumulative view: every send from any role (agent / manager / area_manager / tenant_admin / platform_admin) appears in one list grouped by `resend_message_id`. From the workbench, the conversation is unified.

But the recipient's inbox is threaded by RFC 5322 `Message-ID` / `In-Reply-To` / `References` headers. W4e's outbound sends do NOT set these headers, so each send produces a separate thread in the recipient's Gmail / Outlook / etc.

`Reply-To` is always the assigned agent's email (per `app/api/admin-homes/leads/[id]/send-email/route.ts` -- `replyTo = r.agent`). So all replies route to the lead's owner agent, regardless of which role composed the outbound. The reply lands in the agent's personal inbox -- NOT in the workbench.

Net asymmetry today:
- **Workbench:** cumulative source of truth for OUTBOUND only
- **Recipient inbox:** fragmented threads (one per workbench send)
- **Inbound replies:** invisible to workbench; only the assigned agent sees them in their personal Gmail

The founder's vision: workbench as the TRUE single source of truth for the ENTIRE conversation -- inbound + outbound, all roles, all unified. That is what W-EMAIL-THREADING covers.

---

## Two layers, two cost profiles

The full vision splits cleanly into two independent layers. They can be built independently. They do NOT both have to land at the same time.

### Layer A -- Outbound threading only

**What it gets you:** the recipient's Gmail / Outlook threads all sends to one lead as one conversation thread. `Re:` prefix on follow-ups. Replies still route to the assigned agent's personal inbox; workbench still does not see inbound.

**Effort estimate:** 1-2 days focused work.

**Steps:**
1. Schema: add `thread_root_message_id` column to `lead_email_recipients_log`, OR new `lead_email_threads` table with FK to leads. Decision-locked at start of phase.
2. Helper: `getOrCreateThreadRoot(leadId, supabase)` -- first send creates the root, subsequent sends link to it.
3. Composer UI change: dropdown "Continue thread" (default to most recent send to this lead) vs "Start new thread" (for genuinely new topics).
4. Route change: POST `/send-email` accepts `inReplyTo` + `references` headers, passes to `sendTenantEmail`.
5. `sendTenantEmail` change: accept and forward custom headers to Resend's API (Resend's `headers` field supports `In-Reply-To` and `References` per their docs -- verify before implementation).
6. Audit: store the thread root on each row in `lead_email_recipients_log`.

**Limitation:** does NOT solve inbound. Replies still only land in the agent's Gmail. Workbench Emails tab still shows only outbound. Half-solution.

### Layer B -- Full unified conversation (inbound capture)

**What it gets you:** lead replies are captured into the workbench Emails tab as inbound rows, threaded with the outbound. Workbench becomes the TRUE single source of truth for the entire conversation. CRM-grade.

**Effort estimate:** 1-2 weeks focused work for a polished version.

**Steps:**
1. DNS + infrastructure:
   - Pick inbound subdomain (e.g., `inbox.condoleads.ca` or `replies.walliam.ca`).
   - Set MX records pointing to Resend's inbound server.
   - Configure inbound webhook in Resend dashboard.
2. Schema migration:
   - Add `direction_class` column (`'outbound'` | `'inbound'`) to `lead_email_recipients_log`, OR new `lead_email_messages` table that unifies both directions.
   - Index on `in_reply_to` for fast thread lookup.
3. Reply-To strategy flip:
   - Currently: `Reply-To: agent@email`.
   - New: `Reply-To: lead-<uuid>@inbox.condoleads.ca` (encodes the lead id in the local-part for fast matching).
   - Trade-off: agent no longer sees replies in their personal Gmail unless you build a forwarding side-channel from the inbound endpoint to the agent's email.
4. Inbound webhook endpoint:
   - New route `app/api/email/inbound/route.ts`.
   - Webhook signature verification (security).
   - Parse Resend's inbound payload: From, To, Subject, In-Reply-To, body (html + text), attachments.
   - Idempotency: dedupe by Message-ID.
5. Matching logic:
   - Parse `To: lead-<uuid>@inbox.condoleads.ca` to extract lead_id (primary).
   - Fallback: match by In-Reply-To -> look up original send by `resend_message_id` -> find lead.
   - Final fallback: match by From contact_email -> find lead by contact_email.
6. Workbench rendering:
   - EmailsTab: show inbound rows aligned/styled differently (right bubble vs left, different icon).
   - Thread grouping (group by thread root, not just by `resend_message_id`).
   - Mark-unread state on inbound rows; mark-as-read action.
7. Notification on inbound:
   - When a reply lands, notify the assigned agent (email digest, in-app badge, push).
   - This grows into its own notification subsystem.
8. Edge cases:
   - Out-of-office bounces.
   - Spam / loop detection (your own notifications hitting your own inbox).
   - Multi-recipient replies (lead CCs their spouse).
   - Attachments (storage cost + virus scanning).
   - Lead replies from a different email than the one we sent to (job change, multiple emails).

**Limitation:** none for the email experience. Cost is in infrastructure, edge cases, and the discipline shift required (agents must work in workbench, not Gmail).

---

## Recommended sequence

**Do NOT ship Layer A first, then Layer B.** Layer A's `thread_root_message_id` work is not thrown away by Layer B, but Layer B's `Reply-To` strategy fundamentally changes how thread roots are anchored. If you are going to do Layer B, do it directly.

**Recommended:** defer both until customer-driven need. Layer B is a focused 1.5-week sprint when activated.

---

## Scope contract

### This workstream OWNS

- DNS + Resend inbound webhook configuration
- Schema migrations for thread tracking + inbound capture
- New API route for inbound webhook processing
- Helpers for thread root resolution + reply matching
- Composer UI changes (thread continuity controls)
- EmailsTab UI changes (inbound rendering, thread grouping, unread state)
- Reply-To strategy migration
- Notification subsystem for inbound replies (or integration with existing system if one ships first)
- Edge-case handling (loops, bounces, attachments, address changes)

### This workstream does NOT own

- W4e Emails tab base implementation (already shipped)
- W4e Send composer base implementation (already shipped)
- `lead_email_recipients_log` table base schema (already shipped W-LEADS-EMAIL T2f + W4e.1 lead_contact extension)
- `sendTenantEmail` core function (already shipped)
- Per-tenant Resend account setup (tenant onboarding work)
- Spam classification logic beyond Resend's defaults

---

## Phase table (skeletal -- not active until trigger)

| # | Phase | Status | Notes |
|---|---|---|---|
| T0 | Trigger / activation | DEFERRED | Customer-driven friction with asymmetric inbox |
| T1 | DNS + Resend inbound setup | DEFERRED | Inbound subdomain MX + webhook config |
| T2 | Schema migration (direction_class + thread linking) | DEFERRED | Either extend lead_email_recipients_log or new lead_email_messages |
| T3 | Inbound webhook endpoint + signature verification | DEFERRED | app/api/email/inbound/route.ts |
| T4 | Lead matching logic (To header + In-Reply-To + From fallback) | DEFERRED | 3-tier match |
| T5 | Reply-To strategy migration | DEFERRED | Per-lead address; consider forwarding side-channel |
| T6 | sendTenantEmail header extension (In-Reply-To + References passthrough) | DEFERRED | Verify Resend API support |
| T7 | EmailsTab inbound rendering + thread grouping | DEFERRED | Right-aligned bubble, unread state |
| T8 | Inbound notification subsystem | DEFERRED | Email digest + in-app badge minimum |
| T9 | Edge-case hardening | DEFERRED | Loops, bounces, attachments, address changes |
| T10 | Local + production smoke + close | DEFERRED | End-to-end conversation thread test |

---

## Status log

- **2026-05-14 W-open** -- Tracker opened as DEFERRED. Logged during W-LEADS-WORKBENCH W4e.8 smoke after founder raised the cohesive-conversation question. W4e ships cumulative-workbench-as-source-of-truth for outbound only; W-EMAIL-THREADING extends to true unified conversation when activated. Recommendation locked: do Layer B directly (skip Layer A as half-solution) when ready. Estimate 1.5 weeks focused for Layer B alone. Activation trigger: WALLiam has paying customers doing real outbound at volume AND the asymmetric inbox experience creates friction for them or their agents.