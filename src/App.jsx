import React, { useEffect, useState } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Typography,
} from "@mui/material";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/Login.jsx";
import POS from "./components/POS.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import LoadingScreen from "./components/common/LoadingScreen";
import { AnalyticsProvider } from "./contexts/AnalyticsContext";

import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { generateDisplayId } from "./utils/idGenerator";

import darkTheme from "./theme";

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'staff' | 'superadmin' | null

  // Staff-only session/shift info
  const [activeShiftId, setActiveShiftId] = useState(null);
  const [activeShiftPeriod, setActiveShiftPeriod] = useState("");

  // ------------------ AUTH BOOTSTRAP ------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          // reset everything on sign out
          setCurrentUser(null);
          setUserRole(null);
          setActiveShiftId(null);
          setActiveShiftPeriod("");
          setIsLoading(false);
          return;
        }

        // Look up user role
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          // Unknown user — sign out for safety
          await signOut(auth);
          setIsLoading(false);
          return;
        }

        const role = userSnap.data()?.role || null;
        setCurrentUser(user);
        setUserRole(role);

        if (role === "staff") {
          // If staff, fetch current active shift if any
          const statusRef = doc(db, "app_status", "current_shift");
          const statusSnap = await getDoc(statusRef);
          if (
            statusSnap.exists() &&
            statusSnap.data()?.activeShiftId &&
            statusSnap.data()?.staffEmail === user.email
          ) {
            const shiftId = statusSnap.data().activeShiftId;
            setActiveShiftId(shiftId);

            // Fetch period to display
            const shiftRef = doc(db, "shifts", shiftId);
            const shiftSnap = await getDoc(shiftRef);
            if (shiftSnap.exists()) {
              setActiveShiftPeriod(shiftSnap.data()?.shiftPeriod || "");
            }
          } else {
            setActiveShiftId(null);
            setActiveShiftPeriod("");
          }
        } else {
          // Superadmin: no shift state needed
          setActiveShiftId(null);
          setActiveShiftPeriod("");
        }
      } catch (err) {
        console.warn("Auth bootstrap error:", err);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // ------------------ HANDLERS ------------------

  /** Get today's date string "YYYY-MM-DD" in Philippine Time. */
  function todayPHT() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  }

  /**
   * Phase 1 — Authenticate and auto-detect role.
   * - Admin roles  → sets App state directly, returns { type: 'admin' }
   * - Staff role   → checks schedule, returns { type: 'scheduled'|'covered'|'relogin'|'fallback', ... }
   * Throws on auth failure, suspension, or shift conflict.
   */
  const handleLogin = async (email, password) => {
    // Check existing shift lock before signing in (public read allowed)
    const statusRef = doc(db, "app_status", "current_shift");
    const statusSnap = await getDoc(statusRef);
    const lock = statusSnap.exists() ? statusSnap.data() : null;

    if (lock?.activeShiftId && lock.staffEmail !== email) {
      const e = new Error(`A shift is already active by ${lock.staffEmail}.`);
      e.code = "shift/active-other";
      throw e;
    }

    // Firebase sign-in
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // Fetch user doc for role
    const userSnap = await getDoc(doc(db, "users", cred.user.uid));
    if (!userSnap.exists()) {
      await signOut(auth).catch(() => {});
      const e = new Error("No account record found. Contact your administrator.");
      e.code = "auth/user-not-found";
      throw e;
    }

    const userData = userSnap.data();

    if (userData?.suspended === true) {
      await signOut(auth).catch(() => {});
      const e = new Error("This account has been suspended. Please contact your administrator.");
      e.code = "auth/account-suspended";
      throw e;
    }

    const role = userData?.role || null;
    const adminRoles = ["superadmin", "admin", "owner"];

    // ── Admin path ──
    if (adminRoles.includes(role)) {
      setCurrentUser(cred.user);
      setUserRole(role);
      return { type: "admin" };
    }

    // ── Staff path ──
    if (role !== "staff") {
      await signOut(auth).catch(() => {});
      const e = new Error("Unrecognized account role. Contact your administrator.");
      e.code = "auth/user-disabled";
      throw e;
    }

    // Re-login: same staff has active shift
    if (lock?.activeShiftId && lock.staffEmail === email) {
      const shiftSnap = await getDoc(doc(db, "shifts", lock.activeShiftId));
      const shiftPeriod = shiftSnap.exists() ? shiftSnap.data()?.shiftPeriod || "" : "";
      return { type: "relogin", shiftPeriod };
    }

    // Query today's own scheduled entry
    const today = todayPHT();
    const ownSnap = await getDocs(query(
      collection(db, "schedules"),
      where("staffEmail", "==", email),
    ));
    const ownEntry = ownSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .find(e => e.date === today && (e.status === "scheduled" || e.status === "in-progress"));
    if (ownEntry) return { type: "scheduled", scheduleEntry: ownEntry };

    // Query coverage entries (where this staff is covering someone)
    const coverSnap = await getDocs(query(
      collection(db, "schedules"),
      where("coveredByEmail", "==", email),
    ));
    const coverEntry = coverSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .find(e => e.date === today && e.status === "covered");
    if (coverEntry) return { type: "covered", scheduleEntry: coverEntry };

    return { type: "fallback" };
  };

  /**
   * Phase 2 — Create shift doc, update schedule entry, set App state.
   * type: 'scheduled' | 'covered' | 'relogin' | 'fallback'
   */
  const handleStartShift = async (type, scheduleEntry, shiftPeriod, notes) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated.");

    // Re-login: restore state from existing lock
    if (type === "relogin") {
      const statusSnap = await getDoc(doc(db, "app_status", "current_shift"));
      const lock = statusSnap.data();
      const shiftSnap = await getDoc(doc(db, "shifts", lock.activeShiftId));
      setCurrentUser(user);
      setUserRole("staff");
      setActiveShiftId(lock.activeShiftId);
      setActiveShiftPeriod(shiftSnap.exists() ? shiftSnap.data()?.shiftPeriod || "" : "");
      return;
    }

    const shiftLabel = scheduleEntry?.shiftLabel || shiftPeriod;

    // Create shift doc
    const displayId = await generateDisplayId("shifts", "SHIFT");
    const shiftDocRef = await addDoc(collection(db, "shifts"), {
      displayId,
      staffEmail: user.email,
      shiftPeriod: shiftLabel,
      scheduleId: scheduleEntry?.id || null,
      notes: notes || "",
      startTime: serverTimestamp(),
      endTime: null,
    });

    // Link schedule entry → in-progress
    if (scheduleEntry?.id) {
      await updateDoc(doc(db, "schedules", scheduleEntry.id), {
        status: "in-progress",
        shiftId: shiftDocRef.id,
        updatedAt: serverTimestamp(),
      });
    }

    // Write shift lock
    await setDoc(doc(db, "app_status", "current_shift"), {
      activeShiftId: shiftDocRef.id,
      staffEmail: user.email,
    });

    // Update App state → triggers route to /pos
    setCurrentUser(user);
    setUserRole("staff");
    setActiveShiftId(shiftDocRef.id);
    setActiveShiftPeriod(shiftLabel);
  };

  /** Cancel pending login (sign out, Login.jsx resets phase) */
  const handleCancelLogin = async () => {
    try { await signOut(auth); } catch {}
  };

  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    } finally {
      setCurrentUser(null);
      setUserRole(null);
    }
  };

  // ------------------ RENDER ------------------

  if (isLoading) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
          {/* We can use the existing AdminLoading or just a spinner */}
          <Typography variant="h6" color="text.secondary">Initializing Application...</Typography>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          {/* Public / Login Route */}
          <Route path="/login" element={
            !currentUser || (userRole === 'staff' && !activeShiftId) ? (
              <Box
                sx={{
                  minHeight: "100vh",
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Login
                  onLogin={handleLogin}
                  onStartShift={handleStartShift}
                  onCancelLogin={handleCancelLogin}
                />
              </Box>
            ) : (
              // If already logged in (and valid state), redirect based on role
              <Navigate to={['superadmin', 'admin', 'owner'].includes(userRole) ? "/admin" : "/pos"} replace />
            )
          } />

          {/* Staff POS Route */}
          <Route path="/pos" element={
            currentUser && userRole === 'staff' ? (
              activeShiftId ? (
                <POS
                  user={currentUser}
                  userRole={userRole}
                  activeShiftId={activeShiftId}
                  shiftPeriod={activeShiftPeriod}
                />
              ) : (
                // Staff logged in but no active shift? Should logically be on login screen to start shift
                // OR we could have a "Shift Start" intermediate page. 
                // For now, existing logic was: if no active shift, show Login.
                // So if we are here, and no active shift, we redirect to login to start one.
                <Navigate to="/login" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          } />

          {/* Admin Routes */}
          <Route path="/admin/*" element={
            currentUser && ['superadmin', 'admin', 'owner'].includes(userRole) ? (
              <Box sx={{ width: "100%", height: "100%", display: "flex" }}>
                <AnalyticsProvider>
                  <AdminDashboard user={currentUser} onLogout={handleAdminLogout} />
                </AnalyticsProvider>
              </Box>
            ) : (
              <Navigate to="/login" replace />
            )
          } />

          {/* Root Redirect */}
          <Route path="/" element={
            currentUser ? (
              <Navigate to={['superadmin', 'admin', 'owner'].includes(userRole) ? "/admin" : "/pos"} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          } />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}