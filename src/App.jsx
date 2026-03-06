import React, { useEffect, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
} from "@mui/material";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/Login.jsx";
import POS from "./components/POS.jsx";
import ClockInDashboard from "./components/ClockInDashboard.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
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
import LoadingScreen from "./components/common/LoadingScreen";

export default function App() {
  const [authReady, setAuthReady] = useState(false); // true once first onAuthStateChanged fires
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'staff' | 'superadmin' | null

  // Staff-only session/shift info
  const [activeShiftId, setActiveShiftId] = useState(null);
  const [activeShiftPeriod, setActiveShiftPeriod] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState(null);

  // Clock-in mode (non-cashier staff clocked in to an existing shift)
  const [clockInMode, setClockInMode]   = useState(false);
  const [clockInLogId, setClockInLogId] = useState(null);

  // Staff display name (extracted from user doc during auth bootstrap — no extra fetch in POS)
  const [staffDisplayName, setStaffDisplayName] = useState('');

  // App-wide settings (fetched once, passed to all pages — avoids per-component flash)
  const [appSettings, setAppSettings] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'config'))
      .then(async snap => {
        const data = snap.exists() ? snap.data() : {};
        // Preload logo so it's in cache before the gate opens — prevents image flash
        if (data.logoUrl) {
          await new Promise(resolve => {
            const img = new Image();
            img.onload = img.onerror = resolve;
            img.src = data.logoUrl;
          });
        }
        setAppSettings(data);
      })
      .catch(() => setAppSettings({}));
  }, []);

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
          setShiftStartTime(null);
          setClockInMode(false);
          setClockInLogId(null);
          setStaffDisplayName('');
          return;
        }

        // Look up user role
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          // Unknown user — sign out for safety
          await signOut(auth);
          return;
        }

        const userData = userSnap.data();
        const role = userData?.role || null;
        setCurrentUser(user);
        setUserRole(role);
        setStaffDisplayName(userData?.fullName || userData?.name || userData?.displayName || user.displayName || user.email || '');

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

            // Fetch period and start time to display
            const shiftRef = doc(db, "shifts", shiftId);
            const shiftSnap = await getDoc(shiftRef);
            if (shiftSnap.exists()) {
              const shiftData = shiftSnap.data();
              setActiveShiftPeriod(shiftData?.shiftPeriod || "");
              const st = shiftData?.startTime;
              if (st?.seconds) setShiftStartTime(new Date(st.seconds * 1000));
              else if (st instanceof Date) setShiftStartTime(st);
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
        setAuthReady(true);
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

    // ── Admin path — bypasses shift lock entirely ──
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

    // Check shift lock only for staff
    const statusRef = doc(db, "app_status", "current_shift");
    const statusSnap = await getDoc(statusRef);
    const lock = statusSnap.exists() ? statusSnap.data() : null;

    if (lock?.activeShiftId && lock.staffEmail !== email) {
      // Another staff owns this shift — offer clock-in instead of blocking
      const shiftSnap = await getDoc(doc(db, "shifts", lock.activeShiftId));
      const shiftPeriod = shiftSnap.exists() ? shiftSnap.data()?.shiftPeriod || "" : "";

      // Try to get the cashier's display name
      let cashierName = lock.staffEmail;
      try {
        const cashierSnap = await getDocs(query(collection(db, "users"), where("email", "==", lock.staffEmail)));
        if (!cashierSnap.empty) {
          const d = cashierSnap.docs[0].data();
          cashierName = d.fullName || d.name || lock.staffEmail;
        }
      } catch {}

      return {
        type: "clockin",
        cashierName,
        cashierEmail: lock.staffEmail,
        activeShiftId: lock.activeShiftId,
        shiftPeriod,
      };
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

  /** Clock in as non-cashier staff to an existing active shift */
  const handleClockIn = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated.");

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    // Fetch the active shift id from the lock
    const statusSnap = await getDoc(doc(db, "app_status", "current_shift"));
    const lock = statusSnap.exists() ? statusSnap.data() : null;

    // Write clock-in log
    const logRef = await addDoc(collection(db, "payroll_logs"), {
      staffUid:   user.uid,
      staffEmail: user.email,
      staffName:  userData.fullName || userData.name || user.email,
      clockIn:    serverTimestamp(),
      shiftId:    lock?.activeShiftId || null,
      type:       "clock_in",
    });

    setCurrentUser(user);
    setUserRole("staff");
    setClockInMode(true);
    setClockInLogId(logRef.id);
  };

  /** Clock out — writes clockOut timestamp, signs out */
  const handleClockOut = async () => {
    try {
      if (clockInLogId) {
        await updateDoc(doc(db, "payroll_logs", clockInLogId), {
          clockOut: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn("Clock-out log update failed:", err);
    }
    try { await signOut(auth); } catch {}
    setClockInMode(false);
    setClockInLogId(null);
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

  // Block rendering routes until Firebase auth state is known.
  // On /login → blank black screen (no flash, no loader).
  // On any other path (already-logged-in page refresh) → show loader.
  if (!authReady || !appSettings) {
    const isLoginPage = window.location.pathname === '/login' || window.location.pathname === '/';
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        {isLoginPage
          ? <Box sx={{ height: '100vh', bgcolor: 'background.default' }} />
          : <Box sx={{ height: '100vh' }}><LoadingScreen message="Initializing..." /></Box>
        }
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
            !currentUser || (userRole === 'staff' && !activeShiftId && !clockInMode) ? (
              <Login
                onLogin={handleLogin}
                onStartShift={handleStartShift}
                onClockIn={handleClockIn}
                onCancelLogin={handleCancelLogin}
              />
            ) : (
              <Navigate to={['superadmin', 'admin', 'owner'].includes(userRole) ? "/admin" : "/pos"} replace />
            )
          } />

          {/* Staff POS / Clock-In Route */}
          <Route path="/pos" element={
            currentUser && userRole === 'staff' ? (
              clockInMode ? (
                <ClockInDashboard
                  user={currentUser}
                  clockInLogId={clockInLogId}
                  onClockOut={handleClockOut}
                />
              ) : activeShiftId ? (
                <POS
                  user={currentUser}
                  userRole={userRole}
                  activeShiftId={activeShiftId}
                  shiftPeriod={activeShiftPeriod}
                  shiftStartTime={shiftStartTime}
                  appSettings={appSettings}
                  staffDisplayName={staffDisplayName}
                />
              ) : (
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
                  <AdminDashboard user={currentUser} onLogout={handleAdminLogout} appSettings={appSettings} />
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