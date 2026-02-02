import React, { useState } from "react";
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
  Tooltip,
  CircularProgress,
  Alert,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import ShieldPerson from "@mui/icons-material/AdminPanelSettings";

const SHIFT_OPTIONS = ["Morning", "Afternoon", "Evening"];

/** Determine current shift using Philippine Time (Asia/Manila, UTC+8). */
function guessShiftPHT() {
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      hour12: false,
      hour: "2-digit",
    }).format(new Date()); // "00".."23"
    const h = parseInt(hourStr, 10);

    if (h >= 4 && h < 11) return "Morning";     // 04:00–10:59
    if (h >= 11 && h < 17) return "Afternoon"; // 11:00–16:59
    return "Evening";                         // 17:00–03:59
  } catch {
    // Fallback if Intl/timeZone isn’t supported (rare)
    const h = new Date().getHours();
    if (h >= 4 && h < 11) return "Morning";
    if (h >= 11 && h < 17) return "Afternoon";
    return "Evening";
  }
}

/**
 * Map Firebase/Auth errors (and optional custom role-mismatch errors) to friendly text.
 * Custom errors thrown by App.jsx:
 * - { code: 'role/invalid-staff' } admin tried staff login
 * - { code: 'role/invalid-admin' } staff tried admin login
 * - { code: 'shift/active-other' } another staff owns the active shift
 *
 * NOTE TO DEVELOPER: To handle a re-login for a user with an active shift,
 * the logic inside the `onLogin` function (passed as a prop) must be updated.
 *
 * When `onLogin` detects that the user logging in is the same one who owns the
 * currently active shift, it should simply complete the login successfully
 * without throwing an error and, critically, *without* updating the existing
 * shift's start time, date, or period. The `shiftPeriod` value from this form
 * should be ignored in that specific scenario.
 */
function humanizeAuthError(err, { adminMode }) {
  const rawCode = (err?.code || "").toLowerCase();
  const rawMsg = (err?.message || "").toLowerCase();

  // Shift lock held by someone else
  if (rawCode === "shift/active-other" || rawMsg.includes("shift is already active")) {
    return err?.message || "A shift is already active. Please wait until it ends.";
  }

  // Role mismatch
  if (
    rawCode === "role/invalid-staff" ||
    rawMsg.includes("invalid staff") ||
    rawMsg.includes("admin used for staff")
  ) {
    return "This is an admin account. Please use “Login as super admin”.";
  }
  if (
    rawCode === "role/invalid-admin" ||
    rawMsg.includes("invalid admin") ||
    rawMsg.includes("staff used for admin")
  ) {
    return "You don’t have admin access. Please use the regular staff login.";
  }

  // Permission/forbidden fallback
  if (rawCode.startsWith("forbidden/") || rawCode === "permission-denied") {
    return adminMode
      ? "You don’t have admin access. Please use the regular staff login."
      : "This is an admin account. Please use “Login as super admin”.";
  }

  // Firebase/Auth common codes
  const table = {
    "auth/invalid-email": "That email doesn’t look right. Please check and try again.",
    "auth/missing-email": "Please enter your email.",
    "auth/missing-password": "Please enter your password.",
    "auth/user-not-found": "We couldn’t find an account with that email.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your internet connection and try again.",
    "auth/user-disabled": "This account has been disabled. Please contact an administrator.",
    "auth/operation-not-allowed": "This sign-in method is not enabled. Please contact an administrator.",
    "auth/popup-closed-by-user": "Login was cancelled.",
  };
  if (table[rawCode]) return table[rawCode];

  // Heuristics if code missing but message hints exist
  if (rawMsg.includes("user-not-found")) return "We couldn’t find an account with that email.";
  if (rawMsg.includes("wrong-password") || rawMsg.includes("password"))
    return "Email or password is incorrect.";
  if (rawMsg.includes("network"))
    return "Network error. Check your internet connection and try again.";

  // Fallback
  return adminMode
    ? "Admin login failed. Please check your email and password."
    : "Login failed. Please check your email and password.";
}

export default function Login({ onLogin, onAdminLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Auto-select shift based on PHT, but user can still change it.
  const [shiftPeriod, setShiftPeriod] = useState(guessShiftPHT());
  const [showPassword, setShowPassword] = useState(false);
  const [adminMode, setAdminMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      if (adminMode) {
        await onAdminLogin(email, password);
      } else {
        await onLogin(email, password, shiftPeriod);
      }
      // parent routes on success
    } catch (error) {
      const friendly = humanizeAuthError(error, { adminMode });
      setErr(friendly);

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("Auth error:", { code: error?.code, message: error?.message });
      }
    } finally {
      // ensure no spinner purgatory
      setLoading(false);
    }
  };

  const onFieldChange = (setter) => (e) => {
    setter(e.target.value);
    if (err) setErr("");
  };

  const disabled = loading || !email || !password || (!adminMode && !shiftPeriod);

  return (
    <>
      <Card
        sx={{
          width: 480,
          maxWidth: "92vw",
          p: 3,
          position: "relative",
          overflow: "hidden",
        }}
        elevation={6}
      >
        {/* subtle admin toggle icon in the corner */}
        <Tooltip title={adminMode ? "Switch to staff login" : "Login as super admin"}>
          <span>
            <IconButton
              size="small"
              onClick={() => {
                setAdminMode((v) => !v);
                setErr("");
              }}
              sx={{ position: "absolute", top: 8, right: 8 }}
              disabled={loading}
            >
              <ShieldPerson fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Centered logo from /public/logo.png */}
        <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="Print+Play Logo"
            sx={{
              width: 72,
              height: 72,
              objectFit: "contain",
              borderRadius: 1,
              userSelect: "none",
              opacity: loading ? 0.7 : 1,
            }}
          />
        </Box>

        <Typography align="center" variant="h5" gutterBottom>
          Print+Play
        </Typography>
        <Typography align="center" variant="caption" display="block" sx={{ mt: -1, mb: 2, opacity: 0.6 }}>
          v0.1.0
        </Typography>

        {/* Inline, user-friendly error */}
        {err && (
          <Alert
            role="alert"
            severity="error"
            sx={{ mb: 1, textAlign: "center" }}
            onClose={() => setErr("")}
          >
            {err}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ mt: 2, display: "grid", gap: 2, opacity: loading ? 0.6 : 1 }}
        >
          <TextField
            label="Email"
            type="email"
            value={email}
            autoComplete="username"
            onChange={onFieldChange(setEmail)}
            fullWidth
            required
            disabled={loading}
          />

          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            autoComplete="current-password"
            onChange={onFieldChange(setPassword)}
            fullWidth
            required
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((s) => !s)}
                    edge="end"
                    aria-label="toggle password visibility"
                    disabled={loading}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {!adminMode && (
            <FormControl fullWidth required disabled={loading}>
              <InputLabel>Shift Period</InputLabel>
              <Select
                label="Shift Period"
                value={shiftPeriod}
                onChange={onFieldChange(setShiftPeriod)}
              >
                {SHIFT_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Button type="submit" variant="contained" disabled={disabled} sx={{ mt: 1 }} fullWidth>
            {loading
              ? adminMode
                ? "Signing in as Admin…"
                : "Starting Shift…"
              : adminMode
                ? "LOGIN AS SUPER ADMIN"
                : "START SHIFT"}
          </Button>
        </Box>
      </Card>

      {/* FULL-PAGE loading overlay */}
      {loading && (
        <Box
          aria-busy="true"
          aria-live="polite"
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: (theme) => theme.zIndex.modal + 2,
            background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.72) 100%)",
            backdropFilter: "blur(1px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 1,
            pointerEvents: "all",
            color: "#fff",
          }}
        >
          <CircularProgress size={40} />
          <Typography variant="caption">
            {adminMode ? "Validating admin…" : "Signing you in…"}
          </Typography>
        </Box>
      )}
    </>
  );
}
