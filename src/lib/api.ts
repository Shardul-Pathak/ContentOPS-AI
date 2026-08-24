import { NextResponse } from "next/server";
import { NotFoundError, ValidationError } from "@/services/companies";

type ApiErrorBody = {
  error: string;
  issues?: { path: string; message: string }[];
};

export function validationErrorResponse(error: ValidationError) {
  const body: ApiErrorBody = {
    error: error.message,
    issues: error.issues.map((i) => ({
      path: i.path.join(".") || "(root)",
      message: i.message,
    })),
  };
  return NextResponse.json(body, { status: 400 });
}

export function notFoundResponse(error: NotFoundError) {
  return NextResponse.json({ error: error.message }, { status: 404 });
}

export function unexpectedResponse(err: unknown) {
  console.error("[api] unexpected error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function handleServiceError(err: unknown) {
  if (err instanceof ValidationError) return validationErrorResponse(err);
  if (err instanceof NotFoundError) return notFoundResponse(err);
  return unexpectedResponse(err);
}
