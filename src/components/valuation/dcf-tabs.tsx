"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ModelCard } from "@/components/valuation/model-card";
import type { ValuationResult, ValuationModelType } from "@/types";

const DCF_MODELS: { key: ValuationModelType; label: string }[] = [
  { key: "dcf_growth_exit_5y", label: "Growth Exit 5Y" },
  { key: "dcf_growth_exit_10y", label: "Growth Exit 10Y" },
  { key: "dcf_3stage", label: "Perpetual Growth" },
  { key: "dcf_pe_exit_10y", label: "P/E Exit 10Y" },
  { key: "dcf_ebitda_exit_fcfe_10y", label: "EV/EBITDA Exit 10Y" },
  { key: "dcf_ebitda_exit_5y", label: "EBITDA Exit 5Y" },
  { key: "dcf_ebitda_exit_10y", label: "EBITDA Exit 10Y" },
];

interface Props {
  models: ValuationResult[];
  currentPrice: number;
}

export function DCFTabs({ models, currentPrice }: Props) {
  const modelMap = new Map(models.map((m) => [m.model_type, m]));

  return (
    <Tabs defaultValue="dcf_growth_exit_5y">
      <TabsList className="w-full justify-start">
        {DCF_MODELS.map((dcf) => (
          <TabsTrigger key={dcf.key} value={dcf.key}>
            {dcf.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {DCF_MODELS.map((dcf) => {
        const model = modelMap.get(dcf.key);
        if (!model) return null;
        return (
          <TabsContent key={dcf.key} value={dcf.key} className="mt-6">
            <ModelCard model={model} currentPrice={currentPrice} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
