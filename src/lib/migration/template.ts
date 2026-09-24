/**
 * The migration template handed to office staff.
 *
 * Five sheets: a Guide, then one per entity in the order they have to be
 * filled — a customer before its contract, a contract before the equipment
 * on it, equipment before its consumables.
 *
 * Every data sheet ships two filled example rows, one B2C and one B2B, so the
 * shape of a real row is visible rather than described. The examples are
 * meant to be deleted before upload. Every identifier in them starts with
 * `SAMPLE-`, including the model code and consumable SKUs, so a workbook sent
 * back untouched always fails validation on "not in the product catalog"
 * rather than quietly creating two fictional customers — the guard has to be
 * deliberate, not a coincidence of which codes the catalog happens to hold.
 */

import { buildSpreadsheetML, type XlsxSheet } from "@/lib/xlsx/spreadsheet-ml";
import { HEADERS, SHEETS } from "@/lib/migration/plan";

const GUIDE_HEADERS = ["항목 / Mục", "설명 (한국어)", "Giải thích (Tiếng Việt)"] as const;

const GUIDE_ROWS: ReadonlyArray<readonly string[]> = [
  [
    "작성 순서 / Thứ tự",
    "고객 → 계약 → 장비 → 소모품 순서로 채웁니다. 뒤 시트는 앞 시트의 코드를 참조합니다.",
    "Điền theo thứ tự: Customers → Contracts → Equipment → Consumables. Sheet sau tham chiếu mã ở sheet trước.",
  ],
  [
    "Customer Code",
    "기존 시스템에서 쓰던 고객 코드입니다. 파일 안에서 고객을 잇는 열쇠이고, 다시 업로드할 때 중복 생성을 막는 기준이 됩니다. 시스템 고객번호(KH#####)는 저장할 때 자동으로 새로 부여됩니다.",
    "Mã khách hàng ở hệ thống cũ. Dùng để liên kết trong file và để tránh tạo trùng khi tải lên lại. Mã khách hàng mới (KH#####) do hệ thống tự cấp.",
  ],
  [
    "Contract No",
    "기존 계약번호입니다. 새 계약번호(HD-…)는 자동으로 만들어집니다.",
    "Số hợp đồng cũ. Số hợp đồng mới (HD-…) do hệ thống tự tạo.",
  ],
  [
    "Equipment Key",
    "이 파일 안에서만 쓰는 임시 번호입니다. 소모품 시트가 이 값으로 장비를 찾습니다. E1, E2 처럼 아무 값이나 괜찮습니다.",
    "Khóa tạm chỉ dùng trong file này. Sheet Consumables dùng nó để tìm thiết bị. Có thể đặt E1, E2…",
  ],
  [
    "Custom Description",
    "카탈로그에 없는 장비일 때만 씁니다. 이 칸에 장비 설명을 적으면 Model Code는 비워 둡니다. 둘 중 하나는 반드시 있어야 합니다.",
    "Chỉ dùng cho thiết bị không có trong danh mục. Điền mô tả ở đây và để trống Model Code. Phải có một trong hai.",
  ],
  [
    "Model Code · Consumable SKU",
    "제품 카탈로그에 이미 등록된 코드여야 합니다. 없는 코드는 오류로 표시되며, 카탈로그에 먼저 등록해야 합니다.",
    "Phải là mã đã có trong danh mục sản phẩm. Mã chưa có sẽ báo lỗi; hãy đăng ký trong danh mục trước.",
  ],
  [
    "날짜 / Ngày",
    "YYYY-MM-DD 형식으로 적습니다. 예: 2024-03-05. 셀 서식이 날짜여도 괜찮습니다.",
    "Định dạng YYYY-MM-DD, ví dụ 2024-03-05. Ô định dạng ngày cũng được.",
  ],
  [
    "금액 / Số tiền",
    "숫자만 적습니다. 1.500.000 처럼 점을 찍어도 됩니다.",
    "Chỉ nhập số. Có thể viết 1.500.000.",
  ],
  [
    "Shortcode",
    "B2B 고객만 필요합니다. 계약번호를 만들 때 쓰는 2~5자 약칭입니다. 예: SHV",
    "Chỉ cần cho khách B2B. Viết tắt 2-5 ký tự dùng để tạo số hợp đồng, ví dụ SHV.",
  ],
  [
    "예시 행 / Dòng ví dụ",
    "각 시트의 SAMPLE- 로 시작하는 행은 예시입니다. 업로드 전에 지우세요.",
    "Các dòng bắt đầu bằng SAMPLE- là ví dụ. Hãy xóa trước khi tải lên.",
  ],
  [
    "업로드 / Tải lên",
    "저장한 파일을 「시스템 관리 → 데이터 이관」에서 올립니다. 먼저 검사 결과를 보여주고, 확인 버튼을 눌러야 실제로 반영됩니다.",
    "Tải file đã lưu ở «Quản lý hệ thống → Nhập dữ liệu». Hệ thống kiểm tra trước, chỉ ghi vào dữ liệu khi bạn bấm xác nhận.",
  ],
  [
    "알림 / Thông báo",
    "이관 중에는 고객에게 문자나 이메일이 발송되지 않습니다.",
    "Trong quá trình nhập dữ liệu, hệ thống không gửi SMS hay email cho khách hàng.",
  ],
];

const CUSTOMER_EXAMPLES: ReadonlyArray<readonly string[]> = [
  [
    "SAMPLE-KH001",
    "Nguyen Thi Lan",
    "B2C",
    "",
    "",
    "Nguyen Thi Lan",
    "0901234567",
    "lan@example.com",
    "vi",
    "TP. Ho Chi Minh",
    "Phuong Ben Nghe",
    "12 Nguyen Hue",
  ],
  [
    "SAMPLE-KH002",
    "CONG TY TNHH SHERATON VIETNAM",
    "B2B",
    "SHV",
    "0301234567",
    "Tran Van Minh",
    "0901112233",
    "minh@sheraton.example",
    "vi",
    "TP. Ho Chi Minh",
    "Phuong Da Kao",
    "88 Dong Khoi",
  ],
];

const CONTRACT_EXAMPLES: ReadonlyArray<readonly string[]> = [
  ["SAMPLE-HD001", "SAMPLE-KH001", "RENTAL", "2024-03-01", "36", "300000", "1000000", "", "기존 임대 계약"],
  ["SAMPLE-HD002", "SAMPLE-KH002", "MAINTENANCE", "2023-11-15", "", "500000", "", "", ""],
];

const EQUIPMENT_EXAMPLES: ReadonlyArray<readonly string[]> = [
  [
    "E1",
    "SAMPLE-KH001",
    "SAMPLE-HD001",
    "SAMPLE-MODEL",
    "",
    "SN-2024-0001",
    "2024-03-05",
    "RENTAL",
    "FULL_SERVICE",
    "300000",
    "",
    "",
  ],
  [
    "E2",
    "SAMPLE-KH002",
    "SAMPLE-HD002",
    "",
    "타사 정수기 (카탈로그 외)",
    "SN-2023-0042",
    "2023-11-20",
    "MAINTENANCE",
    "FULL_SERVICE",
    "500000",
    "60",
    "로비 설치",
  ],
];

const CONSUMABLE_EXAMPLES: ReadonlyArray<readonly string[]> = [
  ["E1", "SAMPLE-SKU-1", "", "1", "180", "2024-03-05", ""],
  ["E1", "SAMPLE-SKU-2", "", "1", "365", "2024-03-05", ""],
  ["E2", "", "타사 세디먼트 필터", "2", "180", "2024-09-01", "카탈로그에 없는 부품 예시"],
];

/** The workbook body — SpreadsheetML, which Excel opens as a real workbook. */
export function buildMigrationTemplate(): string {
  const sheets: XlsxSheet[] = [
    { name: "Guide", headers: GUIDE_HEADERS, rows: GUIDE_ROWS },
    { name: SHEETS.customers, headers: HEADERS.customers, rows: CUSTOMER_EXAMPLES },
    { name: SHEETS.contracts, headers: HEADERS.contracts, rows: CONTRACT_EXAMPLES },
    { name: SHEETS.equipment, headers: HEADERS.equipment, rows: EQUIPMENT_EXAMPLES },
    { name: SHEETS.consumables, headers: HEADERS.consumables, rows: CONSUMABLE_EXAMPLES },
  ];
  return buildSpreadsheetML(sheets);
}

/** Rows whose identifiers mark them as the shipped examples. */
export function isExampleRow(value: string): boolean {
  return value.trim().toUpperCase().startsWith("SAMPLE-");
}
