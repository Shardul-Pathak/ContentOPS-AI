import { NextRequest, NextResponse } from "next/server";
import { startWorkflow } from "@/services/workflow/orchestrator";
import { handleServiceError } from "@/lib/api";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// Start a content workflow for this campaign.
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { topic?: string } | null;
    const topic = body?.topic?.trim();
    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }
    const contentId = await startWorkflow(id, topic);
    return NextResponse.json({ id: contentId }, { status: 202 });
  } catch (err) {
    return handleServiceError(err);
  }
}

// List workflow runs (contents) for this campaign.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const contents = await prisma.content.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      include: { agentRuns: { orderBy: { startedAt: "asc" } } },
    });
    return NextResponse.json(contents);
  } catch (err) {
    return handleServiceError(err);
  }
}
