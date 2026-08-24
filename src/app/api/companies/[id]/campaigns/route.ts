import { NextRequest, NextResponse } from "next/server";
import { createCampaign, listCampaigns } from "@/services/campaigns";
import { handleServiceError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (body == null) {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }
    const campaign = await createCampaign(id, body);
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const campaigns = await listCampaigns(id);
    return NextResponse.json(campaigns);
  } catch (err) {
    return handleServiceError(err);
  }
}
