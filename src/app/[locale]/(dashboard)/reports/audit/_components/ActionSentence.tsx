"use client";

/**
 * Renders a one-line natural-language description of an audit row.
 *
 *   "홍길동(관리자)이 김철수(고객) 정보를 수정했습니다."
 *   "admin (Admin) updated김철수 (Customer)."
 *   "admin (Quản lý) đã cập nhật khách hàng김철수."
 *
 * The Korean entry uses verb strings shaped like "을(를) 수정했습니다", so
 * the rendered sentence is technically `"actor이 entity을 수정했습니다"`.
 * That's intentional v1 — proper jongseong handling is in plan §"비범위" v2.
 */

import { useTranslations } from "next-intl";
import { useAuditRowFormatter } from "@/lib/audit/use-audit-row-formatter";

interface Props {
  actorName: string | null;
  actorRole: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityDisplay: string | null;
  entityId: string | null;
}

export function ActionSentence({
  actorName,
  actorRole,
  actorType,
  action,
  entityType,
  entityDisplay,
  entityId,
}: Readonly<Props>) {
  const fmt = useAuditRowFormatter();
  const t = useTranslations("reports.audit");
  const tActor = useTranslations("reports.audit.actor");

  const { verb, isUnknown } = fmt.action(action);
  const entityLabel = fmt.entityTypeLabel(entityType);

  // Resolve the actor block.
  let actorBlock = actorName ?? "";
  if (!actorBlock) {
    if (actorType === "SYSTEM") actorBlock = tActor("system");
    else if (actorType === "CUSTOMER") actorBlock = tActor("anonymousCustomer");
    else actorBlock = "—";
  }
  const roleBadge = fmt.roleBadge(actorRole);
  if (roleBadge) {
    actorBlock = `${actorBlock} (${roleBadge})`;
  }

  // Resolve the entity block.
  const entityName = entityDisplay ?? (entityId ? shortenId(entityId) : null);
  const entityBlock = entityName ? `${entityName} (${entityLabel})` : null;

  return (
    <span className="inline-flex items-baseline gap-1">
      {isUnknown && (
        <span
          title={t("unknownActionTooltip")}
          className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
        >
          {fmt.unknownActionMarker}
        </span>
      )}
      <span className="text-sm text-[#171717]">
        {entityBlock
          ? `${actorBlock}${spacer()}${entityBlock}${spacer()}${verb}`
          : `${actorBlock}${spacer()}${verb}`}
      </span>
    </span>
  );
}

function spacer(): string {
  return " ";
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}
