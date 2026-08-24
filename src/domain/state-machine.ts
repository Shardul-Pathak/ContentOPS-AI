// Workflow state machine per AGENTS.md section 20. Pure functions — no I/O.
// The application owns these transitions; TrueForge executes agents within them.

export const WORKFLOW_STATUSES = [
  "CREATED",
  "VALIDATING",
  "RESEARCHING",
  "STRATEGIZING",
  "WRITING",
  "REVIEWING",
  "REVISING",
  "GENERATING_ASSETS",
  "AWAITING_APPROVAL",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "REQUIRES_HUMAN_INTERVENTION",
  "CANCELLED",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const MAX_REVISIONS = 3;

export type TransitionEvent =
  | { type: "VALIDATED" }
  | { type: "RESEARCH_DONE" }
  | { type: "STRATEGY_DONE" }
  | { type: "DRAFT_DONE" }
  | { type: "REVIEW_PASS" }
  | { type: "REVIEW_FAIL"; revisionCount: number }
  | { type: "ASSETS_READY" }
  | { type: "APPROVED" }
  | { type: "REJECTED" }
  | { type: "PUBLISH_SUCCEEDED" }
  | { type: "PUBLISH_FAILED" };

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: WorkflowStatus,
    public readonly event: string,
  ) {
    super(`Illegal workflow transition: ${event} is not valid from state ${from}`);
    this.name = "IllegalTransitionError";
  }
}

export function nextStatus(
  current: WorkflowStatus,
  event: TransitionEvent,
): WorkflowStatus {
  switch (event.type) {
    case "VALIDATED":
      expect(current, "CREATED", event.type);
      return "VALIDATING";
    case "RESEARCH_DONE":
      // Validation success flows straight into research.
      expect(current, ["CREATED", "VALIDATING", "RESEARCHING"], event.type);
      return "STRATEGIZING";
    case "STRATEGY_DONE":
      expect(current, "STRATEGIZING", event.type);
      return "WRITING";
    case "DRAFT_DONE":
      expect(current, ["WRITING", "REVISING"], event.type);
      return "REVIEWING";
    case "REVIEW_PASS":
      expect(current, "REVIEWING", event.type);
      return "GENERATING_ASSETS";
    case "REVIEW_FAIL": {
      expect(current, "REVIEWING", event.type);
      // Revision loop guard (AGENTS.md section 14): stop at MAX_REVISIONS
      // instead of looping forever; escalate to a human.
      return event.revisionCount < MAX_REVISIONS
        ? "REVISING"
        : "REQUIRES_HUMAN_INTERVENTION";
    }
    case "ASSETS_READY":
      expect(current, "GENERATING_ASSETS", event.type);
      return "AWAITING_APPROVAL";
    case "APPROVED":
      expect(current, "AWAITING_APPROVAL", event.type);
      return "PUBLISHING";
    case "REJECTED":
      expect(current, "AWAITING_APPROVAL", event.type);
      return "CANCELLED";
    case "PUBLISH_SUCCEEDED":
      expect(current, "PUBLISHING", event.type);
      return "PUBLISHED";
    case "PUBLISH_FAILED":
      expect(current, "PUBLISHING", event.type);
      return "FAILED";
    default:
      throw new IllegalTransitionError(current, String((event as TransitionEvent).type));
  }
}

function expect(
  current: WorkflowStatus,
  allowed: WorkflowStatus | WorkflowStatus[],
  event: string,
): void {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(current)) {
    throw new IllegalTransitionError(current, event);
  }
}

export function isTerminal(status: WorkflowStatus): boolean {
  return (
    status === "PUBLISHED" ||
    status === "FAILED" ||
    status === "REQUIRES_HUMAN_INTERVENTION" ||
    status === "CANCELLED"
  );
}
