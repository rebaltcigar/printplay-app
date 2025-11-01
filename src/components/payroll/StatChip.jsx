// src/components/payroll/StatChip.jsx
import React from "react";
import { Chip } from "@mui/material";

export default function StatChip({ label, value, bold = false }) {
  return (
    <Chip sx={{ fontWeight: bold ? 700 : 500 }} label={`${label}: ${value}`} />
  );
}
