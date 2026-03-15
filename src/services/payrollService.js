// src/services/payrollService.js
// Centralized service layer for all payroll CRUD operations.

import { supabase } from "../supabase";
import { generateDisplayId } from "./orderService";
import { recordExpense } from "./transactionService";
import {
  minutesBetween,
  calcGross,
  resolveHourlyRate,
  shortageForShift,
} from "../utils/payrollHelpers";

// ─── PAYROLL RUNS ───────────────────────────────────────────────────────────

/**
 * Fetch all payroll runs, optionally filtered.
 */
export async function fetchRuns({ status, fromDate, toDate } = {}) {
  let q = supabase
    .from("payroll_runs")
    .select("*")
    .order("period_start", { ascending: false });

  if (status && status.length > 0) {
    q = q.in("status", status);
  }
  if (fromDate) q = q.gte("period_start", fromDate);
  if (toDate) q = q.lte("period_end", toDate);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch a single run with all its lines, shifts, deductions, and additions.
 */
export async function loadRun(runId) {
  const [runRes, linesRes, shiftsRes, dedsRes, addsRes] = await Promise.all([
    supabase.from("payroll_runs").select("*").eq("id", runId).single(),
    supabase.from("payroll_lines").select("*").eq("run_id", runId),
    supabase.from("payroll_line_shifts").select("*").eq("run_id", runId),
    supabase.from("payroll_deductions").select("*").eq("run_id", runId),
    supabase.from("payroll_additions").select("*").eq("run_id", runId),
  ]);

  if (runRes.error) throw runRes.error;

  const lines = (linesRes.data || []).map((line) => {
    const lineShifts = (shiftsRes.data || []).filter((s) => s.line_id === line.id);
    const lineDeductions = (dedsRes.data || []).filter((d) => d.line_id === line.id);
    const lineAdditions = (addsRes.data || []).filter((a) => a.line_id === line.id);
    return { ...line, shifts: lineShifts, deductions: lineDeductions, additions: lineAdditions };
  });

  return { run: runRes.data, lines };
}

// ─── PREVIEW GENERATION ─────────────────────────────────────────────────────

/**
 * Generate a payroll preview from shifts in a date range.
 * Returns an array of line previews (one per staff) with embedded shift rows,
 * auto-applied deductions (shortages + advances), and rate lookups.
 */
export async function generatePreview(periodStart, periodEnd) {
  const startISO = new Date(`${periodStart}T00:00:00+08:00`).toISOString();
  const endISO = new Date(`${periodEnd}T23:59:59+08:00`).toISOString();

  // 1. Fetch shifts in range (completed or ongoing)
  const { data: shifts, error: shiftErr } = await supabase
    .from("shifts")
    .select("*")
    .gte("start_time", startISO)
    .lte("start_time", endISO)
    .order("start_time", { ascending: true });

  if (shiftErr) throw shiftErr;

  // 2. Fetch all staff profiles (for rates)
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "staff");

  if (profErr) throw profErr;

  // 3. Fetch salary advances in the period
  const shiftIds = (shifts || []).map((s) => s.id);
  const { data: advances, error: advErr } = await supabase
    .from("expenses")
    .select("*")
    .eq("expense_type", "Salary Advance")
    .in("shift_id", shiftIds.length > 0 ? shiftIds : ["__none__"]);

  if (advErr) throw advErr;

  // Build lookup maps
  const profileById = new Map();
  const profileByEmail = new Map();
  const profileBySeqId = new Map();
  (profiles || []).forEach((p) => {
    profileById.set(p.id, p);
    if (p.email) profileByEmail.set(p.email, p);
    if (p.staff_id) profileBySeqId.set(p.staff_id, p);
  });

  const advancesByShift = new Map();
  (advances || []).filter((a) => !a.voided).forEach((a) => {
    const list = advancesByShift.get(a.shift_id) || [];
    list.push(a);
    advancesByShift.set(a.shift_id, list);
  });

  // Group shifts by staff
  const byStaff = new Map();
  (shifts || []).forEach((s) => {
    const rawStaffId = s.staff_id;
    if (!rawStaffId) return;

    // Resolve profile: try UUID, then sequential ST-xxx, then email
    const profile = profileById.get(rawStaffId) || profileBySeqId.get(rawStaffId) || profileByEmail.get(s.staff_email);
    // Use the profile UUID for DB storage; fall back to raw ID if no profile found
    const resolvedStaffId = profile?.id || rawStaffId;
    const isOngoing = !s.end_time;
    const effectiveEnd = isOngoing ? new Date().toISOString() : s.end_time;
    const minutes = minutesBetween(s.start_time, effectiveEnd);
    const shortage = shortageForShift(s);

    const shiftRow = {
      shiftId: s.id,
      originalStart: s.start_time,
      originalEnd: s.end_time || null,
      overrideStart: null,
      overrideEnd: isOngoing ? effectiveEnd : null,
      minutesUsed: minutes,
      excluded: false,
      shortage,
      isOngoing,
      shiftPeriod: s.shift_period || "",
      notes: "",
    };

    // Calculate advance for this shift
    const shiftAdvances = advancesByShift.get(s.id) || [];
    const advanceTotal = shiftAdvances.reduce((sum, a) => sum + Number(a.amount || a.total || 0), 0);

    const bucket = byStaff.get(resolvedStaffId) || {
      staffId: resolvedStaffId,
      staffName: profile?.full_name || s.staff_email || "Unknown",
      staffEmail: profile?.email || s.staff_email || "",
      profile,
      shifts: [],
      deductions: [],
    };

    bucket.shifts.push(shiftRow);

    // Auto deductions: shortage (only if meaningfully negative, > ₱1)
    if (shortage > 1) {
      bucket.deductions.push({
        type: "shortage",
        label: `Shortage — ${s.shift_period || s.id} (${new Date(s.start_time).toLocaleDateString()})`,
        amount: shortage,
        sourceId: s.id,
        autoApplied: true,
      });
    }

    // Auto deductions: salary advance
    if (advanceTotal > 0) {
      shiftAdvances.filter((a) => !a.voided).forEach((a) => {
        bucket.deductions.push({
          type: "advance",
          label: `Salary Advance — ${s.shift_period || ""} (${new Date(s.start_time).toLocaleDateString()})`,
          amount: Number(a.amount || a.total || 0),
          sourceId: a.id,
          autoApplied: true,
        });
      });
    }

    byStaff.set(resolvedStaffId, bucket);
  });

  // Build line previews
  const endDateForRate = new Date(`${periodEnd}T23:59:59`);
  const lines = [];

  for (const [, bucket] of byStaff) {
    const rate = resolveHourlyRate(bucket.profile?.payroll_config, endDateForRate);
    const totalMinutes = bucket.shifts
      .filter((s) => !s.excluded)
      .reduce((sum, s) => sum + s.minutesUsed, 0);
    const gross = calcGross(totalMinutes, rate);
    const totalDeductions = bucket.deductions.reduce((sum, d) => sum + d.amount, 0);
    const totalAdditions = 0; // No auto additions yet
    const net = Number((gross + totalAdditions - totalDeductions).toFixed(2));

    lines.push({
      staffId: bucket.staffId,
      staffName: bucket.staffName,
      staffEmail: bucket.staffEmail,
      rate,
      totalMinutes,
      gross,
      totalDeductions,
      totalAdditions,
      net,
      shifts: bucket.shifts,
      deductions: bucket.deductions,
      additions: [],
    });
  }

  return lines.sort((a, b) => a.staffName.localeCompare(b.staffName));
}

// ─── SAVE / UPDATE RUN ──────────────────────────────────────────────────────

/**
 * Create or update a payroll run with all its lines.
 */
export async function saveRun({ runId, periodStart, periodEnd, payDate, status, lines, notes, userId }) {
  const startISO = new Date(`${periodStart}T00:00:00+08:00`).toISOString();
  const endISO = new Date(`${periodEnd}T23:59:59+08:00`).toISOString();
  const payISO = new Date(`${payDate}T00:00:00+08:00`).toISOString();

  // Compute totals
  const totals = {
    staffCount: lines.length,
    totalMinutes: lines.reduce((s, l) => s + l.totalMinutes, 0),
    gross: Number(lines.reduce((s, l) => s + l.gross, 0).toFixed(2)),
    deductions: Number(lines.reduce((s, l) => s + l.totalDeductions, 0).toFixed(2)),
    additions: Number(lines.reduce((s, l) => s + l.totalAdditions, 0).toFixed(2)),
    net: Number(lines.reduce((s, l) => s + l.net, 0).toFixed(2)),
  };

  let finalRunId = runId;

  if (runId) {
    // Update existing run
    const { error } = await supabase
      .from("payroll_runs")
      .update({ period_start: startISO, period_end: endISO, pay_date: payISO, status, totals, notes, updated_at: new Date().toISOString() })
      .eq("id", runId);
    if (error) throw error;

    // Delete old child records to replace
    await Promise.all([
      supabase.from("payroll_lines").delete().eq("run_id", runId),
    ]);
  } else {
    // Create new run
    const displayId = await generateDisplayId("payroll_runs", "PR");
    const { data, error } = await supabase
      .from("payroll_runs")
      .insert({
        display_id: displayId,
        period_start: startISO,
        period_end: endISO,
        pay_date: payISO,
        status,
        totals,
        notes: notes || "",
        created_by: userId || null,
      })
      .select()
      .single();
    if (error) throw error;
    finalRunId = data.id;
  }

  // Insert lines + children
  for (const line of lines) {
    const { data: lineData, error: lineErr } = await supabase
      .from("payroll_lines")
      .insert({
        run_id: finalRunId,
        staff_id: line.staffId,
        staff_name: line.staffName,
        staff_email: line.staffEmail,
        rate: line.rate,
        total_minutes: line.totalMinutes,
        gross: line.gross,
        total_deductions: line.totalDeductions,
        total_additions: line.totalAdditions,
        net: line.net,
      })
      .select()
      .single();

    if (lineErr) throw lineErr;
    const lineId = lineData.id;

    // Insert shift records
    if (line.shifts?.length > 0) {
      const shiftRows = line.shifts.map((s) => ({
        line_id: lineId,
        run_id: finalRunId,
        shift_id: s.shiftId,
        original_start: s.originalStart,
        original_end: s.originalEnd,
        override_start: s.overrideStart,
        override_end: s.overrideEnd,
        minutes_used: s.minutesUsed,
        excluded: s.excluded,
        shortage: s.shortage,
        notes: s.notes || "",
      }));
      const { error } = await supabase.from("payroll_line_shifts").insert(shiftRows);
      if (error) throw error;
    }

    // Insert deductions
    if (line.deductions?.length > 0) {
      const dedRows = line.deductions.map((d) => ({
        line_id: lineId,
        run_id: finalRunId,
        type: d.type,
        label: d.label,
        amount: d.amount,
        source_id: d.sourceId || null,
        auto_applied: d.autoApplied || false,
      }));
      const { error } = await supabase.from("payroll_deductions").insert(dedRows);
      if (error) throw error;
    }

    // Insert additions
    if (line.additions?.length > 0) {
      const addRows = line.additions.map((a) => ({
        line_id: lineId,
        run_id: finalRunId,
        type: a.type,
        label: a.label,
        amount: a.amount,
        auto_applied: a.autoApplied || false,
      }));
      const { error } = await supabase.from("payroll_additions").insert(addRows);
      if (error) throw error;
    }
  }

  return finalRunId;
}

// ─── POST / VOID / DELETE ───────────────────────────────────────────────────

/**
 * Post a run — marks as posted and generates pay stubs.
 */
export async function postRun(runId, userId) {
  const { run, lines } = await loadRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status === "posted") throw new Error("Run already posted");

  // Generate stubs with accurate snapshots
  const stubs = lines.map((line) => {
    // We already have everything we need from loadRun(runId)
    return {
      run_id: runId,
      line_id: line.id,
      staff_id: line.staff_id,
      staff_name: line.staff_name,
      period_start: run.period_start,
      period_end: run.period_end,
      pay_date: run.pay_date,
      rate: line.rate,
      total_hours: Number((line.total_minutes / 60).toFixed(2)),
      gross_pay: line.gross,
      deductions: (line.deductions || []).map((d) => ({ type: d.type, label: d.label, amount: d.amount })),
      additions: (line.additions || []).map((a) => ({ type: a.type, label: a.label, amount: a.amount })),
      total_deductions: line.total_deductions,
      total_additions: line.total_additions,
      net_pay: line.net,
      shifts: (line.shifts || []).map((s) => ({
        id: s.shift_id,
        label: s.notes || "",
        start: s.override_start || s.original_start,
        end: s.override_end || s.original_end,
        hours: Number((s.minutes_used / 60).toFixed(2)),
        pay: calcGross(s.minutes_used, line.rate),
      })),
    };
  });

  if (stubs.length > 0) {
    const { error: stubErr } = await supabase.from("payroll_stubs").insert(stubs);
    if (stubErr) {
      console.error("[payrollService] Failed to insert stubs:", stubErr);
      throw new Error("Payroll posted but pay slips failed to generate. " + stubErr.message);
    }
  }

  // Update run status
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "posted", approved_by: userId || null, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;

  // Record each line as an individual expense
  try {
    const expensePromises = lines
      .filter(line => line.net > 0)
      .map(line => 
        recordExpense({
          expenseType: 'Salary',
          expenseStaffId: line.staff_id,
          price: line.net,
          quantity: 1,
          notes: `Payroll - ${line.staff_name} (Run ${run.display_id})`,
          activeShiftId: null,
          metadata: { 
            payrollRunId: runId, 
            payrollLineId: line.id,
            staffName: line.staff_name
          }
        })
      );

    await Promise.all(expensePromises);
  } catch (expErr) {
    console.error("[payrollService] Failed to record individual payroll expenses:", expErr);
  }
}

/**
 * Void a posted run — only posted runs can be voided.
 * Also deletes associated pay stubs since they are no longer valid.
 */
export async function voidRun(runId) {
  // Safety: verify current status
  const { data: run, error: fetchErr } = await supabase
    .from("payroll_runs")
    .select("status")
    .eq("id", runId)
    .single();
  if (fetchErr) throw fetchErr;
  if (run.status !== "posted") throw new Error(`Cannot void a run with status "${run.status}". Only posted runs can be voided.`);

  // Delete associated pay stubs
  const { error: stubErr } = await supabase.from("payroll_stubs").delete().eq("run_id", runId);
  if (stubErr) throw stubErr;

  // Update run status
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "voided", updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;

  // Void the corresponding expense
  try {
    await supabase
      .from("expenses")
      .update({ is_deleted: true })
      .contains("metadata", { payrollRunId: runId });
  } catch (expErr) {
    console.error("[payrollService] Failed to void payroll expense:", expErr);
  }
}

/**
 * Delete a run — only draft or voided runs can be deleted.
 * CASCADE on FK handles child table cleanup.
 */
export async function deleteRun(runId) {
  // Safety: verify current status
  const { data: run, error: fetchErr } = await supabase
    .from("payroll_runs")
    .select("status")
    .eq("id", runId)
    .single();
  if (fetchErr) throw fetchErr;
  if (run.status !== "draft" && run.status !== "voided") {
    throw new Error(`Cannot delete a run with status "${run.status}". Only draft or voided runs can be deleted.`);
  }

  const { error } = await supabase.from("payroll_runs").delete().eq("id", runId);
  if (error) throw error;
}

// ─── DASHBOARD STATS ────────────────────────────────────────────────────────

/**
 * Fetch dashboard statistics for the payroll overview.
 */
export async function fetchDashboardStats() {
  const { data: runs, error } = await supabase
    .from("payroll_runs")
    .select("id, status, totals, period_start, period_end, pay_date, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const allRuns = runs || [];
  const posted = allRuns.filter((r) => r.status === "posted");
  const drafts = allRuns.filter((r) => r.status === "draft" || r.status === "reviewed" || r.status === "approved");

  const totalNetPaid = posted.reduce((s, r) => s + Number(r.totals?.net || 0), 0);

  // Staff count from profiles
  const { count: activeStaffCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "staff");

  return {
    totalRuns: allRuns.length,
    postedRuns: posted.length,
    pendingDrafts: drafts.length,
    totalNetPaid,
    activeStaffCount: activeStaffCount || 0,
    lastPostedRun: posted[0] || null,
    recentRuns: allRuns.slice(0, 5),
  };
}

/**
 * Fetch pay stubs, optionally filtered.
 */
export async function fetchStubs({ runId, staffId, fromDate, toDate } = {}) {
  let q = supabase
    .from("payroll_stubs")
    .select("*")
    .order("pay_date", { ascending: false });

  if (runId) q = q.eq("run_id", runId);
  if (staffId) q = q.eq("staff_id", staffId);
  if (fromDate) q = q.gte("period_start", fromDate);
  if (toDate) q = q.lte("period_end", toDate);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ─── STAFF PAY HISTORY ──────────────────────────────────────────────────────

/**
 * Fetch pay history for a specific staff member.
 * Returns summary stats and per-run breakdown from posted runs.
 */
export async function fetchStaffPayHistory(staffId) {
  // Get all payroll lines for this staff, joined with run info
  const { data: lines, error: lineErr } = await supabase
    .from("payroll_lines")
    .select("id, run_id, rate, total_minutes, gross, total_deductions, total_additions, net, created_at")
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false });

  if (lineErr) throw lineErr;
  if (!lines || lines.length === 0) return { totalEarned: 0, runCount: 0, runs: [] };

  // Fetch the associated runs to get period info and status
  const runIds = [...new Set(lines.map((l) => l.run_id))];
  const { data: runs, error: runErr } = await supabase
    .from("payroll_runs")
    .select("id, display_id, period_start, period_end, pay_date, status")
    .in("id", runIds);

  if (runErr) throw runErr;

  const runMap = new Map((runs || []).map((r) => [r.id, r]));

  // Build per-run breakdown (only posted runs count towards totals)
  const runBreakdown = lines
    .map((line) => {
      const run = runMap.get(line.run_id);
      return {
        runId: line.run_id,
        displayId: run?.display_id || "",
        periodStart: run?.period_start,
        periodEnd: run?.period_end,
        payDate: run?.pay_date,
        status: run?.status || "unknown",
        hours: Number((line.total_minutes / 60).toFixed(2)),
        gross: Number(line.gross),
        deductions: Number(line.total_deductions),
        additions: Number(line.total_additions),
        net: Number(line.net),
      };
    })
    .sort((a, b) => new Date(b.periodStart || 0) - new Date(a.periodStart || 0));

  const postedRuns = runBreakdown.filter((r) => r.status === "posted");
  const totalEarned = postedRuns.reduce((s, r) => s + r.net, 0);

  return {
    totalEarned: Number(totalEarned.toFixed(2)),
    runCount: postedRuns.length,
    runs: runBreakdown,
  };
}
