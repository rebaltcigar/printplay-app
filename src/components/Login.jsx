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

  // subtle admin toggle (no large “login as admin” link)
  const [adminMode, setAdminMode] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (adminMode) {
      await onAdminLogin(email, password);
    } else {
      await onLogin(email, password, shiftPeriod);
    }
  };

  return (
    <Card
      sx={{
        width: 480,
        maxWidth: "92vw",
        p: 3,
        position: "relative",
      }}
      elevation={6}
    >
      {/* subtle admin toggle icon in the corner */}
      <Tooltip title={adminMode ? "Switch to staff login" : "Login as super admin"}>
        <IconButton
          size="small"
          onClick={() => setAdminMode((v) => !v)}
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          <ShieldPerson fontSize="small" />
        </IconButton>
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
          }}
        />
      </Box>

      <Typography align="center" variant="h5" gutterBottom>
        Print+Play
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, display: "grid", gap: 2 }}>
        <TextField
          label="Email"
          type="email"
          value={email}
          autoComplete="username"
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          required
        />

        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          required
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword((s) => !s)}
                  edge="end"
                  aria-label="toggle password visibility"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {!adminMode && (
          <FormControl fullWidth required>
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
          disabled={!email || !password || (!adminMode && !shiftPeriod)}
          sx={{ mt: 1 }}
          fullWidth
        >
          {adminMode ? "LOGIN AS SUPER ADMIN" : "START SHIFT"}
        </Button>
      </Box>
    </Card>
  );
}
