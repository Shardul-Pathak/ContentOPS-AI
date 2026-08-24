# Context Handoff

## Project
Autonomous Content Operations Platform (TrueForge-first)

## Current Branch
main — MVP COMPLETE (all 12 milestones merged, working tree clean)

## Final State
- 66/66 tests green · lint/typecheck/build clean · HTTP-level e2e smoke verified
- Full pipeline: company → campaign → workflow → research(provenance) → strategy → draft → review → revision loop (MAX 3) → hero asset → publisher pauses at gated tool → human approve/reject → PUBLISHED/CANCELLED
- Critical paths proven live over HTTP: PASS path, APPROVE→PUBLISHED (+409 double submit), REJECT→CANCELLED (+409 late approve); REVISION/MAX_REVISION/PUBLISH_FAILURE covered by vitest integration suite

## Key Commits (merge nodes)
d6b7925 F3 foundation · e0cc171 F4 · bf6defc F5 · 7dda5af F6 · 7abdb31 F7 · 78ca33b F8 · 7a3f420 F9 · 81fb4f7 F10 approval gate · 445e6c7 F11 cms-publishing · a816561 F12 mvp complete

## Architecture (final)
- TrueForge = agent harness: 6 named agents (seeded by `npm run seed:agents`), sessions/turns/events, approval pauses via requireApprovalForTools:["publish_article"], resume via user.tool_approval turns; SDK @truefoundry/trueforge-sdk@0.1.3 (types under TrueForgeApi.*)
- App = business states (`src/domain/state-machine.ts`), Zod contracts (`src/contracts/`), orchestrator + approval service (`src/services/workflow/`), AgentRuntime port with TrueForge+Mock providers (`src/lib/agent-runtime.ts`)
- Mock CMS: real MCP server `scripts/mock-cms-server.mjs` (npm run mock:cms, :3780/mcp, header auth, idempotency on publish_article) — registered into TF by seed when CMS_MCP_URL set
- Publisher flow: stage submits → turn PAUSES at gated call → Approval row stores tfSessionId/tfTurnId/toolCallId/threadId + frozen payload summary → decideApproval() resumes THAT session; no pause ⇒ workflow FAILED (safety invariant)
- AGENT_PROVIDER=mock mirrors the identical state machine for offline demo/tests

## Running the demo
See README "Demo walkthrough". Prereqs: .env from example; trueforge mode needs model key + running TF server + seed.

## Known Issues / Future Work
- Live-server smoke against real TrueForge still pending (needs model API key in env): verify json_schema behavior of the chosen endpoint (fallback RESPONSE_FORMAT_MODE=json_object) and MCP catalog contents
- ESLint via FlatCompat bridge; npm 12 install-scripts approval note in F0 commit
- Deferred per plan: Google Workspace MCP, real image-gen MCP, hosted TF mode, SSE live streaming to browser (polling today)

## Next Action if resuming
Only optional enhancements remain. Suggested order: (1) live TF server smoke test with real key; (2) SSE proxy route for live timeline updates; (3) Google Workspace read-only connector as company-knowledge source.
