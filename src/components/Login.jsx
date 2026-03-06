import React, { useState, useEffect, useRef } from "react";
import {
  Box, Card, Typography, TextField, InputAdornment, IconButton,
  MenuItem, FormControl, InputLabel, Select, Button, CircularProgress,
  Alert, Stack,
} from "@mui/material";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import EmailIcon from "@mui/icons-material/Email";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LoginIcon from "@mui/icons-material/Login";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

const SHIFT_OPTIONS = ["Morning", "Afternoon", "Evening"];

function guessShiftPHT() {
  try {
    const h = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila", hour12: false, hour: "2-digit",
      }).format(new Date()), 10
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

  if (code === "auth/account-suspended" || msg.includes("suspended"))
    return "This account has been suspended. Please contact your administrator.";

  const table = {
    "auth/invalid-email":          "That email doesn't look right.",
    "auth/missing-email":          "Please enter your email.",
    "auth/missing-password":       "Please enter your password.",
    "auth/user-not-found":         "No account found with that email.",
    "auth/invalid-credential":     "Email or password is incorrect.",
    "auth/wrong-password":         "Email or password is incorrect.",
    "auth/too-many-requests":      "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/user-disabled":          "This account has been disabled.",
  };
  if (table[code]) return table[code];
  if (msg.includes("wrong-password") || msg.includes("password")) return "Email or password is incorrect.";
  if (msg.includes("network")) return "Network error. Check your connection.";
  return "Sign-in failed. Check your email and password.";
}

// ── Particle canvas — defined outside Login so it never remounts on re-render ──
function ParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const setSize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();

    let ps = [];
    let raf = 0;

    const make = () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      v: Math.random() * 0.25 + 0.05,
      o: Math.random() * 0.35 + 0.15,
    });

    const init = () => {
      ps = [];
      const count = Math.floor((canvas.width * canvas.height) / 9000);
      for (let i = 0; i < count; i++) ps.push(make());
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ps.forEach(p => {
        p.y -= p.v;
        if (p.y < 0) {
          p.x = Math.random() * canvas.width;
          p.y = canvas.height + Math.random() * 40;
          p.v = Math.random() * 0.25 + 0.05;
          p.o = Math.random() * 0.35 + 0.15;
        }
        ctx.fillStyle = `rgba(250,250,250,${p.o})`;
        ctx.fillRect(p.x, p.y, 0.7, 2.2);
      });
      raf = requestAnimationFrame(draw);
    };

    const onResize = () => { setSize(); init(); };
    window.addEventListener("resize", onResize);
    init();
    raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        opacity: 0.4, mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
}

// ── Shared glass card style ───────────────────────────────────────────────────
const CARD_SX = {
  width: 420,
  maxWidth: "92vw",
  p: 4,
  background: "rgba(10,10,10,0.85)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid #2a2a2a",
  borderRadius: 2,
  boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
};

// ── Main component ────────────────────────────────────────────────────────────
// Props:
//   onLogin(email, password)                → Promise<{ type: 'admin'|'scheduled'|'covered'|'relogin'|'fallback'|'clockin', ... }>
//   onStartShift(type, entry, period, note) → Promise<void>
//   onClockIn()                             → Promise<void>
//   onCancelLogin()                         → Promise<void>
export default function Login({ onLogin, onStartShift, onClockIn, onCancelLogin }) {
  // Phase machine: 'credentials' | 'confirm' | 'fallback' | 'clockin'
  const [phase, setPhase] = useState("credentials");

  // Periodic grid-line animation reset — increments key every 9s to remount grid divs
  const [gridKey, setGridKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setGridKey(k => k + 1), 9000);
    return () => clearInterval(id);
  }, []);

  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [showPassword,   setShowPassword]   = useState(false);
  const [loginResult,    setLoginResult]    = useState(null);
  const [fallbackPeriod, setFallbackPeriod] = useState(guessShiftPHT);
  const [fallbackNote,   setFallbackNote]   = useState("");

  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");
  const [branding, setBranding] = useState({ storeName: "Kunek", logoUrl: "/logo.png" });

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "config"));
        if (snap.exists()) {
          const d = snap.data();
          setBranding({ storeName: d.storeName || "Kunek", logoUrl: d.logoUrl || "/logo.png" });
        }
      } catch {}
    })();
  }, []);

  // ── Handlers ──
  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const result = await onLogin(email, password);
      if (result?.type !== "admin") {
        setLoginResult(result);
        if (result.type === "fallback")     setPhase("fallback");
        else if (result.type === "clockin") setPhase("clockin");
        else                                setPhase("confirm");
      }
    } catch (error) {
      setErr(humanizeAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleStartShift = async () => {
    setErr(""); setLoading(true);
    try {
      await onStartShift(loginResult.type, loginResult.scheduleEntry || null, fallbackPeriod, fallbackNote);
    } catch (error) {
      setErr(humanizeAuthError(error));
      setLoading(false);
    }
  };

  const handleClockInConfirm = async () => {
    setErr(""); setLoading(true);
    try {
      await onClockIn();
    } catch (error) {
      setErr(humanizeAuthError(error));
      setLoading(false);
    }
  };

  const handleBack = async () => {
    setLoading(true);
    try { await onCancelLogin?.(); } catch {}
    setPhase("credentials");
    setLoginResult(null);
    setErr("");
    setFallbackNote("");
    setLoading(false);
  };

  const clearErr      = (setter) => (e) => { setter(e.target.value); if (err) setErr(""); };
  const credDisabled  = loading || !email || !password;
  const shiftDisabled = loading || (phase === "fallback" && !fallbackPeriod);

  // ── Card content per phase ──
  // NOTE: The full-screen shell and `pp-card` wrapper are rendered once and
  // never unmount — only the card content below changes. This prevents the
  // CSS entry animation from replaying on every keystroke.

  const cardContent = (() => {
    // ── credentials ──
    if (phase === "credentials") return (
      <>
        {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr("")}>{err}</Alert>}

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
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon sx={{ fontSize: 17, color: "text.disabled" }} />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password} onChange={clearErr(setPassword)}
            autoComplete="current-password"
            fullWidth required disabled={loading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ fontSize: 17, color: "text.disabled" }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(s => !s)}
                    edge="end" disabled={loading}
                    aria-label="toggle password visibility"
                    size="small"
                  >
                    {showPassword
                      ? <VisibilityOff sx={{ fontSize: 17 }} />
                      : <Visibility   sx={{ fontSize: 17 }} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* Forgot password — placeholder, not yet implemented */}
          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: -0.5 }}>
            {/* TODO: implement forgot password flow */}
            <Typography
              variant="caption"
              title="Coming soon"
              sx={{ color: "#444", cursor: "default", userSelect: "none" }}
            >
              Forgot password?
            </Typography>
          </Box>

          {/*
            Remember me — reserved for future use
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Checkbox size="small" id="remember-me" />
              <Typography variant="caption" color="text.secondary" component="label" htmlFor="remember-me">
                Remember me
              </Typography>
            </Box>
          */}

          <Button
            type="submit" variant="contained" fullWidth
            disabled={credDisabled}
            startIcon={<LoginIcon />}
            sx={{ height: 42, mt: 0.5 }}
          >
            Sign In
          </Button>

          {/* Version number — below the sign in button */}
          <Typography
            variant="caption"
            align="center"
            sx={{ color: "#3a3a3a", fontFamily: "monospace", mt: -0.5 }}
          >
            v{__APP_VERSION__}
          </Typography>
        </Box>
      </>
    );

    // ── confirm ──
    if (phase === "confirm") {
      const entry      = loginResult?.scheduleEntry;
      const type       = loginResult?.type;
      const isRelogin  = type === "relogin";
      const isCovered  = type === "covered";
      const shiftLabel = entry?.shiftLabel || loginResult?.shiftPeriod || "";
      const timeRange  = entry?.startTime
        ? `${formatTime(entry.startTime)} – ${formatTime(entry.endTime)}`
        : "";
      return (
        <>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {isRelogin ? "Shift Still Active" : isCovered ? "Coverage Confirmed" : "Shift Confirmed"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {isRelogin ? "Your shift is still in progress" : "Ready to start your shift"}
          </Typography>

          {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr("")}>{err}</Alert>}

          <Box sx={{
            border: "1px solid",
            borderColor: isRelogin ? "warning.main" : "success.main",
            borderRadius: 1.5, p: 2, mb: 3,
            bgcolor: isRelogin ? "rgba(255,167,38,.05)" : "rgba(102,187,106,.05)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.75 }}>
              {isRelogin
                ? <AutorenewIcon color="warning" />
                : <CheckCircleOutlineIcon color="success" />}
              <Typography variant="subtitle2" fontWeight={700}>{shiftLabel} Shift</Typography>
            </Stack>
            {isCovered && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Covering <strong>{entry?.staffName || entry?.staffEmail}</strong>
              </Typography>
            )}
            {isRelogin && (
              <Typography variant="body2" color="text.secondary">Click Continue to resume.</Typography>
            )}
            {timeRange && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {timeRange}
              </Typography>
            )}
          </Box>

          <Stack direction="row" spacing={1.5}>
            <Button fullWidth variant="outlined" onClick={handleBack} disabled={loading}>← Back</Button>
            <Button fullWidth variant="contained" onClick={handleStartShift} disabled={shiftDisabled}>
              {isRelogin ? "Continue" : "Start Shift"}
            </Button>
          </Stack>
        </>
      );
    }

    // ── clockin ──
    if (phase === "clockin") {
      const { cashierName, shiftPeriod } = loginResult || {};
      return (
        <>
          <Typography variant="h5" fontWeight={700} gutterBottom>Clock In</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            A shift is already in progress
          </Typography>

          {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr("")}>{err}</Alert>}

          <Box sx={{
            border: "1px solid #2a2a2a",
            borderRadius: 1.5, p: 2, mb: 3,
            bgcolor: "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
              <AccessTimeIcon sx={{ color: "primary.main" }} />
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  {shiftPeriod || "Active"} Shift
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Cashier: {cashierName || "—"}
                </Typography>
              </Box>
            </Stack>
            <Alert severity="info" sx={{ fontSize: "0.75rem", py: 0.5 }}>
              You'll clock in as a non-cashier staff member. POS access is not available.
            </Alert>
          </Box>

          <Stack direction="row" spacing={1.5}>
            <Button fullWidth variant="outlined" onClick={handleBack} disabled={loading}>← Back</Button>
            <Button
              fullWidth variant="contained"
              onClick={handleClockInConfirm} disabled={loading}
              startIcon={<LoginIcon />}
            >
              Clock In
            </Button>
          </Stack>
        </>
      );
    }

    // ── fallback ──
    return (
      <>
        <Typography variant="h5" fontWeight={700} gutterBottom>Start Shift</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          No schedule found for today
        </Typography>

        {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr("")}>{err}</Alert>}

        <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 2.5 }}>
          Select your shift period to continue.
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
          <Button fullWidth variant="outlined" onClick={handleBack} disabled={loading}>← Back</Button>
          <Button fullWidth variant="contained" onClick={handleStartShift} disabled={shiftDisabled}>
            Start Shift
          </Button>
        </Stack>
      </>
    );
  })();

  // ── Single render — shell never unmounts, only card content changes ──
  return (
    <Box sx={{
      position: "fixed", inset: 0,
      bgcolor: "background.default",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* CSS animations — injected once, never re-injected */}
      <style>{`
        .pp-hline, .pp-vline {
          position: absolute; background: #1e1e1e; will-change: transform, opacity;
        }
        .pp-hline {
          left: 0; right: 0; height: 1px;
          transform: scaleX(0); transform-origin: 50% 50%;
          animation: ppDrawX .8s cubic-bezier(.22,.61,.36,1) forwards;
        }
        .pp-vline {
          top: 0; bottom: 0; width: 1px;
          transform: scaleY(0); transform-origin: 50% 0%;
          animation: ppDrawY .9s cubic-bezier(.22,.61,.36,1) forwards;
        }
        .pp-hline:nth-child(1){top:18%;animation-delay:.12s}
        .pp-hline:nth-child(2){top:50%;animation-delay:.22s}
        .pp-hline:nth-child(3){top:82%;animation-delay:.32s}
        .pp-vline:nth-child(4){left:22%;animation-delay:.42s}
        .pp-vline:nth-child(5){left:50%;animation-delay:.54s}
        .pp-vline:nth-child(6){left:78%;animation-delay:.66s}
        @keyframes ppDrawX{0%{transform:scaleX(0);opacity:0}60%{opacity:.9}100%{transform:scaleX(1);opacity:.55}}
        @keyframes ppDrawY{0%{transform:scaleY(0);opacity:0}60%{opacity:.9}100%{transform:scaleY(1);opacity:.55}}
        .pp-card {
          opacity: 0; transform: translateY(18px);
          animation: ppFadeUp .75s cubic-bezier(.22,.61,.36,1) .25s forwards;
        }
        @keyframes ppFadeUp { to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Grid lines — key resets CSS animations every 9s */}
      <Box key={gridKey} sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div className="pp-hline" /><div className="pp-hline" /><div className="pp-hline" />
        <div className="pp-vline" /><div className="pp-vline" /><div className="pp-vline" />
      </Box>

      {/* Red tint vignette */}
      <Box sx={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(75% 55% at 50% 25%, rgba(209,0,0,0.05), transparent 65%)",
      }} />

      {/* Particles */}
      <ParticleCanvas />

      {/* Centered card — pp-card wrapper stays mounted, content swaps inside */}
      <Box sx={{
        flex: 1, position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
        px: 2,
      }}>
        <Box className="pp-card">
          <Card elevation={0} sx={CARD_SX}>
            {/* Branding — logo + store name at top of card */}
            <Stack alignItems="center" spacing={1} sx={{ mb: 3.5 }}>
              <Box
                component="img"
                src={branding.logoUrl}
                alt="logo"
                sx={{ width: 44, height: 44, objectFit: "contain", borderRadius: 1 }}
              />
              <Typography variant="caption" sx={{
                letterSpacing: "0.13em", textTransform: "uppercase",
                color: "text.secondary", fontWeight: 600,
              }}>
                {branding.storeName}
              </Typography>
            </Stack>

            {cardContent}
          </Card>
        </Box>
      </Box>

      {/* Powered by + version */}
      <Box sx={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', zIndex: 10 }}>
        <Typography variant="caption" sx={{ opacity: 0.35, fontSize: '0.65rem', letterSpacing: '0.08em', color: 'text.secondary' }}>
          Powered by Kunek &nbsp;·&nbsp; v{__APP_VERSION__}
        </Typography>
      </Box>

      {/* Loading overlay */}
      {loading && (
        <Box aria-busy="true" sx={{
          position: "fixed", inset: 0, zIndex: 99,
          background: "linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.75))",
          backdropFilter: "blur(1px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 1.5,
        }}>
          <CircularProgress size={32} sx={{ color: "primary.main" }} />
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.65)" }}>
            {phase === "credentials" ? "Signing in…"
              : phase === "clockin"  ? "Clocking in…"
              : "Starting shift…"}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
