import { NextRequest, NextResponse } from "next/server";
import { listCampaigns } from "@/services/campaigns";
import { handleServiceError } from "@/lib/api";

export async function GET(_request: NextRequest) {
  try {
    const campaigns = await listCampaigns();
    return NextResponse.json(campaigns);
  } catch (err) {
    return handleServiceError(err);
  }
}
