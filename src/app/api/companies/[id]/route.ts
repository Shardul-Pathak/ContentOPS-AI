import { NextRequest, NextResponse } from "next/server";
import { getCompany, updateCompany } from "@/services/companies";
import { handleServiceError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const company = await getCompany(id);
    return NextResponse.json(company);
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
    const company = await updateCompany(id, body);
    return NextResponse.json(company);
  } catch (err) {
    return handleServiceError(err);
  }
}
