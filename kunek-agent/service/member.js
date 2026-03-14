'use strict';

const { getSupabase } = require('./supabase');
const logger = require('./logger');

/**
 * Verifies member credentials against Supabase.
 * @returns {Promise<{success: boolean, member?: object, error?: string}>}
 */
async function authenticateMember(username, password) {
    try {
        const supabase = getSupabase();
        const lowerUser = username.trim().toLowerCase();

        // Find member by username
        const { data: member, error } = await supabase
            .from('customers')
            .select('*')
            .eq('username', lowerUser)
            .single();

        if (error || !member) {
            return { success: false, error: 'Invalid username or password' };
        }

        // Verify password (plain text check as requested by user)
        if (member.password !== password) {
            return { success: false, error: 'Invalid username or password' };
        }

        return {
            success: true,
            member: {
                id: member.id,
                username: member.username,
                fullName: member.full_name,
                minutesRemaining: member.minutes_remaining || 0,
                forcePasswordChange: !!member.force_password_change
            }
        };
    } catch (err) {
        logger.error(`Error authenticating member: ${err.message}`);
        return { success: false, error: 'Authentication service error' };
    }
}

/**
 * Updates a member's password and clears the force-change flag.
 */
async function updateMemberPassword(memberId, newPassword) {
    try {
        const supabase = getSupabase();
        
        await supabase
            .from('customers')
            .update({
                password: newPassword,
                force_password_change: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', memberId);

        return { success: true };
    } catch (err) {
        logger.error(`Error updating member password: ${err.message}`);
        return { success: false, error: 'Failed to update password' };
    }
}

module.exports = { authenticateMember, updateMemberPassword };
