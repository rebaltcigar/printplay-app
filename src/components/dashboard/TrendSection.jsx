// src/components/dashboard/TrendSection.jsx
import React from "react";
import {
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import TrendChart from "../TrendChart";

export default function TrendSection({
  preset,
  allTimeMode,
  setAllTimeMode,
  trendSeries,
  showSales,
  setShowSales,
  showExpenses,
  setShowExpenses,
  includeCapitalInExpenses,
  setIncludeCapitalInExpenses,
}) {
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Trend
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.6 }}>
          {preset === "past7" && "Daily (MM/DD)"}
          {(preset === "thisMonth" || preset === "monthYear") &&
            "Daily (1–31)"}
          {preset === "thisYear" && "Monthly (Jan–Dec)"}
          {preset === "allTime" &&
            (allTimeMode === "monthly" ? "Monthly" : "Yearly")}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {/* toggles on the top right */}
        {preset === "allTime" && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>View</InputLabel>
            <Select
              label="View"
              value={allTimeMode}
              onChange={(e) => setAllTimeMode(e.target.value)}
            >
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>
        )}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TrendChart
          data={trendSeries}
          showSales={true}
          showExpenses={true}
          includeCapitalInExpenses={false}
        />
      </Box>
    </>
  );
}
