// src/components/TrendChart.jsx
import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function TrendChart({
  data,
  showSales,
  showExpenses,
  currencyPrefix = "₱",
}) {
  const yFmt = (v) =>
    `${currencyPrefix}${Number(v || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  // UPDATED: force comma formatting with no decimals
  const tFmt = (v) =>
    `${currencyPrefix}${Number(v || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" />
        <YAxis tickFormatter={yFmt} width={80} />
        <Tooltip
          formatter={(value, name, { payload }) => {
            if (name === "net") return [tFmt(value), "Net"];
            if (name === "sales") return [tFmt(value), "Sales"];
            if (name === "expenses") return [tFmt(value), "Expenses"];
            return [value, name];
          }}
          labelFormatter={(label, payload) => {
            const p = payload && payload[0] ? payload[0].payload : null;
            return p?.key || label;
          }}
        />
        {/* Straight lines (no smoothing), specific colors */}
        {showSales && (
          <Line
            type="linear"
            dataKey="sales"
            dot={false}
            strokeWidth={2}
            connectNulls
            stroke="#22c55e" // green
            isAnimationActive={false}
          />
        )}
        {showExpenses && (
          <Line
            type="linear"
            dataKey="expenses"
            dot={false}
            strokeWidth={2}
            connectNulls
            stroke="#f59e0b" // orange
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
