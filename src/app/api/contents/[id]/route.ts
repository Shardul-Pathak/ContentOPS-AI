import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleServiceError, notFoundResponse } from "@/lib/api";
import { NotFoundError } from "@/services/companies";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const content = await prisma.content.findUnique({
      where: { id },
      include: {
        agentRuns: { orderBy: { startedAt: "asc" } },
        campaign: true,
        assetRows: true,
        approvals: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!content) throw new NotFoundError("Content not found");

    const { assetRows, ...rest } = content;
    return NextResponse.json({ ...rest, assets: assetRows });
  } catch (err) {
    return handleServiceError(err);
  }
}
