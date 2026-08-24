import { NextRequest, NextResponse } from "next/server";
import { createCompany, listCompanies } from "@/services/companies";
import { handleServiceError } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (body == null) {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }
    const company = await createCompany(body);
    return NextResponse.json(company, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function GET() {
  try {
    const companies = await listCompanies();
    return NextResponse.json(companies);
  } catch (err) {
    return handleServiceError(err);
  }
}
