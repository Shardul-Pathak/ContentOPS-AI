# Context Handoff

## Project
Autonomous Content Operations Platform

## Current Branch
main

## Current Task
Initial project setup — no implementation yet.

## Project State
- Company context: not started
- Campaign management: not started
- Agent orchestration: not started
- Research Agent: not started
- Growth & Visibility Agent: not started
- Writer Agent: not started
- SEO/Quality Agent: not started
- Revision loop: not started
- Image Agent: not started
- Human approval gate: not started
- Publishing Agent: not started

## Important Architecture Decisions
- The workflow uses specialized agents (Orchestrator + 6 subagents), coordinated via OpenCode, defined in `.opencode/agents/`.
- Agent handoffs use validated structured contracts (see AGENTS.md sections 10–17 for each agent's JSON output shape).
- Publishing requires explicit human approval — no exceptions, no bypass via prompt.
- Maximum revision count is 3 before requiring human intervention.
- Company context is authoritative for company facts; never overwritten by model inference.

## Recent Commits
None yet.

## Current Implementation State
- AGENTS.md created.
- `.opencode/agents/` scaffolded with: orchestrator, research, growth-visibility, writer, seo-quality, image, publishing.
- No application code, schema, or database yet.

## Uncommitted Changes
This is the first commit for the project — initialize the repo and commit AGENTS.md + `.opencode/agents/` as the first commit.

## Remaining Work
Follow the recommended build order in AGENTS.md section 35:
1. Company context management
2. Campaign management
3. Agent orchestration foundation
4. Research Agent
5. Growth & Visibility Agent
6. Writer Agent
7. SEO / Quality Agent
8. Revision loop
9. Image Agent
10. Human approval gate
11. Publishing Agent
12. End-to-end workflow

## Important Files
- AGENTS.md
- CONTEXT_HANDOFF.md
- .opencode/agents/orchestrator.md
- .opencode/agents/research.md
- .opencode/agents/growth-visibility.md
- .opencode/agents/writer.md
- .opencode/agents/seo-quality.md
- .opencode/agents/image.md
- .opencode/agents/publishing.md

## Known Issues
None.

## Next Action
Decide the tech stack (framework, DB, ORM) and scaffold the Company Context feature per AGENTS.md sections 7 and 35 step 1.
