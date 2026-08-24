import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  publishPayloadSchema,
  publishResultSchema,
  type PublishResult,
} from "@/contracts/artifacts";
import type { Prisma } from "@prisma/client";
import { parseLooseJson } from "@/lib/json-extract";
import { nextStatus, type WorkflowStatus } from "@/domain/state-machine";
import { NotFoundError } from "@/services/companies";
import { getAgentRuntime } from "@/services/workflow/orchestrator";
import type { AgentRuntime } from "@/lib/agent-runtime";

// Human approval gate (AGENTS.md sections 4.4/17). The decision is a control
// boundary outside model discretion: execution happens only through this
// service, which requires a PENDING approval row on a content item that is
// currently AWAITING_APPROVAL.

export class ApprovalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalConflictError";
  }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });

export async function decideApproval(
  contentId: string,
  decision: "approve" | "reject",
  runtimeOverride?: AgentRuntime,
): Promise<{ status: string; publishedUrl?: string | null }> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new NotFoundError("Content not found");

  if (content.status !== "AWAITING_APPROVAL") {
    throw new ApprovalConflictError(
      `Content is ${content.status}; approvals can only be decided while AWAITING_APPROVAL`,
    );
  }

  const approval = await prisma.approval.findFirst({
    where: { contentId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!approval) {
    throw new ApprovalConflictError("No pending approval for this content");
  }

  // Idempotency guard: mark decided first so a concurrent duplicate decision
  // loses the race and hits the no-pending-approval path.
  const claimed = await prisma.approval.updateMany({
    where: { id: approval.id, status: "PENDING" },
    data: { status: decision === "approve" ? "APPROVED" : "REJECTED", decidedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApprovalConflictError("Approval was already decided");
  }

  if (decision === "reject") {
    await prisma.content.update({
      where: { id: contentId },
      data: { status: nextStatus(content.status as WorkflowStatus, { type: "REJECTED" }), currentAgent: null },
    });
    return { status: "CANCELLED" };
  }

  // --- APPROVED: resume the exact paused tool call --------------------------
  await prisma.content.update({
    where: { id: contentId },
    data: { status: nextStatus(content.status as WorkflowStatus, { type: "APPROVED" }), currentAgent: "publisher" },
  });

  if (!approval.tfSessionId || !approval.toolCallId) {
    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: nextStatus("PUBLISHING", { type: "PUBLISH_FAILED" }),
        failureReason: "Approval row lacks TrueForge pause references — cannot resume safely",
        currentAgent: null,
      },
    });
    throw new ApprovalConflictError("Approval row has no paused session reference");
  }

  const payload = publishPayloadSchema.parse(approval.payloadSummary);

  try {
    const runtime = runtimeOverride ?? getAgentRuntime();
    const result = await runtime.resumeAfterApproval(approval.tfSessionId, [
      {
        threadId: approval.threadId ?? "main",
        toolCallId: approval.toolCallId,
        allow: true,
      },
    ]);

    let parsed: PublishResult | null = null;
    if (result.status === "done" && result.outputText) {
      const json = parseLooseJson(result.outputText);
      if (json != null) {
        const candidate = publishResultSchema.safeParse(json);
        parsed = candidate.success ? candidate.data : null;
      }
    }
    if (!parsed) {
      throw new Error(`publishing agent did not return a valid result: ${result.errorMessage ?? "unparseable"}`);
    }

    await prisma.agentRun.updateMany({
      where: { contentId, agentRole: "publisher", status: "RUNNING" },
      data: {
        status: "DONE",
        output: asJson(parsed),
        activity: asJson(result.activity),
        finishedAt: new Date(),
      },
    });
    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: nextStatus("PUBLISHING", { type: "PUBLISH_SUCCEEDED" }),
        publishedUrl: parsed.publishedUrl,
        currentAgent: null,
      },
    });
    return { status: "PUBLISHED", publishedUrl: parsed.publishedUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.updateMany({
      where: { contentId, agentRole: "publisher", status: "RUNNING" },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: nextStatus("PUBLISHING", { type: "PUBLISH_FAILED" }),
        failureReason: `Publishing failed: ${message}`,
        currentAgent: null,
      },
    });
    throw err;
  }
}
