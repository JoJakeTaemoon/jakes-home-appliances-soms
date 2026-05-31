/**
 * One-shot script: render a sample bilingual contract PDF to verify the
 * font, lang-pair and company-info changes end-to-end.
 *
 *   npx tsx scripts/render-sample-contract.ts
 *
 * Picks a CONTRACT_PARTY whose `language` field is "vi" (forcing the
 * VI → EN fallback) and writes the PDF to `tmp/sample-contract-vi-en.pdf`.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import prisma from "../src/lib/prisma";
import { registerFonts } from "../src/lib/pdf/fonts";
import { getCompanyTaxInfo, getHqPhone } from "../src/lib/settings";
import { B2cRentalContract } from "../src/lib/pdf/templates/b2c-rental-contract";
import { B2cSaleContract } from "../src/lib/pdf/templates/b2c-sale-contract";
import { B2bContract } from "../src/lib/pdf/templates/b2b-contract";
import { MaintenanceContract } from "../src/lib/pdf/templates/maintenance-contract";
import { AppendixContract } from "../src/lib/pdf/templates/appendix";
import {
  langPairForContractParty,
  type PdfContractView,
  type PdfCustomerSummary,
  type PdfEquipmentLine,
  type PdfRenderProps,
} from "../src/lib/pdf/types";

async function main() {
  registerFonts();

  // Default — first arg overrides the contract number.
  const wanted = process.argv[2] ?? "HD-20250615/SA-KH0001";
  const contract = await prisma.contract.findFirst({
    where: { contractNumber: wanted },
    include: {
      parentContract: { select: { contractNumber: true } },
      customer: {
        include: {
          contacts: { where: { role: "CONTRACT_PARTY" }, take: 1 },
        },
      },
      equipment: {
        include: {
          equipment: {
            include: {
              model: true,
              site: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!contract) throw new Error(`Seed contract ${wanted} not found — run \`npm run db:reset:dev\` first.`);

  const cp = contract.customer.contacts[0];
  const customer: PdfCustomerSummary = {
    id: contract.customer.id,
    code: contract.customer.code,
    name: contract.customer.name,
    type: contract.customer.type,
    shortcode: contract.customer.shortcode,
    taxCode: contract.customer.taxCode,
    representativeName: contract.customer.representativeName,
    residency: contract.customer.residency,
    nationalId: contract.customer.nationalId,
    passportNumber: contract.customer.passportNumber,
    nationality: contract.customer.nationality,
    address: contract.customer.address,
    district: contract.customer.district,
    city: contract.customer.city,
    contractParty: cp
      ? {
          name: cp.name,
          title: cp.title,
          phone: cp.phone1,
          email: cp.email,
          language: cp.language,
        }
      : null,
  };

  const contractView: PdfContractView = {
    id: contract.id,
    contractNumber: contract.contractNumber,
    type: contract.type,
    state: contract.state,
    startDate: contract.startDate,
    endDate: contract.endDate,
    termMonths: contract.termMonths,
    monthlyMaintenanceFee: contract.monthlyMaintenanceFee
      ? Number(contract.monthlyMaintenanceFee.toString())
      : null,
    totalContractValue: contract.totalContractValue
      ? Number(contract.totalContractValue.toString())
      : null,
    signedByCustomerAt: contract.signedByCustomerAt,
    signedByCompanyAt: contract.signedByCompanyAt,
    activatedAt: contract.activatedAt,
    notes: null,
    parentContractNumber: contract.parentContract?.contractNumber ?? null,
    amendmentRevision: contract.amendmentRevision,
    amendmentReason: contract.amendmentReason,
  };

  const equipment: PdfEquipmentLine[] = contract.equipment.map((ce) => ({
    equipmentId: ce.equipmentId,
    modelCode: ce.equipment.model.name,
    modelName: ce.equipment.model.name,
    serialNumber: ce.equipment.serialNumber,
    siteName: ce.equipment.site?.name ?? null,
    unitPrice: ce.unitPrice ? Number(ce.unitPrice.toString()) : null,
    quantity: ce.quantity,
    notes: ce.notes,
  }));

  const tax = await getCompanyTaxInfo();
  const hqPhone = await getHqPhone();
  const langPair = langPairForContractParty(cp?.language ?? "vi");

  const props: PdfRenderProps = {
    contract: contractView,
    customer,
    equipment,
    langPair,
    generatedAt: new Date(),
    company: {
      legalName: tax.legalName,
      address: tax.address,
      representativeName: tax.representativeName,
      taxCode: tax.taxCode,
    },
    hqPhone,
  };

  const isAmendment = !!contract.parentContractId;
  let element: React.ReactElement;
  if (isAmendment) element = React.createElement(AppendixContract, props);
  else if (contract.type === "MAINTENANCE") element = React.createElement(MaintenanceContract, props);
  else if (contract.customer.type === "B2B") element = React.createElement(B2bContract, props);
  else if (contract.type === "RENTAL") element = React.createElement(B2cRentalContract, props);
  else element = React.createElement(B2cSaleContract, props);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  const outDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(outDir, { recursive: true });
  const safe = wanted.replace(/\//g, "_");
  const outFile = path.join(outDir, `sample-${safe}-${langPair}.pdf`);
  await fs.writeFile(outFile, buffer);
  console.log(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
  console.log(`  contract     = ${contract.contractNumber}`);
  console.log(`  customer     = ${customer.name} (${customer.code})`);
  console.log(`  party lang   = ${cp?.language ?? "—"}`);
  console.log(`  langPair     = ${langPair}`);
  console.log(`  company      = ${tax.legalName}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
