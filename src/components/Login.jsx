import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Button,
  CircularProgress,
  Alert,
  Stack,
} from "@mui/material";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";

const SHIFT_OPTIONS = ["Morning", "Afternoon", "Evening"];

function guessShiftPHT() {
  try {
    const h = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        hour12: false,
        hour: "2-digit",
      }).format(new Date()),
      10
    );
    if (h >= 4 && h < 11) return "Morning";
    if (h >= 11 && h < 17) return "Afternoon";
    return "Evening";
  } catch {
    const h = new Date().getHours();
    if (h >= 4 && h < 11) return "Morning";
    if (h >= 11 && h < 17) return "Afternoon";
    return "Evening";
  }
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function humanizeAuthError(err) {
  const code = (err?.code || "").toLowerCase();
  const msg  = (err?.message || "").toLowerCase();

  if (code === "shift/active-other" || msg.includes("shift is already active"))
    return err?.message || "A shift is already active. Please wait until it ends.";

  if (code === "auth/account-suspended" || msg.includes("suspended"))
    return "This account has been suspended. Please contact your administrator.";

  const table = {
    "auth/invalid-email":           "That email doesn't look right.",
    "auth/missing-email":           "Please enter your email.",
    "auth/missing-password":        "Please enter your password.",
    "auth/user-not-found":          "No account found with that email.",
    "auth/invalid-credential":      "Email or password is incorrect.",
    "auth/wrong-password":          "Email or password is incorrect.",
    "auth/too-many-requests":       "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed":  "Network error. Check your connection.",
    "auth/user-disabled":           "This account has been disabled.",
  };
  if (table[code]) return table[code];
  if (msg.includes("wrong-password") || msg.includes("password")) return "Email or password is incorrect.";
  if (msg.includes("network")) return "Network error. Check your connection.";

  return "Sign-in failed. Check your email and password.";
}

// ── Login component ──────────────────────────────────────────────────────────
// Props:
//   onLogin(email, password) → Promise<{ type: 'admin'|'scheduled'|'covered'|'relogin'|'fallback', scheduleEntry?, shiftPeriod? }>
//   onStartShift(type, scheduleEntry, fallbackPeriod, fallbackNote) → Promise<void>
//   onCancelLogin() → Promise<void>
export default function Login({ onLogin, onStartShift, onCancelLogin }) {
  // Phase machine: 'credentials' | 'confirm' | 'fallback'
  const [phase, setPhase] = useState("credentials");

  // Phase 1 fields
  const [email,        setEmail]       = useState("");
  const [password,     setPassword]    = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Phase 2 — result from login
  const [loginResult, setLoginResult] = useState(null);

  // Phase 2 — fallback fields
  const [fallbackPeriod, setFallbackPeriod] = useState(guessShiftPHT);
  const [fallbackNote,   setFallbackNote]   = useState("");

  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");
  const [branding, setBranding] = useState({ storeName: "Print+Play", logoUrl: "/logo.png" });

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "config"));
        if (snap.exists()) {
          const d = snap.data();
          setBranding({ storeName: d.storeName || "Print+Play", logoUrl: d.logoUrl || "/logo.png" });
        }
      } catch {}
    })();
  }, []);

  // ── Phase 1: credential submit ──
  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const result = await onLogin(email, password);
      // If admin, parent handles routing — this component may unmount
      if (result?.type !== "admin") {
        setLoginResult(result);
        setPhase(result.type === "fallback" ? "fallback" : "confirm");
      }
    } catch (error) {
      setErr(humanizeAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  // ── Phase 2: start shift ──
  const handleStartShift = async () => {
    setErr(""); setLoading(true);
    try {
      await onStartShift(
        loginResult.type,
        loginResult.scheduleEntry || null,
        fallbackPeriod,
        fallbackNote,
      );
      // parent sets activeShiftId → route changes → this unmounts
    } catch (error) {
      setErr(humanizeAuthError(error));
      setLoading(false);
    }
  };

  // ── Back / cancel pending auth ──
  const handleBack = async () => {
    setLoading(true);
    try { await onCancelLogin?.(); } catch {}
    setPhase("credentials");
    setLoginResult(null);
    setErr("");
    setFallbackNote("");
    setLoading(false);
  };

  const clearErr = (setter) => (e) => { setter(e.target.value); if (err) setErr(""); };

  const credDisabled = loading || !email || !password;
  const shiftDisabled = loading || (phase === "fallback" && !fallbackPeriod);

  // ── Branding header (shared across phases) ──
  const Header = () => (
    <>
      <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
        <Box
          component="img"
          src={branding.logoUrl}
          alt={`${branding.storeName} Logo`}
          sx={{ width: 64, height: 64, objectFit: "contain", borderRadius: 1, opacity: loading ? 0.7 : 1 }}
        />
      </Box>
      <Typography align="center" variant="h5" gutterBottom>{branding.storeName}</Typography>
      <Typography align="center" variant="caption" display="block" sx={{ mt: -1, mb: 2, opacity: 0.5 }}>
        v{__APP_VERSION__}
      </Typography>
    </>
  );

  // ── Loading overlay ──
  const LoadingOverlay = () =>
    loading ? (
      <Box
        aria-busy="true"
        sx={{
          position: "fixed", inset: 0, zIndex: (t) => t.zIndex.modal + 2,
          background: "linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.72))",
          backdropFilter: "blur(1px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 1, color: "#fff",
        }}
      >
        <CircularProgress size={36} />
        <Typography variant="caption">
          {phase === "credentials" ? "Signing in…" : "Starting shift…"}
        </Typography>
      </Box>
    ) : null;

  // ══ PHASE: credentials ══════════════════════════════════════════════════════
  if (phase === "credentials") {
    return (
      <>
        <Card sx={{ width: 440, maxWidth: "92vw", p: 3 }} elevation={6}>
          <Header />

          {err && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setErr("")}>{err}</Alert>
          )}

          <Box
            component="form"
            onSubmit={handleCredentialSubmit}
            sx={{ display: "grid", gap: 2, opacity: loading ? 0.6 : 1 }}
          >
            <TextField
              label="Email" type="email"
              value={email} onChange={clearErr(setEmail)}
              autoComplete="username"
              fullWidth required disabled={loading}
            />
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password} onChange={clearErr(setPassword)}
              autoComplete="current-password"
              fullWidth required disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(s => !s)}
                      edge="end" disabled={loading}
                      aria-label="toggle password visibility"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit" variant="contained" fullWidth
              disabled={credDisabled} sx={{ mt: 0.5 }}
            >
              {loading ? "Signing in…" : "SIGN IN"}
            </Button>
          </Box>
        </Card>
        <LoadingOverlay />
      </>
    );
  }

  // ══ PHASE: confirm (scheduled / covered / relogin) ══════════════════════════
  if (phase === "confirm") {
    const entry = loginResult?.scheduleEntry;
    const type  = loginResult?.type;

    const isRelogin  = type === "relogin";
    const isCovered  = type === "covered";
    const shiftLabel = entry?.shiftLabel || loginResult?.shiftPeriod || "";
    const timeRange  = entry?.startTime
      ? `${formatTime(entry.startTime)} – ${formatTime(entry.endTime)}`
      : "";

    return (
      <>
        <Card sx={{ width: 440, maxWidth: "92vw", p: 3 }} elevation={6}>
          <Header />

          {err && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr("")}>{err}</Alert>
          )}

          {/* Shift info card */}
          <Box
            sx={{
              border: "1px solid",
              borderColor: isRelogin ? "warning.main" : "success.main",
              borderRadius: 2, p: 2, mb: 3,
              bgcolor: isRelogin ? "rgba(255,167,38,.05)" : "rgba(102,187,106,.05)",
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
              {isRelogin
                ? <AutorenewIcon color="warning" />
                : <CheckCircleOutlineIcon color="success" />}
              <Typography variant="subtitle1" fontWeight={700}>
                {isRelogin ? "Shift Still Active" : isCovered ? "Coverage Confirmed" : "Shift Confirmed"}
              </Typography>
            </Stack>

            {isRelogin ? (
              <Typography variant="body2" color="text.secondary">
                Your <strong>{shiftLabel}</strong> shift is still in progress.
                Click Continue to resume.
              </Typography>
            ) : isCovered ? (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  You are covering <strong>{entry?.staffName || entry?.staffEmail}</strong>
                </Typography>
                <Typography variant="body1" fontWeight={600}>{shiftLabel} Shift</Typography>
                {timeRange && <Typography variant="body2" color="text.secondary">{timeRange}</Typography>}
              </>
            ) : (
              <>
                <Typography variant="body1" fontWeight={600}>{shiftLabel} Shift</Typography>
                {timeRange && <Typography variant="body2" color="text.secondary">{timeRange}</Typography>}
              </>
            )}
          </Box>

          <Stack direction="row" spacing={1.5}>
            <Button fullWidth variant="outlined" onClick={handleBack} disabled={loading}>
              ← Back
            </Button>
            <Button fullWidth variant="contained" onClick={handleStartShift} disabled={shiftDisabled}>
              {loading ? "Starting…" : isRelogin ? "CONTINUE" : "START SHIFT"}
            </Button>
          </Stack>
        </Card>
        <LoadingOverlay />
      </>
    );
  }

  // ══ PHASE: fallback (no schedule found) ═════════════════════════════════════
  return (
    <>
      <Card sx={{ width: 440, maxWidth: "92vw", p: 3 }} elevation={6}>
        <Header />

        {err && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr("")}>{err}</Alert>
        )}

        <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 2.5 }}>
          No schedule found for today. Please select your shift below.
        </Alert>

        <Box sx={{ display: "grid", gap: 2, mb: 3 }}>
          <FormControl fullWidth required>
            <InputLabel>Shift Period</InputLabel>
            <Select
              label="Shift Period"
              value={fallbackPeriod}
              onChange={e => setFallbackPeriod(e.target.value)}
              disabled={loading}
            >
              {SHIFT_OPTIONS.map(opt => (
                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Notes (optional)"
            value={fallbackNote}
            onChange={e => setFallbackNote(e.target.value)}
            fullWidth multiline rows={2} disabled={loading}
            placeholder="e.g. Covering for Juan, special shift, etc."
          />
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button fullWidth variant="outlined" onClick={handleBack} disabled={loading}>
            ← Back
          </Button>
          <Button fullWidth variant="contained" onClick={handleStartShift} disabled={shiftDisabled}>
            {loading ? "Starting…" : "START SHIFT"}
          </Button>
        </Stack>
      </Card>
      <LoadingOverlay />
    </>
  );
}
