import { describe, it, expect } from "vitest";
import {
  nextStatus,
  isTerminal,
  MAX_REVISIONS,
  IllegalTransitionError,
  type WorkflowStatus,
} from "@/domain/state-machine";

describe("workflow state machine", () => {
  it("walks the happy path from CREATED to AWAITING_APPROVAL", () => {
    let s: WorkflowStatus = "CREATED";
    s = nextStatus(s, { type: "VALIDATED" });
    s = nextStatus(s, { type: "RESEARCH_DONE" });
    expect(s).toBe("STRATEGIZING");
    s = nextStatus(s, { type: "STRATEGY_DONE" });
    s = nextStatus(s, { type: "DRAFT_DONE" });
    expect(s).toBe("REVIEWING");
    s = nextStatus(s, { type: "REVIEW_PASS" });
    expect(s).toBe("GENERATING_ASSETS");
    s = nextStatus(s, { type: "ASSETS_READY" });
    expect(s).toBe("AWAITING_APPROVAL");
  });

  it("routes REVIEW_FAIL to REVISING while under MAX_REVISIONS", () => {
    for (let count = 0; count < MAX_REVISIONS; count++) {
      const next = nextStatus("REVIEWING", { type: "REVIEW_FAIL", revisionCount: count });
      expect(next).toBe("REVISING");
    }
  });

  it("escalates to REQUIRES_HUMAN_INTERVENTION at the revision limit", () => {
    const next = nextStatus("REVIEWING", { type: "REVIEW_FAIL", revisionCount: MAX_REVISIONS });
    expect(next).toBe("REQUIRES_HUMAN_INTERVENTION");
    expect(isTerminal(next)).toBe(true);
  });

  it("moves through approval and publishing states only legally", () => {
    expect(nextStatus("AWAITING_APPROVAL", { type: "APPROVED" })).toBe("PUBLISHING");
    expect(nextStatus("AWAITING_APPROVAL", { type: "REJECTED" })).toBe("CANCELLED");
    expect(nextStatus("PUBLISHING", { type: "PUBLISH_SUCCEEDED" })).toBe("PUBLISHED");
    expect(nextStatus("PUBLISHING", { type: "PUBLISH_FAILED" })).toBe("FAILED");
  });

  it.each([
    ["CREATED", "APPROVED"],
    ["WRITING", "REVIEW_PASS"],
    ["AWAITING_APPROVAL", "ASSETS_READY"],
    ["CANCELLED", "APPROVED"],
    ["PUBLISHED", "PUBLISH_SUCCEEDED"],
    ["RESEARCHING", "DRAFT_DONE"],
  ] as [WorkflowStatus, Parameters<typeof nextStatus>[1]["type"]][])(
    "rejects illegal transition %s + %s",
    (from, eventType) => {
      const event = (
        eventType === "REVIEW_FAIL" ? { type: eventType, revisionCount: 0 } : { type: eventType }
      ) as Parameters<typeof nextStatus>[1];
      expect(() => nextStatus(from, event)).toThrow(IllegalTransitionError);
    },
  );

  it("treats terminal states as absorbing", () => {
    for (const t of ["PUBLISHED", "FAILED", "REQUIRES_HUMAN_INTERVENTION", "CANCELLED"] as WorkflowStatus[]) {
      expect(isTerminal(t)).toBe(true);
    }
    expect(isTerminal("AWAITING_APPROVAL")).toBe(false);
  });
});
