// src/components/Login.jsx
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
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import ShieldPerson from "@mui/icons-material/AdminPanelSettings";

const SHIFT_OPTIONS = ["Morning", "Afternoon", "Evening"];

export default function Login({ onLogin, onAdminLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shiftPeriod, setShiftPeriod] = useState(SHIFT_OPTIONS[0]);
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
      // parent will route away on success
    } catch (error) {
      const msg =
        (error && (error.message || error.code || String(error))) ||
        "Login failed.";
      setErr(msg);
      setLoading(false);
    }
  };

  const disabled =
    loading || !email || !password || (!adminMode && !shiftPeriod);

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
        <Tooltip
          title={adminMode ? "Switch to staff login" : "Login as super admin"}
        >
          <span>
            <IconButton
              size="small"
              onClick={() => setAdminMode((v) => !v)}
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

        {err && (
          <Typography
            role="alert"
            variant="body2"
            color="error"
            sx={{ textAlign: "center", mb: 1 }}
          >
            {err}
          </Typography>
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
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            required
            disabled={loading}
          />

          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
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
                onChange={(e) => setShiftPeriod(e.target.value)}
              >
                {SHIFT_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Button
            type="submit"
            variant="contained"
            disabled={disabled}
            sx={{ mt: 1 }}
            fullWidth
          >
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
            zIndex: (theme) => theme.zIndex.modal + 2, // above dialogs/cards
            // Dark gradient overlay
      background:
        "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.72) 100%)",
      backdropFilter: "blur(1px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 1,
      pointerEvents: "all",
      color: "#fff", // make text/spinner white
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
