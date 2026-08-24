# Implementation Plan (Finalized)

TrueForge-first architecture per `AGENTS.md`. TrueForge is the agent harness: agent
execution, tool/MCP routing, human approval pauses, session state, and stream resume.
The application owns business entities, workflow sequencing, contract validation, UI,
and publishing records.

## Stack

- Next.js 15 App Router + TypeScript (single deployable: API + UI)
- Prisma + SQLite (business data; Postgres-swappable via service boundary)
- Zod contracts at every agent/model boundary (never trust model output)
- Vitest (unit + integration; mock TrueForge client for CI)
- TrueForge local mode (`npx @truefoundry/trueforge@latest`, :8790) via
  `@truefoundry/trueforge-sdk`

## Verified TrueForge facts (docs trueforge.dev, Aug 2026)

- Agent spec: `model{name,params}`, `instructions`,
  `mcp_servers[{name,enable_tools,disable_tools,require_approval_for_tools,preload}]`,
  `skills[{name}]` (needs sandbox), `config{sandbox,dynamic_sub_agents,
  context_management,iteration_limit,...}`, `response_format{text|json_object|json_schema}`
- Registry CRUD: `agents.create/list/get/update/delete`; unique immutable name
- Sessions → Turns → Events. Turn input types: `user.message`, `user.tool_approval`
  ({threadId, toolCallId, approval:{status:"allow"}|{status:"deny",reason}}),
  `user.tool_response`. Cannot mix message with approval items in one turn.
- Approval gating: `require_approval_for_tools` pauses the turn with
  `tool.approval_required` in `turn.done.state.required_actions`; resume = NEW turn.
- Resume: persist sessionId+turnId+lastSeq → `getTurn`; running ⇒
  `subscribeToTurn({afterSequenceNumber})`; finished ⇒ `listTurnEvents`.
- Subagents: dynamic, parallel, one level deep, shared tools/sandbox;
  `thread.created/done` events; disable via config for deterministic agents.
- MCP servers by URL with header auth or OAuth DCR; in-chat auth pause (`mcp.auth_required`).
- Sandbox provider: Daytona (only supported provider) — OPTIONAL enhancement.
- Metrics on `turn.done`: tokens + total_cost_in_usd.

## Topology decision

Application-side workflow service sequences six NAMED TrueForge agents
(one fresh session per agent run → isolated contexts, structured handoffs).
A model-driven root orchestrator was rejected: AGENTS.md §19 forbids prompt-bypassable
approval/validation; max revisions and gates must be deterministic code. Dynamic
subagents stay ON only inside research (parallel fan-out). The CMS is an in-repo MCP
endpoint (`/api/mcp/cms`) whose `publish_article` tool is approval-gated in TrueForge.

## Workflow states (app-enforced)

CREATED→VALIDATING→RESEARCHING→STRATEGIZING→WRITING→REVIEWING
REVIEWING─PASS→GENERATING_ASSETS→AWAITING_APPROVAL─approve→PUBLISHING→PUBLISHED|FAILED
         ├─FAIL(<3)→REVISING→WRITING
         └─FAIL(≥3)→REQUIRES_HUMAN_INTERVENTION [terminal]
AWAITING_APPROVAL─reject→CANCELLED [terminal]; retry requires new gated call+approval

## Feature sequence (branch per feature; merge --no-ff after verify+review)

| # | Branch | Commit |
|---|---|---|
| F0 | main (bootstrap exception) | chore(repo): docs/agents; scaffold foundation |
| F1 | feature/company-context | feat(company): add company context management |
| F2 | feature/campaign-management | feat(campaign): add campaign creation workflow |
| F3 | feature/trueforge-foundation | feat(workflow): add trueforge orchestration foundation |
| F4 | feature/research-agent | feat(research): implement research agent |
| F5 | feature/growth-agent | feat(growth): implement growth and visibility agent |
| F6 | feature/writer-agent | feat(writer): implement article writer agent |
| F7 | feature/quality-agent | feat(quality): add seo quality review |
| F8 | feature/revision-workflow | feat(revision): add automatic revision workflow |
| F9 | feature/image-generation | feat(images): add article image generation |
| F10 | feature/publishing-approval | feat(approval): add human approval gate |
| F11 | feature/cms-publishing | feat(publishing): add cms publishing integration |
| F12 | feature/end-to-end-workflow | feat(workflow): complete end-to-end workflow |

## Decisions locked with owner

1. Model provider: OpenAI-compatible endpoint via env (`MODEL_PROVIDER_BASE_URL`,
   `MODEL_PROVIDER_API_KEY`, `MODEL_FQN`); registered into TrueForge Settings by seed
   script; keys live only in TF connector store. Provider switch = env change + reseed.
2. Sandbox/skills: optional behind `ENABLE_SANDBOX` + `DAYTONA_API_KEY`; graceful
   degradation; no custom sandbox replacement; never blocks core path.
3. MVP priority: orchestration → MCP tools → persistent state → revision loop →
   approval → real publish.

## Verification-first items at kickoff of F3/F9

- Pin `@truefoundry/trueforge-sdk`; smoke-check API drift vs these docs.
- Inspect shipped MCP catalog (image-gen presence?) before F9; mock fallback regardless.
- Check provider's json_schema support; RESPONSE_FORMAT_MODE fallback documented.
