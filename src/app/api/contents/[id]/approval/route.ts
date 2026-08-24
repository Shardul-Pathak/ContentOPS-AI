import { NextRequest, NextResponse } from "next/server";
import { decideApproval, decisionSchema } from "@/services/workflow/approval";
import { handleServiceError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
    }
    const result = await decideApproval(id, parsed.data.decision);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
