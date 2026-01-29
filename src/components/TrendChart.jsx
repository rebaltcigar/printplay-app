// src/components/TrendChart.jsx
import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export default function TrendChart({
  data = [],
  showSales = true,
  showExpenses = true,
  includeCapitalInExpenses = true,
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
        <XAxis dataKey="x" stroke="#777" />
        <YAxis tickFormatter={peso} stroke="#777" />
        <Tooltip
          contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
          formatter={(value, name) => {
            if (name === "sales") return [peso(value), "Gross Sales"];
            if (name === "operatingProfit") return [peso(value), "Operating Profit"];
            if (name === "netCashFlow") return [peso(value), "Net Cash Flow"];
            return [peso(value), name];
          }}
        />
        {showSales && (
          <Line
            type="monotone"
            dataKey="sales"
            stroke="#4caf50" // Green
            strokeWidth={2}
            dot={false}
            name="sales"
          />
        )}
        {showExpenses && (
          <Line
            type="monotone"
            dataKey="operatingProfit"
            stroke="#d32f2f" // Red
            strokeWidth={2}
            dot={false}
            name="operatingProfit"
          />
        )}
        {includeCapitalInExpenses && showExpenses && (
          <Line
            type="monotone"
            dataKey="netCashFlow"
            stroke="#ff9800" // Orange
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="netCashFlow"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
