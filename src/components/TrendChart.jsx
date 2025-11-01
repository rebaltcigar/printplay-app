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
  const displayData = data.map((d) => {
    const capital = Number(d.capital || 0);
    const baseExpenses = Number(d.expenses || 0);
    const expensesNoCap = Math.max(0, baseExpenses - capital);
    return {
      ...d,
      displayExpenses: includeCapitalInExpenses ? baseExpenses : expensesNoCap,
    };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={displayData}
        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" />
        <YAxis tickFormatter={peso} />
        <Tooltip
          formatter={(value, name, props) => {
            if (name === "sales") return [peso(value), "Sales"];
            if (name === "displayExpenses") {
              const hasCapital = Number(props?.payload?.capital || 0) > 0;
              const label = hasCapital
                ? includeCapitalInExpenses
                  ? "Expenses (incl. capital)"
                  : "Expenses (no capital)"
                : "Expenses";
              return [peso(value), label];
            }
            return [value, name];
          }}
          itemSorter={(item) => {
            if (item.dataKey === "sales") return -2;
            if (item.dataKey === "displayExpenses") return -1;
            return 0;
          }}
        />
        {showSales && (
          <Line
            type="linear"
            dataKey="sales"
            stroke="#1976d2"
            strokeWidth={2.2}
            dot={false}
            name="Sales"
          />
        )}
        {showExpenses && (
          <Line
            type="linear"
            dataKey="displayExpenses"
            stroke="#d32f2f"
            strokeWidth={2}
            dot={false}
            name="Expenses"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
