/**
 * Action-code catalog + automatic fallback.
 *
 * `getActionLabel(action, locale)` returns a `{ verb, entityHint?, isUnknown }`
 * tuple. Known codes (~80) get a curated verb in ko/en/vi; unknown codes
 * derive a verb from the last token (CREATE/UPDATE/DELETE/COMPLETE/...) and
 * an entity hint from the prefix. Unknown rows render with an `(미등록)`
 * marker so admins can spot follow-up work.
 *
 * Adding a new code: just append a row below. v1 catalog is intentionally
 * flat — no inheritance, no codegen.
 */

export type AuditLocale = "ko" | "en" | "vi";

export interface ActionLabel {
  verb: string;
  /** Best-effort entity name derived from the action prefix. Optional. */
  entityHint?: string;
  /** True when the code wasn't in the catalog and we fell back. */
  isUnknown: boolean;
}

interface CatalogEntry {
  ko: string;
  en: string;
  vi: string;
  /** Optional hint for the rendering layer (e.g. "Customer"). */
  entityHint?: string;
}

/** Curated catalog — ~80 codes from `grep -rh logAudit`. */
const ACTION_LABELS: Record<string, CatalogEntry> = {
  // ── Auth (no entity) ────────────────────────────────────────────
  LOGIN_SUCCESS: { ko: "로그인했습니다", en: "logged in", vi: "đã đăng nhập" },
  LOGIN_FAILED: {
    ko: "로그인에 실패했습니다",
    en: "failed to log in",
    vi: "đăng nhập thất bại",
  },
  LOGOUT: { ko: "로그아웃했습니다", en: "logged out", vi: "đã đăng xuất" },
  PASSWORD_RESET_REQUEST: {
    ko: "비밀번호 재설정을 요청했습니다",
    en: "requested a password reset",
    vi: "yêu cầu đặt lại mật khẩu",
  },
  PASSWORD_RESET_COMPLETE: {
    ko: "비밀번호를 재설정했습니다",
    en: "completed password reset",
    vi: "đã đặt lại mật khẩu",
  },
  PASSWORD_RESET_VERIFY_FAILED: {
    ko: "비밀번호 재설정 인증에 실패했습니다",
    en: "failed password reset verification",
    vi: "xác thực đặt lại mật khẩu thất bại",
  },

  // ── Customer ────────────────────────────────────────────────────
  CUSTOMER_CREATE: {
    ko: "을(를) 등록했습니다",
    en: "registered",
    vi: "đã đăng ký",
    entityHint: "Customer",
  },
  CUSTOMER_UPDATE: {
    ko: "정보를 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Customer",
  },
  CUSTOMER_DEACTIVATE: {
    ko: "을(를) 비활성화했습니다",
    en: "deactivated",
    vi: "đã ngừng hoạt động",
    entityHint: "Customer",
  },
  CUSTOMER_REACTIVATE: {
    ko: "을(를) 재활성화했습니다",
    en: "reactivated",
    vi: "đã kích hoạt lại",
    entityHint: "Customer",
  },
  CUSTOMER_MERGE: {
    ko: "을(를) 병합했습니다",
    en: "merged",
    vi: "đã hợp nhất",
    entityHint: "Customer",
  },
  CUSTOMER_CONTACT_DISABLE: {
    ko: "연락처를 비활성화했습니다",
    en: "disabled a contact",
    vi: "đã vô hiệu hoá liên hệ",
    entityHint: "CustomerContact",
  },

  // ── Site ────────────────────────────────────────────────────────
  SITE_UPDATE: {
    ko: "정보를 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Site",
  },
  SITE_DEACTIVATE: {
    ko: "을(를) 비활성화했습니다",
    en: "deactivated",
    vi: "đã ngừng hoạt động",
    entityHint: "Site",
  },

  // ── Contract ────────────────────────────────────────────────────
  CONTRACT_CREATE: {
    ko: "을(를) 생성했습니다",
    en: "created",
    vi: "đã tạo",
    entityHint: "Contract",
  },
  CONTRACT_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Contract",
  },
  CONTRACT_AMEND: {
    ko: "에 부록을 발행했습니다",
    en: "issued an appendix to",
    vi: "đã phát hành phụ lục cho",
    entityHint: "Contract",
  },
  CONTRACT_EMAILED: {
    ko: "을(를) 이메일로 발송했습니다",
    en: "emailed",
    vi: "đã gửi email",
    entityHint: "Contract",
  },
  CONTRACT_PDF_REGENERATED: {
    ko: " PDF를 재생성했습니다",
    en: "regenerated the PDF for",
    vi: "đã tạo lại PDF của",
    entityHint: "Contract",
  },
  CONTRACT_RENEW_PREPARED: {
    ko: " 갱신을 준비했습니다",
    en: "prepared renewal for",
    vi: "đã chuẩn bị gia hạn cho",
    entityHint: "Contract",
  },

  // ── Visit ──────────────────────────────────────────────────────
  VISIT_CREATE: {
    ko: "을(를) 생성했습니다",
    en: "created",
    vi: "đã tạo",
    entityHint: "Visit",
  },
  VISIT_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Visit",
  },
  VISIT_SCHEDULE: {
    ko: " 일정을 잡았습니다",
    en: "scheduled",
    vi: "đã lên lịch",
    entityHint: "Visit",
  },
  VISIT_RESCHEDULE: {
    ko: " 일정을 변경했습니다",
    en: "rescheduled",
    vi: "đã đổi lịch",
    entityHint: "Visit",
  },
  VISIT_REASSIGN: {
    ko: " 담당자를 변경했습니다",
    en: "reassigned",
    vi: "đã đổi người phụ trách",
    entityHint: "Visit",
  },
  VISIT_START: {
    ko: "을(를) 시작했습니다",
    en: "started",
    vi: "đã bắt đầu",
    entityHint: "Visit",
  },
  VISIT_COMPLETE: {
    ko: "을(를) 완료했습니다",
    en: "completed",
    vi: "đã hoàn tất",
    entityHint: "Visit",
  },
  VISIT_FAIL: {
    ko: "을(를) 실패 처리했습니다",
    en: "marked as failed",
    vi: "đánh dấu thất bại",
    entityHint: "Visit",
  },
  VISIT_CANCEL: {
    ko: "을(를) 취소했습니다",
    en: "cancelled",
    vi: "đã huỷ",
    entityHint: "Visit",
  },
  VISIT_NOTE_ADD: {
    ko: "에 메모를 추가했습니다",
    en: "added a note to",
    vi: "thêm ghi chú cho",
    entityHint: "Visit",
  },
  VISIT_OFFICE_NOTE_ADD: {
    ko: "에 사무실 메모를 추가했습니다",
    en: "added an office note to",
    vi: "thêm ghi chú văn phòng cho",
    entityHint: "Visit",
  },

  // ── Service Request ────────────────────────────────────────────
  SR_CREATE: {
    ko: "을(를) 접수했습니다",
    en: "submitted",
    vi: "đã gửi",
    entityHint: "ServiceRequest",
  },
  SR_APPROVE: {
    ko: "을(를) 승인했습니다",
    en: "approved",
    vi: "đã duyệt",
    entityHint: "ServiceRequest",
  },
  SR_REJECT: {
    ko: "을(를) 거절했습니다",
    en: "rejected",
    vi: "đã từ chối",
    entityHint: "ServiceRequest",
  },
  SR_CANCEL: {
    ko: "을(를) 취소했습니다",
    en: "cancelled",
    vi: "đã huỷ",
    entityHint: "ServiceRequest",
  },
  SR_ESCALATE: {
    ko: "을(를) 에스컬레이션했습니다",
    en: "escalated",
    vi: "đã chuyển cấp",
    entityHint: "ServiceRequest",
  },
  SR_MESSAGE: {
    ko: "에 메시지를 추가했습니다",
    en: "posted a message on",
    vi: "đã nhắn tin cho",
    entityHint: "ServiceRequest",
  },

  // ── Payment ────────────────────────────────────────────────────
  PAYMENT_CREATE: {
    ko: "을(를) 기록했습니다",
    en: "recorded",
    vi: "đã ghi nhận",
    entityHint: "Payment",
  },
  PAYMENT_COLLECT_CASH: {
    ko: " 현금을 수금했습니다",
    en: "collected cash for",
    vi: "đã thu tiền mặt cho",
    entityHint: "Payment",
  },
  PAYMENT_BANK_TRANSFER: {
    ko: " 이체 수금을 처리했습니다",
    en: "recorded a bank transfer for",
    vi: "đã ghi nhận chuyển khoản cho",
    entityHint: "Payment",
  },
  PAYMENT_PARTIAL: {
    ko: " 부분 수금을 처리했습니다",
    en: "recorded a partial payment for",
    vi: "đã ghi nhận thu một phần cho",
    entityHint: "Payment",
  },
  PAYMENT_HAND_OVER: {
    ko: "을(를) 사무실에 인계했습니다",
    en: "handed over to office",
    vi: "đã bàn giao cho văn phòng",
    entityHint: "Payment",
  },
  PAYMENT_HANDOVER_SLA_BREACH: {
    ko: "의 인계 SLA를 어겼습니다",
    en: "breached the hand-over SLA on",
    vi: "vi phạm SLA bàn giao",
    entityHint: "Payment",
  },
  PAYMENT_RECONCILE: {
    ko: "을(를) 정산했습니다",
    en: "reconciled",
    vi: "đã đối soát",
    entityHint: "Payment",
  },
  PAYMENT_WRITE_OFF: {
    ko: "을(를) 손실처리했습니다",
    en: "wrote off",
    vi: "đã ghi giảm",
    entityHint: "Payment",
  },
  PAYMENT_OVERDUE: {
    ko: "을(를) 연체로 표시했습니다",
    en: "marked as overdue",
    vi: "đánh dấu quá hạn",
    entityHint: "Payment",
  },

  // ── Tax invoice ────────────────────────────────────────────────
  TAX_INVOICE_REISSUE: {
    ko: "을(를) 재발행했습니다",
    en: "reissued",
    vi: "đã phát hành lại",
    entityHint: "TaxInvoice",
  },

  // ── User ───────────────────────────────────────────────────────
  USER_CREATE: {
    ko: "을(를) 생성했습니다",
    en: "created",
    vi: "đã tạo",
    entityHint: "User",
  },
  USER_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "User",
  },
  USER_DISABLE: {
    ko: "을(를) 비활성화했습니다",
    en: "disabled",
    vi: "đã vô hiệu hoá",
    entityHint: "User",
  },
  USER_PHONE_UPDATE: {
    ko: " 전화번호를 변경했습니다",
    en: "updated phone for",
    vi: "đã cập nhật số điện thoại của",
    entityHint: "User",
  },

  // ── Equipment ─────────────────────────────────────────────────
  EQUIPMENT_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Equipment",
  },
  EQUIPMENT_MOVE_SITE: {
    ko: "의 사이트를 이동했습니다",
    en: "moved to a new site",
    vi: "đã chuyển sang địa điểm mới",
    entityHint: "Equipment",
  },
  EQUIPMENT_REPLACE: {
    ko: "을(를) 교체했습니다",
    en: "replaced",
    vi: "đã thay thế",
    entityHint: "Equipment",
  },
  EQUIPMENT_MODEL_UPDATE: {
    ko: " 모델을 수정했습니다",
    en: "updated the model",
    vi: "đã cập nhật mẫu",
    entityHint: "EquipmentModel",
  },

  // ── Catalog (product / brand / consumable / accessory / charge) ─
  BRAND_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Brand",
  },
  BRAND_DEACTIVATE: {
    ko: "을(를) 비활성화했습니다",
    en: "deactivated",
    vi: "đã ngừng",
    entityHint: "Brand",
  },
  PRODUCT_CATEGORY_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "ProductCategory",
  },
  PRODUCT_CATEGORY_DEACTIVATE: {
    ko: "을(를) 비활성화했습니다",
    en: "deactivated",
    vi: "đã ngừng",
    entityHint: "ProductCategory",
  },
  CONSUMABLE_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Consumable",
  },
  CONSUMABLE_DEACTIVATE: {
    ko: "을(를) 비활성화했습니다",
    en: "deactivated",
    vi: "đã ngừng",
    entityHint: "Consumable",
  },
  ACCESSORY_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "Accessory",
  },
  ACCESSORY_DEACTIVATE: {
    ko: "을(를) 비활성화했습니다",
    en: "deactivated",
    vi: "đã ngừng",
    entityHint: "Accessory",
  },
  CHARGE_POLICY_UPDATE: {
    ko: "을(를) 수정했습니다",
    en: "updated",
    vi: "đã cập nhật",
    entityHint: "ChargePolicy",
  },
  CHARGE_POLICY_DELETE: {
    ko: "을(를) 삭제했습니다",
    en: "deleted",
    vi: "đã xoá",
    entityHint: "ChargePolicy",
  },

  // ── Company info ─────────────────────────────────────────────
  COMPANY_HQ_PHONE_UPDATE: {
    ko: " 본사 전화번호를 수정했습니다",
    en: "updated the HQ phone",
    vi: "đã cập nhật số điện thoại trụ sở",
  },
  COMPANY_TAX_INFO_UPDATE: {
    ko: " 세무 정보를 수정했습니다",
    en: "updated tax info",
    vi: "đã cập nhật thông tin thuế",
  },

  // ── Notification templates ───────────────────────────────────
  NOTIFICATION_TEMPLATE_UPSERT: {
    ko: " 서식을 수정했습니다",
    en: "saved a template",
    vi: "đã lưu mẫu",
    entityHint: "NotificationTemplate",
  },
  NOTIFICATION_TEMPLATE_DELETE: {
    ko: " 서식을 삭제했습니다",
    en: "deleted a template",
    vi: "đã xoá mẫu",
    entityHint: "NotificationTemplate",
  },

  // ── Portal accounts ──────────────────────────────────────────
  PORTAL_ENABLED: {
    ko: " 포털을 활성화했습니다",
    en: "enabled the portal",
    vi: "đã bật cổng",
  },
  PORTAL_LOGIN_SUCCESS: {
    ko: "포털에 로그인했습니다",
    en: "logged in to the portal",
    vi: "đã đăng nhập cổng",
  },
  PORTAL_LOGIN_FAILED: {
    ko: "포털 로그인에 실패했습니다",
    en: "failed portal login",
    vi: "đăng nhập cổng thất bại",
  },
  PORTAL_LOGOUT: {
    ko: "포털에서 로그아웃했습니다",
    en: "logged out of the portal",
    vi: "đã đăng xuất cổng",
  },
  PORTAL_PASSWORD_CHANGED: {
    ko: " 포털 비밀번호를 변경했습니다",
    en: "changed the portal password",
    vi: "đã đổi mật khẩu cổng",
  },
  PORTAL_PASSWORD_CHANGE_FAILED: {
    ko: " 포털 비밀번호 변경에 실패했습니다",
    en: "failed to change portal password",
    vi: "đổi mật khẩu cổng thất bại",
  },
  PORTAL_PASSWORD_RESET_BY_STAFF: {
    ko: " 포털 비밀번호를 직원이 재설정했습니다",
    en: "had portal password reset by staff",
    vi: "được nhân viên đặt lại mật khẩu cổng",
  },
  PORTAL_PASSWORD_RESET_REQUESTED: {
    ko: " 포털 비밀번호 재설정을 요청했습니다",
    en: "requested a portal password reset",
    vi: "yêu cầu đặt lại mật khẩu cổng",
  },
  PORTAL_PASSWORD_RESET_REQUEST_FAILED: {
    ko: " 포털 비밀번호 재설정 요청에 실패했습니다",
    en: "failed to request portal password reset",
    vi: "yêu cầu đặt lại mật khẩu cổng thất bại",
  },
  PORTAL_SELF_UPDATE: {
    ko: " 포털 본인 정보를 수정했습니다",
    en: "updated their own portal profile",
    vi: "đã tự cập nhật hồ sơ cổng",
  },

  // ── Scheduler / system ───────────────────────────────────────
  SCHEDULER_WEIGHTS_UPDATE: {
    ko: " 스케줄러 가중치를 변경했습니다",
    en: "updated scheduler weights",
    vi: "đã chỉnh trọng số xếp lịch",
  },
  CRON_RUN: {
    ko: " 크론을 실행했습니다",
    en: "ran a scheduled job",
    vi: "đã chạy tác vụ định kỳ",
  },
};

/** Last-token → verb fallback map for unknown codes. */
const VERB_FALLBACK: Record<string, { ko: string; en: string; vi: string }> = {
  CREATE: { ko: "을(를) 생성했습니다", en: "created", vi: "đã tạo" },
  UPDATE: { ko: "을(를) 수정했습니다", en: "updated", vi: "đã cập nhật" },
  DELETE: { ko: "을(를) 삭제했습니다", en: "deleted", vi: "đã xoá" },
  STATE: { ko: " 상태를 변경했습니다", en: "changed state of", vi: "đã đổi trạng thái" },
  ENABLE: { ko: "을(를) 활성화했습니다", en: "enabled", vi: "đã kích hoạt" },
  DISABLE: {
    ko: "을(를) 비활성화했습니다",
    en: "disabled",
    vi: "đã vô hiệu hoá",
  },
  MERGE: { ko: "을(를) 병합했습니다", en: "merged", vi: "đã hợp nhất" },
  RUN: { ko: "을(를) 실행했습니다", en: "ran", vi: "đã chạy" },
  BREACH: { ko: " 위반이 발생했습니다", en: "breached", vi: "vi phạm" },
  COMPLETE: { ko: "을(를) 완료했습니다", en: "completed", vi: "đã hoàn tất" },
  CANCEL: { ko: "을(를) 취소했습니다", en: "cancelled", vi: "đã huỷ" },
  FAIL: { ko: "을(를) 실패 처리했습니다", en: "failed", vi: "thất bại" },
  START: { ko: "을(를) 시작했습니다", en: "started", vi: "đã bắt đầu" },
  REASSIGN: {
    ko: " 담당자를 변경했습니다",
    en: "reassigned",
    vi: "đã đổi phụ trách",
  },
  RESCHEDULE: {
    ko: " 일정을 변경했습니다",
    en: "rescheduled",
    vi: "đã đổi lịch",
  },
  REISSUE: {
    ko: "을(를) 재발행했습니다",
    en: "reissued",
    vi: "đã phát hành lại",
  },
  AMEND: {
    ko: "에 부록을 발행했습니다",
    en: "amended",
    vi: "đã chỉnh sửa",
  },
};

function safeLocale(locale: string): AuditLocale {
  if (locale === "en" || locale === "vi" || locale === "ko") return locale;
  return "ko";
}

function humaniseToken(token: string): string {
  // FOO_BAR_BAZ -> "Foo bar baz"
  const lower = token.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Resolve an action code to a localised verb + an unknown flag.
 *
 *   getActionLabel("CUSTOMER_UPDATE", "ko")
 *     // → { verb: "정보를 수정했습니다", entityHint: "Customer", isUnknown: false }
 */
export function getActionLabel(action: string, locale: string): ActionLabel {
  const loc = safeLocale(locale);
  const known = ACTION_LABELS[action];
  if (known) {
    return {
      verb: known[loc],
      entityHint: known.entityHint,
      isUnknown: false,
    };
  }

  // Fallback path. Pull the last underscore-separated token as the verb
  // hint; everything before it becomes a humanised entityHint.
  const parts = action.split("_");
  const lastToken = parts[parts.length - 1] ?? action;
  const prefix = parts.slice(0, -1).join("_");
  const fallback = VERB_FALLBACK[lastToken];
  const verb = fallback
    ? fallback[loc]
    : // No matching verb? Just humanise the whole code so it's at least readable.
      humaniseToken(action);
  return {
    verb,
    entityHint: prefix ? humaniseToken(prefix) : undefined,
    isUnknown: true,
  };
}
