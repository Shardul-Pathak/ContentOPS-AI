import { NextRequest, NextResponse } from "next/server";
import { getCampaign, updateCampaign } from "@/services/campaigns";
import { handleServiceError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);
    return NextResponse.json(campaign);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (body == null) {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }
    const campaign = await updateCampaign(id, body);
    return NextResponse.json(campaign);
  } catch (err) {
    return handleServiceError(err);
  }
}
