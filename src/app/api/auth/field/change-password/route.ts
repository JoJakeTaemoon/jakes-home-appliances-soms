/** POST /api/auth/field/change-password — technicians change their own password. */

import type { NextRequest } from "next/server";
import { fieldRealm } from "@/lib/auth/realms/field-realm";
import { changeOwnPassword } from "@/lib/auth/change-password";

export function POST(request: NextRequest) {
  return changeOwnPassword(fieldRealm, request);
}
