import { NextRequest } from "next/server";
import { getApiSecret } from "@/lib/auth/config";

export function verifyApiAuth(request: NextRequest): boolean {
  const secret = getApiSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
