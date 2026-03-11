// src/services/shiftService.js
import { supabase } from "../supabase";
import { sumDenominations } from "../utils/shiftFinancials";
import { generateDisplayId } from "./orderService";

const generateId = () => `SHIFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/**
 * Calculates on-hand cash from denominations.
 * Returns null if no denominations are provided.
 */
export const calculateOnHand = (denoms) => {
    if (!denoms || typeof denoms !== 'object') return null;
    if (Object.keys(denoms).length === 0) return null;
    try {
        return sumDenominations(denoms);
    } catch (e) {
        return null;
    }
};

/**
 * Returns { startStr, endStr } for the current month as "YYYY-MM-DD".
 */
export const getThisMonthDefaults = () => {
    const now = new Date();
    const startStr = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString().slice(0, 10);
    const endStr = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString().slice(0, 10);
    return { startStr, endStr };
};

/**
 * Converts ISO String → "YYYY-MM-DDTHH:MM" for datetime-local inputs.
 */
export const toLocalInput = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (!d || isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Converts "YYYY-MM-DDTHH:MM" string → ISO String for PostgreSQL TIMESTAMPTZ.
 */
export const toTimestamp = (str) => {
    if (!str) return null;
    return new Date(str).toISOString();
};

/**
 * Sets the active shift in app_status.
 */
export const resumeShift = async (shiftId, staffEmail) => {
    const { error } = await supabase
        .from('app_status')
        .update({
            active_shift_id: shiftId,
            staff_email: staffEmail,
            updated_at: new Date().toISOString()
        })
        .eq('id', 'current_shift');

    if (error) {
        // If row doesn't exist, insert it
        await supabase.from('app_status').insert([{
            id: 'current_shift',
            active_shift_id: shiftId,
            staff_email: staffEmail,
            updated_at: new Date().toISOString()
        }]);
    }
};

/**
 * Creates a new shift document.
 */
export const createShift = async (payload) => {
    const newId = generateId();
    const displayId = await generateDisplayId('shifts', 'SHF');
    const fullPayload = {
        id: newId,
        display_id: displayId,
        pc_rental_total: 0,
        system_total: 0,
        staff_email: payload.staffEmail,
        shift_period: payload.shiftPeriod,
        notes: payload.notes,
        schedule_id: payload.scheduleId,
        start_time: payload.startTime ? toTimestamp(payload.startTime) : new Date().toISOString(),
        end_time: payload.endTime ? toTimestamp(payload.endTime) : null,
        services_total: 0,
        expenses_total: 0,
        total_ar: 0,
        total_cash: 0,
        total_gcash: 0,
        ar_payments_total: 0
    };

    const { data, error } = await supabase
        .from('shifts')
        .insert([fullPayload])
        .select()
        .single();

    if (error) throw error;

    return data;
};

/**
 * Updates an existing shift.
 */
export const updateShift = async (shiftId, payload) => {
    const finalPayload = {};
    if (payload.startTime) finalPayload.start_time = toTimestamp(payload.startTime);
    if (payload.endTime) finalPayload.end_time = toTimestamp(payload.endTime);
    if (payload.notes !== undefined) finalPayload.notes = payload.notes;
    // Map other UI properties back to DB snake_case safely if needed
    if (payload.systemTotal !== undefined) finalPayload.system_total = payload.systemTotal;
    if (payload.pcRentalTotal !== undefined) finalPayload.pc_rental_total = payload.pcRentalTotal;

    const { error } = await supabase
        .from('shifts')
        .update(finalPayload)
        .eq('id', shiftId);

    if (error) throw error;
};

/**
 * Deletes a shift. 
 * Due to PostgreSQL referential integrity:
 * - ON DELETE SET NULL constraint will automatically 'unlink' child transactions based on our schema v2.0
 * - If UI explicitly wants to "purge", we sequentially delete children first.
 */
export const deleteShift = async (shiftId, mode = "unlink") => {
    if (mode === "purge") {
        await Promise.all([
            supabase.from('order_items').delete().eq('shift_id', shiftId),
            supabase.from('pc_transactions').delete().eq('shift_id', shiftId),
            supabase.from('expenses').delete().eq('shift_id', shiftId)
        ]);
    } else if (mode === "unlink") {
        await Promise.all([
            supabase.from('order_items').update({ shift_id: null }).eq('shift_id', shiftId),
            supabase.from('pc_transactions').update({ shift_id: null }).eq('shift_id', shiftId),
            supabase.from('expenses').update({ shift_id: null }).eq('shift_id', shiftId)
        ]);
    }

    const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', shiftId);

    if (error) throw error;
};
