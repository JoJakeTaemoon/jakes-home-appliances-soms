/**
 * GET /uploads/service-requests/{customerId}/{tmpId}/{filename}
 *
 * Serves the photos customers attach to a service request — the exact url
 * `storeSrAttachment` hands back, so stored rows need no migration. Same
 * shape as /uploads/visits/[visitId]/[filename]: Next only serves `public/`,
 * so without this handler the office SR detail and the portal showed broken
 * images.
 *
 * Readable by office staff (staff realm) and by portal contacts of the
 * owning customer (customer realm). Anyone else authenticated gets 404.
 * ponytail: customer-level check — a SITE-scoped contact who knows another
 * site's random tmpId could open its photo; resolve the SR from the
 * attachment if that ever matters.
 */

import { NextRequest, NextResponse } from "next/server";
import fsp from "node:fs/promises";
import path from "node:path";
import { requireAuth } from "@/lib/auth/core/guards";
import { staffRealm } from "@/lib/auth/realms/staff-realm";
import { customerRealm } from "@/lib/auth/realms/customer-realm";
import { NotFoundError, UnauthorizedError } from "@/lib/api/error";
import { toErrorResponse } from "@/lib/api/response";
import { getSrAttachmentDir } from "@/lib/upload/sr-attachment-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ customerId: string; tmpId: string; filename: string }>;
}

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** One path segment: no separators, no leading dot (so no `..` / dotfiles). */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { customerId, tmpId, filename } = await ctx.params;
    const mime = IMAGE_MIME[path.extname(filename).slice(1).toLowerCase()];
    if (!mime || ![customerId, tmpId, filename].every((s) => SAFE_SEGMENT.test(s))) {
      throw new NotFoundError("File not found");
    }

    const [staff, customer] = await Promise.all([
      requireAuth(staffRealm, request).catch(() => null),
      requireAuth(customerRealm, request).catch(() => null),
    ]);
    if (!staff && !customer) throw new UnauthorizedError("Missing access token");

    const allowed =
      (!!staff && staff.role !== "TECHNICIAN") ||
      (!!customer && customer.customerId === customerId);
    if (!allowed) throw new NotFoundError("File not found");

    const dir = getSrAttachmentDir(customerId, tmpId);
    const fullPath = path.resolve(dir, filename);
    if (path.dirname(fullPath) !== dir) throw new NotFoundError("File not found");
    const buf = await fsp.readFile(fullPath).catch(() => null);
    if (!buf) throw new NotFoundError("File not found");

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
