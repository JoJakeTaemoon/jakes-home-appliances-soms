export interface PdfMessages {
  documentTitle: {
    SALE: string;
    RENTAL_B2C: string;
    RENTAL_B2B: string;
    MAINTENANCE: string;
    APPENDIX: string;
  };
  labels: {
    contractNumber: string;
    parentContractNumber: string;
    revision: string;
    customerCode: string;
    customerName: string;
    customerType: string;
    taxCode: string;
    shortcode: string;
    address: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    contractType: string;
    state: string;
    startDate: string;
    endDate: string;
    termMonths: string;
    monthlyFee: string;
    totalValue: string;
    signedByCustomer: string;
    signedByCompany: string;
    activatedAt: string;
    equipmentLines: string;
    site: string;
    serial: string;
    model: string;
    unitPrice: string;
    quantity: string;
    lineTotal: string;
    grandTotal: string;
    notes: string;
    pageOf: string;
    signatureCustomer: string;
    signatureCompany: string;
    seoulAquaLegalName: string;
    generatedAt: string;
    companyBlockTitle: string;
    companyLegalName: string;
    companyAddress: string;
    companyRepresentative: string;
    companyTaxCode: string;
    companyPhone: string;
    customerRepresentative: string;
    customerNationalId: string;
    customerPassport: string;
    customerNationality: string;
    type: { SALE: string; RENTAL: string; MAINTENANCE: string };
  };
  clauses: {
    intro: string;
    rentalTerm: string;
    rentalAutoConvert: string;
    maintenance: string;
    saleOwnership: string;
    appendix: string;
    paymentTerms: string;
    signatureBlock: string;
  };
}

export const ko: PdfMessages = {
  documentTitle: {
    SALE: "납품서 (영수증 겸용)",
    RENTAL_B2C: "임대 계약서",
    RENTAL_B2B: "임대 계약서",
    MAINTENANCE: "유지관리 계약서",
    APPENDIX: "계약 부록 (수정 부록)",
  },
  labels: {
    contractNumber: "계약 번호",
    parentContractNumber: "원본 계약",
    revision: "수정본",
    customerCode: "고객 코드",
    customerName: "고객명",
    customerType: "유형",
    taxCode: "MST (세무 코드)",
    shortcode: "약칭",
    address: "주소",
    contactName: "담당자",
    contactPhone: "전화",
    contactEmail: "이메일",
    contractType: "계약 유형",
    state: "상태",
    startDate: "개시일",
    endDate: "종료일",
    termMonths: "계약 기간 (개월)",
    monthlyFee: "월 유지관리비",
    totalValue: "총 계약 금액",
    signedByCustomer: "고객 서명일",
    signedByCompany: "회사 서명일",
    activatedAt: "활성화일",
    equipmentLines: "장비 내역",
    site: "사이트 / 설치 위치",
    serial: "Serial #",
    model: "모델",
    unitPrice: "단가",
    quantity: "수량",
    lineTotal: "합계",
    grandTotal: "총계",
    notes: "비고",
    pageOf: "{page} / {total}",
    signatureCustomer: "고객 (계약 주체)",
    signatureCompany: "회사 (대표)",
    seoulAquaLegalName: "CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)",
    generatedAt: "발행일시",
    companyBlockTitle: "발행 회사 정보",
    companyLegalName: "기업명",
    companyAddress: "주소",
    companyRepresentative: "대표자",
    companyTaxCode: "세무코드 (MST)",
    companyPhone: "전화",
    customerRepresentative: "법적 대표자",
    customerNationalId: "주민등록번호 (CCCD)",
    customerPassport: "여권번호",
    customerNationality: "국적",
    type: { SALE: "판매", RENTAL: "임대", MAINTENANCE: "유지관리" },
  },
  clauses: {
    intro:
      "본 계약은 위 계약 당사자 간에 체결되며, 본 계약서에 명시된 조건과 'Seoul Aqua 표준 약관'에 따른다.",
    rentalTerm:
      "임대 기간은 {term}개월이며, 의무사용 기간은 24개월입니다. 의무사용 기간 내 중도해지 시 잔여 월수의 50% 위약금이 발생합니다.",
    rentalAutoConvert:
      "본 임대 계약은 만료 1개월 전 통보가 없는 경우 동일 조건의 유지관리 계약으로 자동 전환됩니다.",
    maintenance:
      "본 계약에 따라 정기 점검 및 필터 교체가 월 1회 또는 격월로 시행됩니다. 비용은 계약 금액에 포함됩니다.",
    saleOwnership: "결제 완료와 동시에 장비 소유권은 고객에게 이전됩니다.",
    appendix:
      "본 부록은 위 원본 계약을 수정합니다. 부록 번호: A{revision}. 사유: {reason}",
    paymentTerms:
      "월 임대료 및 유지관리비는 매월 청구되며, 결제 기한은 청구일로부터 30일 입니다.",
    signatureBlock: "양 당사자는 본 계약의 모든 조항을 충분히 이해하고 동의함.",
  },
};
