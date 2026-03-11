import React, { useEffect, useState, useMemo } from "react";
import {
  Box, Card, Typography, Divider, Paper,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  IconButton, Tooltip, Stack, Button, TextField, InputAdornment,
  ToggleButtonGroup, ToggleButton, Chip, MenuItem, Select, FormControl,
  InputLabel, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import PageHeader from "./common/PageHeader";
import ValidatedInput from "./common/ValidatedInput";
import DetailDrawer from "./common/DetailDrawer";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import EditIcon from "@mui/icons-material/Edit";
import LockResetIcon from "@mui/icons-material/LockReset";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { supabase } from "../supabase";
import { registerFingerprint } from "../services/biometricService";
import { getFriendlyErrorMessage } from "../services/errorService";
import { ROLES } from "../utils/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ROLE_LABELS = { [ROLES.STAFF]: "Staff", [ROLES.SUPERADMIN]: "Super Admin", [ROLES.OWNER]: "Owner", [ROLES.ADMIN]: "Admin" };

const StatusChip = ({ suspended }) =>
  suspended ? (
    <Chip label="Suspended" size="small" color="warning" variant="outlined" />
  ) : (
    <Chip label="Active" size="small" color="success" variant="outlined" />
  );

// ---------------------------------------------------------------------------
// AddUserDrawer
// ---------------------------------------------------------------------------
function AddUserDrawer({ open, onClose, onSave }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setFullName(""); setEmail(""); setPassword(""); setRole(ROLES.STAFF);
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
      setError(getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="Add New User"
      actions={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : null}>
            Create User
          </Button>
        </>
      }
    >
      <Stack spacing={2} pt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <ValidatedInput
          label="Full Name" rule="text" fullWidth required
          value={fullName} onChange={setFullName}
        />
        <ValidatedInput
          label="Email" rule="email" fullWidth required
          value={email} onChange={setEmail}
        />
        <TextField
          label="Temporary Password" type="password" fullWidth required
          value={password} onChange={(e) => setPassword(e.target.value)}
          helperText="Min. 6 characters. User should reset after first login."
        />
        <FormControl fullWidth>
          <InputLabel>Role</InputLabel>
          <Select value={role} label="Role" onChange={(e) => setRole(e.target.value)}>
            <MenuItem value={ROLES.STAFF}>Staff</MenuItem>
            <MenuItem value={ROLES.SUPERADMIN}>Super Admin</MenuItem>
            <MenuItem value={ROLES.OWNER}>Owner</MenuItem>
            <MenuItem value={ROLES.ADMIN}>Admin</MenuItem>
          </Select>
        </FormControl>
      </Stack>
    </DetailDrawer>
  );
}

// ---------------------------------------------------------------------------
// EditUserDrawer
// ---------------------------------------------------------------------------
function EditUserDrawer({ open, onClose, user, onSave }) {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setFullName(user.full_name || "");
      setRole(user.role || ROLES.STAFF);
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
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="Edit User"
      actions={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : null}>
            Save
          </Button>
        </>
      }
    >
      <Stack spacing={2} pt={1}>
        <ValidatedInput
          label="Email" rule="email" fullWidth value={user?.email || ""}
          InputProps={{ readOnly: true }}
          helperText="Email cannot be changed here."
        />
        <ValidatedInput
          label="Full Name" rule="text" fullWidth required
          value={fullName} onChange={setFullName}
        />
        <FormControl fullWidth>
          <InputLabel>Role</InputLabel>
          <Select value={role} label="Role" onChange={(e) => setRole(e.target.value)}>
            <MenuItem value={ROLES.STAFF}>Staff</MenuItem>
            <MenuItem value={ROLES.SUPERADMIN}>Super Admin</MenuItem>
            <MenuItem value={ROLES.OWNER}>Owner</MenuItem>
            <MenuItem value={ROLES.ADMIN}>Admin</MenuItem>
          </Select>
        </FormControl>
      </Stack>
    </DetailDrawer>
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
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      if (error) {
        console.warn("Failed to load users:", error);
        showSnackbar?.(getFriendlyErrorMessage(error), "error");
      } else {
        setUsers(data || []);
      }
      setLoading(false);
    };

    fetchUsers();

    const channel = supabase
      .channel('usermgmt-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchUsers)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (q) {
        const name = (u.full_name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter]);

  // ---- Handlers ----

  const handleAddUser = async ({ fullName, email, password, role }) => {
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    const { error: insertErr } = await supabase.from('profiles').insert([{
      id: createData.user.id,
      email,
      full_name: fullName,
      role,
      suspended: false,
      requires_password_reset: true,
      created_at: new Date().toISOString(),
    }]);
    if (insertErr) throw insertErr;
    showSnackbar?.(`User ${fullName} created successfully.`, "success");
  };

  const handleEditUser = async (uid, updates) => {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: updates.fullName, role: updates.role, updated_at: new Date().toISOString() })
      .eq('id', uid);
    if (error) throw error;
    showSnackbar?.("User updated.", "success");
  };

  const handleResetPassword = async (u) => {
    try {
      await supabase.auth.resetPasswordForEmail(u.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      showSnackbar?.(`Password reset email sent to ${u.email}.`, "success");
    } catch (err) {
      showSnackbar?.(getFriendlyErrorMessage(err), "error");
    }
  };

  const handleOnboard = async (u) => {
    try {
      // 1. Create a clear temporary password
      const tempPassword = "Kunek" + Math.random().toString(36).slice(-5).toUpperCase() + "!";
      
      const { createClient } = await import('@supabase/supabase-js');
      const secondaryClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
      
      // 2. Sign up the user in Auth
      // NOTE: This sends a confirmation email if configured in Supabase.
      const { data: signUpData, error: signUpErr } = await secondaryClient.auth.signUp({ 
        email: u.email, 
        password: tempPassword 
      });
      
      if (signUpErr) throw signUpErr;
      
      // 3. Update the profile with the new Auth ID and set the reset flag
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ 
          id: signUpData.user.id,
          requires_password_reset: true 
        })
        .eq('email', u.email);
      
      if (profileErr) throw profileErr;
      
      // 4. Show the password to the admin
      alert(`User ${u.full_name} onboarded!\n\nTemporary Password: ${tempPassword}\n\nPlease give this to the user. They will be forced to change it on login.`);
      showSnackbar?.(`Onboarded ${u.full_name} successfully.`, "success");
    } catch (err) {
      showSnackbar?.(getFriendlyErrorMessage(err), "error");
    }
  };

  const handleToggleSuspend = async (u) => {
    const newVal = !u.suspended;
    const { error } = await supabase.from('profiles').update({ suspended: newVal }).eq('id', u.id);
    if (error) throw error;
    showSnackbar?.(newVal ? `${u.full_name} suspended.` : `${u.full_name} reactivated.`, "success");
  };

  const handleDelete = async (u) => {
    const { error } = await supabase.from('profiles').delete().eq('id', u.id);
    if (error) throw error;
    showSnackbar?.(
      `${u.full_name} removed from the system. Their auth account still exists in the authentication provider.`,
      "info"
    );
  };

  const handleRegisterUser = async (targetUser) => {
    if (!targetUser) return;
    setRegisteringUid(targetUser.id);
    try {
      const result = await registerFingerprint(targetUser.email, targetUser.full_name || targetUser.email);
      if (result?.success) {
        const { error } = await supabase
          .from('profiles')
          .update({ biometric_id: result.credentialId, biometric_registered_at: new Date().toISOString() })
          .eq('id', targetUser.id);
        if (error) throw error;
        showSnackbar?.(`Fingerprint registered for ${targetUser.full_name || targetUser.email}`, "success");
      }
    } catch (err) {
      showSnackbar?.(getFriendlyErrorMessage(err), "error");
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
        title: `Delete ${confirmTarget.user.full_name}?`,
        message: `This will remove the account from the system. Their auth account still exists in the authentication provider.`,
        confirmLabel: "Delete",
        confirmColor: "error",
      }
      : confirmTarget.action === "suspend"
        ? {
          title: `Suspend ${confirmTarget.user.full_name}?`,
          message: `They will be blocked from logging in immediately.`,
          confirmLabel: "Suspend",
          confirmColor: "warning",
        }
        : {
          title: `Reactivate ${confirmTarget.user.full_name}?`,
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
          <ToggleButton value={ROLES.STAFF}>Staff</ToggleButton>
          <ToggleButton value={ROLES.SUPERADMIN}>Super Admin</ToggleButton>
          <ToggleButton value={ROLES.OWNER}>Owner</ToggleButton>
          <ToggleButton value={ROLES.ADMIN}>Admin</ToggleButton>
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
                    <TableCell sx={{ fontWeight: 500 }}>{u.full_name || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{ROLE_LABELS[u.role] || u.role || "—"}</TableCell>
                    <TableCell><StatusChip suspended={u.suspended} /></TableCell>
                    <TableCell align="center">
                      <Tooltip title={u.biometric_id ? "Re-register Fingerprint" : "Register Fingerprint (Windows Hello)"}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleRegisterUser(u)}
                            disabled={registeringUid === u.id}
                            color={u.biometric_id ? "success" : "default"}
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
                        <Tooltip title="Migrate/Onboard to Supabase">
                          <IconButton size="small" color="primary" onClick={() => handleOnboard(u)}>
                            <PersonAddIcon fontSize="small" />
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
          Deleting removes from this system only — the auth account must be removed separately from the authentication provider.
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
                      <Typography variant="body2" fontWeight={600} noWrap>{u.full_name || "—"}</Typography>
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
                          color={u.biometric_id ? "success" : "default"}
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
      <AddUserDrawer open={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddUser} />
      <EditUserDrawer
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
