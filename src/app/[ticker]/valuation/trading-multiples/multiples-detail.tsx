"use client";

import { useState } from "react";
import type { PeerComparison } from "@/types";
import type { MultipleDetail, CompanyRow, MultipleKey } from "./data";
import { MultiplesOverview } from "./multiples-overview";
import { PeerComparisonTable } from "./peer-table";
import { MultipleBridgeCard } from "./multiple-breakdown";

interface Props {
  multiples: MultipleDetail[];
  peers: PeerComparison[];
  companyRow: CompanyRow;
  currentPrice: number;
  industry: string;
}

export function MultiplesDetailView({ multiples, peers, companyRow, currentPrice, industry }: Props) {
  const [activeKey, setActiveKey] = useState<MultipleKey>("pe");
  const activeDetail = multiples.find((m) => m.key === activeKey);

  return (
    <>
      {/* Selector cards */}
      <MultiplesOverview
        multiples={multiples}
        currentPrice={currentPrice}
        activeKey={activeKey}
        onKeyChange={setActiveKey}
      />

      {/* Active multiple detail */}
      {activeDetail && (
        <div className="space-y-6 mt-6">
          {/* Peer table for active multiple */}
          {peers.length > 0 && (
            <div className="val-card">
              <h3 className="val-card-title">
                {activeDetail.label} Peer Comparison — {industry}
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Industry peers sorted by market cap. Subject company highlighted.
              </p>
              <PeerComparisonTable
                companyRow={companyRow}
                peers={peers}
                multipleKey={activeKey}
              />
            </div>
          )}

          {/* Bridge calculation */}
          <MultipleBridgeCard detail={activeDetail} />
        </div>
      )}
    </>
  );
}
