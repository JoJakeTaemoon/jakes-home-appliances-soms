/**
 * GET /uploads/visits/{visitId}/{filename}
 *
 * Serves the photos + signature shots `storeVisitPhoto` writes under
 * ./uploads/visits — the exact url it hands back, so stored rows need no
 * migration. Next only serves `public/`, and production Caddy just proxies,
 * so without this handler every stored photo was a broken image.
 *
 * Auth: every realm's access cookie is Path=/, so a plain `<img>` request
 * carries whichever ones the browser holds (the Authorization header also
 * works for fetch callers). Middleware skips dot-containing paths, so this
 * handler authenticates on its own. Readable by:
 *   - office staff (staff realm),
 *   - a technician on the visit (field realm, lead or collaborator),
 *   - a portal contact of the visit's customer (customer realm; SITE-scoped
 *     contacts only for their own site, same rule as /api/portal/visits/[id]).
 * Anyone else authenticated gets 404, matching the mobile API's opacity.
 *
 * Only image extensions are served — the same folder also holds the visit's
 * rendered PDFs, which have their own authorised download routes.
 */

import { NextRequest, NextResponse } from "next/server";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/core/guards";
import { staffRealm } from "@/lib/auth/realms/staff-realm";
import { fieldRealm } from "@/lib/auth/realms/field-realm";
import { customerRealm } from "@/lib/auth/realms/customer-realm";
import { NotFoundError, UnauthorizedError } from "@/lib/api/error";
import { toErrorResponse } from "@/lib/api/response";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { getVisitUploadDir } from "@/lib/upload/photo-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ visitId: string; filename: string }>;
}

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** One path segment: no separators, no leading dot (so no `..` / dotfiles). */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function orNull<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null);
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { visitId, filename } = await ctx.params;
    const mime = IMAGE_MIME[path.extname(filename).slice(1).toLowerCase()];
    if (!mime || !SAFE_SEGMENT.test(visitId) || !SAFE_SEGMENT.test(filename)) {
      throw new NotFoundError("File not found");
    }

    const [staff, tech, customer] = await Promise.all([
      orNull(requireAuth(staffRealm, request)),
      orNull(requireAuth(fieldRealm, request)),
      orNull(requireAuth(customerRealm, request)),
    ]);
    if (!staff && !tech && !customer) {
      throw new UnauthorizedError("Missing access token");
    }

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        customerId: true,
        siteId: true,
        leadTechnicianId: true,
        collaboratorTechnicianIds: true,
      },
    });
    const allowed =
      !!visit &&
      ((!!staff && VisitWorkflow.access.canView(staff, visit)) ||
        (!!tech && VisitWorkflow.access.canTechnicianView(tech, visit)) ||
        (!!customer &&
          customer.customerId === visit.customerId &&
          !(customer.scope === "SITE" && customer.siteId && visit.siteId !== customer.siteId)));
    if (!allowed) throw new NotFoundError("File not found");

    const dir = getVisitUploadDir(visitId);
    const fullPath = path.resolve(dir, filename);
    if (path.dirname(fullPath) !== dir) throw new NotFoundError("File not found");
    const buf = await fsp.readFile(fullPath).catch(() => null);
    if (!buf) throw new NotFoundError("File not found");

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.byteLength),
        // Filenames are timestamped and never rewritten, so a private cache
        // is safe; never let a shared proxy keep a customer's photo.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
