import React, { useEffect, useState } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Typography,
} from "@mui/material";

import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";

import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

// ------------------ THEME ------------------
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#f44336" },
  },
});

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

  // Staff login + shift start
  const handleStaffLogin = async (email, password, shiftPeriod) => {
    // We throw errors; Login.jsx will catch and render them.
    // DO NOT alert inside this function.
    // 1) Check for an existing active shift lock first
    const statusRef = doc(db, "app_status", "current_shift");
    const statusSnap = await getDoc(statusRef);
    const lock = statusSnap.exists() ? statusSnap.data() : null;

    if (lock?.activeShiftId) {
      // Another staff owns the active shift
      if (lock.staffEmail !== email) {
        const e = new Error(
          `A shift is already active by ${lock.staffEmail}.`
        );
        e.code = "shift/active-other";
        throw e;
      }

      // Same staff re-logging in to the same active shift
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setCurrentUser(cred.user);
      setUserRole("staff");
      setActiveShiftId(lock.activeShiftId);

      const shiftRef = doc(db, "shifts", lock.activeShiftId);
      const shiftSnap = await getDoc(shiftRef);
      setActiveShiftPeriod(shiftSnap.exists() ? shiftSnap.data()?.shiftPeriod : "");
      return;
    }

    // 2) No active lock — start a new shift
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // Validate role
    const userRef = doc(db, "users", cred.user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || userSnap.data()?.role !== "staff") {
      // Not a staff account => sign out and throw role error
      await signOut(auth).catch(() => {});
      const e = new Error("Admin used for staff");
      e.code = "role/invalid-staff";
      throw e;
    }

    // Create shift
    const shiftData = {
      staffEmail: cred.user.email,
      shiftPeriod,
      startTime: serverTimestamp(),
      endTime: null,
    };
    const shiftDocRef = await addDoc(collection(db, "shifts"), shiftData);

    // Write lock
    await setDoc(statusRef, {
      activeShiftId: shiftDocRef.id,
      staffEmail: cred.user.email,
    });

    // Update local state
    setCurrentUser(cred.user);
    setUserRole("staff");
    setActiveShiftId(shiftDocRef.id);
    setActiveShiftPeriod(shiftPeriod);
  };

  // Super admin login (no shift)
  const handleAdminLogin = async (email, password) => {
    // Throw errors; Login.jsx will humanize and render them.
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const userRef = doc(db, "users", cred.user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists() || userSnap.data()?.role !== "superadmin") {
      await signOut(auth).catch(() => {});
      const e = new Error("Staff used for admin");
      e.code = "role/invalid-admin";
      throw e;
    }

    setCurrentUser(cred.user);
    setUserRole("superadmin");
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
  const renderContent = () => {
    if (isLoading) return <Typography>Loading...</Typography>;

    if (currentUser && userRole === "superadmin") {
      return (
        <Box sx={{ width: "100%", height: "100%", display: "flex" }}>
          <AdminDashboard user={currentUser} onLogout={handleAdminLogout} />
        </Box>
      );
    }

    if (currentUser && userRole === "staff" && activeShiftId) {
      return (
        <Dashboard
          user={currentUser}
          activeShiftId={activeShiftId}
          shiftPeriod={activeShiftPeriod}
        />
      );
    }

    // Default: Login screen
    return (
      <Login onLogin={handleStaffLogin} onAdminLogin={handleAdminLogin} />
    );
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          justifyContent:
            currentUser && userRole === "superadmin" ? "flex-start" : "center",
          alignItems:
            currentUser && userRole === "superadmin" ? "stretch" : "center",
        }}
      >
        {renderContent()}
      </Box>
    </ThemeProvider>
  );
}
