"use client";

import { useParams } from "next/navigation";
import { VisitDetailContent } from "@/components/visits/visit-detail-content";

/**
 * Thin route wrapper. The page body lives in `VisitDetailContent` so
 * the calendar drawer (in `visits-calendar-view`) can reuse it inline.
 */
export default function VisitDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  return <VisitDetailContent visitId={id} />;
}
