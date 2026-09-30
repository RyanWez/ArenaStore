# 05 — Research & Verification Protocol

## Why this exists

Arena Store decisions must be based on the **current project state** and, where relevant, the **current external reality** — not only an agent's remembered knowledge.

## Mandatory workflow

Before starting a meaningful feature or making a decision:

### 1. Inspect local reality

Read the relevant source files, package versions, lockfile, configuration, tests, current implementation, and related Memory documents.

Questions to answer:
- What already exists and what does it actually do?
- Which decisions were already made?
- What is intentionally not implemented yet?
- Will the new work conflict with current package versions, architecture, or tests?

### 2. Verify changeable external facts

Search the web whenever the work depends on facts that can change, including:
- Next.js, React, shadcn/ui, Telegram Bot API, package APIs, and security practices
- hosting, free-tier limits, deployment requirements, or pricing
- payment-provider integration and policy
- supplier/partner API documentation or behavior

Use the official documentation or provider-owned source first. Cross-check high-impact claims with another reliable source when appropriate.

### 3. Compare before choosing

Compare realistic options using the user's goal and the current project:
- compatibility
- security
- reliability
- maintenance effort
- delivery speed
- cost
- future migration risk

Do not choose a tool merely because it is fashionable or because it was used in an old example.

### 4. Be clear about confidence

Mark information as one of:
- **Verified** — confirmed from current local state or primary source
- **Assumption** — reasonable but not confirmed
- **Open question** — needs user/provider confirmation

If sources conflict or the decision would materially affect money, security, data, launch, or product direction, stop and ask the user.

### 5. Record the result

Append one concise entry to `Memory/YYYY-MM-DD.md` with:
- local files/configuration checked
- external sources checked (direct URLs)
- decision and why
- test/verification result
- follow-up or open question

Never record secrets, access tokens, private customer data, credentials, or delivery content.

## Source priority

1. Local project state and reproducible tests
2. Official documentation / provider source
3. Official source repository or release notes
4. Reputable technical references
5. Community posts only as supplementary evidence

## Proportionate use

A spelling or isolated visual copy change does not require broad web research. Architecture, dependency, API, payment, security, deployment, and externally-dependent behavior do.
