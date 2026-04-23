"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#6d28d9",
];

interface Props {
  weights: Record<string, number>;
}

export function AllocationPieChart({ weights }: Props) {
  const data = Object.entries(weights)
    .filter(([, w]) => w > 0.001)
    .sort(([, a], [, b]) => b - a)
    .map(([ticker, weight]) => ({
      name: ticker,
      value: Math.round(weight * 1000) / 10,
    }));

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(val: unknown) => [`${val}%`, "Allocation"]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
