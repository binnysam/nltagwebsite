---
name: nl-tag-membership
description: Use for NLTAG membership: individual and family applications, email verification, admin approval, membership IDs, member dashboard, birthdays, privacy (Phase 4+).
---

# NLTAG membership

## Status
Not implemented. No production membership data may be collected until Gate 4 approves the data model, privacy notice, consent and retention.

## Approved model (Gate 0)
- Individual: independent person record; membership ID after approval.
- Family: head of family adds spouse, children and others; each adult verifies their own details and consents; children registered under parent/guardian consent; each approved person counted once.
- Lifecycle: Draft → Email verified → Pending admin review → Approved → Membership ID → Active, with Correction requested and Rejected as documented exits; history kept.
- ID format `NLTAG-2026-0001`, one per approved individual, generated server-side in a transaction from a locked counter row, `UNIQUE` constraint, never reused. Open: year = approval year? yearly reset?
- Counting: a person belongs to at most one active household; login + household link is still one person; households and people reported separately.
- Google sign-in never auto-approves membership.

## UI available now
`MembershipStatusBadge` (statuses mapped to tones), `TextField`, `Button` (loading/disabled). Tamil status labels are drafts.

## Security and privacy rules
Server-side authorisation on every action; never trust client IDs or roles; household isolation tests; rate limiting; no DOBs, phones, passwords or tokens in logs; birthdays visible only to authorised staff, children's never public; exports permission-controlled and audited.

## Escalate
Everything in this area before Gate 4: data fields, consent wording, providers, retention, notification channels.
