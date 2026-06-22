import type { PdfMessages } from "./ko";

export const vi: PdfMessages = {
  documentTitle: {
    SALE: "Phiếu giao hàng (kiêm hóa đơn)",
    RENTAL_B2C: "Hợp đồng thuê",
    RENTAL_B2B: "Hợp đồng thuê",
    MAINTENANCE: "Hợp đồng bảo trì",
    APPENDIX: "Phụ lục hợp đồng",
  },
  labels: {
    contractNumber: "Số hợp đồng",
    parentContractNumber: "Hợp đồng gốc",
    revision: "Bản sửa đổi",
    customerCode: "Mã khách hàng",
    customerName: "Tên khách hàng",
    customerType: "Loại",
    taxCode: "MST",
    shortcode: "Viết tắt",
    address: "Địa chỉ",
    contactName: "Người liên hệ",
    contactPhone: "Điện thoại",
    contactEmail: "Email",
    contractType: "Loại hợp đồng",
    state: "Trạng thái",
    startDate: "Ngày bắt đầu",
    endDate: "Ngày kết thúc",
    termMonths: "Thời hạn (tháng)",
    monthlyFee: "Phí bảo trì/tháng",
    totalValue: "Tổng giá trị HĐ",
    signedByCustomer: "Ngày KH ký",
    signedByCompany: "Ngày Cty ký",
    activatedAt: "Ngày hiệu lực",
    equipmentLines: "Danh sách thiết bị",
    site: "Cơ sở / Vị trí",
    serial: "Số sê-ri",
    model: "Model",
    unitPrice: "Đơn giá",
    quantity: "SL",
    lineTotal: "Thành tiền",
    grandTotal: "TỔNG CỘNG",
    notes: "Ghi chú",
    pageOf: "Trang {page} / {total}",
    signatureCustomer: "KHÁCH HÀNG (Bên ký HĐ)",
    signatureCompany: "CÔNG TY (Đại diện)",
    seoulAquaLegalName: "CÔNG TY TNHH MTV TM&DV JAKE'S HA (Jake's Home Appliances)",
    generatedAt: "Ngày xuất",
    companyBlockTitle: "Thông tin công ty phát hành",
    companyLegalName: "Tên pháp nhân",
    companyAddress: "Địa chỉ",
    companyRepresentative: "Người đại diện",
    companyTaxCode: "Mã số thuế (MST)",
    companyPhone: "Điện thoại",
    customerRepresentative: "Người đại diện pháp luật",
    customerNationalId: "CCCD",
    customerPassport: "Số hộ chiếu",
    customerNationality: "Quốc tịch",
    type: { SALE: "Bán", RENTAL: "Thuê", MAINTENANCE: "Bảo trì" },
  },
  clauses: {
    intro:
      "Hợp đồng này được ký kết giữa hai bên nêu trên, theo các điều khoản và Quy chế chuẩn của Jake's Home Appliances.",
    rentalTerm:
      "Thời hạn thuê là {term} tháng; thời gian sử dụng bắt buộc 24 tháng. Hủy hợp đồng trong giai đoạn bắt buộc chịu phí phạt 50% số tháng còn lại.",
    rentalAutoConvert:
      "Hợp đồng tự động chuyển sang Hợp đồng bảo trì nếu không có thông báo chấm dứt từ một trong hai bên trước ngày kết thúc 1 tháng.",
    maintenance:
      "Theo hợp đồng này, dịch vụ kiểm tra định kỳ và thay lõi lọc được thực hiện hàng tháng hoặc 2 tháng/lần. Chi phí đã bao gồm trong phí hợp đồng.",
    saleOwnership:
      "Quyền sở hữu thiết bị được chuyển giao cho khách hàng ngay khi hoàn tất thanh toán.",
    appendix:
      "Phụ lục này sửa đổi hợp đồng gốc. Số phụ lục: A{revision}. Lý do: {reason}",
    paymentTerms:
      "Phí thuê tháng / phí bảo trì được lập hóa đơn hàng tháng, hạn thanh toán 30 ngày kể từ ngày lập.",
    signatureBlock:
      "Hai bên đã đọc, hiểu rõ và đồng ý với mọi điều khoản trong hợp đồng này.",
  },
};
