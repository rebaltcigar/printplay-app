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
  Button,
  Tooltip,
  IconButton
} from "@mui/material";
import { 
  collection, 
  getDocs, 
  orderBy, 
  query, 
  doc, 
  updateDoc 
} from "firebase/firestore";
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';

import { db } from "../firebase";
import { registerFingerprint } from "../utils/biometrics";

/**
 * User Management with Biometric Registration.
 * - Lists users (fullName, email, role)
 * - Allows linking a fingerprint credential to a staff member.
 */
export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Load Users ---
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Biometric Registration Handler ---
  const handleRegisterBio = async (userRow) => {
    // 1. Confirm intention (so we don't accidentally trigger the popup)
    const confirmMsg = userRow.biometricId 
      ? `This will overwrite the existing fingerprint for ${userRow.fullName}. Continue?`
      : `Get ${userRow.fullName} ready to scan their finger.\n\nClick OK to start.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      // 2. Call the helper (triggers Windows Hello)
      const result = await registerFingerprint(userRow.email, userRow.fullName);

      if (result.success) {
        // 3. Save the ID to Firestore
        await updateDoc(doc(db, "users", userRow.id), {
          biometricId: result.credentialId,
          biometricRegisteredAt: new Date().toISOString()
        });

        // 4. Update local state immediately to show the green checkmark
        setUsers(prev => prev.map(u => 
          u.id === userRow.id ? { ...u, biometricId: result.credentialId } : u
        ));

        alert(`Success! Fingerprint linked to ${userRow.fullName}.`);
      }
    } catch (err) {
      console.error(err);
      alert(`Registration Failed: ${err.message || "Operation cancelled."}`);
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      {/* ----- WEB / DESKTOP ----- */}
      <Card sx={{ p: 2, display: { xs: "none", sm: "block" } }}>
        <Typography variant="h6" gutterBottom>
          Users & Security
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <TableContainer component={Paper} sx={{ maxHeight: 520 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Full Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell align="center">Biometrics</TableCell>
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
                    
                    {/* Biometric Controls */}
                    <TableCell align="center">
                      {u.biometricId ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                          <Tooltip title="Fingerprint Registered">
                            <CheckCircleIcon color="success" />
                          </Tooltip>
                          <Tooltip title="Re-register Fingerprint">
                            <IconButton 
                              size="small" 
                              onClick={() => handleRegisterBio(u)}
                            >
                              <ReplayIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Button 
                          size="small" 
                          variant="outlined" 
                          startIcon={<FingerprintIcon />}
                          onClick={() => handleRegisterBio(u)}
                        >
                          Register
                        </Button>
                      )}
                    </TableCell>

                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          To add users, create the account in <strong>Firebase Authentication</strong>, then add a matching
          document in <code>users/&lt;uid&gt;</code>.
        </Typography>
      </Card>

      {/* ----- MOBILE (Compact View) ----- */}
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
                <TableCell align="right">Bio</TableCell>
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
                        {u.email || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {/* Simple Icon for Mobile */}
                      {u.biometricId ? (
                         <CheckCircleIcon color="success" fontSize="small" />
                      ) : (
                        <IconButton size="small" onClick={() => handleRegisterBio(u)}>
                          <FingerprintIcon fontSize="small" />
                        </IconButton>
                      )}
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