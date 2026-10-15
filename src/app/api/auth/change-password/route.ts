/** POST /api/auth/change-password — office staff change their own password. */

import type { NextRequest } from "next/server";
import { staffRealm } from "@/lib/auth/realms/staff-realm";
import { changeOwnPassword } from "@/lib/auth/change-password";

export function POST(request: NextRequest) {
  return changeOwnPassword(staffRealm, request);
}
