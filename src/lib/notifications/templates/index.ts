/**
 * Notification template registry.
 *
 * Each template defines:
 *   - `code`         : stable identifier (matches `NotificationLog.templateCode`)
 *   - `channels`     : which channels the template is allowed on (SMS / EMAIL / both)
 *   - `category`     : SYSTEM (opt-out ignored) / TRANSACTIONAL / MARKETING
 *   - `bodies`       : locale → string  (KO / VI / EN)
 *   - `subjects?`    : locale → string  (email only)
 *
 * Bodies pulled verbatim from `docs/DOCUMENT_TEMPLATES.md` §A (SMS) + §B (Email).
 * Variable placeholders use `{var}` notation; `renderTemplate()` does the
 * interpolation. Extra keys passed in `vars` are tolerated; missing keys are
 * replaced with an empty string (so a partially-filled template still sends).
 *
 * Phase 3.5 ships every template referenced by Phase 1-3 flows + the seven
 * SMS codes and 9 email codes called out in the Phase 3.5 spec. Templates
 * that are wired to flows that don't ship until later phases (visit reminder,
 * service-request approval, etc.) exist here so the router and provider can
 * still find them when those phases come online.
 */

import type {
  NotificationCategory,
  NotificationChannel,
  NotificationLocale,
  TemplateVars,
} from "@/lib/notifications/types";

export interface TemplateDef {
  code: string;
  channels: NotificationChannel[];
  category: NotificationCategory;
  bodies: Record<NotificationLocale, string>;
  subjects?: Record<NotificationLocale, string>;
}

// ── helpers ─────────────────────────────────────────────────────────────

/**
 * Replace `{var}` placeholders. Unmatched placeholders are left in place so
 * call sites notice missing data; passing `strict: true` throws instead.
 */
export function renderTemplate(
  body: string,
  vars: TemplateVars,
  opts: { strict?: boolean } = {},
): string {
  return body.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    if (opts.strict) {
      throw new Error(`Missing template variable: ${key}`);
    }
    return match;
  });
}

export function getTemplate(code: string): TemplateDef {
  const t = TEMPLATES[code];
  if (!t) throw new Error(`Unknown notification template: ${code}`);
  return t;
}

export function pickLocaleBody(
  template: TemplateDef,
  locale: NotificationLocale,
): string {
  return template.bodies[locale] ?? template.bodies.vi;
}

export function pickLocaleSubject(
  template: TemplateDef,
  locale: NotificationLocale,
): string | undefined {
  if (!template.subjects) return undefined;
  return template.subjects[locale] ?? template.subjects.vi;
}

// ── SMS templates (DOCUMENT_TEMPLATES §A) ───────────────────────────────

const SMS_PORTAL_WELCOME: TemplateDef = {
  code: "SMS_PORTAL_WELCOME",
  channels: ["SMS"],
  category: "SYSTEM",
  bodies: {
    ko: "[JakeApp] {name}님 환영합니다. 포털: {url} · ID: {phone} · 임시PW: {pwd}. 첫 로그인 시 비밀번호를 변경하세요.",
    vi: "[JakeApp] Chào {name}. Cổng KH: {url} · ID: {phone} · MK tạm: {pwd}. Đổi MK khi đăng nhập đầu.",
    en: "[JakeApp] Welcome {name}. Portal: {url} · ID: {phone} · Temp PW: {pwd}. Change PW on first login.",
  },
};

const SMS_PASSWORD_RESET: TemplateDef = {
  code: "SMS_PASSWORD_RESET",
  channels: ["SMS"],
  category: "SYSTEM",
  bodies: {
    ko: "[JakeApp] {name}님 비밀번호 초기화. 새 PW: {pwd} · 접속 {url}. 본인 요청이 아닌 경우 {hq_phone}",
    vi: "[JakeApp] MK của {name} đã đặt lại. MK mới: {pwd} · {url}. Không phải bạn? LH {hq_phone}",
    en: "[JakeApp] {name}, password reset. New PW: {pwd} · {url}. If not you: {hq_phone}",
  },
};

/**
 * Staff self-service recovery — sends a 6-digit verification code. After the
 * user types the code back into the recovery UI, the server generates a
 * one-time temp password and shows it on-screen (NOT via SMS). This template
 * only carries the code itself.
 */
const SMS_STAFF_RESET_CODE: TemplateDef = {
  code: "SMS_STAFF_RESET_CODE",
  channels: ["SMS"],
  category: "SYSTEM",
  bodies: {
    ko: "[JakeApp] 비밀번호 복구 인증코드: {code} ({minutes}분 유효). 본인 요청이 아니면 즉시 관리자에게 알리세요.",
    vi: "[JakeApp] Mã xác thực khôi phục mật khẩu: {code} (hiệu lực {minutes} phút). Không phải bạn? Báo quản trị viên ngay.",
    en: "[JakeApp] Password recovery code: {code} (valid {minutes} min). If this wasn't you, alert your admin immediately.",
  },
};

const SMS_VISIT_REMINDER: TemplateDef = {
  code: "SMS_VISIT_REMINDER",
  channels: ["SMS"],
  category: "TRANSACTIONAL",
  bodies: {
    ko: "[JakeApp] {date} {time}, {technician} 기사 방문({service}). 변경 {url}",
    vi: "[JakeApp] {date} {time}, {technician} đến ({service}). Đổi {url}",
    en: "[JakeApp] {date} {time}, {technician} visit ({service}). {url}",
  },
};

const SMS_SR_APPROVED: TemplateDef = {
  code: "SMS_SR_APPROVED",
  channels: ["SMS"],
  category: "TRANSACTIONAL",
  bodies: {
    ko: "[JakeApp] 요청 #{req_no} 승인. 비용 {amount}₫ · 방문 {date}. 동의 {url}",
    vi: "[JakeApp] YC #{req_no} duyệt. Chi phí: {amount}đ · Hẹn: {date}. XN: {url}",
    en: "[JakeApp] Request #{req_no} approved. Cost: {amount} VND · Visit: {date}. Confirm: {url}",
  },
};

const SMS_SR_REJECTED: TemplateDef = {
  code: "SMS_SR_REJECTED",
  channels: ["SMS"],
  category: "TRANSACTIONAL",
  bodies: {
    ko: "[JakeApp] 요청 #{req_no} 반려. 사유: {reason}. 문의 {hq_phone}",
    vi: "[JakeApp] YC #{req_no} từ chối. Lý do: {reason}. LH {hq_phone}",
    en: "[JakeApp] Request #{req_no} declined. Reason: {reason}. Contact {hq_phone}",
  },
};

const SMS_PAYMENT_OVERDUE_FINAL: TemplateDef = {
  code: "SMS_PAYMENT_OVERDUE_FINAL",
  channels: ["SMS"],
  category: "TRANSACTIONAL",
  bodies: {
    ko: "[JakeApp] {name}님 {month} 임대료 {amount}₫ 미납. 결제 {url} 또는 {hq_phone}",
    vi: "[JakeApp] {name}, phí thuê {month} {amount}đ chưa TT. TT: {url} hoặc {hq_phone}",
    en: "[JakeApp] {name}, {month} rental {amount} VND overdue. Pay {url} or {hq_phone}",
  },
};

const SMS_CONTRACT_RENEWAL_FINAL: TemplateDef = {
  code: "SMS_CONTRACT_RENEWAL_FINAL",
  channels: ["SMS"],
  category: "TRANSACTIONAL",
  bodies: {
    ko: "[JakeApp] {name}님 임대 만료 {date} (잔여 {days}일). 소유권 이전 또는 유지관리 {url} / {hq_phone}",
    vi: "[JakeApp] {name}, HĐ thuê hết hạn {date} (còn {days} ngày). Chuyển SH/bảo trì: {url} / {hq_phone}",
    en: "[JakeApp] {name}, rental ends {date} ({days} days left). Transfer/maintenance: {url} / {hq_phone}",
  },
};

// ── Email templates (DOCUMENT_TEMPLATES §B) ─────────────────────────────

const EMAIL_PORTAL_WELCOME: TemplateDef = {
  code: "EMAIL_PORTAL_WELCOME",
  channels: ["EMAIL"],
  category: "SYSTEM",
  subjects: {
    ko: "[Jake's Home Appliances] 고객 포털 가입을 환영합니다 — 로그인 정보 안내",
    vi: "[Jake's Home Appliances] Chào mừng đến cổng khách hàng — Thông tin đăng nhập",
    en: "[Jake's Home Appliances] Welcome to your customer portal — Login info",
  },
  bodies: {
    ko: `{name}님 안녕하세요,

Jake's Home Appliances를 선택해주셔서 감사합니다. 고객 포털 계정이 개설되었습니다.

▸ 포털 주소: {url}
▸ 로그인 아이디: {phone}
▸ 임시 비밀번호: 보안상의 이유로 SMS로 별도 전송됩니다

첫 로그인 시 비밀번호 변경을 요청합니다 (보안상 필수).

포털에서 이용 가능한 서비스:
• 장비 이력 및 다음 점검 일정 확인
• 필터 교체 주기 모니터링
• 서비스 요청 제출 (정기점검 / 고장 / 교체 / 이전설치)
• 결제 이력 및 청구서 다운로드

문의: {hq_phone} / cs@jakeshomeappliances.com.vn

Jake's Home Appliances 고객지원팀`,
    vi: `Kính chào {name},

Cảm ơn quý khách đã chọn Jake's Home Appliances. Tài khoản cổng khách hàng đã được kích hoạt.

▸ Địa chỉ cổng: {url}
▸ Tên đăng nhập: {phone}
▸ Mật khẩu tạm: được gửi riêng qua SMS vì lý do bảo mật

Vui lòng đổi mật khẩu khi đăng nhập lần đầu (yêu cầu bảo mật).

Dịch vụ qua cổng:
• Xem lịch sử thiết bị và lịch bảo trì sắp tới
• Theo dõi chu kỳ thay lõi lọc
• Gửi yêu cầu dịch vụ (bảo trì / báo lỗi / thay thế / di dời)
• Lịch sử thanh toán và tải hóa đơn

Liên hệ: {hq_phone} / cs@jakeshomeappliances.com.vn

Đội ngũ CSKH Jake's Home Appliances`,
    en: `Dear {name},

Thank you for choosing Jake's Home Appliances. Your customer portal account has been activated.

▸ Portal URL: {url}
▸ Login ID: {phone}
▸ Temporary password: sent separately via SMS for security

Please change your password on first login (required for security).

What you can do in the portal:
• View equipment history and upcoming visit schedule
• Monitor filter replacement cycles
• Submit service requests (inspection / fault / replacement / relocation)
• Access payment history and download invoices

Contact: {hq_phone} / cs@jakeshomeappliances.com.vn

Jake's Home Appliances Customer Support`,
  },
};

const EMAIL_FILTER_DUE_D14: TemplateDef = {
  code: "EMAIL_FILTER_DUE_D14",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] {equipment} {part_name} {action_label} 시기 안내 ({days}일 후)",
    vi: "[Jake's Home Appliances] Đến hạn {action_label} {part_name} — {equipment} (còn {days} ngày)",
    en: "[Jake's Home Appliances] {part_name} {action_label} due in {days} days — {equipment}",
  },
  bodies: {
    ko: `{name}님,

귀하의 {equipment}의 {part_name}이(가) {days}일 후 {action_label} 시기에 도달합니다.

▸ 권장 {action_label}일: {date}
▸ 임대 고객: 무상 {action_label}
▸ 판매/유지관리 고객: 부품비용/작업비 별도 (포털에서 견적 확인)

방문 예약: {url}

기사 방문 일정은 D-3일까지 확정 SMS로 안내드립니다.

문의: {hq_phone}`,
    vi: `Kính chào {name},

{part_name} của thiết bị {equipment} sẽ đến hạn {action_label} trong {days} ngày tới.

▸ Ngày khuyến nghị: {date}
▸ Khách thuê: {action_label} miễn phí
▸ Khách mua / bảo trì: phí vật tư/dịch vụ riêng (xem báo giá tại cổng)

Đặt lịch: {url}

Lịch KTV sẽ được xác nhận qua SMS trước 3 ngày.

Liên hệ: {hq_phone}`,
    en: `Dear {name},

The {part_name} on your {equipment} is due for {action_label} in {days} days.

▸ Recommended date: {date}
▸ Rental customers: {action_label} free of charge
▸ Sale/Maintenance customers: parts/labor billed separately (see portal for quote)

Book a visit: {url}

Technician schedule will be confirmed via SMS 3 days prior.

Contact: {hq_phone}`,
  },
};

const EMAIL_SR_RECEIVED: TemplateDef = {
  code: "EMAIL_SR_RECEIVED",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] 서비스 요청 접수 #{req_no}",
    vi: "[Jake's Home Appliances] Đã nhận yêu cầu dịch vụ #{req_no}",
    en: "[Jake's Home Appliances] Service request #{req_no} received",
  },
  bodies: {
    ko: `{name}님,

서비스 요청이 접수되었습니다.

▸ 요청 번호: #{req_no}
▸ 유형: {type}
▸ 접수 시간: {received_at}
▸ 예상 회신: 1영업일 내

요청 내용 확인: {url}

무상 요청(정기점검 등)은 자동으로 방문 일정이 잡힙니다.
유상 요청은 사무실 검토 후 견적과 함께 회신드립니다.

문의: {hq_phone}`,
    vi: `Kính chào {name},

Yêu cầu dịch vụ đã được tiếp nhận.

▸ Số yêu cầu: #{req_no}
▸ Loại: {type}
▸ Thời gian nhận: {received_at}
▸ Phản hồi dự kiến: trong 1 ngày làm việc

Theo dõi: {url}

Yêu cầu miễn phí (bảo trì định kỳ...) sẽ được xếp lịch tự động.
Yêu cầu có phí sẽ được xét duyệt và báo giá từ văn phòng.

Liên hệ: {hq_phone}`,
    en: `Dear {name},

We have received your service request.

▸ Request number: #{req_no}
▸ Type: {type}
▸ Received: {received_at}
▸ Expected response: within 1 business day

Track: {url}

Free requests (periodic inspection, etc.) will be scheduled automatically.
Paid requests will receive a quote and approval from the office.

Contact: {hq_phone}`,
  },
};

const EMAIL_SR_APPROVED_DETAILS: TemplateDef = {
  code: "EMAIL_SR_APPROVED_DETAILS",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] 요청 #{req_no} 승인 — 견적 및 방문 일정",
    vi: "[Jake's Home Appliances] Yêu cầu #{req_no} đã duyệt — Báo giá + lịch",
    en: "[Jake's Home Appliances] Request #{req_no} approved — Quote + visit schedule",
  },
  bodies: {
    ko: `{name}님,

서비스 요청이 승인되었습니다.

▸ 요청 번호: #{req_no}
▸ 유형: {type}
▸ 견적 (세부):
{itemized_table}
▸ 합계: {amount}₫ (VAT 10% 포함)
▸ 방문 예정일: {date} {time}
▸ 담당 기사: {technician}

승인 / 거절: {url}

24시간 내 응답이 없으면 일정대로 진행됩니다.

문의: {hq_phone}`,
    vi: `Kính chào {name},

Yêu cầu dịch vụ đã được duyệt.

▸ Số yêu cầu: #{req_no}
▸ Loại: {type}
▸ Báo giá (chi tiết):
{itemized_table}
▸ Tổng: {amount}đ (đã VAT 10%)
▸ Ngày hẹn: {date} {time}
▸ KTV phụ trách: {technician}

Đồng ý / Từ chối: {url}

Nếu không phản hồi trong 24h, chúng tôi sẽ tiến hành theo lịch.

Liên hệ: {hq_phone}`,
    en: `Dear {name},

Your service request has been approved.

▸ Request number: #{req_no}
▸ Type: {type}
▸ Itemized quote:
{itemized_table}
▸ Total: {amount} VND (incl. 10% VAT)
▸ Scheduled: {date} {time}
▸ Technician: {technician}

Confirm / Decline: {url}

If no response within 24h, we'll proceed as scheduled.

Contact: {hq_phone}`,
  },
};

const EMAIL_VISIT_COMPLETED: TemplateDef = {
  code: "EMAIL_VISIT_COMPLETED",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] {date} 방문 완료 — 작업확인서 (#{visit_no})",
    vi: "[Jake's Home Appliances] Hoàn tất ngày {date} — Phiếu công việc (#{visit_no})",
    en: "[Jake's Home Appliances] Visit completed {date} — Work confirmation (#{visit_no})",
  },
  bodies: {
    ko: `{name}님,

오늘 방문 작업이 완료되었습니다. 서명된 작업확인서를 첨부합니다.

▸ 방문 번호: #{visit_no}
▸ 일시: {date} {time}
▸ 담당 기사: {technician}
▸ 작업 내역: {summary}
▸ 교체 부품: {parts_replaced}
▸ 다음 점검 예정일: {next_date}

▸ 첨부: 작업확인서.pdf (서명본)

장비 상세 확인: {url}

이번 방문에 대한 피드백은 1주일 내 SMS로 안내드립니다.

문의: {hq_phone}`,
    vi: `Kính chào {name},

Lượt thăm hôm nay đã hoàn tất. Phiếu công việc đã ký kèm theo.

▸ Số phiếu: #{visit_no}
▸ Thời gian: {date} {time}
▸ KTV: {technician}
▸ Hạng mục: {summary}
▸ Phụ tùng đã thay: {parts_replaced}
▸ Lượt kế dự kiến: {next_date}

▸ Đính kèm: Phieu-cong-viec.pdf (đã ký)

Xem chi tiết thiết bị: {url}

Chúng tôi sẽ gửi SMS đánh giá trong 1 tuần tới.

Liên hệ: {hq_phone}`,
    en: `Dear {name},

Today's visit has been completed. Signed work confirmation is attached.

▸ Visit number: #{visit_no}
▸ Time: {date} {time}
▸ Technician: {technician}
▸ Work performed: {summary}
▸ Parts replaced: {parts_replaced}
▸ Next visit scheduled: {next_date}

▸ Attachment: work-confirmation.pdf (signed)

View equipment details: {url}

A satisfaction survey SMS will follow within 1 week.

Contact: {hq_phone}`,
  },
};

const EMAIL_PAYMENT_DUE_D7: TemplateDef = {
  code: "EMAIL_PAYMENT_DUE_D7",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] {month} 임대료 결제 안내",
    vi: "[Jake's Home Appliances] Nhắc thanh toán phí thuê {month}",
    en: "[Jake's Home Appliances] Reminder — {month} rental payment",
  },
  bodies: {
    ko: `{name}님 안녕하세요,

{month} 임대료가 아직 결제되지 않았습니다.

▸ 청구 금액: {amount}₫ (VAT 포함)
▸ 청구일: {invoice_date}
▸ 결제 기한: {due_date} (7일 지남)

결제 방법:
• 포털 온라인: {url}
• 은행 송금: {bank_info}
• 기사 방문 시 현금/카드 (다음 방문일: {next_visit})

이미 결제하셨다면 본 메일을 무시해주세요 (시스템 반영 1~2일 소요).

문의: {hq_phone} / accounts@jakeshomeappliances.com.vn`,
    vi: `Kính chào {name},

Phí thuê tháng {month} của quý khách chưa được thanh toán.

▸ Số tiền: {amount}đ (đã VAT)
▸ Ngày lập HĐ: {invoice_date}
▸ Hạn TT: {due_date} (đã quá 7 ngày)

Phương thức TT:
• Online qua cổng: {url}
• Chuyển khoản: {bank_info}
• Tiền mặt/thẻ khi KTV đến (lượt kế: {next_visit})

Nếu đã TT, xin vui lòng bỏ qua email này (cập nhật hệ thống mất 1-2 ngày).

Liên hệ: {hq_phone} / accounts@jakeshomeappliances.com.vn`,
    en: `Dear {name},

Your {month} rental fee remains unpaid.

▸ Amount: {amount} VND (incl. VAT)
▸ Invoice date: {invoice_date}
▸ Due date: {due_date} (7 days overdue)

Payment options:
• Online via portal: {url}
• Bank transfer: {bank_info}
• Cash/card during technician visit (next visit: {next_visit})

If already paid, please disregard (system updates take 1-2 days).

Contact: {hq_phone} / accounts@jakeshomeappliances.com.vn`,
  },
};

const EMAIL_PAYMENT_DUE_D14: TemplateDef = {
  code: "EMAIL_PAYMENT_DUE_D14",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] {month} 미수금 안내 (2차)",
    vi: "[Jake's Home Appliances] Phí thuê {month} chưa TT (Lần 2)",
    en: "[Jake's Home Appliances] Second reminder — {month} payment outstanding",
  },
  bodies: {
    ko: `{name}님,

{month} 임대료가 결제 기한을 14일 초과했습니다.

▸ 청구 금액: {amount}₫
▸ 지연 일수: 14일
▸ 누적 연체이자 (해당 시): {late_fee}₫

▸ 다음 안내는 D+30 SMS로 진행되며, 서비스 중단 가능성이 있습니다.

즉시 결제: {url}
문의: {hq_phone}`,
    vi: `Kính chào {name},

Phí thuê tháng {month} đã quá hạn 14 ngày.

▸ Số tiền: {amount}đ
▸ Quá hạn: 14 ngày
▸ Phí trễ (nếu có): {late_fee}đ

▸ Thông báo kế tiếp sẽ là SMS vào D+30, có thể bị ngưng dịch vụ.

TT ngay: {url}
Liên hệ: {hq_phone}`,
    en: `Dear {name},

Your {month} rental payment is now 14 days overdue.

▸ Amount: {amount} VND
▸ Overdue: 14 days
▸ Late fee (if applicable): {late_fee} VND

▸ Next notice will be via SMS at D+30, with potential service interruption.

Pay now: {url}
Contact: {hq_phone}`,
  },
};

const EMAIL_RENTAL_DUE_D60: TemplateDef = {
  code: "EMAIL_RENTAL_DUE_D60",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] 임대 계약 만료 안내 (60일 전) — 옵션 비교",
    vi: "[Jake's Home Appliances] HĐ thuê sắp hết hạn (còn 60 ngày) — So sánh phương án",
    en: "[Jake's Home Appliances] Rental contract ending in 60 days — Options",
  },
  bodies: {
    ko: `{name}님,

36개월 임대 계약이 60일 후 만료됩니다.

▸ 만료일: {date}
▸ 잔여: 60일
▸ 현재 임대 중: {equipment_list}

만료 후 3가지 옵션:
1. 소유권 이전 — 무료, 장비 그대로 자가 소유
2. 유지관리 계약 — 월 {maintenance_fee}₫, 무상 점검·필터 교체 지속
3. 계약 종료 — 장비 회수 (회수비 별도)

옵션 선택: {url}
문의: {hq_phone}

D-30 시점에 결정 안내 이메일이, D-7 시점에 SMS 최종 알림이 발송됩니다.`,
    vi: `Kính chào {name},

Hợp đồng thuê 36 tháng sẽ hết hạn trong 60 ngày tới.

▸ Ngày hết hạn: {date}
▸ Còn lại: 60 ngày
▸ Thiết bị đang thuê: {equipment_list}

3 phương án sau khi hết hạn:
1. Chuyển quyền sở hữu — Miễn phí, sở hữu thiết bị
2. Hợp đồng bảo trì — {maintenance_fee}đ/tháng, bảo trì + thay lõi miễn phí
3. Kết thúc HĐ — Thu hồi thiết bị (có phí thu hồi)

Chọn phương án: {url}
Liên hệ: {hq_phone}

Email nhắc quyết định sẽ gửi vào D-30, SMS cuối cùng vào D-7.`,
    en: `Dear {name},

Your 36-month rental contract will end in 60 days.

▸ End date: {date}
▸ Remaining: 60 days
▸ Equipment under rental: {equipment_list}

Three options after expiry:
1. Ownership transfer — Free, keep equipment as your own
2. Maintenance contract — {maintenance_fee} VND/mo, continued inspection + filter changes
3. End contract — Equipment retrieval (retrieval fee applies)

Choose: {url}
Contact: {hq_phone}

Reminder email at D-30, final SMS at D-7.`,
  },
};

const EMAIL_RENTAL_DUE_D30: TemplateDef = {
  code: "EMAIL_RENTAL_DUE_D30",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] 임대 만료 임박 (D-30) — 결정 부탁드립니다",
    vi: "[Jake's Home Appliances] HĐ thuê còn 30 ngày — Quyết định",
    en: "[Jake's Home Appliances] 30 days to rental expiry — please decide",
  },
  bodies: {
    ko: `{name}님,

임대 계약 만료까지 30일 남았습니다. 아직 옵션을 선택하지 않으셨습니다.

▸ 만료일: {date}
▸ 미선택 시 기본값: 옵션 3 (계약 종료, 회수비 부과)

지금 선택: {url}

회수비를 피하시려면 옵션 1 (소유권 이전) 또는 옵션 2 (유지관리)를 D-7 이전에 선택해주세요.

D-7 시점에 SMS 최종 안내가 발송됩니다.

문의: {hq_phone}`,
    vi: `Kính chào {name},

Còn 30 ngày để chọn phương án sau khi hết hạn HĐ thuê. Quý khách chưa chọn.

▸ Ngày hết hạn: {date}
▸ Mặc định nếu không chọn: PA 3 (Kết thúc HĐ, có phí thu hồi)

Chọn ngay: {url}

Để tránh phí thu hồi, chọn PA 1 (Chuyển SH) hoặc PA 2 (Bảo trì) trước D-7.

SMS nhắc cuối sẽ gửi vào D-7.

Liên hệ: {hq_phone}`,
    en: `Dear {name},

30 days remaining to choose your post-rental option. You haven't selected yet.

▸ End date: {date}
▸ Default if no selection: Option 3 (End contract, retrieval fee applies)

Select now: {url}

To avoid retrieval fee, choose Option 1 (Transfer) or Option 2 (Maintenance) before D-7.

Final SMS will be sent at D-7.

Contact: {hq_phone}`,
  },
};

// ── Phase 3 → 3.5 carry-overs (used by existing flows) ─────────────────

const EMAIL_RECEIPT: TemplateDef = {
  code: "EMAIL_RECEIPT",
  channels: ["EMAIL"],
  category: "SYSTEM", // payment receipts cannot be opted out of
  subjects: {
    ko: "[Jake's Home Appliances] 결제 영수증 — {amount}₫ ({date})",
    vi: "[Jake's Home Appliances] Biên lai thanh toán — {amount}đ ({date})",
    en: "[Jake's Home Appliances] Payment receipt — {amount} VND ({date})",
  },
  bodies: {
    ko: `{name}님,

결제가 확인되었습니다. 영수증을 보관해주세요.

▸ 영수 번호: {receipt_no}
▸ 결제일: {date}
▸ 결제 방법: {method}
▸ 금액: {amount}₫

문의: {hq_phone}

Jake's Home Appliances`,
    vi: `Kính chào {name},

Thanh toán đã được ghi nhận. Vui lòng lưu lại biên lai.

▸ Số biên lai: {receipt_no}
▸ Ngày: {date}
▸ Phương thức: {method}
▸ Số tiền: {amount}đ

Liên hệ: {hq_phone}

Jake's Home Appliances`,
    en: `Dear {name},

Payment received. Please keep this receipt for your records.

▸ Receipt no.: {receipt_no}
▸ Date: {date}
▸ Method: {method}
▸ Amount: {amount} VND

Contact: {hq_phone}

Jake's Home Appliances`,
  },
};

const EMAIL_TAX_INVOICE: TemplateDef = {
  code: "EMAIL_TAX_INVOICE",
  channels: ["EMAIL"],
  category: "SYSTEM",
  subjects: {
    ko: "[Jake's Home Appliances] 세금계산서 발행 — {invoice_no}",
    vi: "[Jake's Home Appliances] Hóa đơn GTGT — {invoice_no}",
    en: "[Jake's Home Appliances] e-Tax invoice — {invoice_no}",
  },
  bodies: {
    ko: `{name}님,

세금계산서를 발행해드렸습니다.

▸ 인보이스 번호: {invoice_no}
▸ 발행일: {invoice_date}
▸ 공급가액: {amount}₫
▸ VAT 10%: {vat}₫
▸ 합계: {total}₫

첨부된 PDF를 확인하시기 바랍니다. 추가 문의는 cs@jakeshomeappliances.com.vn 또는 {hq_phone}.`,
    vi: `Kính chào {name},

Đã phát hành hóa đơn GTGT.

▸ Số HĐ: {invoice_no}
▸ Ngày phát hành: {invoice_date}
▸ Giá trước thuế: {amount}đ
▸ VAT 10%: {vat}đ
▸ Tổng: {total}đ

Vui lòng xem file PDF đính kèm. Liên hệ: cs@jakeshomeappliances.com.vn / {hq_phone}`,
    en: `Dear {name},

Your e-tax invoice has been issued.

▸ Invoice no.: {invoice_no}
▸ Issued: {invoice_date}
▸ Subtotal: {amount} VND
▸ VAT 10%: {vat} VND
▸ Total: {total} VND

See attached PDF. Questions: cs@jakeshomeappliances.com.vn / {hq_phone}`,
  },
};

const EMAIL_CONTRACT_COPY: TemplateDef = {
  code: "EMAIL_CONTRACT_COPY",
  channels: ["EMAIL"],
  category: "SYSTEM", // contract documents are legally required deliverables
  subjects: {
    ko: "[Jake's Home Appliances] 계약서 사본 — {contract_no}",
    vi: "[Jake's Home Appliances] Bản sao hợp đồng — {contract_no}",
    en: "[Jake's Home Appliances] Contract copy — {contract_no}",
  },
  bodies: {
    ko: `{name}님,

요청하신 계약서 사본을 첨부합니다.

▸ 계약 번호: {contract_no}
▸ 발행일: {issued_at}

문의: {hq_phone} / cs@jakeshomeappliances.com.vn

Jake's Home Appliances`,
    vi: `Kính chào {name},

Đính kèm bản sao hợp đồng theo yêu cầu.

▸ Số hợp đồng: {contract_no}
▸ Ngày phát hành: {issued_at}

Liên hệ: {hq_phone} / cs@jakeshomeappliances.com.vn

Jake's Home Appliances`,
    en: `Dear {name},

Please find a copy of your contract attached.

▸ Contract no.: {contract_no}
▸ Issued: {issued_at}

Contact: {hq_phone} / cs@jakeshomeappliances.com.vn

Jake's Home Appliances`,
  },
};

const EMAIL_RENTAL_COMPLETED: TemplateDef = {
  code: "EMAIL_RENTAL_COMPLETED",
  channels: ["EMAIL"],
  category: "TRANSACTIONAL",
  subjects: {
    ko: "[Jake's Home Appliances] 임대 계약 완료 — 장비 소유권 이전 안내",
    vi: "[Jake's Home Appliances] Hợp đồng thuê đã hoàn tất — Chuyển quyền sở hữu",
    en: "[Jake's Home Appliances] Rental contract completed — Ownership transferred",
  },
  bodies: {
    ko: `{name}님,

36개월 임대 계약이 정상적으로 완료되었습니다.

▸ 계약 번호: {contract_no}
▸ 완료일: {completed_at}
▸ 이전된 장비: {equipment_count}대

이제 장비는 귀하의 소유입니다. 유지관리 계약을 원하시면 포털에서 신청해주세요.

포털: {url}
문의: {hq_phone}

Jake's Home Appliances`,
    vi: `Kính chào {name},

Hợp đồng thuê 36 tháng đã hoàn tất.

▸ Số hợp đồng: {contract_no}
▸ Ngày hoàn tất: {completed_at}
▸ Thiết bị đã chuyển SH: {equipment_count}

Thiết bị nay thuộc quyền sở hữu của quý khách. Nếu cần HĐ bảo trì, đăng ký tại cổng.

Cổng: {url}
Liên hệ: {hq_phone}

Jake's Home Appliances`,
    en: `Dear {name},

Your 36-month rental contract has been completed successfully.

▸ Contract no.: {contract_no}
▸ Completed: {completed_at}
▸ Equipment transferred: {equipment_count}

The equipment is now yours. If you'd like a maintenance contract, sign up via the portal.

Portal: {url}
Contact: {hq_phone}

Jake's Home Appliances`,
  },
};

// ── Registry ────────────────────────────────────────────────────────────

export const TEMPLATES: Record<string, TemplateDef> = {
  // SMS
  SMS_PORTAL_WELCOME,
  SMS_PASSWORD_RESET,
  SMS_STAFF_RESET_CODE,
  SMS_VISIT_REMINDER,
  SMS_SR_APPROVED,
  SMS_SR_REJECTED,
  SMS_PAYMENT_OVERDUE_FINAL,
  SMS_CONTRACT_RENEWAL_FINAL,
  // Email
  EMAIL_PORTAL_WELCOME,
  EMAIL_RECEIPT,
  EMAIL_SR_RECEIVED,
  EMAIL_SR_APPROVED_DETAILS,
  EMAIL_FILTER_DUE_D14,
  EMAIL_PAYMENT_DUE_D7,
  EMAIL_PAYMENT_DUE_D14,
  EMAIL_RENTAL_DUE_D60,
  EMAIL_RENTAL_DUE_D30,
  EMAIL_VISIT_COMPLETED,
  EMAIL_TAX_INVOICE,
  EMAIL_CONTRACT_COPY,
  EMAIL_RENTAL_COMPLETED,
};

export const TEMPLATE_CODES = Object.keys(TEMPLATES);
