import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Divider,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  IconButton,
  Tooltip,
  Stack
} from "@mui/material";
import PageHeader from "./common/PageHeader";
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { collection, getDocs, orderBy, query, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { registerFingerprint } from "../utils/biometrics";

/**
 * User Management
 * - Shows users (fullName, email, role)
 * - Allows biometric registration for staff on this device
 */
export default function UserManagement({ showSnackbar }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registeringUid, setRegisteringUid] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(collection(db, "users"), orderBy("fullName"));
        const snap = await getDocs(q);
        if (cancelled) return;
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn("Failed to load users:", err);
        if (showSnackbar) showSnackbar("Failed to load users.", 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRegisterUser = async (targetUser) => {
    if (!targetUser) return;
    setRegisteringUid(targetUser.id);
    try {
      // Trigger WebAuthn
      const result = await registerFingerprint(targetUser.email, targetUser.fullName || targetUser.email);

      if (result && result.success) {
        // Save to Firestore
        const userRef = doc(db, 'users', targetUser.id);
        await updateDoc(userRef, {
          biometricId: result.credentialId,
          biometricRegisteredAt: new Date().toISOString()
        });

        showSnackbar(`Fingerprint registered for ${targetUser.fullName || targetUser.email}`, 'success');
      }
    } catch (err) {
      console.error("Enrollment failed:", err);
      showSnackbar(`Failed: ${err.message}`, 'error');
    } finally {
      setRegisteringUid(null);
    }
  };

  return (
    <Box sx={{ width: "100%", p: 3 }}>
      <PageHeader
        title="User Management"
        subtitle="Manage staff accounts and biometric enrollment."
      />
      {/* ----- WEB / DESKTOP ----- */}
      <Card sx={{ p: 2, display: { xs: "none", sm: "block" } }}>
        <Divider sx={{ mb: 2 }} />
        <TableContainer component={Paper} sx={{ maxHeight: 520 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Full Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary">Loading…</Typography>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary">No users found.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>{u.fullName || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{u.role || "—"}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Register Fingerprint (Windows Hello)">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleRegisterUser(u)}
                            disabled={registeringUid === u.id}
                            color={u.biometricId ? "success" : "default"}
                          >
                            <FingerprintIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          To add users: create account in <strong>Firebase Auth</strong> first.
          <br />
          Click the <FingerprintIcon fontSize="inherit" sx={{ verticalAlign: 'text-bottom' }} /> icon to enroll user's fingerprint on this device.
        </Typography>
      </Card>

      {/* ----- MOBILE ----- */}
      <Card
        sx={{
          p: 2,
          display: { xs: "block", sm: "none" },
        }}
      >
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Users
        </Typography>
        <Divider sx={{ mb: 1.5 }} />
        <TableContainer
          component={Paper}
          sx={{
            maxHeight: 520,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            borderRadius: 1,
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              "& th, & td": { py: 0.75, px: 1 },
              "& thead th": { fontSize: "0.75rem" },
              "& tbody td": { fontSize: "0.88rem" },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell>Name & Email</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Typography color="text.secondary">Loading…</Typography>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Typography color="text.secondary">No users found.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {u.fullName || "—"}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: "block",
                          maxWidth: 200,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {u.role} • {u.email}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => handleRegisterUser(u)}
                        disabled={registeringUid === u.id}
                        color={u.biometricId ? "success" : "default"}
                      >
                        <FingerprintIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
