# eSMS Brandname Application — Seoul Aqua

> ⚠️ **Status (2026-05-26): NOT BLOCKING PHASE 3.5 DEVELOPMENT** ⚠️
>
> Phase 3.5 customer-portal development uses a **mock SMS provider** (`SMS_PROVIDER=mock`) that logs messages to console + DB without delivering. This Brandname application is needed only before **production go-live** (still ~2-3 week telecom lead-time). Recommend submitting ~3-4 weeks before your target production launch date — there is no rush to file it during Phase 3.5 dev.
>
> When `ApiKey` / `SecretKey` / approved Brandname arrive, production rollout is an env-only flip: `SMS_PROVIDER=esms` + populate `ESMS_API_KEY` / `ESMS_SECRET_KEY` / `ESMS_BRANDNAME=SeoulAqua`. No code changes required.

> **Audience:** Seoul Aqua office staff to submit to eSMS.vn account manager.
> **Goal:** Register the Brandname `SeoulAqua` for transactional customer-care SMS (CSKH / SmsType=2) for use by the SOMS customer portal and visit-management system.
> **Lead-time:** 2–3 weeks for Vietnamese telecom approval (per eSMS.vn standard guidance).
> **Format:** This document is presented in English + Vietnamese. The Vietnamese sections (§2, §4) are what telecom auditors review. KO summaries are included for Seoul Aqua office reference.

---

## 한국어 요약 (For Seoul Aqua Office)

이 문서는 eSMS.vn에 **Brandname (발신자명) 등록 신청**을 위해 제출하는 양식입니다. eSMS 계정 매니저에게 이 파일(또는 PDF 변환본)을 전달하면 베트남 통신사 승인 절차가 시작됩니다.

승인 받을 항목:
- **발신자명**: `SeoulAqua` (영문 9자, 대소문자 구분, 공백 없음)
- **용도**: 거래성 고객 응대 SMS (CSKH = Customer Care, SmsType 2) — 광고 SMS 아님
- **포함 메시지 10건**: 포털 가입, 비밀번호 초기화, 방문 알림, 필터 교체 임박, 서비스 요청 접수/승인/반려, 방문 완료, 미수금, 계약 만료

**진행 전 미리 채워야 할 사항** (`<<TODO_...>>` 표시된 부분):
1. 사업자등록증 + 세금등록증 색상 스캔본
2. 회사 대표자 정보 (이름, 직책)
3. 기술/청구 담당자 연락처
4. 회사 등록 주소 (베트남어)
5. (선택) 위임장 — 대표자가 직접 신청하지 않는 경우

승인되면 모든 SMS 본문이 `[SeoulAqua]`로 시작하며, 고객 휴대폰에 "SeoulAqua"로 표시됩니다 (랜덤 발신번호 X).

---

## 1. Company / Brandname Information — Thông tin công ty & Brandname

| Field | Value |
|---|---|
| Legal entity (Tên doanh nghiệp) | **CÔNG TY TNHH MTV TM&DV ĐẠI Á** |
| Trade name (Tên thương mại) | **Seoul Aqua** |
| Tax code (MST — Mã số thuế) | `<<TODO_TAX_CODE>>` |
| Business license number (Số GPKD) | `<<TODO_LICENSE_NUMBER>>` |
| License issue date (Ngày cấp) | `<<TODO_LICENSE_DATE>>` |
| Registered address (Địa chỉ ĐKKD) | `<<TODO_ADDRESS_VI>>` |
| Authorized representative (Người đại diện) | `<<TODO_REPRESENTATIVE_NAME>>` |
| Representative position (Chức vụ) | `<<TODO_REPRESENTATIVE_TITLE>>` |
| **Requested Brandname** | `SeoulAqua` (9 chars, no spaces, case-sensitive) |
| **SMS service category** | CSKH (Chăm sóc khách hàng — Customer Care, transactional) |
| **eSMS SmsType code** | `2` (CSKH primary). If eSMS prefers a split for OTP-only flows, use `24` for `SMS_PORTAL_WELCOME` and `SMS_PASSWORD_RESET`. |
| Production domain | `seoulaqua.com.vn` (corporate); portal at subdomain `portal.seoulaqua.com.vn` |

---

## 2. Use case description — Mô tả mục đích sử dụng (Vietnamese)

Hệ thống quản lý dịch vụ Seoul Aqua (SOMS) gửi tin nhắn giao dịch cho khách hàng đã ký hợp đồng thuê hoặc mua sản phẩm xử lý nước gia dụng và công nghiệp: máy lọc nước, máy lọc không khí, bồn cầu thông minh, và các phụ kiện liên quan.

Tin nhắn được gửi tự động theo các sự kiện sau:
- Kích hoạt tài khoản cổng khách hàng khi ký hợp đồng hoặc giao hàng
- Đặt lại mật khẩu khi nhân viên văn phòng yêu cầu
- Nhắc lịch bảo trì định kỳ trước 1 ngày
- Nhắc thay lõi lọc theo chu kỳ
- Xác nhận đã nhận yêu cầu dịch vụ
- Thông báo phê duyệt hoặc từ chối yêu cầu dịch vụ
- Xác nhận hoàn tất lượt thăm và gửi phiếu công việc
- Nhắc thanh toán phí thuê quá hạn
- Thông báo hợp đồng thuê sắp hết hạn

**Tất cả tin nhắn đều là tin giao dịch (CSKH), không phải tin quảng cáo.** Khách hàng đồng ý nhận tin nhắn này khi ký hợp đồng (xem mục Chính sách bảo mật trong hợp đồng thuê/mua).

Tin nhắn sẽ được gửi bằng tiếng Việt, tiếng Hàn, hoặc tiếng Anh tuỳ theo lựa chọn của từng khách hàng (lưu trong hệ thống). Brandname `SeoulAqua` được sử dụng cho cả ba ngôn ngữ.

---

## 3. Expected monthly volume — Khối lượng tin nhắn dự kiến

Seoul Aqua uses a **two-channel notification system**: only urgent/security/dunning-final messages go through SMS; receipts, acknowledgments, and early-stage reminders go through email (sender: `noreply@seoulaqua.com.vn`). This Brandname application covers the **SMS-only subset (7 templates)**.

| Category — Loại tin | Templates | Est. SMS/month |
|---|---|---:|
| Account / authentication (Tài khoản / xác thực) | #1 Portal Welcome, #2 Password Reset | ~60 |
| Visit reminders (Nhắc lịch thăm — D-1 only) | #3 Visit Reminder | ~900 |
| Service request decisions (Quyết định yêu cầu) | #4 SR Approved (paid), #5 SR Rejected | ~260 |
| Financial / contract final notices (Thông báo cuối) | #6 Overdue D+30, #7 Renewal D-7 | ~25 |
| **Total — Tổng cộng SMS** | 7 templates | **~1,245** |

> Note: Email volume (managed separately by direct sender from `seoulaqua.com.vn` root domain with DKIM/SPF — not eSMS) is estimated at ~1,560 msgs/month for receipts, acknowledgments, and early-stage reminders. Total notification volume across both channels ~2,805/month.

First-month onboarding may add ~200–400 extra SMS as existing customer base receives portal-welcome messages.

---

## 4. Sample message bodies — 10 mẫu tin nhắn

> **Variable notation**: bodies below use `{key}` (developer notation). The eSMS submission form may require either `<<key>>` or `{{key}}` — substitute mechanically. The variable dictionary in §5 lists all keys.
>
> **Character count rule**: Unicode SMS (Vietnamese with diacritics) = 70 chars per single segment, 67 chars per segment in multi-part messages. All bodies below have been validated against realistic substitutions to fit within their declared segment count.

### Template 1 — `SMS_PORTAL_WELCOME`

- **Trigger**: Customer signs a rental/sale contract; portal account auto-created. New OPS contact added by CONTRACT_PARTY also triggers this.
- **Recipient**: New CustomerContact's registered phone (one per contact)
- **Segments**: 2 (Unicode multi-part)

**VI:**
```
[SeoulAqua] Chào {name}. Cổng KH: portal.seoulaqua.com.vn · ID: {phone} · MK tạm: {pwd}. Đổi MK khi đăng nhập đầu.
```

**Sample (with placeholders filled):**
```
[SeoulAqua] Chào Nguyễn Văn A. Cổng KH: portal.seoulaqua.com.vn · ID: 0901234567 · MK tạm: K7m3Px9Qrt. Đổi MK khi đăng nhập đầu.
```

### Template 2 — `SMS_PASSWORD_RESET`

- **Trigger**: MANAGER+ resets a customer password from the office app
- **Recipient**: The contact whose password was reset
- **Segments**: 2

**VI:**
```
[SeoulAqua] MK của {name} đã đặt lại. MK mới: {pwd} · portal.seoulaqua.com.vn. Không phải bạn? LH {hq_phone}
```

**Sample:**
```
[SeoulAqua] MK của Nguyễn Văn A đã đặt lại. MK mới: K7m3Px9Qrt · portal.seoulaqua.com.vn. Không phải bạn? LH 028-1234-5678
```

### Template 3 — `SMS_VISIT_REMINDER`

- **Trigger**: Daily 19:00 cron — sends for all visits scheduled the next day
- **Recipient**: Primary OPS_CONTACT (fallback CONTRACT_PARTY)
- **Segments**: 2 (Unicode multi-part) — ⚠️ pushed from 1-seg to 2-seg after A.10 portal-URL subdomain decision (2026-05-26). VI body went from 70 chars (1-seg) to 77 chars (2-seg). KO body stays at 69 chars (1-seg).

**VI:**
```
[SeoulAqua] {date} {time}, {technician} đến ({service}). Đổi portal.seoulaqua.com.vn
```

**Sample:**
```
[SeoulAqua] 15/06/2026 14:00, Lê Văn B đến (Bảo trì). Đổi portal.seoulaqua.com.vn
```

### Template 4 — `SMS_SR_APPROVED` (paid requests only)

- **Trigger**: Office staff approves a paid service request (free requests use email only, not SMS)
- **Recipient**: Submitter + CONTRACT_PARTY
- **Segments**: 2

**VI:**
```
[SeoulAqua] YC #{req_no} duyệt. Chi phí: {amount}đ · Hẹn: {date}. XN: portal.seoulaqua.com.vn
```

**Sample:**
```
[SeoulAqua] YC #SR-2026-0042 duyệt. Chi phí: 1,500,000đ · Hẹn: 15/06/2026. XN: portal.seoulaqua.com.vn
```

### Template 5 — `SMS_SR_REJECTED`

- **Trigger**: Office staff declines a request
- **Recipient**: The submitting CustomerContact
- **Segments**: 1 (no URL — request lifecycle ends)

**VI:**
```
[SeoulAqua] YC #{req_no} từ chối. Lý do: {reason}. LH {hq_phone}
```

**Sample:**
```
[SeoulAqua] YC #SR-2026-0042 từ chối. Lý do: Hết bảo hành. LH 028-1234-5678
```

### Template 6 — `SMS_PAYMENT_OVERDUE_FINAL` (D+30 only)

- **Trigger**: Cron D+30 after `Invoice.dueDate` (D+7 and D+14 escalation steps are email-only, not part of this Brandname application)
- **Recipient**: CONTRACT_PARTY + all OPS_CONTACTs (CC)
- **Segments**: 2

**VI:**
```
[SeoulAqua] {name}, phí thuê {month} {amount}đ chưa TT. TT: portal.seoulaqua.com.vn hoặc {hq_phone}
```

**Sample:**
```
[SeoulAqua] Nguyễn Văn A, phí thuê T04/2026 1,500,000đ chưa TT. TT: portal.seoulaqua.com.vn hoặc 028-1234-5678
```

### Template 7 — `SMS_CONTRACT_RENEWAL_FINAL` (D-7 only)

- **Trigger**: Cron D-7 before `Contract.endDate` (36-month rental); D-60 and D-30 are email-only
- **Recipient**: CONTRACT_PARTY only
- **Segments**: 2

**VI:**
```
[SeoulAqua] {name}, HĐ thuê hết hạn {date} (còn {days} ngày). Chuyển SH/bảo trì: portal.seoulaqua.com.vn / {hq_phone}
```

**Sample:**
```
[SeoulAqua] Nguyễn Văn A, HĐ thuê hết hạn 15/06/2026 (còn 14 ngày). Chuyển SH/bảo trì: portal.seoulaqua.com.vn / 028-1234-5678
```

### Fallback notes (in case eSMS flags Vietnamese abbreviations)

The following abbreviations are common in Vietnamese CSKH SMS but may occasionally be flagged for clarity during Brandname review:

| Abbreviation | Full term | Used in |
|---|---|---|
| `MK` | Mật khẩu | #1, #2 |
| `KH` | Khách hàng | #1 |
| `YC` | Yêu cầu | #5, #6, #7 |
| `TT` | Thanh toán | #9 |
| `HĐ` | Hợp đồng | #10 |
| `SH` | Sở hữu | #10 |
| `LH` | Liên hệ | #7 |
| `XN` | Xác nhận | #6 |

If any are rejected, the unabridged versions add ~5–10 chars each, pushing the affected template from 1 to 2 segments (or 2 to 3 segments). This is acceptable — please request which specific abbreviations need to be expanded and we will resubmit.

---

## 5. Variable dictionary — Từ điển biến

| Variable | Description (EN / VI) | Max length | Sample (VI) |
|---|---|---:|---|
| `{name}` | Customer contact name / Tên khách hàng | 30 chars | `Nguyễn Văn A` |
| `{phone}` | Phone number (login ID) / Số điện thoại | 11 digits | `0901234567` |
| `{pwd}` | Auto-generated temp password / Mật khẩu tạm | 10 chars | `K7m3Px9Qrt` |
| `{date}` | Date (DD/MM/YYYY for VI) / Ngày | 10 chars | `15/06/2026` |
| `{time}` | Time HH:MM (24h) / Giờ | 5 chars | `14:00` |
| `{technician}` | Technician name / Tên kỹ thuật viên | 30 chars | `Lê Văn B` |
| `{service}` | Service type, short / Loại dịch vụ | 15 chars | `Bảo trì` |
| `{equipment}` | Equipment + model / Thiết bị | 20 chars | `máy lọc PTS-2100` |
| `{req_no}` | Service request number / Mã yêu cầu | 15 chars | `SR-2026-0042` |
| `{amount}` | VND amount, thousand-sep / Số tiền | 12 chars | `1,500,000` |
| `{summary}` | Work summary / Tóm tắt công việc | 30 chars | `Thay 3 lõi lọc` |
| `{next_date}` | Next visit date / Ngày thăm kế tiếp | 10 chars | `15/08/2026` |
| `{reason}` | Rejection reason / Lý do từ chối | 40 chars | `Hết bảo hành` |
| `{month}` | Month (T-prefix VN format) / Tháng | 8 chars | `T04/2026` |
| `{days}` | Days remaining / Số ngày còn lại | 3 chars | `14` |
| `{hq_phone}` | HQ contact number / Số điện thoại văn phòng | 13 chars | `028-1234-5678` |

> **Fixed values** (not variables):
> - Brand prefix: `[SeoulAqua]` (always present at the start of every body)
> - Portal URL: `portal.seoulaqua.com.vn` (hardcoded in every body, not a variable, to maximize compression)

---

## 6. Required attachments — Tài liệu đính kèm

Submit these separately to eSMS (PDF/image scans):

- [ ] Business license (Giấy phép đăng ký kinh doanh) — color scan PDF
- [ ] Tax registration (Đăng ký mã số thuế)
- [ ] Authorization letter (Giấy uỷ quyền) — only if account holder is not the legal representative
- [ ] Sample contract or privacy policy (Hợp đồng mẫu / Chính sách bảo mật) showing customer consent to receive SMS

---

## 7. Contact for eSMS coordination — Liên hệ phối hợp eSMS

| Role | Name | Email | Phone |
|---|---|---|---|
| Technical contact (Kỹ thuật) | `<<TODO_TECH_CONTACT_NAME>>` | `<<TODO_TECH_CONTACT_EMAIL>>` | `<<TODO_TECH_CONTACT_PHONE>>` |
| Billing contact (Thanh toán) | `<<TODO_BILLING_CONTACT_NAME>>` | `<<TODO_BILLING_CONTACT_EMAIL>>` | `<<TODO_BILLING_CONTACT_PHONE>>` |
| Expected go-live (Ngày dự kiến) | Phase 3.5 — approximately `<<TODO_GO_LIVE_TARGET>>` | | |

---

## 8. Cost / Pricing breakdown — Báo giá chi tiết

가격 정보 요약 (한국어): eSMS.vn 공식 페이지 일부 비공개로, Stringeex 집계 + SpeedSMS 공시가를 기준으로 정리한 시장 평균입니다. 정식 견적은 eSMS hotline (`0901 888 484`)에서 받아 보강하시기 바랍니다.

### 8.1 Brandname registration + monthly maintenance — Đăng ký Brandname + Phí duy trì

| Network — Nhà mạng | Registration (1회) | Monthly maintenance (월) |
|---|---:|---:|
| Viettel (general) | 50,000 VND | 50,000 VND/mo |
| Viettel (Banking/Finance) | 550,000 VND | 550,000 VND/mo |
| MobiFone | 50,000 VND | 50,000 VND/mo |
| VinaPhone | 50,000 VND | 50,000 VND/mo |
| Vietnamobile | 50,000 VND | 50,000 VND/mo |
| Gmobile / Itel | **Free** | **Free** |

Seoul Aqua = "general" (Other Business) classification. 4 networks selected (Big 3 + Vietnamobile) + Gmobile (free):
- **One-time registration**: 50,000 × 4 = **200,000 VND** (~₩10,800)
- **Monthly maintenance**: 50,000 × 4 = **200,000 VND/month** (~₩10,800/month)

### 8.2 Per-segment send rate — Đơn giá theo segment

Per-segment rate (incl. 10% VAT) — Vietnamese networks by business category. Seoul Aqua = "Other Business" row:

| Category — Phân loại | MobiFone | VinaPhone | Viettel | Vietnamobile | Gmobile | Itel |
|---|---:|---:|---:|---:|---:|---:|
| Healthcare / Education (preferential) | 440 | 430 | 440 | 1,550 | 400 | 850 |
| **Other Business (Seoul Aqua)** | **830** | **830** | **830** | **1,550** | **400** | **850** |
| Banking / Finance / Insurance | 830 | 830 | 830 | 1,550 | 400 | 850 |
| Social Media | 600 | 600 | 600 | 1,550 | 400 | 850 |
| E-commerce | 600 | 600 | 600 | 1,550 | 400 | 850 |

> Unicode SMS (Vietnamese with diacritics) = 70 chars per single segment, 67 chars per segment in multi-part. Multi-segment messages multiply by segment count.

### 8.3 Message-length × segment cost — Chi phí theo độ dài tin

Big 3 carriers (Seoul Aqua's primary customer base):

| Message length | Segments | Big 3 rate | Vietnamobile | Gmobile |
|---|:-:|---:|---:|---:|
| ≤ 70 chars (1-seg) | 1 | **830 VND** | 1,550 | 400 |
| 71–134 chars (2-seg) | 2 | **1,660 VND** | 3,100 | 800 |
| 135–201 chars (3-seg) | 3 | **2,490 VND** | 4,650 | 1,200 |

### 8.4 Seoul Aqua monthly cost estimate — Chi phí tháng dự kiến

Assumed customer carrier mix: Big 3 ≈ 70%, Vietnamobile ≈ 25%, Gmobile ≈ 5%. Volume: ~1,245 SMS/month (per §3). VI:KO:EN language mix 80%:15%:5%.

> **Revised 2026-05-26 (v1.3)** after client A.10 portal-URL decision: `portal.seoulaqua.com.vn` subdomain (23 chars) instead of root URL (16 chars) pushed `SMS_VISIT_REMINDER` VI from 1-seg to 2-seg.

| Item — Hạng mục | Volume × rate | Monthly cost |
|---|---|---:|
| 1-seg SMS (A.3 KO ~135 + A.3 EN ~45 + A.7 ~10 = ~190) | 190 × ~950 VND (weighted avg) | ~180K VND |
| 2-seg SMS (A.1, A.2, A.6, A.9, A.10 + A.3 VI ~720) | ~1,055 × ~1,900 VND | ~2.00M VND |
| **SMS send subtotal** | | **~2.18M VND/mo** |
| Brandname maintenance (4 networks) | 50K × 4 | **0.20M VND/mo** |
| **Monthly total (SMS only)** | | **≈ 2.38M VND/mo (≈ ₩129K)** |

> **Regression from earlier estimate**: +600K VND/mo from A.3 VI 1→2 seg flip after subdomain URL choice. Original estimate with root URL was 1.70M VND/mo.
>
> Email channel (separate from this Brandname application, sent directly from `seoulaqua.com.vn` root domain via Resend) is estimated to add **~$0–20/month** (within Resend free tier of 100K msgs/mo at the projected ~1,560 msgs/mo).

### 8.5 1-year cost estimate — Ước tính chi phí 1 năm

| Line item — Hạng mục | Amount (VND) | Equivalent (KRW) |
|---|---:|---:|
| Registration (one-time, 4 networks × 50K) | 200,000 | ~₩10,800 |
| Monthly maintenance × 12 | 2,400,000 | ~₩129,600 |
| SMS sends (avg 2.18M × 12) | 26,160,000 | ~₩1.41M |
| First-month onboarding spike (PORTAL_WELCOME wave) | ~400,000 | ~₩21,600 |
| **1-year total** | **≈ 29.2M VND** | **≈ ₩1.57M** |

### 8.6 All applicable fees checklist — Tất cả các loại phí

| # | Fee — Loại phí | Frequency | Amount / Condition |
|---|---|---|---|
| 1 | Brandname registration | One-time per network | 50K × 4 = 200K VND |
| 2 | Monthly Brandname maintenance | Monthly × per network | 50K × 4 = 200K VND/mo |
| 3 | Per-segment send rate | Per SMS sent | 830 VND/seg (Big 3), incl. 10% VAT |
| 4 | eSMS account setup | One-time | 0 VND (eSMS direct; resellers may add 200K) |
| 5 | Minimum top-up | One-time deposit | ~500,000 VND minimum recharge |
| 6 | Dormancy penalty | Inactive for X months | Brandname may auto-deregister; re-registration 2–3 weeks + 50K |
| 7 | VAT 10% | All items | Above prices include VAT (Stringeex source); confirm with eSMS direct quote |
| 8 | Banking/Finance category fee | If reclassified | 550K registration + 550K/mo (Seoul Aqua does NOT qualify) |
| 9 | Healthcare/Education discount | If qualified | 430–440 VND/seg (Seoul Aqua does NOT qualify) |
| 10 | Volume discount | Above 5,000 msgs/mo | Negotiable via eSMS hotline 5–10% |
| 11 | International SMS | Non-VN phone numbers | 4–6× domestic rate (Seoul Aqua N/A — all VN customers) |
| 12 | Brandname change / re-registration | After approval | Re-review 2–3 weeks + new registration fee |
| 13 | Failed delivery | Not billed | Only successful submits are charged |

### 8.7 Cost-reduction options — Phương án giảm chi phí

1. **Exclude Vietnamobile** (~25% customer base) — saves 50K/mo maintenance but Vietnamobile customers won't receive SMS. Not recommended unless that customer segment is negligible.
2. **OTP type split** (SmsType=24 for `SMS_PORTAL_WELCOME` and `SMS_PASSWORD_RESET`) — some OTP categories are cheaper. Requires separate carrier approval.
3. **Email-first for non-urgent** (already implemented in this design — see SOMS notification router §C of `DOCUMENT_TEMPLATES.md`). 60% cost reduction vs all-SMS.
4. **Volume negotiation**: at 1.2K+ msgs/month consistent, request 5–10% discount via eSMS hotline.

### 8.8 Recommended next steps — Hành động đề xuất

| Priority | Action — Việc cần làm | Timeline |
|---|---|---|
| ★ 1 | Call eSMS hotline `0901 888 484` for official Seoul Aqua quote (table above is market average) | Immediate |
| ★ 2 | Decide which networks to register (recommend Big 3 + Vietnamobile + Gmobile-free) | When F.4 answered |
| 3 | Verify whether OTP split (SmsType=24) is viable | During Brandname submission |
| 4 | Negotiate volume discount after 1st-month send data | Month 2 |

### 8.9 Source data references — Nguồn tham khảo

- Stringeex (multi-provider aggregator): `https://stringeex.com/vi/blog/post/bao-gia-sms-brandname`
- SpeedSMS (provider reference): `https://speedsms.vn/bang-gia-dich-vu-tin-nhan-thuong-hieu-cskh/`
- eSMS official pricing policy: `https://esms.vn/chinh-sach-gia` (broad rates published; specific carrier × segment table available only via direct quote)

---

## 9. Notes for Seoul Aqua office — 사무실 참고사항

- Templates use compressed Vietnamese abbreviations (`MK`, `KH`, `YC`, `TT`, `HĐ`, `SH`, `LH`, `XN`, `KTV`) common in Vietnamese CSKH SMS. If eSMS or any carrier rejects them, we have unabridged 3-segment fallbacks ready — see §4 fallback notes above.
- Each template will be sent in the customer's chosen language (VI / KO / EN) based on `CustomerContact.language`. **eSMS only reviews the VI versions** for Brandname approval; KO/EN are stored in our system and rendered through the same Brandname.
- Verified character counts use the URL `portal.seoulaqua.com.vn` (23 chars, subdomain confirmed by client A.10 2026-05-26). The earlier 16-char root URL assumption is superseded — `SMS_VISIT_REMINDER` VI is now 2-seg. If eSMS requires URL link-tracking (e.g., shortened URLs through their tracking domain), additional segment growth is possible — please confirm eSMS's URL tracking policy before resubmitting.
- The Brandname `SeoulAqua` is locked once approved; changes require a new submission and another 2-3 week review.
<!-- portfolio:drop-start -->
- This application covers **7 SMS templates only**. An additional 9 email templates (receipts, acknowledgments, early-stage reminders) are sent directly from `seoulaqua.com.vn` root domain via Resend (transactional) + vhost.vn (operational), and do not require eSMS Brandname registration. See `docs/DOCUMENT_TEMPLATES.md` §B for the full email template catalog and §C for the channel selection rule.
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
- This application covers **7 SMS templates only**. An additional 9 email templates (receipts, acknowledgments, early-stage reminders) are sent directly from `seoulaqua.com.vn` root domain via Resend (single ESP), and do not require eSMS Brandname registration. See `docs/DOCUMENT_TEMPLATES.md` §B for the full email template catalog and §C for the channel selection rule.
portfolio:add-end -->
- **Mock-first dev (2026-05-26 decision)**: Phase 3.5 implementation does not wait on this approval. The codebase ships with `SMS_PROVIDER=mock` that logs sends to console + `SmsLog` table with `status='MOCKED'`. When eSMS approval lands and credentials arrive, production env flips to `SMS_PROVIDER=esms` with no code rewrite. Submit this form when you know your production launch date.

---

## Change log

- **2026-05-26 (v1.2 latest)** — Status banner added at top: this application is no longer a Phase 3.5 blocker. Mock SMS provider (`SMS_PROVIDER=mock`) covers dev/staging; this form is needed only before production go-live (still 2-3 week telecom lead-time, submit ~3-4 weeks before target launch). No template content changes.
- **2026-05-26 (v1.3 latest)** — **Client answer A.10 applied**: portal URL changed from root `seoulaqua.com.vn` (16 chars) to **subdomain `portal.seoulaqua.com.vn` (23 chars)**. All 7 SMS sample bodies updated. **Template 3 (`SMS_VISIT_REMINDER`) VI flipped from 1-seg to 2-seg** (70 → 77 chars). §8 monthly cost revised: ~1.70M → ~2.38M VND/mo (+0.68M/mo regression). 1-year total revised: ~21.0M → ~29.2M VND/yr. All other templates unaffected at segment level. Email channel sender domain confirmed as `seoulaqua.com.vn` root (not portal subdomain).
- **2026-05-26 (v1.1)** — Template count reduced 10 → 7 (email-eligible templates moved to direct email channel; only urgent/security/dunning-final/D-1 messages remain as SMS). §3 volume estimate revised from ~2,695 to ~1,245 SMS/mo. §8 Pricing breakdown added with verified eSMS rates (830 VND/seg Other Business, 50K/mo per network maintenance), 1-year cost estimate ~21M VND, and all-fees checklist. Numbering: previous §8 Notes is now §9 (after §8 Pricing was inserted).
- **2026-05-26** — v1 initial draft. 10 templates locked. Awaiting eSMS account manager review.
