// src/components/dashboard/SalesBreakdownPanel.jsx
import React, { useMemo } from "react";
import { Card, Typography, Box, Stack, Divider } from "@mui/material";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtPeso, txAmount } from "../../utils/analytics";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AF19FF", "#FF19A3", "#19FFBF"];

export default function SalesBreakdownPanel({ transactions = [] }) {
  // Compute breakdown internally
  const list = useMemo(() => {
    const groups = {};
    transactions.forEach(t => {
      // Logic for "Sale": not deleted, amount > 0, not expense
      if (t.isDeleted) return;
      const amt = txAmount(t);
      if (amt <= 0) return; // ignore refunds/expenses
      if (t.item === 'Paid Debt') return;

      const isExp = t.expenseType || t.item === 'Expenses' || t.category === 'credit';
      if (isExp) return;

      const name = t.item || "Unknown";
      if (!groups[name]) groups[name] = 0;
      groups[name] += amt;
    });

    return Object.entries(groups)
      .map(([item, amount]) => ({ item, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  // Chart Data: Top 5 + Others
  const chartData = useMemo(() => {
    if (!list.length) return [];
    if (list.length <= 5) return list;

    const top = list.slice(0, 5);
    const others = list.slice(5);
    const otherTotal = others.reduce((s, x) => s + x.amount, 0);

    return [...top, { item: "Others", amount: otherTotal }];
  }, [list]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <Box sx={{ bgcolor: 'background.paper', p: 1, border: '1px solid #333', borderRadius: 1 }}>
          <Typography variant="body2">{d.item}: {fmtPeso(d.amount)}</Typography>
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
        minHeight: 500, // Increased height for list
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Sales Breakdown
      </Typography>

      {list.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No sales data.</Typography>
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
                  fill="#8884d8"
                  dataKey="amount"
                  nameKey="item"
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
                <Box key={row.item} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
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
                      {row.item}
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
