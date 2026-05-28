/**
 * Recommend candidate technicians for a Visit (UC-VS-01).
 *
 * Algorithm (CLAUDE.md C.1 + C.2):
 *   1. If `Customer.preferredTechnicianId` is set AND that tech is available
 *      on the target slot → put them first with rationale "preferred".
 *   2. Take TECHNICIAN-role users where `User.preferredRegion` matches the
 *      Site's region (B2B) or the Customer's `preferredRegion` (B2C);
 *      rank ascending by today's lead-visit load.
 *   3. Fill any remaining slots with any other ACTIVE technicians sorted by
 *      today's load (least-busy first), with rationale "available".
 *
 * Returns up to `maxResults` candidates. Each entry includes the score so the
 * UI can render a deterministic ordering (ties broken by name).
 */

import prisma from "@/lib/prisma";
import {
  getLoadMap,
  isAvailable as isAvailableQuery,
} from "@/lib/scheduler/availability";
import {
  pickRationale,
  scoreCandidate,
  type Rationale,
} from "@/lib/scheduler/scoring";
import { getSchedulerWeights } from "@/lib/settings";

export interface RecommendInput {
  customerId: string;
  siteId?: string | null;
  scheduledFor: Date;
  maxResults?: number;
}

export interface RecommendedTechnician {
  technicianId: string;
  name: string;
  username: string;
  phone: string | null;
  preferredRegion: string | null;
  score: number;
  rationale: Rationale;
  isPreferred: boolean;
  regionMatch: boolean;
  visitsOnDate: number;
}

const DEFAULT_LIMIT = 3;

interface TechRow {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  preferredRegion: string | null;
}

export async function recommendTechnicians(
  input: RecommendInput,
): Promise<RecommendedTechnician[]> {
  const limit = input.maxResults ?? DEFAULT_LIMIT;
  if (limit <= 0) return [];

  const [customer, site] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        preferredTechnicianId: true,
        preferredRegion: true,
      },
    }),
    input.siteId
      ? prisma.site.findUnique({
          where: { id: input.siteId },
          select: { id: true, region: true, customerId: true },
        })
      : Promise.resolve(null),
  ]);
  if (!customer) return [];

  // Resolve the region used for matching: site region beats customer region.
  const targetRegion = site?.region ?? customer.preferredRegion ?? null;

  // Load all active technicians once. Population is small (≤80 per CLAUDE.md
  // total org headcount) so an in-memory pass is fine and avoids juggling SQL
  // ordering with complex conditional weights.
  const techs = await prisma.user.findMany({
    where: { role: "TECHNICIAN", status: "ACTIVE" },
    select: {
      id: true,
      username: true,
      phone: true,
      email: true,
      preferredRegion: true,
    },
  });
  if (techs.length === 0) return [];

  const techIds = techs.map((t) => t.id);
  const loadMap = await getLoadMap(techIds, input.scheduledFor);
  const weights = await getSchedulerWeights();

  // Find the preferred tech (must be in the active list AND available)
  let preferredId: string | null = null;
  if (customer.preferredTechnicianId) {
    const preferred = techs.find((t) => t.id === customer.preferredTechnicianId);
    if (preferred) {
      const available = await isAvailableQuery(
        preferred.id,
        input.scheduledFor,
      );
      if (available) preferredId = preferred.id;
    }
  }

  // Build candidate list with scores.
  const candidates: RecommendedTechnician[] = techs.map((tech: TechRow) => {
    const isPreferred = tech.id === preferredId;
    const regionMatch =
      !!targetRegion &&
      !!tech.preferredRegion &&
      tech.preferredRegion === targetRegion;
    const visitsOnDate = loadMap.get(tech.id) ?? 0;
    const score = scoreCandidate(
      { isPreferred, regionMatch, visitsOnDate },
      {
        preferred: weights.preferred,
        regionMatch: weights.regionMatch,
        loadPenaltyPerVisit:
          weights.loadPenaltyPerVisit <= 0
            ? weights.loadPenaltyPerVisit
            : -weights.loadPenaltyPerVisit,
      },
    );
    const rationale = pickRationale({ isPreferred, regionMatch, visitsOnDate });
    return {
      technicianId: tech.id,
      name: tech.username, // Phase 4: User has no display name field — fall back to username
      username: tech.username,
      phone: tech.phone ?? null,
      preferredRegion: tech.preferredRegion ?? null,
      score,
      rationale,
      isPreferred,
      regionMatch,
      visitsOnDate,
    };
  });

  // Sort: score desc, then load asc, then username asc for deterministic ties.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.visitsOnDate !== b.visitsOnDate) return a.visitsOnDate - b.visitsOnDate;
    return a.username.localeCompare(b.username);
  });

  return candidates.slice(0, limit);
}
