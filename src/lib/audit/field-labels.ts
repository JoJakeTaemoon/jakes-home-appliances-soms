/**
 * Field-name → localised label, used by the diff table.
 *
 * 3-step fallback:
 *   1. Entity-scoped: `${entityType}.${field}` in FIELD_LABELS
 *   2. Common: `field` in COMMON_FIELDS
 *   3. Humanise camelCase: "preferredTechnicianId" → "Preferred technician id"
 *
 * The catalog is intentionally small: it only covers the high-traffic
 * audit payload fields. Unknown fields humanise gracefully so we never
 * crash on a new schema column.
 */

export type AuditLocale = "ko" | "en" | "vi";

type Triplet = { ko: string; en: string; vi: string };

const COMMON_FIELDS: Record<string, Triplet> = {
  id: { ko: "ID", en: "ID", vi: "ID" },
  createdAt: {
    ko: "생성일",
    en: "Created at",
    vi: "Ngày tạo",
  },
  updatedAt: {
    ko: "수정일",
    en: "Updated at",
    vi: "Ngày cập nhật",
  },
  active: { ko: "활성", en: "Active", vi: "Hoạt động" },
  state: { ko: "상태", en: "Status", vi: "Trạng thái" },
  status: { ko: "상태", en: "Status", vi: "Trạng thái" },
  name: { ko: "이름", en: "Name", vi: "Tên" },
  phone: { ko: "전화번호", en: "Phone", vi: "Số điện thoại" },
  email: { ko: "이메일", en: "Email", vi: "Email" },
  notes: { ko: "메모", en: "Notes", vi: "Ghi chú" },
  language: { ko: "언어", en: "Language", vi: "Ngôn ngữ" },
  address: { ko: "주소", en: "Address", vi: "Địa chỉ" },
  region: { ko: "지역", en: "Region", vi: "Khu vực" },
  district: { ko: "구/군", en: "District", vi: "Quận/Huyện" },
  city: { ko: "도시", en: "City", vi: "Thành phố" },
  amount: { ko: "금액", en: "Amount", vi: "Số tiền" },
  currency: { ko: "통화", en: "Currency", vi: "Tiền tệ" },
  type: { ko: "유형", en: "Type", vi: "Loại" },
  code: { ko: "코드", en: "Code", vi: "Mã" },
  role: { ko: "역할", en: "Role", vi: "Vai trò" },
  title: { ko: "직책", en: "Title", vi: "Chức danh" },
  username: { ko: "사용자명", en: "Username", vi: "Tên đăng nhập" },
};

const FIELD_LABELS: Record<string, Triplet> = {
  // ── Customer ───────────────────────────────────────────────
  "Customer.preferredTechnicianId": {
    ko: "선호 기사",
    en: "Preferred technician",
    vi: "Kỹ thuật viên ưu tiên",
  },
  "Customer.preferredRegion": {
    ko: "선호 지역",
    en: "Preferred region",
    vi: "Khu vực ưu tiên",
  },
  "Customer.type": {
    ko: "고객 유형",
    en: "Customer type",
    vi: "Loại khách hàng",
  },
  "Customer.legalName": {
    ko: "법적 상호",
    en: "Legal name",
    vi: "Tên pháp lý",
  },
  "Customer.taxCode": {
    ko: "세무코드",
    en: "Tax code",
    vi: "Mã số thuế",
  },
  "Customer.note": { ko: "메모", en: "Note", vi: "Ghi chú" },

  // ── Contract ───────────────────────────────────────────────
  "Contract.state": {
    ko: "계약 상태",
    en: "Contract status",
    vi: "Trạng thái hợp đồng",
  },
  "Contract.code": {
    ko: "계약 코드",
    en: "Contract code",
    vi: "Mã hợp đồng",
  },
  "Contract.startDate": {
    ko: "시작일",
    en: "Start date",
    vi: "Ngày bắt đầu",
  },
  "Contract.endDate": { ko: "종료일", en: "End date", vi: "Ngày kết thúc" },
  "Contract.monthlyPrice": {
    ko: "월 임대료",
    en: "Monthly price",
    vi: "Giá hàng tháng",
  },
  "Contract.totalPrice": {
    ko: "총 금액",
    en: "Total price",
    vi: "Tổng giá",
  },
  "Contract.parentContractId": {
    ko: "원 계약",
    en: "Parent contract",
    vi: "Hợp đồng gốc",
  },
  "Contract.amendmentRevision": {
    ko: "부록 차수",
    en: "Amendment revision",
    vi: "Số bản sửa đổi",
  },

  // ── Visit ──────────────────────────────────────────────────
  "Visit.scheduledAt": {
    ko: "예정 일시",
    en: "Scheduled at",
    vi: "Thời gian dự kiến",
  },
  "Visit.startedAt": {
    ko: "시작 일시",
    en: "Started at",
    vi: "Thời gian bắt đầu",
  },
  "Visit.completedAt": {
    ko: "완료 일시",
    en: "Completed at",
    vi: "Thời gian hoàn tất",
  },
  "Visit.leadTechnicianId": {
    ko: "주관 기사",
    en: "Lead technician",
    vi: "KTV chính",
  },
  "Visit.collaboratorTechnicianIds": {
    ko: "협업 기사",
    en: "Collaborators",
    vi: "KTV phụ",
  },
  "Visit.officeNotes": {
    ko: "사무실 메모",
    en: "Office notes",
    vi: "Ghi chú văn phòng",
  },
  "Visit.fieldNotes": {
    ko: "현장 메모",
    en: "Field notes",
    vi: "Ghi chú hiện trường",
  },

  // ── Service request ──────────────────────────────────────
  "ServiceRequest.type": {
    ko: "요청 유형",
    en: "Request type",
    vi: "Loại yêu cầu",
  },
  "ServiceRequest.priority": {
    ko: "우선순위",
    en: "Priority",
    vi: "Ưu tiên",
  },
  "ServiceRequest.state": {
    ko: "처리 상태",
    en: "Status",
    vi: "Trạng thái",
  },
  "ServiceRequest.assignedToId": {
    ko: "담당자",
    en: "Assignee",
    vi: "Người phụ trách",
  },

  // ── Payment ─────────────────────────────────────────────
  "Payment.method": {
    ko: "수금 방식",
    en: "Method",
    vi: "Phương thức",
  },
  "Payment.receiptNo": {
    ko: "영수증 번호",
    en: "Receipt number",
    vi: "Số biên lai",
  },
  "Payment.collectedAt": {
    ko: "수금 일시",
    en: "Collected at",
    vi: "Thời gian thu",
  },
  "Payment.handedOverAt": {
    ko: "인계 일시",
    en: "Handed over at",
    vi: "Thời gian bàn giao",
  },

  // ── User ─────────────────────────────────────────────────
  "User.role": { ko: "역할", en: "Role", vi: "Vai trò" },
  "User.preferredRegion": {
    ko: "선호 지역",
    en: "Preferred region",
    vi: "Khu vực ưu tiên",
  },
  "User.disabledAt": {
    ko: "비활성화 일시",
    en: "Disabled at",
    vi: "Thời gian vô hiệu",
  },

  // ── Equipment ───────────────────────────────────────────
  "Equipment.serialNo": {
    ko: "시리얼 번호",
    en: "Serial number",
    vi: "Số serial",
  },
  "Equipment.siteId": {
    ko: "사이트",
    en: "Site",
    vi: "Địa điểm",
  },
  "Equipment.modelId": {
    ko: "모델",
    en: "Model",
    vi: "Mẫu",
  },
  "Equipment.installedAt": {
    ko: "설치 일시",
    en: "Installed at",
    vi: "Thời gian lắp đặt",
  },
};

function safeLocale(locale: string): AuditLocale {
  if (locale === "en" || locale === "vi" || locale === "ko") return locale;
  return "ko";
}

function humaniseCamel(field: string): string {
  if (!field) return "";
  // preferredTechnicianId → "preferred technician id"
  const withSpaces = field.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Capitalise first letter only
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Resolve a `${entityType}.${field}` label, with graceful fallback.
 *
 *   getFieldLabel("Customer", "preferredTechnicianId", "ko")
 *     // → "선호 기사"
 *   getFieldLabel("Unknown", "fooBar", "en")
 *     // → "Foo bar"
 */
export function getFieldLabel(
  entityType: string,
  field: string,
  locale: string,
): string {
  if (!field) return "";
  const loc = safeLocale(locale);
  const scoped = FIELD_LABELS[`${entityType}.${field}`];
  if (scoped) return scoped[loc];
  const common = COMMON_FIELDS[field];
  if (common) return common[loc];
  return humaniseCamel(field);
}
