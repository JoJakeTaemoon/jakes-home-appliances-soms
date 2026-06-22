"use client";

import { useEffect, useMemo, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

export interface VnAddressValue {
  provinceCode?: string | null;
  provinceName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  street?: string | null;
}

interface VnAddressLabels {
  province: string;
  district: string;
  ward: string;
  street: string;
}

interface Props {
  value: VnAddressValue;
  onChange: (next: VnAddressValue) => void;
  labels: VnAddressLabels;
  /** Display locale for province secondary name. */
  locale?: "vi" | "ko" | "en";
  streetPlaceholder?: string;
}

interface Province {
  code: string;
  name: string;
  nameKo?: string;
  nameEn?: string;
}
interface District {
  code: string;
  provinceCode: string;
  name: string;
  nameEn?: string;
}
interface Ward {
  code: string;
  districtCode: string;
  name: string;
}
interface AddressData {
  provinces: Province[];
  districts: District[];
  wards: Ward[];
}

let dataPromise: Promise<AddressData> | null = null;
async function loadAddressData(): Promise<AddressData> {
  if (!dataPromise) {
    dataPromise = import("@/data/vn-administrative-divisions.json").then(
      (m) => m.default as unknown as AddressData,
    );
  }
  return dataPromise;
}

function provinceLabel(p: Province, locale: "vi" | "ko" | "en"): string {
  if (locale === "ko" && p.nameKo) return `${p.name} · ${p.nameKo}`;
  if (locale === "en" && p.nameEn) return `${p.name} · ${p.nameEn}`;
  return p.name;
}

/**
 * Cascading Vietnamese-administrative-division picker, Shopee-style:
 * Tỉnh/Thành phố → Quận/Huyện → Phường/Xã + free-text street detail.
 *
 * Falls back to free-text entry at any level via the Combobox `allowCreate`
 * affordance — the bundled JSON is a starter dataset, not a full GSO mirror,
 * so users in less-common areas can still type their region.
 */
export function VnAddressPicker({
  value,
  onChange,
  labels,
  locale = "vi",
  streetPlaceholder,
}: Readonly<Props>) {
  const [data, setData] = useState<AddressData | null>(null);

  useEffect(() => {
    let alive = true;
    loadAddressData()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData({ provinces: [], districts: [], wards: [] });
      });
    return () => {
      alive = false;
    };
  }, []);

  const provinceOptions = useMemo<ComboboxOption[]>(() => {
    const base: ComboboxOption[] = data
      ? data.provinces.map((p) => ({ value: p.code, label: provinceLabel(p, locale) }))
      : [];
    if (
      value.provinceCode &&
      !base.some((o) => o.value === value.provinceCode)
    ) {
      base.unshift({
        value: value.provinceCode,
        label: value.provinceName || value.provinceCode,
      });
    }
    return base;
  }, [data, locale, value.provinceCode, value.provinceName]);

  const districtOptions = useMemo<ComboboxOption[]>(() => {
    const base: ComboboxOption[] =
      data && value.provinceCode
        ? data.districts
            .filter((d) => d.provinceCode === value.provinceCode)
            .map((d) => ({ value: d.code, label: d.name }))
        : [];
    if (
      value.districtCode &&
      !base.some((o) => o.value === value.districtCode)
    ) {
      base.unshift({
        value: value.districtCode,
        label: value.districtName || value.districtCode,
      });
    }
    return base;
  }, [data, value.provinceCode, value.districtCode, value.districtName]);

  const wardOptions = useMemo<ComboboxOption[]>(() => {
    const base: ComboboxOption[] =
      data && value.districtCode
        ? data.wards
            .filter((w) => w.districtCode === value.districtCode)
            .map((w) => ({ value: w.code, label: w.name }))
        : [];
    if (value.wardCode && !base.some((o) => o.value === value.wardCode)) {
      base.unshift({
        value: value.wardCode,
        label: value.wardName || value.wardCode,
      });
    }
    return base;
  }, [data, value.districtCode, value.wardCode, value.wardName]);

  function pickProvince(code: string | null) {
    if (!code) {
      onChange({
        ...value,
        provinceCode: null,
        provinceName: null,
        districtCode: null,
        districtName: null,
        wardCode: null,
        wardName: null,
      });
      return;
    }
    const p = data?.provinces.find((x) => x.code === code);
    onChange({
      ...value,
      provinceCode: code,
      provinceName: p?.name ?? code,
      districtCode: null,
      districtName: null,
      wardCode: null,
      wardName: null,
    });
  }

  function createProvince(name: string) {
    onChange({
      ...value,
      provinceCode: name,
      provinceName: name,
      districtCode: null,
      districtName: null,
      wardCode: null,
      wardName: null,
    });
  }

  function pickDistrict(code: string | null) {
    if (!code) {
      onChange({
        ...value,
        districtCode: null,
        districtName: null,
        wardCode: null,
        wardName: null,
      });
      return;
    }
    const d = data?.districts.find((x) => x.code === code);
    onChange({
      ...value,
      districtCode: code,
      districtName: d?.name ?? code,
      wardCode: null,
      wardName: null,
    });
  }

  function createDistrict(name: string) {
    onChange({
      ...value,
      districtCode: name,
      districtName: name,
      wardCode: null,
      wardName: null,
    });
  }

  function pickWard(code: string | null) {
    if (!code) {
      onChange({ ...value, wardCode: null, wardName: null });
      return;
    }
    const w = data?.wards.find((x) => x.code === code);
    onChange({ ...value, wardCode: code, wardName: w?.name ?? code });
  }

  function createWard(name: string) {
    onChange({ ...value, wardCode: name, wardName: name });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[#525252]">{labels.province}</label>
        <Combobox
          value={value.provinceCode ?? null}
          onChange={pickProvince}
          options={provinceOptions}
          allowCreate
          createLabel={(q) => `“${q}”`}
          onCreate={createProvince}
          searchPlaceholder="Tỉnh / Thành phố"
          ariaLabel={labels.province}
          placeholder="Tỉnh / Thành phố"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[#525252]">{labels.district}</label>
        <Combobox
          value={value.districtCode ?? null}
          onChange={pickDistrict}
          options={districtOptions}
          disabled={!value.provinceCode}
          allowCreate={!!value.provinceCode}
          createLabel={(q) => `“${q}”`}
          onCreate={createDistrict}
          searchPlaceholder="Quận / Huyện"
          ariaLabel={labels.district}
          placeholder="Quận / Huyện"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[#525252]">{labels.ward}</label>
        <Combobox
          value={value.wardCode ?? null}
          onChange={pickWard}
          options={wardOptions}
          disabled={!value.districtCode}
          allowCreate={!!value.districtCode}
          createLabel={(q) => `“${q}”`}
          onCreate={createWard}
          searchPlaceholder="Phường / Xã"
          ariaLabel={labels.ward}
          placeholder="Phường / Xã"
        />
      </div>
      <div className="sm:col-span-3 flex flex-col gap-1">
        <label className="text-xs font-medium text-[#525252]">{labels.street}</label>
        <Input
          value={value.street ?? ""}
          onChange={(e) =>
            onChange({ ...value, street: e.target.value === "" ? null : e.target.value })
          }
          placeholder={streetPlaceholder ?? "123 Lê Lợi, Tầng 5"}
        />
      </div>
    </div>
  );
}
