// src/components/payroll/PaySlipViewer.jsx
// Renders a single pay slip for viewing and download.

import React, { useRef, useState, useEffect } from "react";
import {
  Box,
  Typography,
  Divider,
  Stack,
  Paper,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import DownloadIcon from "@mui/icons-material/Download";
import BusinessIcon from "@mui/icons-material/Business";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import LocationOnIcon from "@mui/icons-material/LocationOn";

import { fmtCurrency, fmtDate } from "../../utils/formatters";
import { toLocaleDateStringPHT, toHours } from "../../utils/payrollHelpers";

export default function PaySlipViewer({ stub, appSettings }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const [logoDataUrl, setLogoDataUrl] = useState("");

  // Convert logo to DataURL to bypass CORS for html2canvas
  useEffect(() => {
    if (!appSettings?.logoUrl) return;

    // Local controller to cleanup if component unmounts
    const controller = new AbortController();

    const fetchLogo = async () => {
      try {
        const response = await fetch(appSettings.logoUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("Network response was not ok");
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoDataUrl(reader.result);
        reader.readAsDataURL(blob);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn("Failed to pre-fetch logo for CORS bypass (falling back to direct URL):", err.message);
        }
      }
    };

    fetchLogo();
    return () => controller.abort();
  }, [appSettings?.logoUrl]);

  const handleDownload = async () => {
    try {
      const { default: html2canvas } = await import("html2canvas");
      // Use a hidden container or specific style for export to ensure it looks premium
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: "#FFFFFF",
        scale: 3, // Higher scale for better print quality
        useCORS: true, 
        allowTaint: true, // Allow tarnished canvas if CORS fails
      });
      const link = document.createElement("a");
      link.download = `payslip_${stub.staff_name?.replace(/\s/g, "_")}_${fmtDate(stub.period_start)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  if (!stub) return null;

  const shifts = Array.isArray(stub.shifts) ? stub.shifts : [];
  const deductions = Array.isArray(stub.deductions) ? stub.deductions : [];
  const additions = Array.isArray(stub.additions) ? stub.additions : [];

  const store = {
    name: appSettings?.storeName || "Kunek POS",
    address: appSettings?.address || "123 Business Loop, Manila, Philippines",
    email: appSettings?.email || "contact@kunek.ph",
    phone: appSettings?.phone || "0912-345-6789",
    logo: appSettings?.logoUrl || "",
  };

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      {/* Download button */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button
          size="small"
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          sx={{ 
            textTransform: "none",
            borderRadius: 2,
            boxShadow: theme.shadows[4],
            "&:hover": { boxShadow: theme.shadows[8] }
          }}
        >
          Download Slip
        </Button>
      </Box>
      
      {/* Pay Slip Content */}
      <Paper
        ref={containerRef}
        elevation={0}
        sx={{
          p: { xs: 3, sm: 6 },
          borderRadius: 4,
          border: "1px solid",
          borderColor: "rgba(0, 0, 0, 0.1)",
          backgroundColor: "#FFFFFF",
          color: "#000000",
          boxShadow: "0 8px 32px 0 rgba(0,0,0,0.1)",
          position: "relative",
          overflow: "hidden",
          "& *": { color: "#1A1A1A" }, // Force dark text for all children
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "8px",
            background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
          }
        }}
      >
        {/* Branding Header */}
        <Stack direction="row" spacing={4} sx={{ mb: 6 }} alignItems="flex-start">
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={900} letterSpacing={-1.5} sx={{ mb: 1, color: "#000000 !important" }}>
              {store.name}
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2" sx={{ color: "#666666 !important", fontWeight: 500 }}>{store.address}</Typography>
              <Typography variant="body2" sx={{ color: "#666666 !important", fontWeight: 500 }}>{store.email} · {store.phone}</Typography>
            </Stack>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="h3" fontWeight={900} sx={{ color: `${theme.palette.primary.main} !important`, lineHeight: 0.8, mb: 1, letterSpacing: -2 }}>
              PAY SLIP
            </Typography>
            <Typography variant="overline" fontWeight={800} sx={{ letterSpacing: 3, color: "#999999 !important" }}>
              CONFIDENTIAL DOCUMENT
            </Typography>
          </Box>
        </Stack>

        {/* Employee Info Section - Tidied Up */}
        <Box 
          sx={{ 
            p: 3, 
            mb: 4, 
            borderRadius: 3, 
            bgcolor: "#FDFDFD",
            border: "1px solid",
            borderColor: "rgba(0,0,0,0.06)",
          }}
        >
          <Typography variant="overline" sx={{ color: "#999999 !important", fontWeight: 800, letterSpacing: 2, mb: 2, display: "block" }}>
            EMPLOYEE INFORMATION
          </Typography>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Box sx={{ flex: "1 1 200px" }}>
              <Typography variant="caption" sx={{ color: "#888888 !important", fontWeight: 700, display: "block", mb: 0.5 }}>NAME</Typography>
              <Typography variant="subtitle1" fontWeight={800}>{stub.staff_name}</Typography>
            </Box>
            <Box sx={{ flex: "1 1 150px" }}>
              <Typography variant="caption" sx={{ color: "#888888 !important", fontWeight: 700, display: "block", mb: 0.5 }}>PAY PERIOD</Typography>
              <Typography variant="body2" fontWeight={700}>
                {toLocaleDateStringPHT(stub.period_start)} – {toLocaleDateStringPHT(stub.period_end)}
              </Typography>
            </Box>
            <Box sx={{ flex: "0 1 120px" }}>
              <Typography variant="caption" sx={{ color: "#888888 !important", fontWeight: 700, display: "block", mb: 0.5 }}>PAY DATE</Typography>
              <Typography variant="body2" fontWeight={800} color="primary">{toLocaleDateStringPHT(stub.pay_date)}</Typography>
            </Box>
          </Stack>

          <Divider sx={{ my: 2.5, opacity: 0.1 }} />

          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Box sx={{ flex: "1 1 150px" }}>
              <Typography variant="caption" sx={{ color: "#888888 !important", fontWeight: 700, display: "block", mb: 0.5 }}>HOURLY RATE</Typography>
              <Typography variant="body2" fontWeight={700}>{fmtCurrency(stub.rate)}/hr</Typography>
            </Box>
            <Box sx={{ flex: "1 1 150px" }}>
              <Typography variant="caption" sx={{ color: "#888888 !important", fontWeight: 700, display: "block", mb: 0.5 }}>TOTAL HOURS</Typography>
              <Typography variant="body2" fontWeight={700}>{Number(stub.total_hours || 0).toFixed(2)}</Typography>
            </Box>
          </Stack>
        </Box>

        {/* Financials Breakdown Grid - Symmetrical Totals */}
        <Stack direction="row" spacing={0} sx={{ mb: 6, border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
          {/* Earnings Column */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid", borderColor: "divider" }}>
            <Box sx={{ p: 3, flex: 1 }}>
              <Typography variant="overline" sx={{ color: "#666666 !important", fontWeight: 800, letterSpacing: 1.5, mb: 2, display: "block" }}>
                EARNINGS
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Regular Pay ({Number(stub.total_hours || 0).toFixed(2)} hrs)</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtCurrency(stub.gross_pay)}</Typography>
                  </Stack>
                  
                  {/* Shift Breakdown */}
                  {shifts.length > 0 && (
                    <Box sx={{ pl: 1.5, borderLeft: "2px solid #EEEEEE", mb: 2 }}>
                      {shifts.map((s, i) => (
                        <Stack key={i} direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
                          <Typography variant="caption" sx={{ color: "#888888 !important" }}>
                            {s.start ? toLocaleDateStringPHT(s.start) : "—"} ({Number(s.hours || 0).toFixed(2)} hrs)
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>{fmtCurrency(s.pay || 0)}</Typography>
                        </Stack>
                      ))}
                    </Box>
                  )}
                </Box>

                {additions.map((a, i) => (
                  <Stack key={i} direction="row" justifyContent="space-between">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {a.type.charAt(0).toUpperCase() + a.type.slice(1)} - {a.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtCurrency(a.amount)}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
            <Box sx={{ p: 2, px: 3, bgcolor: "rgba(0,0,0,0.02)", borderTop: "1px solid", borderColor: "divider" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography variant="caption" fontWeight={800} sx={{ color: "#666666 !important" }}>TOTAL EARNINGS</Typography>
                <Typography variant="subtitle1" fontWeight={800}>{fmtCurrency(stub.gross_pay + stub.total_additions)}</Typography>
              </Stack>
            </Box>
          </Box>

          {/* Deductions Column */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", bgcolor: "rgba(0,0,0,0.01)" }}>
            <Box sx={{ p: 3, flex: 1 }}>
              <Typography variant="overline" sx={{ color: "#666666 !important", fontWeight: 800, letterSpacing: 1.5, mb: 2, display: "block" }}>
                DEDUCTIONS
              </Typography>
              <Stack spacing={2}>
                {deductions.length === 0 ? (
                  <Typography variant="subtitle2" sx={{ color: "#BBBBBB !important", fontStyle: "italic", textAlign: "center", py: 2 }}>No deductions</Typography>
                ) : (
                  deductions.map((d, i) => (
                    <Stack key={i} direction="row" justifyContent="space-between">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {d.type.charAt(0).toUpperCase() + d.type.slice(1)} - {d.label}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtCurrency(d.amount)}</Typography>
                    </Stack>
                  ))
                )}
              </Stack>
            </Box>
            <Box sx={{ p: 2, px: 3, bgcolor: "rgba(0,0,0,0.02)", borderTop: "1px solid", borderColor: "divider" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography variant="caption" fontWeight={800} sx={{ color: "#666666 !important" }}>TOTAL DEDUCTIONS</Typography>
                <Typography variant="subtitle1" fontWeight={800} sx={{ color: "inherit" }}>
                   {fmtCurrency(stub.total_deductions)}
                </Typography>
              </Stack>
            </Box>
          </Box>
        </Stack>

        {/* BOTTOM SECTION: Summary & Net Pay */}
        <Box sx={{ ml: "auto", maxWidth: 300 }}>
          <Typography variant="overline" sx={{ color: "#999999 !important", fontWeight: 800, letterSpacing: 1.5, mb: 2, display: "block", textAlign: "right", pr: 0.5 }}>
            FINAL SUMMARY
          </Typography>
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" sx={{ color: "#666666 !important", fontWeight: 600 }}>Total Earnings</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtCurrency(stub.gross_pay + stub.total_additions)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" sx={{ color: "#666666 !important", fontWeight: 600 }}>Total Deductions</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>-{fmtCurrency(stub.total_deductions)}</Typography>
            </Stack>
          </Stack>
          
          <Box 
            sx={{ 
              p: 2, 
              borderRadius: 2.5, 
              bgcolor: theme.palette.primary.main,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`
            }}
          >
            <Typography variant="h6" fontWeight={900} sx={{ color: "#FFFFFF !important", letterSpacing: -0.5 }}>NET PAY</Typography>
            <Typography variant="h5" fontWeight={900} sx={{ color: "#FFFFFF !important", letterSpacing: -1 }}>
              {fmtCurrency(stub.net_pay)}
            </Typography>
          </Box>
        </Box>

        {/* Footer Note */}
        <Box sx={{ textAlign: "center", pt: 6 }}>
          <Typography variant="caption" sx={{ color: "#BBBBBB !important", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
            Computer Generated Document · Valid Without Signature
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
