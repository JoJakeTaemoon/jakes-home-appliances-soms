# SMS 문안 등록 현황 — eSMS Brandname `SEOUL AQUA`

> 최종 갱신 2026-09-24. 실측은 2026-09-12 기준, 문안은 ViHAT 회신을 반영해 재작성했습니다.
> 재현 명령: `ESMS_PROBE_LIVE=1 npx tsx scripts/esms-probe.ts <번호>`

## 1. 현재 상태

2026-09-12에 당시 문안 8종 × 3개 언어를 실제로 발송해 통신사 판정을 받은 결과, 정기점검 알림 하나만 통과하고 나머지는 전부 코드 146으로 거부됐습니다. 이후 ViHAT 회신을 받아 문안을 다시 작성했습니다. 직원 비밀번호 복구 인증코드는 2026-09-24에 기능 자체가 폐지되어 등록 대상에서 빠졌고, 남은 문안은 7종입니다.

| 상황 | 문안 코드 | 베트남어 | 영어 |
|---|---|:-:|:-:|
| 고객 포털 계정 발급 | `SMS_PORTAL_WELCOME` | ⏳ 등록 요청 대상 | ⏳ 등록 요청 대상 |
| 고객 포털 비밀번호 초기화 | `SMS_PASSWORD_RESET` | ⏳ 등록 요청 대상 | ⏳ 등록 요청 대상 |
| 정기점검 방문 D-1 알림 | `SMS_VISIT_REMINDER` | ✅ 등록 완료 | ✅ 등록 완료 |
| 유상 서비스 요청 승인 | `SMS_SR_APPROVED` | ⏳ 등록 요청 대상 | ⏳ 등록 요청 대상 |
| 서비스 요청 반려 | `SMS_SR_REJECTED` | ⏳ 등록 요청 대상 | ⏳ 등록 요청 대상 |
| 임대료 미납 최종 독촉 D+30 | `SMS_PAYMENT_OVERDUE_FINAL` | ⏳ 등록 요청 대상 | ⏳ 등록 요청 대상 |
| 임대 만료 최종 안내 D-7 | `SMS_CONTRACT_RENEWAL_FINAL` | ⏳ 등록 요청 대상 | ⏳ 등록 요청 대상 |

## 2. 확정된 규칙

**한국어는 등록하지 않습니다.** ViHAT이 한국어 7건 전부에 `Không hỗ trợ tiếng Hàn`으로 회신했습니다. 한국어를 쓰는 고객에게는 **영어 문안**을 발송합니다. 코드에서도 SMS 문안의 한국어 자리가 영어 본문을 그대로 가리키도록 했습니다.

**베트남어는 성조 없이 등록합니다.** 성조가 있으면 한 통에 70자, 없으면 160자입니다. 무성조로 바꾸면서 가운뎃점과 통화기호도 아스키로 정리해, **14개 본문이 모두 1세그먼트에 들어갑니다.** 이전에는 대부분 2세그먼트였으므로 발송 단가가 절반이 됩니다.

**링크는 고정 주소를 본문에 직접 씁니다.** 통신사가 고정 링크 등록을 요구했습니다. 주소는 `soms.seoulaqua.com.vn` 하나로 통일했습니다. 문안에 `{url}` 변수는 더 이상 없습니다.

**변수 값도 성조를 제거해 발송합니다.** 고객 이름에 성조가 하나라도 들어가면 무성조로 등록한 문안이라도 유니코드로 바뀝니다. 발송 공통 경로에서 아스키 본문일 때 변수 값을 자동으로 변환합니다.

## 3. 등록 완료 — 추가 작업 없음

### 정기점검 방문 D-1 알림 (`SMS_VISIT_REMINDER`)

| 언어 | 본문 | 길이 | 세그먼트 |
|---|---|---:|---:|
| 베트남어 | `TB BAO TRI DINH KY: KTV cua SEOUL AQUA du kien se den bao tri {equipment} cua QK vao {datetime}. Neu QK can doi khung gio khac vui long LH: 0768902009.` | 151 | 1 |
| 영어 | `MAINTENANCE NOTICE: SEOUL AQUA technician will service your {equipment} on {datetime}. To reschedule, please contact 0768902009.` | 128 | 1 |

`{equipment}`는 50자, `{datetime}`은 40자까지입니다. 고정 문구가 130자라 두 값의 합이 30자를 넘으면 2세그먼트가 됩니다.

## 4. 등록 요청 대상 — 14건

언어별로 나눴습니다. `{변수}` 자리는 슬롯으로 등록하고, 옆 숫자는 요청할 최대 길이입니다.

### 4.1 베트남어 — 7건

**고객 포털 계정 발급** · `SMS_PORTAL_WELCOME`

- 본문: `[SeoulAqua] Chao {name}. Cong KH: soms.seoulaqua.com.vn - ID: {phone} - MK tam: {pwd}. Doi MK khi dang nhap dau.`
- 실제 예시: `[SeoulAqua] Chao Nguyen Van An. Cong KH: soms.seoulaqua.com.vn - ID: 0901234567 - MK tam: Ab12Cd34Ef. Doi MK khi dang nhap dau.`
- 변수: `{name}` ≤ 50, `{phone}` ≤ 15, `{pwd}` ≤ 10
- 길이: 112자 · 1세그먼트

**고객 포털 비밀번호 초기화** · `SMS_PASSWORD_RESET`

- 본문: `[SeoulAqua] MK cua {name} da dat lai. MK moi: {pwd} - soms.seoulaqua.com.vn. Khong phai ban? LH {hq_phone}`
- 실제 예시: `[SeoulAqua] MK cua Nguyen Van An da dat lai. MK moi: Ab12Cd34Ef - soms.seoulaqua.com.vn. Khong phai ban? LH 0768902009`
- 변수: `{name}` ≤ 50, `{pwd}` ≤ 10, `{hq_phone}` ≤ 15
- 길이: 106자 · 1세그먼트

**유상 서비스 요청 승인** · `SMS_SR_APPROVED`

- 본문: `[SeoulAqua] YC #{req_no} duyet. Chi phi: {amount}d - Hen: {date}. XN: soms.seoulaqua.com.vn`
- 실제 예시: `[SeoulAqua] YC #12345 duyet. Chi phi: 500.000d - Hen: 30/09/2026. XN: soms.seoulaqua.com.vn`
- 변수: `{req_no}` ≤ 10, `{amount}` ≤ 15, `{date}` ≤ 20
- 길이: 91자 · 1세그먼트

**서비스 요청 반려** · `SMS_SR_REJECTED`

- 본문: `[SeoulAqua] YC #{req_no} tu choi. Ly do: {reason}. LH {hq_phone}`
- 실제 예시: `[SeoulAqua] YC #12345 tu choi. Ly do: Het thoi han bao hanh. LH 0768902009`
- 변수: `{req_no}` ≤ 10, `{reason}` ≤ 60, `{hq_phone}` ≤ 15
- 길이: 64자 · 1세그먼트

**임대료 미납 최종 독촉 D+30** · `SMS_PAYMENT_OVERDUE_FINAL`

- 본문: `[SeoulAqua] {name}, phi thue {month} {amount}d chua TT. TT: soms.seoulaqua.com.vn hoac {hq_phone}`
- 실제 예시: `[SeoulAqua] Nguyen Van An, phi thue 09/2026 500.000d chua TT. TT: soms.seoulaqua.com.vn hoac 0768902009`
- 변수: `{name}` ≤ 50, `{month}` ≤ 10, `{amount}` ≤ 15, `{hq_phone}` ≤ 15
- 길이: 97자 · 1세그먼트

**임대 만료 최종 안내 D-7** · `SMS_CONTRACT_RENEWAL_FINAL`

- 본문: `[SeoulAqua] {name}, HD thue het han {date} (con {days} ngay). Chuyen SH/bao tri: soms.seoulaqua.com.vn / {hq_phone}`
- 실제 예시: `[SeoulAqua] Nguyen Van An, HD thue het han 30/09/2026 (con 7 ngay). Chuyen SH/bao tri: soms.seoulaqua.com.vn / 0768902009`
- 변수: `{name}` ≤ 50, `{date}` ≤ 20, `{days}` ≤ 4, `{hq_phone}` ≤ 15
- 길이: 115자 · 1세그먼트

### 4.2 영어 — 7건

**고객 포털 계정 발급** · `SMS_PORTAL_WELCOME`

- 본문: `[SeoulAqua] Welcome {name}. Portal: soms.seoulaqua.com.vn - ID: {phone} - Temp PW: {pwd}. Change PW on first login.`
- 실제 예시: `[SeoulAqua] Welcome Nguyen Van An. Portal: soms.seoulaqua.com.vn - ID: 0901234567 - Temp PW: Ab12Cd34Ef. Change PW on first login.`
- 변수: `{name}` ≤ 50, `{phone}` ≤ 15, `{pwd}` ≤ 10
- 길이: 115자 · 1세그먼트

**고객 포털 비밀번호 초기화** · `SMS_PASSWORD_RESET`

- 본문: `[SeoulAqua] {name}, password reset. New PW: {pwd} - soms.seoulaqua.com.vn. If not you: {hq_phone}`
- 실제 예시: `[SeoulAqua] Nguyen Van An, password reset. New PW: Ab12Cd34Ef - soms.seoulaqua.com.vn. If not you: 0768902009`
- 변수: `{name}` ≤ 50, `{pwd}` ≤ 10, `{hq_phone}` ≤ 15
- 길이: 97자 · 1세그먼트

**유상 서비스 요청 승인** · `SMS_SR_APPROVED`

- 본문: `[SeoulAqua] Request #{req_no} approved. Cost: {amount} VND - Visit: {date}. Confirm: soms.seoulaqua.com.vn`
- 실제 예시: `[SeoulAqua] Request #12345 approved. Cost: 500.000 VND - Visit: 30/09/2026. Confirm: soms.seoulaqua.com.vn`
- 변수: `{req_no}` ≤ 10, `{amount}` ≤ 15, `{date}` ≤ 20
- 길이: 106자 · 1세그먼트

**서비스 요청 반려** · `SMS_SR_REJECTED`

- 본문: `[SeoulAqua] Request #{req_no} declined. Reason: {reason}. Contact {hq_phone}`
- 실제 예시: `[SeoulAqua] Request #12345 declined. Reason: Het thoi han bao hanh. Contact 0768902009`
- 변수: `{req_no}` ≤ 10, `{reason}` ≤ 60, `{hq_phone}` ≤ 15
- 길이: 76자 · 1세그먼트

**임대료 미납 최종 독촉 D+30** · `SMS_PAYMENT_OVERDUE_FINAL`

- 본문: `[SeoulAqua] {name}, {month} rental {amount} VND overdue. Pay soms.seoulaqua.com.vn or {hq_phone}`
- 실제 예시: `[SeoulAqua] Nguyen Van An, 09/2026 rental 500.000 VND overdue. Pay soms.seoulaqua.com.vn or 0768902009`
- 변수: `{name}` ≤ 50, `{month}` ≤ 10, `{amount}` ≤ 15, `{hq_phone}` ≤ 15
- 길이: 96자 · 1세그먼트

**임대 만료 최종 안내 D-7** · `SMS_CONTRACT_RENEWAL_FINAL`

- 본문: `[SeoulAqua] {name}, rental ends {date} ({days} days left). Transfer/maintenance: soms.seoulaqua.com.vn / {hq_phone}`
- 실제 예시: `[SeoulAqua] Nguyen Van An, rental ends 30/09/2026 (7 days left). Transfer/maintenance: soms.seoulaqua.com.vn / 0768902009`
- 변수: `{name}` ≤ 50, `{date}` ≤ 20, `{days}` ≤ 4, `{hq_phone}` ≤ 15
- 길이: 115자 · 1세그먼트

## 5. ViHAT 회신 반영 내역

2026-09-19 회신에서 요구한 네 가지를 모두 반영했습니다.

| ViHAT 요구 | 반영 |
|---|---|
| 변수를 채운 실제 발송 문안 추가 | §6 표의 「Nội dung thực tế」 칸에 예시 값을 넣었습니다 |
| 링크는 고정 링크로 등록 | `{url}` 변수를 없애고 `soms.seoulaqua.com.vn`을 본문에 직접 썼습니다 |
| 성조 유무 확정 | 무성조로 등록합니다 |
| 한국어 미지원 | 한국어 7건을 요청에서 뺐습니다. 한국어 고객은 영어로 받습니다 |

## 6. ViHAT 제출용 요청서 (베트남어)

담당자 `thaoltt@vihatgroup.com`에게 보내면 됩니다. 같은 내용을 `docs/SMS_TEMPLATE_REGISTRATION_REQUEST.docx`로도 만들어 두었습니다.

---

**Đăng ký thêm mẫu tin CSKH cho Brandname `SEOUL AQUA`**

Kính gửi anh/chị,

Cảm ơn anh/chị đã phản hồi. Chúng tôi đã chỉnh sửa theo đúng bốn yêu cầu: bổ sung nội dung thực tế đã gồm biến, dùng link cố định thay cho biến, đăng ký nội dung **không dấu**, và bỏ toàn bộ mẫu tiếng Hàn.

Link cố định dùng chung cho mọi mẫu: **soms.seoulaqua.com.vn**

Tất cả nội dung dưới đây đều không dấu và nằm gọn trong 1 segment (≤160 ký tự).

| # | Tình huống | Ngôn ngữ | Nội dung đăng ký | Nội dung thực tế |
|---:|---|---|---|---|
| 1 | Cấp tài khoản cổng khách hàng | Tiếng Việt | `[SeoulAqua] Chao {name}. Cong KH: soms.seoulaqua.com.vn - ID: {phone} - MK tam: {pwd}. Doi MK khi dang nhap dau.` | `[SeoulAqua] Chao Nguyen Van An. Cong KH: soms.seoulaqua.com.vn - ID: 0901234567 - MK tam: Ab12Cd34Ef. Doi MK khi dang nhap dau.` |
| 2 | Cấp tài khoản cổng khách hàng | Tiếng Anh | `[SeoulAqua] Welcome {name}. Portal: soms.seoulaqua.com.vn - ID: {phone} - Temp PW: {pwd}. Change PW on first login.` | `[SeoulAqua] Welcome Nguyen Van An. Portal: soms.seoulaqua.com.vn - ID: 0901234567 - Temp PW: Ab12Cd34Ef. Change PW on first login.` |
| 3 | Đặt lại mật khẩu cổng khách hàng | Tiếng Việt | `[SeoulAqua] MK cua {name} da dat lai. MK moi: {pwd} - soms.seoulaqua.com.vn. Khong phai ban? LH {hq_phone}` | `[SeoulAqua] MK cua Nguyen Van An da dat lai. MK moi: Ab12Cd34Ef - soms.seoulaqua.com.vn. Khong phai ban? LH 0768902009` |
| 4 | Đặt lại mật khẩu cổng khách hàng | Tiếng Anh | `[SeoulAqua] {name}, password reset. New PW: {pwd} - soms.seoulaqua.com.vn. If not you: {hq_phone}` | `[SeoulAqua] Nguyen Van An, password reset. New PW: Ab12Cd34Ef - soms.seoulaqua.com.vn. If not you: 0768902009` |
| 5 | Mã xác thực khôi phục mật khẩu nhân viên | Tiếng Việt | `[SeoulAqua] Ma xac thuc khoi phuc mat khau: {code} (hieu luc {minutes} phut). Khong phai ban? Bao quan tri vien ngay.` | `[SeoulAqua] Ma xac thuc khoi phuc mat khau: 123456 (hieu luc 10 phut). Khong phai ban? Bao quan tri vien ngay.` |
| 6 | Mã xác thực khôi phục mật khẩu nhân viên | Tiếng Anh | `[SeoulAqua] Password recovery code: {code} (valid {minutes} min). If this wasn't you, alert your admin immediately.` | `[SeoulAqua] Password recovery code: 123456 (valid 10 min). If this wasn't you, alert your admin immediately.` |
| 7 | Duyệt yêu cầu dịch vụ có phí | Tiếng Việt | `[SeoulAqua] YC #{req_no} duyet. Chi phi: {amount}d - Hen: {date}. XN: soms.seoulaqua.com.vn` | `[SeoulAqua] YC #12345 duyet. Chi phi: 500.000d - Hen: 30/09/2026. XN: soms.seoulaqua.com.vn` |
| 8 | Duyệt yêu cầu dịch vụ có phí | Tiếng Anh | `[SeoulAqua] Request #{req_no} approved. Cost: {amount} VND - Visit: {date}. Confirm: soms.seoulaqua.com.vn` | `[SeoulAqua] Request #12345 approved. Cost: 500.000 VND - Visit: 30/09/2026. Confirm: soms.seoulaqua.com.vn` |
| 9 | Từ chối yêu cầu dịch vụ | Tiếng Việt | `[SeoulAqua] YC #{req_no} tu choi. Ly do: {reason}. LH {hq_phone}` | `[SeoulAqua] YC #12345 tu choi. Ly do: Het thoi han bao hanh. LH 0768902009` |
| 10 | Từ chối yêu cầu dịch vụ | Tiếng Anh | `[SeoulAqua] Request #{req_no} declined. Reason: {reason}. Contact {hq_phone}` | `[SeoulAqua] Request #12345 declined. Reason: Het thoi han bao hanh. Contact 0768902009` |
| 11 | Nhắc nợ phí thuê lần cuối (D+30) | Tiếng Việt | `[SeoulAqua] {name}, phi thue {month} {amount}d chua TT. TT: soms.seoulaqua.com.vn hoac {hq_phone}` | `[SeoulAqua] Nguyen Van An, phi thue 09/2026 500.000d chua TT. TT: soms.seoulaqua.com.vn hoac 0768902009` |
| 12 | Nhắc nợ phí thuê lần cuối (D+30) | Tiếng Anh | `[SeoulAqua] {name}, {month} rental {amount} VND overdue. Pay soms.seoulaqua.com.vn or {hq_phone}` | `[SeoulAqua] Nguyen Van An, 09/2026 rental 500.000 VND overdue. Pay soms.seoulaqua.com.vn or 0768902009` |
| 13 | Thông báo hết hạn hợp đồng thuê (D-7) | Tiếng Việt | `[SeoulAqua] {name}, HD thue het han {date} (con {days} ngay). Chuyen SH/bao tri: soms.seoulaqua.com.vn / {hq_phone}` | `[SeoulAqua] Nguyen Van An, HD thue het han 30/09/2026 (con 7 ngay). Chuyen SH/bao tri: soms.seoulaqua.com.vn / 0768902009` |
| 14 | Thông báo hết hạn hợp đồng thuê (D-7) | Tiếng Anh | `[SeoulAqua] {name}, rental ends {date} ({days} days left). Transfer/maintenance: soms.seoulaqua.com.vn / {hq_phone}` | `[SeoulAqua] Nguyen Van An, rental ends 30/09/2026 (7 days left). Transfer/maintenance: soms.seoulaqua.com.vn / 0768902009` |

Phần trong dấu `{ }` là tham số thay đổi theo từng tin. Độ dài tối đa của từng tham số có trong phụ lục kỹ thuật, và hệ thống của chúng tôi tự động loại bỏ dấu tiếng Việt khỏi giá trị tham số trước khi gửi, nên nội dung thực tế luôn không dấu.

Mục đích sử dụng giống hồ sơ Brandname đã nộp: tin chăm sóc khách hàng (CSKH) gửi tới khách hàng đang có hợp đồng thuê hoặc bảo trì với Seoul Aqua.

Nhờ anh/chị cho biết mẫu nào cần chỉnh sửa thêm và thời gian dự kiến hoàn tất. Xin cảm ơn.

---

## 7. 재검증

등록 완료 회신을 받으면 같은 명령으로 확인합니다. 실제 발송이므로 본인 번호를 쓰세요.

```bash
ESMS_PROBE_LIVE=1 npx tsx scripts/esms-probe.ts 0961122564
```

결과는 관리자 화면 「설정 → 알림 발송 내역」에도 그대로 쌓입니다. 실패한 줄에는 거부 사유가 코드와 함께 남습니다.

## 변경 이력

- **2026-09-24** — 직원 셀프 비밀번호 복구 기능 폐지. `SMS_STAFF_RESET_CODE` 등록 요청 목록에서 삭제. 직원은 관리자에게 전화로 연락하고, 관리자가 「관리자 → 사용자 관리」에서 임시 비밀번호를 발급해 구두로 전달합니다 — 임시 비밀번호는 SMS로 나가지 않습니다. 남은 문안 7종 · 본문 14개.
- **2026-09-23** — ViHAT 회신 반영. 한국어 7건 제외, 베트남어 무성조 전환, 고정 링크를 본문에 직접 기재. 16개 본문 모두 1세그먼트. 한국어 고객은 영어 문안 수신.
- **2026-09-12** — 최초 작성. 8종 × 3개 언어 실제 발송 결과 기록. 통과 3건, 미등록 21건.
