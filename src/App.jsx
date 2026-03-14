import React, { useEffect, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
} from "@mui/material";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/pages/Login.jsx";
import POS from "./components/pages/POS.jsx";
import ClockInDashboard from "./components/pages/ClockInDashboard.jsx";
import AdminDashboard from "./components/pages/AdminDashboard.jsx";
import ForcePasswordReset from "./components/common/ForcePasswordReset.jsx";
import { AnalyticsProvider } from "./contexts/AnalyticsContext";
import { GlobalUIProvider } from "./contexts/GlobalUIContext.jsx";
import { StaffProvider } from "./contexts/StaffContext.jsx";
import { ServiceProvider } from "./contexts/ServiceContext.jsx";

import { supabase } from "./supabase";

import { generateDisplayId, getStaffIdentity } from "./utils/idUtils";
import { convertLogoUrl } from "./services/brandingService";
import { canAccessAdmin } from "./utils/permissions";
import { generateUUID } from "./utils/uuid";

import darkTheme from "./theme";
import LoadingScreen from "./components/common/LoadingScreen";

export default function App() {
  const [authReady, setAuthReady] = useState(false); // true once first onAuthStateChanged fires
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'staff' | 'superadmin' | null
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);

  // Staff-only session/shift info
  const [activeShiftId, setActiveShiftId] = useState(null);
  const [activeShiftPeriod, setActiveShiftPeriod] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState(null);

  // Clock-in mode (non-cashier staff clocked in to an existing shift)
  const [clockInMode, setClockInMode] = useState(false);
  const [clockInLogId, setClockInLogId] = useState(null);

  // Staff display name and sequential ID (extracted from user doc during auth bootstrap — no extra fetch in POS)
  const [staffDisplayName, setStaffDisplayName] = useState('');
  const [staffSequentialId, setStaffSequentialId] = useState(null);

  // App-wide settings (fetched once, passed to all pages — avoids per-component flash)
  const [appSettings, setAppSettings] = useState({
    storeName: "Kunek",
    pcRentalEnabled: true,
    currencySymbol: "₱",
    paymentMethods: {},
  });

  useEffect(() => {
    console.log("[App] Subscribing to Settings...");

    const fetchSettings = async () => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 'config').maybeSingle();
      let mappedData = {
        storeName: "Kunek",
        pcRentalEnabled: true,
        currencySymbol: "₱",
        paymentMethods: {}
      };

      if (data) {
        mappedData = {
          storeName: data.store_name,
          logoUrl: data.logo_url,
          address: data.address,
          phone: data.phone,
          mobile: data.mobile,
          email: data.email,
          tin: data.tin,
          currencySymbol: data.currency_symbol,
          taxRate: data.tax_rate,
          receiptFooter: data.receipt_footer,
          showTaxBreakdown: data.show_tax_breakdown,
          drawerHotkey: data.drawer_hotkey,
          checkoutHotkey: data.checkout_hotkey,
          idPrefixes: data.id_prefixes,
          shiftDurationHours: data.shift_duration_hours,
          shiftAlertMinutes: data.shift_alert_minutes,
          schedulePostingFrequency: data.schedule_posting_frequency,
          pcRentalEnabled: data.pc_rental_enabled,
          pcRentalMode: data.pc_rental_mode,
          pcRentalServiceId: data.pc_rental_service_id,
          invoiceDueDays: data.invoice_due_days,
          paymentMethods: data.payment_methods,
          drawerSignalType: data.drawer_signal_type
        };

        // Preload logo so it's in cache before the gate opens
        if (mappedData.logoUrl) {
          const converted = convertLogoUrl(mappedData.logoUrl);
          await new Promise(resolve => {
            const img = new Image();
            img.onload = img.onerror = resolve;
            img.src = converted;
          });
          mappedData.logoUrl = converted;
        }
      }
      
      console.log("[App] Settings Loaded:", mappedData.storeName);
      setAppSettings(mappedData);
    };

    fetchSettings();

    // Fallback: If settings fail to load after 3 seconds, forcefully mount with defaults
    // to prevent the app from freezing on a white loading screen if RLS drops the query.
    const settingsTimeout = setTimeout(() => {
      setAppSettings(prev => prev || {
        storeName: "Kunek",
        pcRentalEnabled: true,
        currencySymbol: "₱",
        paymentMethods: {}
      });
    }, 3000);

    const channel = supabase.channel('public:settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'id=eq.config' }, fetchSettings)
      .subscribe();

    return () => {
      clearTimeout(settingsTimeout);
      supabase.removeChannel(channel);
    };
  }, []);

  // Fast-path: if there is no cached Supabase session on mount, skip the loading
  // screen immediately so logged-out users see the login page without delay.
  // Also add listener for tab visibility to refresh session when waking from sleep.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setAuthReady(true);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().catch(console.warn);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // ------------------ AUTH BOOTSTRAP  // 1. Initial Auth State
  useEffect(() => {
    let internalAuthReady = false;

    console.log("[App] Initializing Auth Bootstrap... authReady:", authReady);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      internalAuthReady = true;
      const user = session?.user || null;
      console.log(`[App] Auth Event: ${event}`, user ? `(User: ${user.email})` : "(No User)");

      // Sticky recovery flag for this event cycle
      const isRecovery = (event === "PASSWORD_RECOVERY");
      if (isRecovery) {
        setRequiresPasswordReset(true);
      }

      // Wrap in an IIFE to prevent Supabase from awaiting this callback,
      // which can block the `signInWithPassword` promise from resolving!
      (async () => {
        try {
        if (!user) {
          // reset everything on sign out
          setCurrentUser(null);
          setUserRole(null);
          setRequiresPasswordReset(false);
          setActiveShiftId(null);
          setActiveShiftPeriod("");
          setShiftStartTime(null);
          setClockInMode(false);
          setClockInLogId(null);
          setStaffDisplayName('');
          setStaffSequentialId(null);
        } else {
          // Now that we have the staff UUID (p.id) and/or sequential staff_id (p.staff_id),
          // we can correctly query the schedules table. (Fix 5 applied)
          const { data: userData, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

          if (profileError) {
            console.warn("[App] Profile fetch error:", profileError.message);
          }
          // Always set the user — if profile is missing/blocked, role=null routes to login
          const role = userData?.role || null;
          setCurrentUser(user);
          setUserRole(role);
            
            // Only set from profile if not currently in a recovery flow
            if (isRecovery) {
              setRequiresPasswordReset(true);
            } else {
              setRequiresPasswordReset(userData?.requires_password_reset || false);
            }
            
            setStaffDisplayName(userData?.full_name || userData?.email || user.email || '');
            setStaffSequentialId(userData?.staff_id || null);

            if (role === "staff") {
              const { data: statusData } = await supabase.from('app_status').select('*').eq('id', 'current_shift').maybeSingle();

              if (statusData?.active_shift_id && (statusData.staff_id === user.id || statusData.staff_id === userData?.staff_id)) {
                const shiftId = statusData.active_shift_id;
                
                // Accept both UUID format and sequential IDs (e.g. SH-100000000001)
                const isValidShiftId = shiftId && (
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shiftId)
                  || /^[A-Z]{2}-\d+$/.test(shiftId)
                );

                let shiftData = null;
                if (isValidShiftId) {
                  const { data } = await supabase.from('shifts').select('*').eq('id', shiftId).maybeSingle();
                  shiftData = data;
                }

                if (shiftData) {
                  setActiveShiftId(shiftId);
                  setActiveShiftPeriod(shiftData.shift_period || "");
                  if (shiftData.start_time) {
                    setShiftStartTime(new Date(shiftData.start_time));
                  }
                } else {
                  console.warn("[App] Active shift ID found in app_status but missing or invalid in shifts table. Clearing stale lock.");
                  await supabase.from('app_status').update({ active_shift_id: null }).eq('id', 'current_shift');
                  setActiveShiftId(null);
                  setActiveShiftPeriod("");
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
        }

      } catch (err) {
        console.warn("Auth bootstrap error:", err);
      } finally {
        setAuthReady(true);
      }
      })(); // End IIFE
    });

    // Force authReady if the listener stalls completely (e.g. offline, profile fetch hangs, etc.)
    // Increased from 3s to 8s because token refresh on page reload can sometimes take longer,
    // causing a premature redirect to the Login page.
    const authTimeout = setTimeout(() => {
      setAuthReady(true);
    }, 8000);

    return () => {
      clearTimeout(authTimeout);
      if (subscription) subscription.unsubscribe();
    };
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
  // Supabase queries can hang indefinitely if RLS blocks or network stalls.
  // This races a query against a timeout so the UI never gets stuck.
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
      ),
    ]);

  const handleLogin = async (email, password) => {
    // Supabase sign-in
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      throw authError;
    }

    const { user } = authData;

    // 1. Try finding by ID (standard Supabase way)
    let { data: userData } = await withTimeout(
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      10000, 'Profile fetch'
    );

    // 2. If not found by ID, try finding by Email (Migration Fallback)
    if (!userData) {
      console.log(`[App] Profile not found by ID, attempting Email lookup for: ${user.email}`);
      const { data: emailMatch } = await withTimeout(
        supabase.from('profiles').select('*').eq('email', user.email).maybeSingle(),
        10000, 'Profile email lookup'
      );
      
      if (emailMatch) {
        console.log(`[App] Found profile by email! Bridging the session for: ${user.email}`);
        
        // Attempt to heal the link, but don't block login if RLS stops us
        supabase.from('profiles').update({ id: user.id }).eq('email', user.email).then(({ error: updateError }) => {
          if (updateError) console.error("[App] Link repair blocked by RLS (Expected):", updateError.message);
          else console.log("[App] Link repair successful.");
        });

        // Use the profile found by email
        userData = { ...emailMatch };
      }
    }

    if (!userData) {
      console.error("[App] Login blocked: No profile found for", user.email);
      await supabase.auth.signOut().catch((err) => { console.warn("forced signout err", err); });
      const e = new Error(`Access Denied: No profile found for ${user.email}. Please ensure your email is correct in the database.`);
      e.code = "auth/user-not-found";
      throw e;
    }

    if (userData.suspended === true) {
      await supabase.auth.signOut().catch((err) => { console.warn("forced signout err", err); });
      const e = new Error("This account has been suspended. Please contact your administrator.");
      e.code = "auth/account-suspended";
      throw e;
    }

    const role = userData.role || null;
    // ── Admin path — bypasses shift lock entirely ──
    if (canAccessAdmin(role)) {
      setCurrentUser(user);
      setUserRole(role);
      return { type: "admin" };
    }

    // ── Staff path ──
    if (role !== "staff") {
      await supabase.auth.signOut().catch((err) => { console.warn("forced signout err", err); });
      const e = new Error("Unrecognized account role. Contact your administrator.");
      e.code = "auth/user-disabled";
      throw e;
    }

    // Check shift lock only for staff
    const { data: statusSnap } = await supabase.from('app_status').select('*').eq('id', 'current_shift').maybeSingle();
    const lock = statusSnap || null;

    const staffOwnsShift = lock?.staff_id === user.id || lock?.staff_id === userData.staff_id;

    // Offer clock-in if shift is locked by another staff
    if (lock?.active_shift_id && !staffOwnsShift) {
      // Re-validate shiftId presence and format
      if (!lock.active_shift_id || typeof lock.active_shift_id !== 'string') {
        console.warn("[App] Corrupt active_shift_id found:", lock.active_shift_id);
        return { type: "fallback" };
      }

      const { data: shiftSnap } = await supabase.from('shifts').select('shift_period').eq('id', lock.active_shift_id).maybeSingle();
      const shiftPeriod = shiftSnap ? shiftSnap.shift_period || "" : "";

      // Try to get the cashier's display name (lookup by UUID first, fall back to staff_id)
      let cashierName = lock.staff_id;
      let cashierEmail = '';
      try {
        const { data: cashierSnap } = await supabase.from('profiles').select('full_name, email')
          .or(`id.eq.${lock.staff_id},staff_id.eq.${lock.staff_id}`)
          .maybeSingle();
        if (cashierSnap) {
          cashierName = cashierSnap.full_name || cashierSnap.email;
          cashierEmail = cashierSnap.email;
        }
      } catch { }

      return { type: "clockin", cashierName, cashierEmail, activeShiftId: lock.active_shift_id, shiftPeriod };
    }

    // Re-login: same staff has active shift
    if (lock?.active_shift_id && staffOwnsShift) {
      const { data: shiftSnap } = await supabase.from('shifts').select('shift_period').eq('id', lock.active_shift_id).maybeSingle();
      const shiftPeriod = shiftSnap ? shiftSnap.shift_period || "" : "";
      return { type: "relogin", shiftPeriod };
    }

    // Query today's own scheduled entry
    const today = todayPHT();
    const staffKey = userData.staff_id || email;
    const { data: ownSnap } = await supabase.from('schedules').select('*').eq('staff_id', staffKey);
    const ownEntry = (ownSnap || []).find(e => e.date === today && (e.status === "scheduled" || e.status === "in-progress"));
    if (ownEntry) return {
      type: "scheduled", scheduleEntry: {
        id: ownEntry.id,
        shiftLabel: ownEntry.shift_label,
        ...ownEntry
      }
    };

    // Query coverage entries (where this staff is covering someone)
    const { data: profileSnap } = await supabase.from('profiles').select('staff_id').eq('email', email).single();
    const coverStaffId = profileSnap?.staff_id;
    const { data: coverSnap } = coverStaffId
        ? await supabase.from('schedules').select('*').eq('covered_by_id', coverStaffId)
        : { data: [] };
    const coverEntry = (coverSnap || []).find(e => e.date === today && e.status === "covered");
    if (coverEntry) return {
      type: "covered", scheduleEntry: {
        id: coverEntry.id,
        shiftLabel: coverEntry.shift_label,
        ...coverEntry
      }
    };

    return { type: "fallback" };
  };

  /**
   * Phase 2 — Create shift doc, update schedule entry, set App state.
   * type: 'scheduled' | 'covered' | 'relogin' | 'fallback'
   */
  const handleStartShift = async (type, scheduleEntry, shiftPeriod, notes) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated.");

    // Re-login: restore state from existing lock
    if (type === "relogin") {
      const { data: lock } = await supabase.from('app_status').select('*').eq('id', 'current_shift').single();
      const shiftId = lock?.active_shift_id;
      const isValidShiftId = shiftId && (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shiftId)
        || /^[A-Z]{2}-\d+$/.test(shiftId)
      );

      let shiftSnap = null;
      if (isValidShiftId) {
        const { data } = await supabase.from('shifts').select('*').eq('id', shiftId).maybeSingle();
        shiftSnap = data;
      }

      if (!shiftSnap) {
        throw new Error("Shift record missing or invalid. Please log in again to start a new shift.");
      }

      setCurrentUser(user);
      setUserRole("staff");
      setActiveShiftId(lock.active_shift_id);
      setActiveShiftPeriod(shiftSnap ? shiftSnap.shift_period || "" : "");
      return;
    }

    const shiftLabel = scheduleEntry?.shiftLabel || shiftPeriod;

    // Create shift doc
    const shiftId = await generateDisplayId("shifts", "SH");

    const finalStaffId = user.id;

    const { data: shiftDoc, error: shiftError } = await supabase.from('shifts').insert([{
      id: shiftId,
      display_id: shiftId,
      staff_id: finalStaffId,
      shift_period: shiftLabel,
      schedule_id: scheduleEntry?.id || null,
      notes: notes || "",
      start_time: new Date().toISOString(),
      // Initialize required financial fields to 0
      pc_rental_total: 0,
      system_total: 0,
      services_total: 0,
      expenses_total: 0,
      total_ar: 0,
      total_cash: 0,
      total_digital: 0,
      ar_payments_total: 0
    }]).select().single();

    if (shiftError) throw shiftError;

    // Link schedule entry → in-progress
    if (scheduleEntry?.id) {
      await supabase.from('schedules').update({
        status: "in-progress",
        shift_id: shiftDoc.id,
        updated_at: new Date().toISOString()
      }).eq('id', scheduleEntry.id);
    }

    // Write shift lock
    await supabase.from('app_status').upsert({
      id: 'current_shift',
      active_shift_id: shiftDoc.id,
      staff_id: finalStaffId,
    });

    // Update App state → triggers route to /pos
    setCurrentUser(user);
    setUserRole("staff");
    setActiveShiftId(shiftDoc.id);
    setActiveShiftPeriod(shiftLabel);
    setStaffSequentialId(finalStaffId);
  };

  /** Cancel pending login (sign out, Login.jsx resets phase) */
  const handleCancelLogin = async () => {
    try { await supabase.auth.signOut(); } catch { }
  };

  /** Clock in as non-cashier staff to an existing active shift */
  const handleClockIn = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated.");

    const { data: userData } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    // Fetch the active shift id from the lock
    const { data: lock } = await supabase.from('app_status').select('*').eq('id', 'current_shift').single();

    // Write clock-in log
    const logId = await generateDisplayId("payroll", "PY");

    const { data: logRef, error: logError } = await supabase.from('payroll_logs').insert([{
      id: logId,
      staff_uid: userData?.staff_id || user.id,
      staff_email: user.email,
      staff_name: userData?.full_name || user.email,
      clock_in: new Date().toISOString(),
      shift_id: lock?.active_shift_id || null,
      type: "clock_in",
    }]).select().single();

    if (logError) throw logError;

    setCurrentUser(user);
    setUserRole("staff");
    setClockInMode(true);
    setClockInLogId(logRef.id);
  };

  /** Clock out — writes clockOut timestamp, signs out */
  const handleClockOut = async () => {
    try {
      if (clockInLogId) {
        await supabase.from('payroll_logs').update({
          clock_out: new Date().toISOString(),
        }).eq('id', clockInLogId);
      }
    } catch (err) {
      console.warn("Clock-out log update failed:", err);
    }
    try { await supabase.auth.signOut(); } catch { }
    setClockInMode(false);
    setClockInLogId(null);
  };

  const handleAdminLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      setCurrentUser(null);
      setUserRole(null);
      setRequiresPasswordReset(false);
    }
  };

  // ------------------ RENDER ------------------

  if (!authReady) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <LoadingScreen message="Loading Kunek Setup..." />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <GlobalUIProvider>
        <BrowserRouter>
          {currentUser && requiresPasswordReset ? (
            <ForcePasswordReset onComplete={() => setRequiresPasswordReset(false)} />
          ) : (
            <Routes>
              {/* Public / Login Route */}
              <Route path="/login" element={
                !currentUser || !userRole || (userRole === 'staff' && !activeShiftId && !clockInMode) ? (
                  <Login
                    onLogin={handleLogin}
                    onStartShift={handleStartShift}
                    onClockIn={handleClockIn}
                    onCancelLogin={handleCancelLogin}
                    appSettings={appSettings}
                  />
                ) : (
                  <Navigate to={canAccessAdmin(userRole) ? "/admin" : "/pos"} replace />
                )
              } />

              {/* Staff POS / Clock-In Route */}
              <Route path="/pos" element={
                currentUser && userRole === 'staff' ? (
                  clockInMode ? (
                    <ClockInDashboard
                      user={currentUser}
                      staffId={staffSequentialId}
                      clockInLogId={clockInLogId}
                      onClockOut={handleClockOut}
                    />
                  ) : activeShiftId ? (
                    <POS
                      user={currentUser}
                      staffId={staffSequentialId}
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
                currentUser && canAccessAdmin(userRole) ? (
                  <Box sx={{ width: "100%", height: "100%", display: "flex" }}>
                    <StaffProvider>
                      <ServiceProvider>
                        <AnalyticsProvider>
                          <AdminDashboard user={currentUser} userRole={userRole} onLogout={handleAdminLogout} appSettings={appSettings} />
                        </AnalyticsProvider>
                      </ServiceProvider>
                    </StaffProvider>
                  </Box>
                ) : (
                  <Navigate to="/login" replace />
                )
              } />

              {/* Root Redirect */}
              <Route path="/" element={
                currentUser ? (
                  <Navigate to={canAccessAdmin(userRole) ? "/admin" : "/pos"} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              } />

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </BrowserRouter>
      </GlobalUIProvider>
    </ThemeProvider>
  );
}