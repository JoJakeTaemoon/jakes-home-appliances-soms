"use client";

/**
 * Visit map placeholder (UC-VS C.5 deferred from Phase 4).
 *
 * Real geocoded map (Leaflet + OpenStreetMap, or Mapbox) is Phase 8+ work.
 * For v1 we render an SVG bubble map of visit counts per region for the
 * next 7 days, sized by count, anchored to a hand-picked coord per known
 * region. Unknown regions fall through to a list below the SVG.
 */

import { useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";

interface MapResp {
  total: number;
  windowStart: string;
  windowEnd: string;
  regions: Array<{ region: string; count: number }>;
}

// Approximate (x, y) anchor points within a 600×400 SVG canvas, picked to
// resemble a Vietnam silhouette — north (Hà Nội cluster) top, central
// (Đà Nẵng) middle, south (HCMC) bottom. Anything not in this map shows
// in the unmapped list.
const REGION_ANCHORS: Record<string, [number, number]> = {
  "Hà Nội": [320, 50],
  Hanoi: [320, 50],
  "Hải Phòng": [380, 70],
  "Đà Nẵng": [420, 200],
  "DaNang": [420, 200],
  "Quảng Nam": [430, 220],
  "Khánh Hòa": [430, 290],
  "HCMC": [350, 360],
  "Hồ Chí Minh": [350, 360],
  "TP. Hồ Chí Minh": [350, 360],
  "HCMC-D1": [355, 360],
  "HCMC-D7": [365, 365],
  "HCMC-D3": [350, 355],
  "Bình Dương": [340, 340],
  "Cần Thơ": [310, 380],
  "Long An": [320, 365],
};

export default function VisitMapPage() {
  const t = useTranslations("visitMap");
  const query = useApiQuery<MapResp>(`/api/visits/map`);
  const data = query.data ?? null;
  const loading = query.isLoading;

  const mapped: Array<{ region: string; count: number; x: number; y: number }> = [];
  const unmapped: Array<{ region: string; count: number }> = [];
  for (const r of data?.regions ?? []) {
    const anchor = REGION_ANCHORS[r.region];
    if (anchor) {
      mapped.push({ ...r, x: anchor[0], y: anchor[1] });
    } else {
      unmapped.push(r);
    }
  }
  const maxCount = Math.max(1, ...mapped.map((m) => m.count));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#525252]">{t("comingSoon")}</p>
      </header>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        {loading && <p className="text-sm text-[#737373]">Loading…</p>}
        {!loading && (
          <>
            <div className="overflow-x-auto">
              <svg
                viewBox="0 0 600 400"
                width="100%"
                height="400"
                role="img"
                aria-label={t("title")}
              >
                {/* Stylized Vietnam outline — a single curved spine */}
                <path
                  d="M310 30 Q360 80 380 150 Q420 200 420 250 Q380 320 340 380 Q310 400 280 380"
                  fill="none"
                  stroke="#cce0ed"
                  strokeWidth="40"
                  strokeLinecap="round"
                />
                {/* Region bubbles */}
                {mapped.map((m) => {
                  const r = 10 + (m.count / maxCount) * 30;
                  return (
                    <g key={m.region}>
                      <circle
                        cx={m.x}
                        cy={m.y}
                        r={r}
                        fill="rgba(0, 113, 189, 0.6)"
                        stroke="#0071BD"
                        strokeWidth="1.5"
                      />
                      <text
                        x={m.x}
                        y={m.y + 4}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill="#ffffff"
                      >
                        {m.count}
                      </text>
                      <text
                        x={m.x}
                        y={m.y + r + 14}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#525252"
                      >
                        {m.region}
                      </text>
                    </g>
                  );
                })}
                {mapped.length === 0 && (
                  <text
                    x="300"
                    y="200"
                    textAnchor="middle"
                    fontSize="14"
                    fill="#a3a3a3"
                  >
                    {t("comingSoon")}
                  </text>
                )}
              </svg>
            </div>
            {unmapped.length > 0 && (
              <div className="mt-3">
                <h2 className="text-sm font-semibold text-[#002A4D]">
                  {t("regionLabel")}
                </h2>
                <ul className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {unmapped.map((u) => (
                    <li
                      key={u.region}
                      className="rounded-md border border-[#e5e5e5] bg-white px-2 py-1 text-sm"
                    >
                      <span className="text-[#525252]">{u.region}</span>{" "}
                      <span className="float-right tabular-nums text-[#737373]">
                        {u.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
