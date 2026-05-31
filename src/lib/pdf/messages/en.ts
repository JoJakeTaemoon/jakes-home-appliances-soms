import type { PdfMessages } from "./ko";

export const en: PdfMessages = {
  documentTitle: {
    SALE: "Delivery Note / Sales Receipt",
    RENTAL_B2C: "Rental Contract",
    RENTAL_B2B: "Rental Contract",
    MAINTENANCE: "Maintenance Contract",
    APPENDIX: "Contract Appendix",
  },
  labels: {
    contractNumber: "Contract #",
    parentContractNumber: "Parent contract",
    revision: "Revision",
    customerCode: "Customer code",
    customerName: "Customer",
    customerType: "Type",
    taxCode: "Tax code (MST)",
    shortcode: "Shortcode",
    address: "Address",
    contactName: "Contact",
    contactPhone: "Phone",
    contactEmail: "Email",
    contractType: "Contract type",
    state: "State",
    startDate: "Start date",
    endDate: "End date",
    termMonths: "Term (months)",
    monthlyFee: "Monthly maintenance fee",
    totalValue: "Total contract value",
    signedByCustomer: "Signed by customer",
    signedByCompany: "Signed by company",
    activatedAt: "Activated",
    equipmentLines: "Equipment",
    site: "Site / Location",
    serial: "Serial #",
    model: "Model",
    unitPrice: "Unit price",
    quantity: "Qty",
    lineTotal: "Line total",
    grandTotal: "GRAND TOTAL",
    notes: "Notes",
    pageOf: "Page {page} of {total}",
    signatureCustomer: "CUSTOMER (Contract party)",
    signatureCompany: "SEOUL AQUA (Representative)",
    seoulAquaLegalName: "CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)",
    generatedAt: "Generated",
    companyBlockTitle: "Issuing company",
    companyLegalName: "Legal entity",
    companyAddress: "Address",
    companyRepresentative: "Representative",
    companyTaxCode: "Tax code (MST)",
    companyPhone: "Phone",
    customerRepresentative: "Legal representative",
    customerNationalId: "National ID (CCCD)",
    customerPassport: "Passport number",
    customerNationality: "Nationality",
    type: { SALE: "Sale", RENTAL: "Rental", MAINTENANCE: "Maintenance" },
  },
  clauses: {
    intro:
      "This contract is concluded between the parties named above and is governed by Seoul Aqua's standard terms.",
    rentalTerm:
      "Rental term: {term} months. Mandatory-use period: 24 months. Early termination during the mandatory period incurs a fee equal to 50% of the remaining monthly installments.",
    rentalAutoConvert:
      "This rental contract auto-converts to a Maintenance contract on the same terms unless either party gives notice at least 1 month before the end date.",
    maintenance:
      "Periodic inspection and filter replacement are performed monthly or bi-monthly under this contract. The cost is included in the contract fee.",
    saleOwnership:
      "Equipment ownership transfers to the customer immediately upon completion of payment.",
    appendix:
      "This appendix amends the parent contract. Revision: A{revision}. Reason: {reason}",
    paymentTerms:
      "Monthly rental/maintenance is invoiced monthly; payment is due within 30 days of invoice date.",
    signatureBlock:
      "Both parties have read, understood, and agreed to every provision of this contract.",
  },
};
