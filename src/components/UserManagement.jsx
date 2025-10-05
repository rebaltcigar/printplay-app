import React, { useEffect, useState } from "react";
import {
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
} from "@mui/material";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

/**
 * List-only user management.
 * - Shows users (fullName, email, role)
 * - No create/edit/delete actions
 * - If you need to add a user: create it in Firebase Auth, then add a matching
 *   Firestore doc at users/{uid} with fields { fullName, email, role }.
 */
export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(collection(db, "users"), orderBy("fullName"));
        const snap = await getDocs(q);
        if (cancelled) return;
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn("Failed to load users:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Users
      </Typography>
      <Divider sx={{ mb: 2 }} />
      <TableContainer component={Paper} sx={{ maxHeight: 520 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Full Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography color="text.secondary">Loading…</Typography>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography color="text.secondary">No users found.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map(u => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.fullName || "—"}</TableCell>
                  <TableCell>{u.email || "—"}</TableCell>
                  <TableCell>{u.role || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        To add users, create the account in <strong>Firebase Authentication</strong>, then add a matching
        document in <code>users/&lt;uid&gt;</code> with fields: <code>fullName</code>, <code>email</code>, <code>role</code> (e.g. <code>"staff"</code> or <code>"superadmin"</code>).
      </Typography>
    </Card>
  );
}
