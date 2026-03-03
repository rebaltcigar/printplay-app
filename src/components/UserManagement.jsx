import React, { useEffect, useState, useMemo } from "react";
import {
  Box, Card, Typography, Divider, Paper,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  IconButton, Tooltip, Stack, Button, TextField, InputAdornment,
  ToggleButtonGroup, ToggleButton, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, Select, FormControl,
  InputLabel, CircularProgress, Alert,
} from "@mui/material";
import PageHeader from "./common/PageHeader";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import EditIcon from "@mui/icons-material/Edit";
import LockResetIcon from "@mui/icons-material/LockReset";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import {
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
} from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { db, auth, firebaseConfig } from "../firebase";
import { registerFingerprint } from "../utils/biometrics";

// ---------------------------------------------------------------------------
// Secondary Firebase app — used for user creation so the admin session is
// never disturbed by createUserWithEmailAndPassword signing in as the new user.
// ---------------------------------------------------------------------------
const SECONDARY_APP_NAME = "admin-user-creator";
const secondaryApp =
  getApps().find((a) => a.name === SECONDARY_APP_NAME) ||
  initializeApp(firebaseConfig, SECONDARY_APP_NAME);
const secondaryAuth = getAuth(secondaryApp);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ROLE_LABELS = { staff: "Staff", superadmin: "Super Admin" };

const StatusChip = ({ suspended }) =>
  suspended ? (
    <Chip label="Suspended" size="small" color="warning" variant="outlined" />
  ) : (
    <Chip label="Active" size="small" color="success" variant="outlined" />
  );

// ---------------------------------------------------------------------------
// AddUserDialog
// ---------------------------------------------------------------------------
function AddUserDialog({ open, onClose, onSave }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setFullName(""); setEmail(""); setPassword(""); setRole("staff");
      setSaving(false); setError("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!fullName.trim()) { setError("Full name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ fullName: fullName.trim(), email: email.trim(), password, role });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create user.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add New User</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Full Name" fullWidth required
            value={fullName} onChange={(e) => setFullName(e.target.value)}
          />
          <TextField
            label="Email" type="email" fullWidth required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Temporary Password" type="password" fullWidth required
            value={password} onChange={(e) => setPassword(e.target.value)}
            helperText="Min. 6 characters. User should reset after first login."
          />
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select value={role} label="Role" onChange={(e) => setRole(e.target.value)}>
              <MenuItem value="staff">Staff</MenuItem>
              <MenuItem value="superadmin">Super Admin</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}>
          Create User
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// EditUserDialog
// ---------------------------------------------------------------------------
function EditUserDialog({ open, onClose, user, onSave }) {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setFullName(user.fullName || "");
      setRole(user.role || "staff");
      setSaving(false);
    }
  }, [open, user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(user.id, { fullName: fullName.trim(), role });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Edit User</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} pt={1}>
          <TextField
            label="Email" fullWidth value={user?.email || ""}
            InputProps={{ readOnly: true }}
            helperText="Email cannot be changed here."
          />
          <TextField
            label="Full Name" fullWidth required
            value={fullName} onChange={(e) => setFullName(e.target.value)}
          />
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select value={role} label="Role" onChange={(e) => setRole(e.target.value)}>
              <MenuItem value="staff">Staff</MenuItem>
              <MenuItem value="superadmin">Super Admin</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------
function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", confirmColor = "error" }) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color={confirmColor} variant="contained" onClick={handleConfirm} disabled={busy}
          startIcon={busy ? <CircularProgress size={16} /> : null}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function UserManagement({ showSnackbar }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Action state
  const [registeringUid, setRegisteringUid] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // { user, action: 'suspend'|'activate'|'delete' }

  // Real-time user list
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("fullName"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => !u.deleted)
      );
      setLoading(false);
    }, (err) => {
      console.warn("Failed to load users:", err);
      showSnackbar?.("Failed to load users.", "error");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (q) {
        const name = (u.fullName || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter]);

  // ---- Handlers ----

  const handleAddUser = async ({ fullName, email, password, role }) => {
    const { user } = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await fbSignOut(secondaryAuth); // Clean up secondary session immediately
    await setDoc(doc(db, "users", user.uid), {
      email,
      fullName,
      role,
      suspended: false,
      createdAt: serverTimestamp(),
    });
    showSnackbar?.(`User ${fullName} created successfully.`, "success");
  };

  const handleEditUser = async (uid, updates) => {
    await updateDoc(doc(db, "users", uid), updates);
    showSnackbar?.("User updated.", "success");
  };

  const handleResetPassword = async (u) => {
    try {
      await sendPasswordResetEmail(auth, u.email);
      showSnackbar?.(`Password reset email sent to ${u.email}.`, "success");
    } catch (err) {
      showSnackbar?.(`Failed: ${err.message}`, "error");
    }
  };

  const handleToggleSuspend = async (u) => {
    const newVal = !u.suspended;
    await updateDoc(doc(db, "users", u.id), { suspended: newVal });
    showSnackbar?.(newVal ? `${u.fullName} suspended.` : `${u.fullName} reactivated.`, "success");
  };

  const handleDelete = async (u) => {
    await updateDoc(doc(db, "users", u.id), { deleted: true });
    showSnackbar?.(
      `${u.fullName} removed from the system. Their Firebase Auth account still exists — delete it from Firebase Console if needed.`,
      "info"
    );
  };

  const handleRegisterUser = async (targetUser) => {
    if (!targetUser) return;
    setRegisteringUid(targetUser.id);
    try {
      const result = await registerFingerprint(targetUser.email, targetUser.fullName || targetUser.email);
      if (result?.success) {
        await updateDoc(doc(db, "users", targetUser.id), {
          biometricId: result.credentialId,
          biometricRegisteredAt: new Date().toISOString(),
        });
        showSnackbar?.(`Fingerprint registered for ${targetUser.fullName || targetUser.email}`, "success");
      }
    } catch (err) {
      showSnackbar?.(`Failed: ${err.message}`, "error");
    } finally {
      setRegisteringUid(null);
    }
  };

  // ---- Confirm dialog resolver ----
  const resolveConfirm = async () => {
    if (!confirmTarget) return;
    const { user: u, action } = confirmTarget;
    if (action === "delete") await handleDelete(u);
    else await handleToggleSuspend(u);
  };

  const confirmMeta = confirmTarget
    ? confirmTarget.action === "delete"
      ? {
          title: `Delete ${confirmTarget.user.fullName}?`,
          message: `This will hide the account from the system. Their Firebase Auth account must be deleted separately from the Firebase Console.`,
          confirmLabel: "Delete",
          confirmColor: "error",
        }
      : confirmTarget.action === "suspend"
      ? {
          title: `Suspend ${confirmTarget.user.fullName}?`,
          message: `They will be blocked from logging in immediately.`,
          confirmLabel: "Suspend",
          confirmColor: "warning",
        }
      : {
          title: `Reactivate ${confirmTarget.user.fullName}?`,
          message: `They will be able to log in again.`,
          confirmLabel: "Reactivate",
          confirmColor: "success",
        }
    : {};

  // ---- Render ----
  return (
    <Box sx={{ width: "100%", p: 3 }}>
      <PageHeader
        title="User Management"
        subtitle="Add, edit, and manage staff accounts."
      />

      {/* Toolbar */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} mb={2} flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 220 }}
        />
        <ToggleButtonGroup
          size="small"
          value={roleFilter}
          exclusive
          onChange={(_, v) => { if (v) setRoleFilter(v); }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="staff">Staff</ToggleButton>
          <ToggleButton value="superadmin">Super Admin</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setAddOpen(true)}
        >
          Add User
        </Button>
      </Stack>

      {/* Table — Desktop */}
      <Card sx={{ p: 2, display: { xs: "none", sm: "block" } }}>
        <TableContainer component={Paper} sx={{ maxHeight: 560 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Full Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Biometric</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary">No users found.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id} hover sx={{ opacity: u.suspended ? 0.7 : 1 }}>
                    <TableCell sx={{ fontWeight: 500 }}>{u.fullName || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{ROLE_LABELS[u.role] || u.role || "—"}</TableCell>
                    <TableCell><StatusChip suspended={u.suspended} /></TableCell>
                    <TableCell align="center">
                      <Tooltip title={u.biometricId ? "Re-register Fingerprint" : "Register Fingerprint (Windows Hello)"}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleRegisterUser(u)}
                            disabled={registeringUid === u.id}
                            color={u.biometricId ? "success" : "default"}
                          >
                            {registeringUid === u.id
                              ? <CircularProgress size={16} />
                              : <FingerprintIcon />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="Edit details">
                          <IconButton size="small" onClick={() => setEditTarget(u)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Send password reset email">
                          <IconButton size="small" onClick={() => handleResetPassword(u)}>
                            <LockResetIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={u.suspended ? "Reactivate account" : "Suspend account"}>
                          <IconButton
                            size="small"
                            color={u.suspended ? "success" : "warning"}
                            onClick={() => setConfirmTarget({ user: u, action: u.suspended ? "activate" : "suspend" })}
                          >
                            {u.suspended ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove user">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setConfirmTarget({ user: u, action: "delete" })}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
          {filtered.length} user{filtered.length !== 1 ? "s" : ""} shown
          {filtered.length !== users.length ? ` (${users.length} total)` : ""}.
          Deleting removes from this system only — Firebase Auth account must be removed separately.
        </Typography>
      </Card>

      {/* Table — Mobile */}
      <Card sx={{ p: 2, display: { xs: "block", sm: "none" } }}>
        <TableContainer component={Paper} sx={{ maxHeight: 560, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <Table stickyHeader size="small" sx={{ "& th, & td": { py: 0.75, px: 1 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Name & Role</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={2} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={22} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Typography color="text.secondary" variant="body2">No users found.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id} hover sx={{ opacity: u.suspended ? 0.7 : 1 }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} noWrap>{u.fullName || "—"}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block" noWrap>
                        {ROLE_LABELS[u.role] || u.role} · {u.email}
                      </Typography>
                      <StatusChip suspended={u.suspended} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0} justifyContent="flex-end">
                        <IconButton size="small" onClick={() => setEditTarget(u)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleResetPassword(u)}>
                          <LockResetIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color={u.suspended ? "success" : "warning"}
                          onClick={() => setConfirmTarget({ user: u, action: u.suspended ? "activate" : "suspend" })}
                        >
                          {u.suspended ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleRegisterUser(u)}
                          disabled={registeringUid === u.id}
                          color={u.biometricId ? "success" : "default"}
                        >
                          {registeringUid === u.id ? <CircularProgress size={14} /> : <FingerprintIcon fontSize="small" />}
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setConfirmTarget({ user: u, action: "delete" })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Dialogs */}
      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddUser} />

      <EditUserDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        user={editTarget}
        onSave={handleEditUser}
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={resolveConfirm}
        title={confirmMeta.title || ""}
        message={confirmMeta.message || ""}
        confirmLabel={confirmMeta.confirmLabel}
        confirmColor={confirmMeta.confirmColor}
      />
    </Box>
  );
}
