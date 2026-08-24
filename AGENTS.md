# AGENTS.md

# Autonomous Content Operations Platform

## 1. Project Identity

This project is an autonomous AI content operations platform for companies.

It is not a simple AI blog generator.

The system coordinates specialized AI agents to:

1. Understand persistent company context.
2. Manage content campaigns.
3. Research topics using real sources and tools.
4. Determine content, SEO, growth, and visibility strategy.
5. Write company blog content.
6. Review content for quality, factual accuracy, SEO, and brand compliance.
7. Automatically revise failed drafts.
8. Generate visual assets.
9. Prepare content for publication.
10. Require explicit human approval.
11. Publish through an external CMS or company API.
12. Track the complete execution history.

The primary architectural goal is to demonstrate a real agentic workflow using the selected agent runtime (OpenCode).

The core product value is:

> A coordinated AI content team that researches, strategizes, writes, validates, illustrates, and publishes company content while keeping consequential external actions under human control.

---

# 2. Core Product Scope

## 2.1 Current MVP

The MVP includes:

### Company Setup

- Company context
- Company description
- Website
- Industry
- Product or service information
- Product features
- Target audience
- Audience pain points
- Brand voice
- Brand guidelines
- Style rules
- Prohibited language
- Marketing goals
- Value propositions
- CTAs
- Competitor context
- Allowed claims
- Prohibited claims
- Blog/content types

### Campaign Management

- Create campaigns
- Define campaign goals
- Define campaign audience
- Define topics
- Track campaign status
- Associate generated content with campaigns
- Track agent runs for campaign content

### Agent Workflow

- Orchestrator
- Research Agent
- Growth & Visibility Agent
- Writer Agent
- SEO/Quality Agent
- Image Agent
- Publishing Agent

### Workflow Features

- Multi-agent orchestration
- Structured agent handoffs
- Persistent workflow state
- Agent execution tracking
- Revision loops
- Maximum revision limit
- Human approval gates
- Controlled external actions
- Error handling
- Execution history

### Integrations

- Google Workspace or equivalent company knowledge integration
- Research/search integration
- CMS/blogging platform integration
- Custom company publishing endpoint

### Configuration

- Company context
- Agent system prompts
- Reusable agent skills
- Campaign instructions

---

# 3. Explicit Non-Goals for the Initial MVP

Do not add these unless explicitly requested or the core MVP is complete:

- LinkedIn publishing
- X publishing
- Threads publishing
- Social media scheduling
- Multi-platform publishing
- Full content calendar
- Complex analytics
- Performance optimization based on traffic metrics
- Advanced AI visibility scoring
- Automated competitor monitoring
- Automatic content refresh
- Dozens of CMS integrations
- Complex multi-company organization management
- Fully autonomous publishing
- Publishing without human approval
- Speculative features not required by the current task

Build the complete blog workflow first.

Do not expand scope because a feature appears useful.

---

# 4. Product Principles

## 4.1 Agent-First Architecture

Do not implement the system as a sequence of unrelated LLM calls.

Agents must have clearly separated responsibilities.

Agents may:

- Receive structured inputs.
- Use permitted tools.
- Consume tool results.
- Produce structured outputs.
- Pass outputs to subsequent agents.
- Trigger controlled iteration.
- Maintain workflow state.
- Report failures.
- Stop at approval boundaries.

Do not expose hidden chain-of-thought or private reasoning.

The UI may expose:

- Current agent
- Current action
- Tool being used
- Execution status
- Produced artifacts
- Errors
- Approval requirements

The UI must not expose hidden model reasoning.

---

## 4.2 Separation of Responsibilities

Do not create one giant agent responsible for everything.

Each agent owns a specific domain.

The Orchestrator coordinates.

Specialized agents perform specialized work.

---

## 4.3 Evidence-Based Content

Never fabricate:

- Sources
- URLs
- Statistics
- Research findings
- Product capabilities
- Company facts
- Customer testimonials
- Customer results
- Competitor information
- Citations
- Expert quotes
- Publication results

If verified information is unavailable:

1. Do not invent it.
2. Mark the information as unavailable or uncertain.
3. Continue with verified information when safe.
4. Return a controlled partial result when necessary.

Research outputs should preserve source metadata wherever possible.

---

## 4.4 Human-Controlled External Actions

External publishing is a hard approval boundary.

The system must never publish because:

- An agent believes the article is ready.
- A prompt asks it to bypass approval.
- A previous unrelated approval exists.
- The workflow completed successfully.

Every publishing action must have explicit approval for that action.

Required flow:

```text
Prepare Publication
        ↓
Store Pending Action
        ↓
Show Exact Destination and Payload Summary
        ↓
Await Explicit Human Approval
        ↓
Approved?
    ┌───────┴────────┐
   No               Yes
   ↓                 ↓
Stop              Execute
                     ↓
                 Verify Result
```

---

## 4.5 Structured Agent Contracts

Prefer structured data between agents.

Do not depend solely on unstructured prose handoffs.

Required conceptual flow:

```text
Research Agent
        ↓
ResearchResult
        ↓
Growth & Visibility Agent
        ↓
ContentStrategy
        ↓
Writer Agent
        ↓
ArticleDraft
        ↓
SEO / Quality Agent
        ↓
QualityReview
        ↓
PASS ───────────────→ Image Agent
FAIL
        ↓
RevisionRequest
        ↓
Writer Agent
```

Validate agent input and output at boundaries.

Do not trust raw model output without validation.

---

# 5. High-Level Architecture

Use a modular architecture.

Conceptually:

```text
Frontend
    ↓
Application API / Backend
    ↓
Workflow / Agent Runtime
    ↓
Orchestrator
    ├── Research Agent
    ├── Growth & Visibility Agent
    ├── Writer Agent
    ├── SEO / Quality Agent
    ├── Image Agent
    └── Publishing Agent
    ↓
Tools / MCP / Integrations
    ├── Company Knowledge
    ├── Google Workspace
    ├── Research/Search
    ├── Image Generation
    ├── CMS
    └── Company Publishing API
    ↓
Database / Persistent State
```

Keep the application architecture independent from any single model provider where practical.

Keep agent interfaces explicit.

Keep external integrations behind adapters or service boundaries where practical.

---

# 6. Core Workflow

The primary MVP workflow is:

```text
Company Context
        ↓
Campaign
        ↓
Topic Selected
        ↓
Research Agent
        ↓
Growth & Visibility Agent
        ↓
Writer Agent
        ↓
SEO / Quality Agent
        ↓
   ┌──── PASS ────┐
   │              │
   │         Image Agent
   │              ↓
   │         Final Draft
   │              ↓
   │       Human Approval
   │              ↓
   │      Publishing Agent
   │              ↓
   │         Published
   │
   └──── FAIL
          ↓
   Revision Feedback
          ↓
     Writer Agent
          ↓
   SEO / Quality Agent
```

Do not skip workflow states without explicit architectural support.

Every transition should be traceable.

---

# 7. Company Context

Company context is the persistent source of truth for company-specific facts.

Conceptual structure:

```json
{
  "company": {
    "name": "",
    "description": "",
    "website": "",
    "industry": ""
  },
  "products": [
    {
      "name": "",
      "description": "",
      "features": [],
      "targetUsers": []
    }
  ],
  "audience": {
    "primary": [],
    "secondary": [],
    "painPoints": []
  },
  "brand": {
    "voice": "",
    "tone": "",
    "styleRules": [],
    "prohibitedLanguage": []
  },
  "marketing": {
    "goals": [],
    "valuePropositions": [],
    "ctas": []
  },
  "competitors": [],
  "allowedClaims": [],
  "prohibitedClaims": []
}
```

Rules:

* Treat persisted company context as authoritative.
* Do not overwrite company facts from model inference.
* Flag conflicts between research and company context.
* Do not silently resolve factual conflicts by guessing.
* Validate company context before starting workflows that depend on it.

---

# 8. Campaign Model

A campaign groups related content around a business objective.

A campaign should support:

* Name
* Description
* Goal
* Target audience
* Topics
* Company context reference
* Status
* Generated content
* Research artifacts
* Agent runs
* Approval states
* Publishing states

Campaign state must be persisted.

---

# 9. Orchestrator

The Orchestrator coordinates the workflow.

It must not absorb all specialized agent responsibilities.

Responsibilities:

* Load required company context.
* Load campaign context.
* Validate required inputs.
* Initialize workflow state.
* Select the next agent.
* Pass validated outputs between agents.
* Persist workflow state.
* Track agent runs.
* Trigger revision loops.
* Enforce maximum revision limits.
* Handle controlled failures.
* Stop at human approval gates.
* Resume after explicit approval.
* Trigger publishing only after approval.
* Record final results.

The Orchestrator must be able to reconstruct workflow state after interruption.

---

# 10. Research Agent

## Responsibility

Research the requested topic using available verified tools and sources.

## Inputs

* Company context
* Campaign context
* Topic
* Target audience
* Research instructions

## Tasks

* Research the topic.
* Identify relevant user questions.
* Identify audience pain points.
* Identify important concepts.
* Find credible sources.
* Collect evidence.
* Identify relevant industry context.
* Identify content opportunities.

## Output

```json
{
  "topic": "",
  "searchIntent": "",
  "audienceQuestions": [],
  "painPoints": [],
  "keyPoints": [],
  "sources": [
    {
      "title": "",
      "url": "",
      "publisher": "",
      "relevance": "",
      "claimsSupported": []
    }
  ],
  "contentOpportunities": [],
  "limitations": []
}
```

## Rules

* Never invent sources.
* Preserve source URLs.
* Distinguish facts from interpretation.
* Prefer authoritative and relevant sources.
* Record research limitations.
* Do not write the final article.
* Do not make unsupported competitor claims.

---

# 11. Growth & Visibility Agent

## Responsibility

Create the content strategy: search intent, SEO strategy, content marketing, product positioning, customer question coverage, content gap analysis, discoverability considerations, CTA strategy.

This agent does not guarantee LLM recommendations. It must not claim the article will make an AI assistant recommend the company. The valid objective is to improve the company's public information coverage and produce useful, authoritative content addressing relevant customer questions.

## Tasks

* Determine search intent.
* Identify important user questions.
* Identify relevant topics and concepts.
* Identify content gaps.
* Determine article angle.
* Recommend product positioning.
* Recommend natural product mentions.
* Determine CTA strategy.
* Recommend article structure.
* Identify comparison opportunities when factual evidence supports them.

## Output

```json
{
  "primaryTopic": "",
  "searchIntent": "",
  "targetQuestions": [],
  "primaryKeywords": [],
  "secondaryTopics": [],
  "contentAngle": "",
  "productPositioning": "",
  "ctaStrategy": "",
  "recommendedStructure": [],
  "contentGaps": []
}
```

## Rules

Do not:

* Keyword stuff.
* Optimize at the expense of usefulness.
* Make unsupported superiority claims.
* Misrepresent competitors.
* Manufacture comparison data.
* Create fake testimonials.
* Insert irrelevant product mentions.
* Guarantee rankings or LLM visibility.

---

# 12. Writer Agent

## Responsibility

Write the article using validated company context, research, and strategy.

## Inputs

* Company context
* Campaign context
* ResearchResult
* ContentStrategy
* Writer system prompt
* Applicable skills
* Revision feedback when applicable

## Tasks

* Create title, slug, meta title, meta description.
* Write the article, following recommended structure.
* Integrate verified research.
* Maintain brand voice.
* Position the product only where relevant.
* Add appropriate CTA.
* Preserve factual accuracy.

## Output

```json
{
  "title": "",
  "slug": "",
  "metaTitle": "",
  "metaDescription": "",
  "content": "",
  "headings": [],
  "cta": "",
  "sources": []
}
```

## Rules

* Never fabricate facts or citations.
* Never copy source material beyond legally permissible short quotations.
* Avoid generic filler.
* Do not over-promote the company.
* Follow brand guidelines and applicable skills.
* Preserve source attribution where required.

---

# 13. SEO / Quality Agent

## Responsibility

Evaluate whether the article is ready to proceed. Reviews and returns structured feedback — does not silently rewrite the article.

## Required Checks

**SEO:** search intent alignment, topic coverage, title quality, heading structure, natural keyword use, meta title, meta description, content structure, internal linking opportunities.

**Content Quality:** factual consistency, logical flow, readability, redundancy, unsupported claims, source quality, source relevance.

**Brand Compliance:** brand voice, product accuracy, allowed/prohibited claims, competitor accuracy, CTA appropriateness.

## Output

PASS:

```json
{ "status": "PASS", "score": 0, "issues": [], "recommendations": [] }
```

FAIL:

```json
{
  "status": "FAIL",
  "score": 0,
  "issues": [
    { "severity": "low", "category": "", "description": "", "location": "", "suggestedFix": "" }
  ],
  "recommendations": []
}
```

The schema must use validated types. Do not allow arbitrary model output to directly control workflow transitions.

---

# 14. Revision Loop

```text
Writer → Quality Review → FAIL → Structured Feedback → Writer Revision → Quality Review
```

Default conceptual limit: `MAX_REVISIONS = 3`

Rules:

* Persist revision count.
* Do not create infinite loops.
* Increment only for an actual revision cycle.
* Stop when the maximum is reached.
* Mark the workflow as requiring human intervention when it cannot pass.
* Preserve previous review results for auditability.
* Do not discard execution history.

---

# 15. Image Agent

## Responsibility

Generate or obtain visual assets appropriate for the final article.

## Inputs

Final article, article topic, brand context, visual requirements.

## Tasks

Determine visual requirements, generate hero image where supported, generate additional images only when required, produce alt text, produce asset metadata.

## Output

```json
{
  "assets": [
    { "type": "hero", "url": "", "altText": "", "description": "" }
  ]
}
```

Rules: respect brand guidelines, do not generate misleading visuals, avoid unnecessary text baked into images, persist asset metadata, handle generation failures explicitly.

---

# 16. Publishing Agent

## Responsibility

Prepare and execute publishing through a configured destination.

## Tasks Before Approval

Validate destination and configuration, prepare payload, upload/prepare assets, create a pending action, generate preview information.

## Tasks After Approval

Execute the publishing action, record the result, verify where possible, store published URL/identifier, persist success or failure state.

## Hard Rule

Do not execute the final external publish action before explicit approval.

---

# 17. Human Approval

The approval screen or API response must clearly identify: destination, article title, slug, meta description, assets, external action, endpoint/target, relevant changes, potential consequences.

Approval and rejection must be persisted. Rejected publishing actions must not execute. A new external action requires its own approval.

---

# 18. Agent Skills

Skills are reusable behavior modules or instruction sets (e.g. SEO Optimization, Technical Writing, Thought Leadership, Product Marketing, Comparison Articles, Case Study Writing, Developer Documentation, How-To Articles, Beginner Guides).

Conceptual skill structure:

```json
{ "name": "", "description": "", "applicableAgents": [], "instructions": [], "parameters": {} }
```

Rules: skills must have explicit applicability, must not override safety or company constraints, should be composable where possible; avoid creating skills for one-off prompt fragments.

---

# 19. Prompt and Instruction Priority

```text
Platform / Safety Constraints
        ↓
Security Constraints
        ↓
Company Rules
        ↓
Agent System Prompt
        ↓
Applicable Agent Skills
        ↓
Campaign Instructions
        ↓
Task Instructions
```

Lower-priority instructions must not override higher-priority constraints. Do not allow user-configurable prompts to bypass human approval, security controls, data validation, or publishing restrictions.

---

# 20. Persistent Workflow State

```json
{
  "campaignId": "",
  "contentId": "",
  "status": "",
  "currentAgent": "",
  "revisionCount": 0,
  "research": {},
  "strategy": {},
  "draft": {},
  "qualityReview": {},
  "assets": {},
  "publishingPayload": {},
  "approval": { "required": true, "status": "pending" }
}
```

Possible states: `CREATED, VALIDATING, RESEARCHING, STRATEGIZING, WRITING, REVIEWING, REVISING, GENERATING_ASSETS, AWAITING_APPROVAL, PUBLISHING, PUBLISHED, FAILED, REQUIRES_HUMAN_INTERVENTION, CANCELLED`

Do not use ambiguous state transitions. Validate transitions.

---

# 21. Integrations and MCP

**Company Knowledge / Google Workspace:** read company/product docs, brand guidelines, approved marketing material. Retrieve only what is necessary; never expose raw credentials to models; validate responses; treat retrieved content as evidence, not automatic permission to publish claims.

**Research Integration:** search for sources, retrieve pages, gather metadata. Preserve provenance; do not invent unavailable data; respect tool failures; distinguish snippets from verified content.

**CMS Integration:** create draft, upload assets, update metadata, preview, publish, retrieve published URL, verify result. Publishing remains behind explicit human approval.

**Custom Company API:** support configurable publishing endpoints.

```json
{ "endpoint": "", "method": "POST", "authenticationReference": "", "payloadSchema": {} }
```

Rules: never expose raw secrets to the model; store credentials securely; validate endpoint configuration, allowed HTTP methods, and payload against schema; do not allow arbitrary unvalidated external destinations.

---

# 22. Database Concepts

Conceptually: `Company, Product, Campaign, Content, AgentRun, AgentTask, ResearchSource, ContentReview, Asset, Integration, AgentSkill, SystemPrompt, Approval, PublishingJob`.

Preserve enough relationships to reconstruct what was requested, which agents ran, which tools were used, what outputs were produced, what revisions occurred, what approval was granted, what publishing action executed. Use migrations for persistent schema changes. Do not modify production data through untracked ad hoc scripts.

---

# 23. Error Handling

Handle tool/API/auth failures, timeouts, invalid responses, missing context, invalid agent output, generation/publishing failures, approval rejection, workflow interruption, recoverable database failures.

Rules:

1. Do not silently ignore failures.
2. Do not replace missing results with fabricated data.
3. Persist meaningful failure information.
4. Retry only when safe.
5. Avoid duplicate external actions during retries; use idempotency where required.
6. Stop and escalate when automatic recovery is unsafe.

---

# 24. Security Requirements

**Credentials:** never in prompts, never committed, never logged; use environment variables or a secure secret store; use references/IDs instead of raw credentials in agent workflows.

**Input Validation:** validate API input, database input, agent output, integration configuration, publishing payloads, external URLs, identifiers. Do not trust model-generated values.

**External Actions:** validate destination, method, payload, authorization, approval state before execution.

**Code Execution:** use an isolated sandbox, apply least privilege, set resource limits, never execute untrusted code directly on the production application server.

---

# 25. UI Requirements

Show workflow progress (company context loaded, campaign loaded, research/strategy/draft/review completed, revision in progress, image generation, awaiting approval, publishing) and current agent activity (action, tool, status).

Do not show hidden chain-of-thought, private reasoning, raw credentials, or internal secrets.

---

# 26. Testing Requirements

Test: workflow state transitions, agent input/output validation, revision loop behavior and max-revision behavior, approval gates and rejection, publishing execution/failure, duplicate publishing protection, company context validation, error handling, integration adapters, database behavior.

Critical paths: PASS path, REVISION path, MAX REVISION path, APPROVAL REJECTION path, PUBLISHING FAILURE path.

Do not add tests merely for coverage numbers — test behavior that can break important workflow guarantees.

---

# 27. Development Workflow

```text
Understand → Inspect Existing Code → Determine Scope → Plan Minimal Complete Change
→ Implement → Verify → Fix Implementation Issues → Re-verify → Review Diff → Commit
```

Do not start implementation by blindly editing files. First inspect existing architecture, relevant files, existing patterns, validation, tests, scripts, and current Git state. Reuse existing patterns where appropriate. Do not introduce a new abstraction when an existing one solves the problem.

---

# 28. Mandatory Git Policy

```text
ONE COMPLETED FEATURE = ONE OR MORE COHERENT FEATURE COMMITS
ONE FIXED ISSUE = A VERIFIED FIX COMMIT
```

Do not accumulate unrelated completed work in one uncommitted working tree. A completed feature is not complete until implementation is complete, relevant verification has run, the diff has been reviewed, and the changes are committed.

## Branching Model

Never commit feature, fix, or refactoring work directly to `main`. All development work happens on short-lived branches that are merged back into `main` only after verification and diff review:

```text
main                        ← always releasable; protected from direct feature/fix commits
├── feat/<short-scope>      ← e.g. feat/company-context, feat/revision-loop
├── fix/<short-issue>       ← e.g. fix/approval-double-submit
└── chore/<topic>           ← e.g. chore/ci-pipeline, chore/deps-prisma
```

Branching rules:

1. Create one branch per coherent feature, fix, or chore — respecting the boundaries in sections 29, 30, and 32.
2. Always branch from the current `main` tip. Do not stack unrelated work onto an existing feature branch.
3. Merge into `main` only after: implementation complete → relevant verification ran on the branch → diff reviewed. Prefer `git merge --no-ff` so feature history remains traceable in `main`.
4. Only repository initialization/bootstrap scaffolding may land directly on `main`.
5. Never force-push `main` and never rewrite `main` history once it is shared.
6. Delete a branch after it is merged; do not reuse a merged branch for new, unrelated work.
7. If a remote is configured, deliver changes via pull request; direct pushes to `main` are prohibited except for critical hotfixes, which must still pass verification and review.
8. Keep branches short-lived and sync them with `main` regularly to limit drift.

---

# 29. Feature Commit Policy

Commit immediately after a coherent feature is complete and verified, e.g.:

```text
feat(company): add company context management
feat(campaign): add campaign creation workflow
feat(workflow): add agent orchestration foundation
feat(research): implement research agent
feat(growth): implement growth and visibility agent
feat(writer): implement article writer agent
feat(quality): add SEO quality review
feat(revision): add automatic revision workflow
feat(images): add article image generation
feat(approval): add publishing approval gate
feat(publishing): add CMS publishing integration
```

A feature commit may contain multiple files when they are all required for that feature. Do not split one coherent vertical feature into meaningless micro-commits. Do not combine unrelated features merely to reduce commit count.

---

# 30. Bug Fix Commit Policy

Every fixed issue must be committed after root cause investigation, minimal fix, relevant verification, regression testing where appropriate, and diff review.

Format: `fix(scope): concise description`

Do not bundle unrelated refactoring into a bug fix. Fix the issue, commit it, handle unrelated improvements separately.

---

# 31. Pre-Commit Procedure

1. `git status` — identify all changed and untracked files.
2. `git diff` / `git diff --staged` — ensure all changes belong to the current feature or fix; watch for secrets, env files, temp files, debug output, build artifacts.
3. Run relevant verification only (inspect project scripts first; don't assume they exist; e.g. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`). If verification cannot run due to an environment limitation, state the exact limitation and do not falsely mark the feature as fully verified.
4. Stage deliberately (`git add path/to/file`), avoid blind `git add .`.
5. Commit using Conventional Commit format (`type(scope): concise description`; types: `feat, fix, refactor, test, docs, chore`; lowercase, concise, imperative, specific — never `update`, `changes`, `stuff`, `wip`).
6. Verify: `git status`, `git log -1 --oneline`. Preferred state before new work: `nothing to commit, working tree clean`.

---

# 32. Feature Boundaries

Identify the feature boundary before implementation. A feature may include schema, migration, validation, service, API, UI, and tests if they collectively form one complete vertical feature. Do not include unrelated work from other features.

---

# 33. Fix Boundaries

A bug fix should be minimal and focused. Avoid rewriting unrelated systems because of one isolated bug unless the architecture genuinely requires it. If unrelated problems are discovered: record them, finish the current fix, verify, commit, handle new work separately.

---

# 34. Database Development Rules

```text
Schema Change → Migration → Application Code → Validation → Relevant Tests → Verification → Commit
```

Do not modify persistent schema without migration handling. Include required migrations with the feature. Do not leave schema and generated client state inconsistent. Review migration impact before applying destructive changes. Preserve data when possible. Do not run destructive database operations casually.

---

# 35. Agent Development Sequence

Recommended order:

```text
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
```

After each major component: verify isolated behavior, verify input/output contract, verify required integration, review diff, commit. Do not implement every agent in one giant change.

---

# 36. Code Quality Rules

Prioritize clear architecture, small focused modules, explicit types, input validation, predictable control flow, error handling, testable functions, minimal duplication, readable naming, clear boundaries.

Avoid giant files, god objects, hidden side effects, untyped model output, unvalidated external input, excessive abstraction, premature optimization, dead code, debug code in final implementation.

Comments should explain non-obvious decisions, constraints, important invariants, and security boundaries — not obvious code.

---

# 37. Dependency Rules

Before adding a dependency: check whether the project already has a suitable one, check whether native platform capabilities suffice, add only when justified, prefer actively maintained packages, avoid adding packages for trivial utilities, verify compatibility. Do not add multiple libraries solving the same problem. Commit dependency changes with the feature that requires them.

---

# 38. Refactoring Rules

Do not refactor unrelated code while implementing a feature unless necessary. If required: keep it scoped, preserve behavior, add/update tests where practical, verify dependent code, use a separate `refactor` commit when logically independent. Do not hide large architectural rewrites inside `fix` commits.

---

# 39. Context Window Continuity

Manage context proactively — do not wait until it's exhausted.

```text
Monitor Context → Approaching Limit → Do Not Start Large New Work → Finish Current Atomic Operation
→ Verify State → Commit Completed Work → Record Handoff → Continue in Next Context Window
```

---

# 40. Mandatory Context Handoff

Before ending a context window, record: current project state (architecture, active technologies, decisions, schema state, agent architecture, integration status, important file locations), completed work (features, fixed issues, commit hashes), current task (what's complete, what remains, status), uncommitted changes (`git status`/`git diff`, why uncommitted), and next exact steps (ordered continuation plan). Completed work must be committed before handoff.

---

# 41. CONTEXT_HANDOFF.md

Maintain `CONTEXT_HANDOFF.md` at the project root to transfer active development state between context windows. See the seed file created alongside this AGENTS.md.

Rules: do not use handoff as an excuse to leave completed work uncommitted; update it before context exhaustion; keep the current task exact; record important decisions that must not be accidentally reversed; record the next exact action.

---

# 42. Absolute Context Continuity Rule

```text
COMMIT COMPLETED WORK → INSPECT GIT STATUS → RECORD PROJECT STATE → RECORD ARCHITECTURAL DECISIONS
→ RECORD UNCOMMITTED WORK → RECORD EXACT NEXT STEPS → UPDATE CONTEXT_HANDOFF.md → CONTINUE
```

Do not start large new or unrelated work near the context limit. Do not make major architecture changes without enough context. Do not leave completed work uncommitted. Do not assume the next context window remembers current implementation details.

---

# 43. Session Start Procedure

1. Read this `AGENTS.md`.
2. Inspect `CONTEXT_HANDOFF.md` if it exists.
3. Run `git status` and `git log --oneline -10`.
4. Inspect relevant project files.
5. Determine the current task.
6. Check for existing uncommitted work; do not overwrite it.
7. Continue from the documented state.

If `CONTEXT_HANDOFF.md` conflicts with the actual repository, treat the repository and Git history as the source of truth, and update the handoff to match reality.

---

# 44. Session End Procedure

1. Finish the current atomic operation if possible.
2. Run relevant verification.
3. Commit completed features or fixes.
4. Run `git status`, `git log -1 --oneline`.
5. Update `CONTEXT_HANDOFF.md`.
6. Record incomplete work, known issues, and exact next steps.

Do not claim work is complete if verification did not occur.

---

# 45. Completion Checklist

**Feature:** scope understood; existing code inspected; existing patterns reused where appropriate; feature implemented; input validation added; relevant error handling added; relevant tests added/updated; relevant verification executed; failures fixed; diff reviewed; only related files staged; Conventional Commit created; commit verified; working tree reviewed.

**Bug Fix:** issue understood; root cause identified; minimal fix implemented; regression test added where appropriate; fix verified; relevant checks executed; diff reviewed; fix committed; commit verified.

**Context Handoff:** completed work committed; git status inspected; current task recorded; architecture decisions recorded; recent commits recorded; uncommitted work recorded; important files recorded; known issues recorded; exact next steps recorded; CONTEXT_HANDOFF.md updated.

---

# 46. Definition of Done for the MVP

The MVP is complete only when a user can: create a company profile; add company context, product info, target audience, brand guidelines, marketing goals; create a campaign; define a blog topic; start a workflow; see Research/Growth/Writer/SEO agent execution; trigger revision automatically when needed and enforce the max revision limit; generate a blog image; review the final article; configure a basic publishing destination; see the Publishing Agent prepare the action; receive an explicit approval request; approve or reject publishing (and prevent publishing when rejected); publish only after approval; verify/record the publishing result; view workflow execution history; recover or report controlled workflow failures.

---

# 47. Product Positioning

Present the project as:

> An autonomous AI content operations platform for companies. It coordinates specialized agents to research, strategize, write, optimize, validate, illustrate, and publish high-quality company content while keeping consequential external actions under human control.

Do not position the core product as "an AI blog generator."

Differentiators: specialized multi-agent workflow, real tool and integration usage, structured agent handoffs, persistent workflow state, automated revision loops, evidence-based content generation, human-controlled external publishing, traceable execution history.

---

# 48. Final Absolute Rules

```text
INSPECT BEFORE EDITING.
DO NOT GUESS WHEN THE REPOSITORY CAN PROVIDE THE ANSWER.
VALIDATE ALL EXTERNAL AND MODEL-GENERATED DATA.
NEVER FABRICATE SOURCES, FACTS, CITATIONS, OR RESULTS.
KEEP AGENT RESPONSIBILITIES SEPARATE.
PERSIST IMPORTANT WORKFLOW STATE.
DO NOT EXPOSE HIDDEN MODEL REASONING.
PUBLISHING ALWAYS REQUIRES EXPLICIT HUMAN APPROVAL.
VERIFY BEFORE CLAIMING SUCCESS.
ONE COMPLETED FEATURE MUST BE COMMITTED.
ONE FIXED ISSUE MUST BE VERIFIED AND COMMITTED.
DO NOT COMBINE UNRELATED WORK IN ONE COMMIT.
REVIEW THE DIFF BEFORE EVERY COMMIT.
DO NOT LEAVE COMPLETED WORK UNCOMMITTED.
MANAGE CONTEXT PROACTIVELY.
BEFORE CONTEXT EXHAUSTION, CREATE A COMPLETE HANDOFF.
THE REPOSITORY AND GIT HISTORY ARE THE SOURCE OF TRUTH.
```
