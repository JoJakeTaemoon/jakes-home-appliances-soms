/**
 * Per-template, per-locale short descriptions of WHEN the message is sent.
 *
 * Used by the admin "알림 서식" page so admins know which business event
 * triggers each template before they edit or disable it. Bodies + subjects
 * stay in `templates/index.ts`; this file is description-only.
 */

import type { NotificationLocale } from "@/lib/notifications/types";

export type TemplateDescription = Record<NotificationLocale, string>;

export const TEMPLATE_DESCRIPTIONS: Record<string, TemplateDescription> = {
  // ── SMS ────────────────────────────────────────────────────────────────
  SMS_PORTAL_WELCOME: {
    ko: "고객 포털 계정이 생성될 때 (계약 활성화 / 판매 확정) 자동 발송. 임시 비밀번호 + 포털 URL을 SMS로 전달합니다.",
    vi: "Tự động gửi khi tài khoản Cổng KH được tạo (kích hoạt hợp đồng / chốt bán). SMS chứa mật khẩu tạm thời và URL cổng.",
    en: "Auto-sent when a customer portal account is created (contract activation / sale finalization). SMS carries the temp password + portal URL.",
  },
  SMS_PASSWORD_RESET: {
    ko: "MANAGER 이상이 고객의 포털 비밀번호를 재설정할 때 발송. opt-out 무관하게 항상 전송 (보안 메시지).",
    vi: "Gửi khi MANAGER+ đặt lại mật khẩu cổng của KH. Luôn gửi, không phụ thuộc opt-out (tin bảo mật).",
    en: "Sent when MANAGER+ resets a customer's portal password. Always delivered regardless of opt-out (security message).",
  },
  SMS_STAFF_RESET_CODE: {
    ko: "직원 본인 비밀번호 찾기 (전화번호 인증) 시 6자리 인증코드 발송. 10분 유효, 재시도 제한 있음.",
    vi: "Gửi mã 6 chữ số khi nhân viên dùng tự khôi phục mật khẩu (xác thực SĐT). Hiệu lực 10 phút, có giới hạn thử lại.",
    en: "Sends the 6-digit verification code during staff self-service password recovery (phone-based). Valid 10 minutes; retry-limited.",
  },
  SMS_VISIT_REMINDER: {
    ko: "방문 예정일 하루 전 (D-1) 자동 발송. 16:00 VST cron이 다음 날 SCHEDULED 방문을 스캔해 고객에게 알림.",
    vi: "Tự động gửi 1 ngày trước lượt thăm (D-1). Cron 16:00 VST quét các Visit SCHEDULED ngày hôm sau và gửi nhắc cho KH.",
    en: "Auto-sent 1 day before the visit (D-1). 16:00 VST cron scans next-day SCHEDULED visits and notifies the customer.",
  },
  SMS_SR_APPROVED: {
    ko: "사무실이 유상 서비스 요청을 승인하고 금액·방문일을 확정했을 때 발송 (짧은 SMS + 동의 URL).",
    vi: "Gửi khi văn phòng duyệt yêu cầu dịch vụ có phí và chốt giá + ngày thăm (SMS ngắn + URL xác nhận).",
    en: "Sent when the office approves a paid service request and locks in price + visit date (short SMS + confirmation URL).",
  },
  SMS_SR_REJECTED: {
    ko: "사무실이 서비스 요청을 거절했을 때 발송. 사유 + 본사 전화번호 포함.",
    vi: "Gửi khi văn phòng từ chối yêu cầu dịch vụ. Bao gồm lý do + SĐT văn phòng.",
    en: "Sent when the office rejects a service request. Includes the reason + HQ phone number.",
  },
  SMS_PAYMENT_OVERDUE_FINAL: {
    ko: "수금 D+30 단계의 최종 경고 SMS. 그 이전 D+7/D+14 단계는 이메일로만 발송.",
    vi: "SMS cảnh báo cuối ở giai đoạn D+30 thu phí. Các giai đoạn D+7/D+14 trước đó chỉ gửi email.",
    en: "Final-warning SMS at the D+30 collection stage. Earlier D+7/D+14 stages go by email only.",
  },
  SMS_CONTRACT_RENEWAL_FINAL: {
    ko: "임대 계약 종료 D-7 단계의 최종 갱신 안내 SMS. 그 이전 D-60/D-30 단계는 이메일로만 발송.",
    vi: "SMS gia hạn cuối ở giai đoạn D-7 trước khi kết thúc hợp đồng thuê. Các giai đoạn D-60/D-30 trước đó chỉ gửi email.",
    en: "Final renewal-prompt SMS at the D-7 stage before rental termination. Earlier D-60/D-30 stages go by email only.",
  },

  // ── EMAIL ──────────────────────────────────────────────────────────────
  EMAIL_PORTAL_WELCOME: {
    ko: "고객 포털 계정 생성 시 SMS와 함께 발송되는 환영 이메일. 포털 사용법 + 첫 로그인 안내.",
    vi: "Email chào mừng gửi cùng SMS khi tài khoản Cổng KH được tạo. Hướng dẫn cách dùng cổng + đăng nhập lần đầu.",
    en: "Welcome email sent alongside the SMS on portal account creation. Walks through portal usage + first login.",
  },
  EMAIL_FILTER_DUE_D14: {
    ko: "필터 교체 예정일 14일 전 이메일 알림. 09:00 VST cron이 정기 필터 교체 도래 장비를 스캔.",
    vi: "Email nhắc thay lõi lọc 14 ngày trước hạn. Cron 09:00 VST quét các thiết bị đến hạn thay lõi định kỳ.",
    en: "Email reminder 14 days before a filter replacement is due. 09:00 VST cron scans equipment with upcoming filter changes.",
  },
  EMAIL_SR_RECEIVED: {
    ko: "고객이 포털에서 서비스 요청을 제출하면 즉시 발송되는 접수 확인 이메일.",
    vi: "Email xác nhận tiếp nhận, gửi ngay khi KH gửi yêu cầu dịch vụ qua cổng.",
    en: "Acknowledgement email sent immediately when a customer submits a service request via the portal.",
  },
  EMAIL_SR_APPROVED_DETAILS: {
    ko: "유상 서비스 요청 승인 시 SMS와 함께 발송되는 상세 견적 이메일 (항목·세금·합계 포함).",
    vi: "Email chi tiết báo giá gửi cùng SMS khi duyệt yêu cầu dịch vụ có phí (gồm các khoản, thuế, tổng).",
    en: "Detailed quotation email sent alongside the SMS on paid SR approval (line items, tax, total).",
  },
  EMAIL_VISIT_COMPLETED: {
    ko: "방문 완료 후 작업확인서 PDF를 첨부해서 발송. 점검 결과 + 교체 부품 요약 포함.",
    vi: "Gửi sau khi hoàn tất lượt thăm, đính kèm PDF phiếu xác nhận công việc. Tóm tắt kết quả + linh kiện đã thay.",
    en: "Sent after a visit is completed; attaches the signed work-confirmation PDF. Summarises findings + replaced parts.",
  },
  EMAIL_PAYMENT_DUE_D7: {
    ko: "수금 연체 1주차 (D+7) 이메일 알림. 첫 단계 — 본문 톤은 정중함 유지.",
    vi: "Email nhắc nợ giai đoạn 1 tuần (D+7). Bước đầu — văn phong vẫn lịch sự.",
    en: "Email reminder at the first overdue stage (D+7). Stage 1 — copy keeps a polite tone.",
  },
  EMAIL_PAYMENT_DUE_D14: {
    ko: "수금 연체 2주차 (D+14) 이메일 알림. 본문 톤은 보다 단호하게 — 본사 전화번호 강조.",
    vi: "Email nhắc nợ giai đoạn 2 tuần (D+14). Văn phong cứng rắn hơn — nhấn mạnh SĐT văn phòng.",
    en: "Email reminder at the D+14 overdue stage. Tone gets firmer — HQ phone is highlighted.",
  },
  EMAIL_RENTAL_DUE_D60: {
    ko: "임대 계약 종료 60일 전 갱신 안내 이메일. 옵션 제시 (갱신·전환·해지).",
    vi: "Email gợi ý gia hạn 60 ngày trước khi hết hợp đồng thuê. Trình bày các lựa chọn (gia hạn / chuyển đổi / kết thúc).",
    en: "Renewal-prompt email 60 days before rental termination. Presents options (renew / convert / end).",
  },
  EMAIL_RENTAL_DUE_D30: {
    ko: "임대 계약 종료 30일 전 갱신 재안내 이메일. D-60 이메일에 응답이 없는 고객 대상.",
    vi: "Email gia hạn lần 2 ở 30 ngày trước khi hết hợp đồng thuê. Gửi cho KH chưa phản hồi email D-60.",
    en: "Second renewal-prompt email 30 days before rental termination, for customers who didn't respond to the D-60 email.",
  },
  EMAIL_RECEIPT: {
    ko: "수금 완료 후 영수증 이메일. 금액 + 결제 수단 + 잔여 회차 정보 포함.",
    vi: "Email biên lai sau khi thu phí. Bao gồm số tiền + phương thức + thông tin chu kỳ còn lại.",
    en: "Receipt email sent after a successful payment. Includes amount, method, and remaining cycle info.",
  },
  EMAIL_TAX_INVOICE: {
    ko: "사무실이 Viettel 포털에서 받은 세금계산서 PDF를 업로드한 직후 자동 발송 (B2B 한정). 첨부 파일 포함.",
    vi: "Tự động gửi ngay khi văn phòng tải lên PDF hóa đơn GTGT từ cổng Viettel (chỉ B2B). Có đính kèm.",
    en: "Auto-sent the moment the office uploads a Viettel-generated tax invoice PDF (B2B only). Includes the attachment.",
  },
  EMAIL_CONTRACT_COPY: {
    ko: "계약서 PDF 사본을 이메일로 재발송. 계약 주체가 포털에서 '계약서 다시 받기' 요청 시 또는 사무실 수동 발송.",
    vi: "Gửi lại bản sao PDF hợp đồng qua email. Khi Bên ký yêu cầu trên cổng hoặc văn phòng gửi thủ công.",
    en: "Re-sends the contract PDF copy via email. Triggered by the Contract Party requesting it on the portal or by manual office send.",
  },
  EMAIL_RENTAL_COMPLETED: {
    ko: "임대 계약이 정상 종료될 때 완료 안내 + 후속 옵션 (장비 인수·교체·반납) 이메일.",
    vi: "Email thông báo khi hợp đồng thuê kết thúc bình thường + các lựa chọn tiếp theo (nhận thiết bị / đổi mới / trả lại).",
    en: "Email sent when a rental contract ends naturally; lays out follow-up options (keep, replace, return the equipment).",
  },
};

export function getTemplateDescription(
  code: string,
  locale: NotificationLocale,
): string {
  const entry = TEMPLATE_DESCRIPTIONS[code];
  if (!entry) return "";
  return entry[locale] ?? entry.vi ?? "";
}
