import { supabase } from "../supabase";

/**
 * Resolves the sequential staff ID from a user object.
 * Priority: user.staff_id -> user.id -> 'unknown'
 */
export const getStaffIdentity = (user) => {
    return user?.staff_id || user?.id || 'unknown';
};

/**
 * Generates a unique sequential display ID using Supabase RPC.
 * Format: PREFIX-000000000001 (12 digits)
 */
export const generateDisplayId = async (counterName, defaultPrefix = "ID") => {
    const { data, error } = await supabase.rpc('get_next_sequence_batch', { 
        p_counter_id: counterName, 
        p_count: 1 
    });

    if (error) {
        console.error(`Failed to generate sequential ID for ${counterName}:`, error);
        throw new Error(`ID Generation Error: ${error.message}`);
    }

    const { new_prefix, first_val, current_padding } = data[0];
    if (first_val == null) {
        throw new Error(`ID Generation Error: Counter '${counterName}' not found in counters table. Run the sequential_ids migration script.`);
    }
    const prefix = new_prefix || defaultPrefix;
    const padding = current_padding || 12;
    const seqPart = String(first_val).padStart(padding, '0');
    return `${prefix}-${seqPart}`;
};

/**
 * Reserves a block of sequential IDs for batch processing.
 */
export const generateBatchIds = async (counterName, defaultPrefix, count) => {
    if (count <= 0) return [];
    const { data, error } = await supabase.rpc('get_next_sequence_batch', { 
        p_counter_id: counterName, 
        p_count: count 
    });

    if (error) {
        console.error(`Failed to generate batch sequential IDs for ${counterName}:`, error);
        throw new Error(`Batch ID Generation Error: ${error.message}`);
    }

    const { new_prefix, first_val, current_padding } = data[0];
    const prefix = new_prefix || defaultPrefix;
    const padding = current_padding || 12;
    
    return Array.from({ length: count }, (_, i) => {
        const seqPart = String(BigInt(first_val) + BigInt(i)).padStart(padding, '0');
        return `${prefix}-${seqPart}`;
    });
};
