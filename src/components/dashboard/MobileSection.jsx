// src/components/admin/MobileSection.jsx
import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export default function MobileSection({ title, children, defaultExpanded = false }) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      sx={{
        display: { xs: "block", md: "none" },
        borderRadius: 2,
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, px: { xs: 1.5, sm: 2 }, pb: 1.5 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
