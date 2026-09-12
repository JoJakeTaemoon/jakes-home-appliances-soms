# SMS 문안 등록 현황 — eSMS Brandname `JAKE'S HOME APPLIANCES`

> 실측 기준 2026-09-12. 테스트 번호 `0961122564`, 실제 발송(LIVE) 24건.
> 재현 명령: `ESMS_PROBE_LIVE=1 npx tsx scripts/esms-probe.ts <번호>`

## 1. 결론

문안 8종 × 3개 언어 = 24개 조합을 실제로 발송했습니다. **3개가 통과하고 21개가 거부**됐습니다.

통과한 것은 정기점검 방문 알림 하나뿐입니다. 나머지 7종은 언어를 불문하고 전부 미등록입니다.

**등록은 본문 단위입니다.** 같은 상황의 알림이라도 언어가 다르면 본문이 다르므로 각각 등록해야 합니다. 실제로 정기점검 알림은 베트남어와 영어가 각각 등록돼 있어 둘 다 통과했습니다.

## 2. 판정 코드

| 코드 | 의미 | 과금 |
|---|---|---|
| `100` | eSMS가 접수함. 통신사로 전달됨 | 세그먼트당 과금 |
| `146` | 이 브랜드네임에 등록되지 않은 본문 (`Sai template Brandname CSKH`) | 없음 |
| `124` | 24시간 내 동일 내용 중복 발송 차단 | 없음 |

`124`는 테스트 과정에서만 나타납니다. 같은 문구를 같은 번호로 반복 발송할 때 eSMS가 막는 것이며, 샌드박스 요청도 이 기록을 남깁니다.

## 3. 전체 결과

| 상황 | 문안 코드 | 한국어 | 베트남어 | 영어 |
|---|---|:-:|:-:|:-:|
| 고객 포털 계정 발급 | `SMS_PORTAL_WELCOME` | ❌ 146 | ❌ 146 | ❌ 146 |
| 고객 포털 비밀번호 초기화 | `SMS_PASSWORD_RESET` | ❌ 146 | ❌ 146 | ❌ 146 |
| 직원 비밀번호 복구 인증코드 | `SMS_STAFF_RESET_CODE` | ❌ 146 | ❌ 146 | ❌ 146 |
| 정기점검 방문 D-1 알림 | `SMS_VISIT_REMINDER` | ✅ 통과 | ✅ 통과 | ✅ 통과 |
| 유상 서비스 요청 승인 | `SMS_SR_APPROVED` | ❌ 146 | ❌ 146 | ❌ 146 |
| 서비스 요청 반려 | `SMS_SR_REJECTED` | ❌ 146 | ❌ 146 | ❌ 146 |
| 임대료 미납 최종 독촉 (D+30) | `SMS_PAYMENT_OVERDUE_FINAL` | ❌ 146 | ❌ 146 | ❌ 146 |
| 임대 만료 최종 안내 (D-7) | `SMS_CONTRACT_RENEWAL_FINAL` | ❌ 146 | ❌ 146 | ❌ 146 |

## 4. 통과 — 추가 작업 없음

### 정기점검 방문 D-1 알림 (`SMS_VISIT_REMINDER`)

| 언어 | 결과 | 본문 | 패턴 길이 | 세그먼트 |
|---|:-:|---|---:|---:|
| 베트남어 (VI) | ✅ | `TB BAO TRI DINH KY: KTV cua JAKE'S HOME APPLIANCES du kien se den bao tri {equipment} cua QK vao {datetime}. Neu QK can doi khung gio khac vui long LH: 0768902009.` | 151 | 1 |
| 영어 (EN) | ✅ | `MAINTENANCE NOTICE: JAKE'S HOME APPLIANCES technician will service your {equipment} on {datetime}. To reschedule, please contact 0768902009.` | 128 | 1 |
| 한국어 (KO) | ✅ | `TB BAO TRI DINH KY: KTV cua JAKE'S HOME APPLIANCES du kien se den bao tri {equipment} cua QK vao {datetime}. Neu QK can doi khung gio khac vui long LH: 0768902009.` | 151 | 1 |

한국어 칸은 베트남어와 같은 본문입니다. 한국어 문안은 등록돼 있지 않아, 한국어 고객에게도 승인된 베트남어 문안을 보내고 있습니다. 통과한 것은 한국어가 아니라 베트남어 본문입니다.

변수 슬롯은 `{equipment}` 최대 50자, `{datetime}` 최대 40자입니다. 고정 문구가 130자여서 두 값의 합이 30자를 넘으면 2세그먼트가 됩니다. 실제 모델명을 넣으면 대부분 2세그먼트입니다.

## 5. 신규 등록 요청 목록

언어별로 나눴습니다. 각 본문의 `{변수}` 자리는 eSMS 등록 시 슬롯으로 지정하고, 옆의 숫자는 요청할 최대 길이입니다.

### 5.1 베트남어 (VI) — 7건

**고객 포털 계정 발급** · `SMS_PORTAL_WELCOME`

- 발송 시점: 계약 확정 또는 판매 완료 시 1회
- 본문: `[JakeApp] Chào {name}. Cổng KH: {url} · ID: {phone} · MK tạm: {pwd}. Đổi MK khi đăng nhập đầu.`
- 변수: `{name}` ≤ 50, `{url}` ≤ 30, `{phone}` ≤ 15, `{pwd}` ≤ 10
- 길이: 96자 · 2세그먼트 (유니코드)

**고객 포털 비밀번호 초기화** · `SMS_PASSWORD_RESET`

- 발송 시점: 매니저가 초기화할 때마다
- 본문: `[JakeApp] MK của {name} đã đặt lại. MK mới: {pwd} · {url}. Không phải bạn? LH {hq_phone}`
- 변수: `{name}` ≤ 50, `{pwd}` ≤ 10, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 90자 · 2세그먼트 (유니코드)

**직원 비밀번호 복구 인증코드** · `SMS_STAFF_RESET_CODE`

- 발송 시점: 직원이 비밀번호 찾기 요청 시
- 본문: `[JakeApp] Mã xác thực khôi phục mật khẩu: {code} (hiệu lực {minutes} phút). Không phải bạn? Báo quản trị viên ngay.`
- 변수: `{code}` ≤ 6, `{minutes}` ≤ 3
- 길이: 117자 · 2세그먼트 (유니코드)

**유상 서비스 요청 승인** · `SMS_SR_APPROVED`

- 발송 시점: 사무실이 승인할 때
- 본문: `[JakeApp] YC #{req_no} duyệt. Chi phí: {amount}đ · Hẹn: {date}. XN: {url}`
- 변수: `{req_no}` ≤ 10, `{amount}` ≤ 15, `{date}` ≤ 20, `{url}` ≤ 30
- 길이: 75자 · 2세그먼트 (유니코드)

**서비스 요청 반려** · `SMS_SR_REJECTED`

- 발송 시점: 사무실이 반려할 때
- 본문: `[JakeApp] YC #{req_no} từ chối. Lý do: {reason}. LH {hq_phone}`
- 변수: `{req_no}` ≤ 10, `{reason}` ≤ 60, `{hq_phone}` ≤ 15
- 길이: 64자 · 1세그먼트 (유니코드)

**임대료 미납 최종 독촉 (D+30)** · `SMS_PAYMENT_OVERDUE_FINAL`

- 발송 시점: 미납 30일 경과 시
- 본문: `[JakeApp] {name}, phí thuê {month} {amount}đ chưa TT. TT: {url} hoặc {hq_phone}`
- 변수: `{name}` ≤ 50, `{month}` ≤ 10, `{amount}` ≤ 15, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 81자 · 2세그먼트 (유니코드)

**임대 만료 최종 안내 (D-7)** · `SMS_CONTRACT_RENEWAL_FINAL`

- 발송 시점: 만료 7일 전
- 본문: `[JakeApp] {name}, HĐ thuê hết hạn {date} (còn {days} ngày). Chuyển SH/bảo trì: {url} / {hq_phone}`
- 변수: `{name}` ≤ 50, `{date}` ≤ 20, `{days}` ≤ 4, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 99자 · 2세그먼트 (유니코드)

### 5.2 영어 (EN) — 7건

**고객 포털 계정 발급** · `SMS_PORTAL_WELCOME`

- 발송 시점: 계약 확정 또는 판매 완료 시 1회
- 본문: `[JakeApp] Welcome {name}. Portal: {url} · ID: {phone} · Temp PW: {pwd}. Change PW on first login.`
- 변수: `{name}` ≤ 50, `{url}` ≤ 30, `{phone}` ≤ 15, `{pwd}` ≤ 10
- 길이: 99자 · 2세그먼트 (유니코드) — 가운뎃점(`·`)과 통화기호를 아스키로 바꾸면 1세그먼트로 줄어듭니다

**고객 포털 비밀번호 초기화** · `SMS_PASSWORD_RESET`

- 발송 시점: 매니저가 초기화할 때마다
- 본문: `[JakeApp] {name}, password reset. New PW: {pwd} · {url}. If not you: {hq_phone}`
- 변수: `{name}` ≤ 50, `{pwd}` ≤ 10, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 81자 · 2세그먼트 (유니코드) — 가운뎃점(`·`)과 통화기호를 아스키로 바꾸면 1세그먼트로 줄어듭니다

**직원 비밀번호 복구 인증코드** · `SMS_STAFF_RESET_CODE`

- 발송 시점: 직원이 비밀번호 찾기 요청 시
- 본문: `[JakeApp] Password recovery code: {code} (valid {minutes} min). If this wasn't you, alert your admin immediately.`
- 변수: `{code}` ≤ 6, `{minutes}` ≤ 3
- 길이: 115자 · 1세그먼트 (GSM-7)

**유상 서비스 요청 승인** · `SMS_SR_APPROVED`

- 발송 시점: 사무실이 승인할 때
- 본문: `[JakeApp] Request #{req_no} approved. Cost: {amount} VND · Visit: {date}. Confirm: {url}`
- 변수: `{req_no}` ≤ 10, `{amount}` ≤ 15, `{date}` ≤ 20, `{url}` ≤ 30
- 길이: 90자 · 2세그먼트 (유니코드) — 가운뎃점(`·`)과 통화기호를 아스키로 바꾸면 1세그먼트로 줄어듭니다

**서비스 요청 반려** · `SMS_SR_REJECTED`

- 발송 시점: 사무실이 반려할 때
- 본문: `[JakeApp] Request #{req_no} declined. Reason: {reason}. Contact {hq_phone}`
- 변수: `{req_no}` ≤ 10, `{reason}` ≤ 60, `{hq_phone}` ≤ 15
- 길이: 76자 · 1세그먼트 (GSM-7)

**임대료 미납 최종 독촉 (D+30)** · `SMS_PAYMENT_OVERDUE_FINAL`

- 발송 시점: 미납 30일 경과 시
- 본문: `[JakeApp] {name}, {month} rental {amount} VND overdue. Pay {url} or {hq_phone}`
- 변수: `{name}` ≤ 50, `{month}` ≤ 10, `{amount}` ≤ 15, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 80자 · 1세그먼트 (GSM-7)

**임대 만료 최종 안내 (D-7)** · `SMS_CONTRACT_RENEWAL_FINAL`

- 발송 시점: 만료 7일 전
- 본문: `[JakeApp] {name}, rental ends {date} ({days} days left). Transfer/maintenance: {url} / {hq_phone}`
- 변수: `{name}` ≤ 50, `{date}` ≤ 20, `{days}` ≤ 4, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 99자 · 1세그먼트 (GSM-7)

### 5.3 한국어 (KO) — 7건

**고객 포털 계정 발급** · `SMS_PORTAL_WELCOME`

- 발송 시점: 계약 확정 또는 판매 완료 시 1회
- 본문: `[JakeApp] {name}님 환영합니다. 포털: {url} · ID: {phone} · 임시PW: {pwd}. 첫 로그인 시 비밀번호를 변경하세요.`
- 변수: `{name}` ≤ 50, `{url}` ≤ 30, `{phone}` ≤ 15, `{pwd}` ≤ 10
- 길이: 86자 · 2세그먼트 (유니코드)

**고객 포털 비밀번호 초기화** · `SMS_PASSWORD_RESET`

- 발송 시점: 매니저가 초기화할 때마다
- 본문: `[JakeApp] {name}님 비밀번호 초기화. 새 PW: {pwd} · 접속 {url}. 본인 요청이 아닌 경우 {hq_phone}`
- 변수: `{name}` ≤ 50, `{pwd}` ≤ 10, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 77자 · 2세그먼트 (유니코드)

**직원 비밀번호 복구 인증코드** · `SMS_STAFF_RESET_CODE`

- 발송 시점: 직원이 비밀번호 찾기 요청 시
- 본문: `[JakeApp] 비밀번호 복구 인증코드: {code} ({minutes}분 유효). 본인 요청이 아니면 즉시 관리자에게 알리세요.`
- 변수: `{code}` ≤ 6, `{minutes}` ≤ 3
- 길이: 75자 · 2세그먼트 (유니코드)

**유상 서비스 요청 승인** · `SMS_SR_APPROVED`

- 발송 시점: 사무실이 승인할 때
- 본문: `[JakeApp] 요청 #{req_no} 승인. 비용 {amount}₫ · 방문 {date}. 동의 {url}`
- 변수: `{req_no}` ≤ 10, `{amount}` ≤ 15, `{date}` ≤ 20, `{url}` ≤ 30
- 길이: 63자 · 1세그먼트 (유니코드)

**서비스 요청 반려** · `SMS_SR_REJECTED`

- 발송 시점: 사무실이 반려할 때
- 본문: `[JakeApp] 요청 #{req_no} 반려. 사유: {reason}. 문의 {hq_phone}`
- 변수: `{req_no}` ≤ 10, `{reason}` ≤ 60, `{hq_phone}` ≤ 15
- 길이: 56자 · 1세그먼트 (유니코드)

**임대료 미납 최종 독촉 (D+30)** · `SMS_PAYMENT_OVERDUE_FINAL`

- 발송 시점: 미납 30일 경과 시
- 본문: `[JakeApp] {name}님 {month} 임대료 {amount}₫ 미납. 결제 {url} 또는 {hq_phone}`
- 변수: `{name}` ≤ 50, `{month}` ≤ 10, `{amount}` ≤ 15, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 68자 · 1세그먼트 (유니코드)

**임대 만료 최종 안내 (D-7)** · `SMS_CONTRACT_RENEWAL_FINAL`

- 발송 시점: 만료 7일 전
- 본문: `[JakeApp] {name}님 임대 만료 {date} (잔여 {days}일). 소유권 이전 또는 유지관리 {url} / {hq_phone}`
- 변수: `{name}` ≤ 50, `{date}` ≤ 20, `{days}` ≤ 4, `{url}` ≤ 30, `{hq_phone}` ≤ 15
- 길이: 80자 · 2세그먼트 (유니코드)

## 6. 등록 요청 전에 정할 것

§5의 본문은 현재 코드에 들어 있는 그대로입니다. 등록을 요청하기 전에 세 가지를 정하는 편이 좋습니다. 한번 등록하면 문구를 바꿀 때마다 재심사를 받아야 하기 때문입니다.

**첫째, `[JakeApp] ` 프리픽스를 뺄지.** 브랜드네임이 이미 발신자명으로 표시되므로 본문에 회사명을 반복할 이유가 없습니다. 승인된 정기점검 문안에도 이 프리픽스가 없습니다. 빼면 문안마다 12자를 아낍니다. **빼는 것을 권합니다.**

**둘째, 영어 본문의 가운뎃점을 바꿀지.** 영어 문안 몇 개가 `·` 하나 때문에 유니코드로 분류돼 세그먼트가 두 배입니다. `-`로 바꾸면 GSM-7로 돌아가 절반 비용이 됩니다. **바꾸는 것을 권합니다.**

**셋째, 한국어를 등록할지.** 한글은 무조건 유니코드라 70자마다 세그먼트가 늘고, 한국어 문안 7건을 추가로 심사받아야 합니다. 지금은 한국어 고객에게도 베트남어 본문이 나갑니다. 한국인 고객 비중이 낮다면 한국어는 등록하지 않고 베트남어나 영어로 보내는 편이 실용적입니다. 등록한다면 §5.3 목록을 함께 제출하면 됩니다.

세 가지를 반영하면 §5의 본문이 바뀌므로, 결정 후 문안을 확정해 제출하는 순서를 권합니다.

## 6.5 임의 문구 발송에 대한 결정 (2026-09-12)

자유 입력 발송 기능은 **제거했습니다.** 통신사가 등록된 문안만 받으므로 직원이 타이핑한 문장은 어떤 경우에도 고객 휴대폰에 닿지 않습니다.

대신 관리자 화면의 발송 기능은 **등록된 문안을 고르고 변수만 채우는 방식**으로 바꿨습니다. 지금은 정기점검 알림 하나만 실제로 나가고, 이 목록의 문안이 등록되는 대로 나머지도 같은 화면에서 바로 쓸 수 있습니다.

자유 문구가 꼭 필요한 상황이 생기면 Zalo OA 상담 메시지가 대안입니다. 고객이 OA에 먼저 말을 건 경우에 한해 사전 등록 없이 답할 수 있습니다. 현재는 SMS만 쓰기로 한 상태라 보류입니다.

## 7. 비용

거부된 건은 접수 자체가 안 되므로 과금되지 않습니다. 이번 실측 24건 중 과금 대상은 통과한 3건뿐입니다.

등록이 끝난 뒤의 발송 단가는 세그먼트당 830 VND입니다. 베트남어와 한국어 본문은 성조와 한글 때문에 대부분 2세그먼트, 영어는 가운뎃점만 정리하면 대부분 1세그먼트입니다.

## 8. ViHAT 제출용 요청서 (베트남어)

아래 내용을 그대로 담당자(`thaoltt@vihatgroup.com`)에게 보내면 됩니다. §6의 결정이 끝난 뒤 본문을 확정해 보내세요.

---

**Đăng ký thêm mẫu tin CSKH cho Brandname `JAKE'S HOME APPLIANCES`**

Kính gửi anh/chị,

Hệ thống của Jake's Home Appliances đã gửi thử toàn bộ mẫu tin qua API eSMS. Hiện chỉ có mẫu «Nhắc lịch bảo trì định kỳ» được duyệt; các mẫu còn lại trả về `CodeResult 146 — Sai template Brandname CSKH`.

Chúng tôi xin đăng ký thêm các mẫu tin dưới đây. Mỗi ngôn ngữ là một nội dung riêng nên cần duyệt riêng. Phần trong dấu `{ }` là tham số thay đổi theo từng tin, kèm độ dài tối đa.

| # | Tình huống | Ngôn ngữ | Nội dung |
|---:|---|---|---|
| 1 | Cấp tài khoản cổng khách hàng | Tiếng Việt | `[JakeApp] Chào {name}. Cổng KH: {url} · ID: {phone} · MK tạm: {pwd}. Đổi MK khi đăng nhập đầu.` |
| 2 | Cấp tài khoản cổng khách hàng | Tiếng Anh | `[JakeApp] Welcome {name}. Portal: {url} · ID: {phone} · Temp PW: {pwd}. Change PW on first login.` |
| 3 | Cấp tài khoản cổng khách hàng | Tiếng Hàn | `[JakeApp] {name}님 환영합니다. 포털: {url} · ID: {phone} · 임시PW: {pwd}. 첫 로그인 시 비밀번호를 변경하세요.` |
| 4 | Đặt lại mật khẩu cổng khách hàng | Tiếng Việt | `[JakeApp] MK của {name} đã đặt lại. MK mới: {pwd} · {url}. Không phải bạn? LH {hq_phone}` |
| 5 | Đặt lại mật khẩu cổng khách hàng | Tiếng Anh | `[JakeApp] {name}, password reset. New PW: {pwd} · {url}. If not you: {hq_phone}` |
| 6 | Đặt lại mật khẩu cổng khách hàng | Tiếng Hàn | `[JakeApp] {name}님 비밀번호 초기화. 새 PW: {pwd} · 접속 {url}. 본인 요청이 아닌 경우 {hq_phone}` |
| 7 | Mã xác thực khôi phục mật khẩu nhân viên | Tiếng Việt | `[JakeApp] Mã xác thực khôi phục mật khẩu: {code} (hiệu lực {minutes} phút). Không phải bạn? Báo quản trị viên ngay.` |
| 8 | Mã xác thực khôi phục mật khẩu nhân viên | Tiếng Anh | `[JakeApp] Password recovery code: {code} (valid {minutes} min). If this wasn't you, alert your admin immediately.` |
| 9 | Mã xác thực khôi phục mật khẩu nhân viên | Tiếng Hàn | `[JakeApp] 비밀번호 복구 인증코드: {code} ({minutes}분 유효). 본인 요청이 아니면 즉시 관리자에게 알리세요.` |
| 10 | Duyệt yêu cầu dịch vụ có phí | Tiếng Việt | `[JakeApp] YC #{req_no} duyệt. Chi phí: {amount}đ · Hẹn: {date}. XN: {url}` |
| 11 | Duyệt yêu cầu dịch vụ có phí | Tiếng Anh | `[JakeApp] Request #{req_no} approved. Cost: {amount} VND · Visit: {date}. Confirm: {url}` |
| 12 | Duyệt yêu cầu dịch vụ có phí | Tiếng Hàn | `[JakeApp] 요청 #{req_no} 승인. 비용 {amount}₫ · 방문 {date}. 동의 {url}` |
| 13 | Từ chối yêu cầu dịch vụ | Tiếng Việt | `[JakeApp] YC #{req_no} từ chối. Lý do: {reason}. LH {hq_phone}` |
| 14 | Từ chối yêu cầu dịch vụ | Tiếng Anh | `[JakeApp] Request #{req_no} declined. Reason: {reason}. Contact {hq_phone}` |
| 15 | Từ chối yêu cầu dịch vụ | Tiếng Hàn | `[JakeApp] 요청 #{req_no} 반려. 사유: {reason}. 문의 {hq_phone}` |
| 16 | Nhắc nợ phí thuê lần cuối (D+30) | Tiếng Việt | `[JakeApp] {name}, phí thuê {month} {amount}đ chưa TT. TT: {url} hoặc {hq_phone}` |
| 17 | Nhắc nợ phí thuê lần cuối (D+30) | Tiếng Anh | `[JakeApp] {name}, {month} rental {amount} VND overdue. Pay {url} or {hq_phone}` |
| 18 | Nhắc nợ phí thuê lần cuối (D+30) | Tiếng Hàn | `[JakeApp] {name}님 {month} 임대료 {amount}₫ 미납. 결제 {url} 또는 {hq_phone}` |
| 19 | Thông báo hết hạn hợp đồng thuê (D-7) | Tiếng Việt | `[JakeApp] {name}, HĐ thuê hết hạn {date} (còn {days} ngày). Chuyển SH/bảo trì: {url} / {hq_phone}` |
| 20 | Thông báo hết hạn hợp đồng thuê (D-7) | Tiếng Anh | `[JakeApp] {name}, rental ends {date} ({days} days left). Transfer/maintenance: {url} / {hq_phone}` |
| 21 | Thông báo hết hạn hợp đồng thuê (D-7) | Tiếng Hàn | `[JakeApp] {name}님 임대 만료 {date} (잔여 {days}일). 소유권 이전 또는 유지관리 {url} / {hq_phone}` |

Tần suất dự kiến và mục đích sử dụng của từng mẫu giống hồ sơ Brandname đã nộp: tin chăm sóc khách hàng (CSKH), gửi tới khách hàng đang có hợp đồng thuê hoặc bảo trì với Jake's Home Appliances.

Nhờ anh/chị cho biết mẫu nào cần chỉnh sửa để được duyệt, và thời gian dự kiến hoàn tất. Xin cảm ơn.

---

## 9. 재검증

등록 완료 회신을 받으면 같은 명령으로 다시 확인합니다. 실제 발송이므로 본인 번호를 쓰세요.

```bash
ESMS_PROBE_LIVE=1 npx tsx scripts/esms-probe.ts 0961122564
```

한 문안만 볼 때는 코드와 언어를 덧붙입니다.

```bash
ESMS_PROBE_LIVE=1 npx tsx scripts/esms-probe.ts 0961122564 SMS_PASSWORD_RESET vi
```

결과는 관리자 화면 「설정 → 알림 발송 내역」에도 그대로 쌓입니다. 실패한 줄에는 거부 사유가 코드와 함께 남고, 재발송 버튼으로 다시 시도할 수 있습니다.

같은 문구를 같은 번호로 24시간 안에 다시 보내면 eSMS가 `124`로 막습니다. 프로브는 실행할 때마다 변수 값을 바꿔 이 충돌을 피합니다.

## 변경 이력

- **2026-09-12** — 최초 작성. 8종 × 3개 언어 실제 발송 결과 기록. 통과 3건(정기점검 알림 VI/EN/KO), 미등록 21건.