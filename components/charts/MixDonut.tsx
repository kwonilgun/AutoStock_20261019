"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SLEEVE_LABEL } from "@/lib/engine/config";
import { formatNumber } from "@/lib/format";
import type { Sleeve, SleeveSnapshot } from "@/lib/engine/types";

const COLORS: Record<Sleeve, string> = {
  US_EQUITY: "#1f4d3a",
  KR_EQUITY: "#3d7a57",
  BOND_10Y: "#d4b56a",
  BOND_30Y: "#8c6a2f",
  GOLD: "#c47b2b",
  BTC: "#e0a106",
  REIT: "#7d6244",
  KRW_CASH: "#8d8a82",
  USD_CASH: "#3d6b8a",
};

export function MixDonut({ sleeves }: { sleeves: SleeveSnapshot[] }) {
  const data = sleeves
    .filter((sleeve) => sleeve.currentKrw > 0)
    .map((sleeve) => ({
      name: SLEEVE_LABEL[sleeve.sleeve],
      value: sleeve.currentKrw,
      fill: COLORS[sleeve.sleeve],
    }));
  if (data.length === 0) {
    return <p className="text-sm text-[#6d675d]">보유 금액이 없습니다.</p>;
  }
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => (typeof value === "number" ? `${formatNumber(Math.round(value))}원` : "")} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
