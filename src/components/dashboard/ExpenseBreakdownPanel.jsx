// src/components/dashboard/ExpenseBreakdownPanel.jsx
import React, { useMemo } from "react";
import { Card, Typography, Box, Stack, Divider } from "@mui/material";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtPeso, txAmount } from "../../utils/analytics";

const COLORS = ["#D32F2F", "#E64A19", "#F57C00", "#FFA000", "#FBC02D", "#388E3C", "#1976D2", "#7B1FA2"];

export default function ExpenseBreakdownPanel({ transactions = [] }) {

  const list = useMemo(() => {
    const groups = {};
    transactions.forEach(t => {
      // Logic for Expense
      if (t.isDeleted) return;
      const isExp = t.expenseType || t.item === 'Expenses' || t.category === 'credit' || (t.amount < 0 && !t.serviceId);
      if (!isExp) return;

      const val = txAmount(t);
      const amt = Math.abs(val || 0); // use helper + Math.abs
      const name = t.expenseType || t.item || "Misc";

      if (!groups[name]) groups[name] = 0;
      groups[name] += amt;
    });

    return Object.entries(groups)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  // Chart Data: Top 5 + Others
  const chartData = useMemo(() => {
    if (!list.length) return [];
    if (list.length <= 5) return list.map(r => ({ name: r.name, value: r.amount }));

    const top = list.slice(0, 5).map(r => ({ name: r.name, value: r.amount }));
    const others = list.slice(5);
    const otherTotal = others.reduce((s, x) => s + x.amount, 0);

    return [...top, { name: "Others", value: otherTotal }];
  }, [list]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <Box sx={{ bgcolor: 'background.paper', p: 1, border: '1px solid #333', borderRadius: 1 }}>
          <Typography variant="body2">{d.name}: {fmtPeso(d.value)}</Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <Card
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        height: "100%",
        minHeight: 500,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Expense Breakdown
      </Typography>

      {list.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No expenses data.</Typography>
      ) : (
        <>
          <Box sx={{ height: 250, width: "100%" }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#d32f2f"
                  dataKey="value"
                  nameKey="name"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </Box>

          <Divider />

          <Typography variant="subtitle2">Details</Typography>
          <Box sx={{ flex: 1, overflowY: "auto", pr: 1, maxHeight: 200 }}>
            <Stack spacing={1}>
              {list.map((row, i) => (
                <Box key={row.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        bgcolor: COLORS[i % COLORS.length],
                        borderRadius: '2px',
                        flexShrink: 0
                      }}
                    />
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {row.name}
                    </Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="bold" sx={{ flexShrink: 0, ml: 1 }}>
                    {fmtPeso(row.amount)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </>
      )}
    </Card>
  );
}
