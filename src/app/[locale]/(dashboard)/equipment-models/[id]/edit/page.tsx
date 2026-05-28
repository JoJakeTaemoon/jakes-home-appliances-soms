"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";
import { EquipmentModelForm } from "@/components/forms/equipment-model-form";

interface ModelDetail {
  id: string;
  modelCode: string;
  name: string;
  category: "WATER_PURIFIER" | "BIDET" | "AIR_PURIFIER" | "FILTER" | "OTHER";
  description: string | null;
  retailPrice: string | null;
  monthlyRentalPrice: string | null;
  monthlyMaintenancePrice: string | null;
  filterPolicy: { filters?: { type: string; replaceEveryDays: number }[] } | null;
  isActive: boolean;
}

export default function EditEquipmentModelPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const tc = useTranslations("common");
  const api = useApi();
  const [data, setData] = useState<ModelDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api.get<ModelDetail>(`/api/equipment-models/${id}`);
      if (!cancelled) setData(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  if (!data) return <div className="text-sm text-[#737373]">{tc("loading")}</div>;

  return (
    <EquipmentModelForm
      mode="edit"
      initial={{
        id: data.id,
        modelCode: data.modelCode,
        name: data.name,
        category: data.category,
        description: data.description ?? "",
        retailPrice: data.retailPrice ?? "",
        monthlyRentalPrice: data.monthlyRentalPrice ?? "",
        monthlyMaintenancePrice: data.monthlyMaintenancePrice ?? "",
        filters: data.filterPolicy?.filters ?? [],
        isActive: data.isActive,
      }}
    />
  );
}
