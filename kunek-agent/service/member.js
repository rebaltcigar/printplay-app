'use strict';

const {
    collection, query, where, getDocs,
    doc, updateDoc, serverTimestamp,
    limit
} = require('firebase/firestore');
const { getDB } = require('./firebase');
const logger = require('./logger');

/**
 * Verifies member credentials against Firestore.
 * @returns {Promise<{success: boolean, member?: object, error?: string}>}
 */
async function authenticateMember(username, password) {
    try {
        const db = getDB();
        const lowerUser = username.trim().toLowerCase();

        // Find member by username
        const q = query(
            collection(db, 'customers'),
            where('username', '==', lowerUser),
            limit(1)
        );

        const snap = await getDocs(q);
        if (snap.empty) {
            return { success: false, error: 'Invalid username or password' };
        }

        const memberDoc = snap.docs[0];
        const memberData = memberDoc.data();

        // Verify password (plain text check as requested by user)
        if (memberData.password !== password) {
            return { success: false, error: 'Invalid username or password' };
        }

        return {
            success: true,
            member: {
                id: memberDoc.id,
                username: memberData.username,
                fullName: memberData.fullName,
                minutesRemaining: memberData.minutesRemaining || 0,
                forcePasswordChange: !!memberData.forcePasswordChange
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
        const db = getDB();
        const memberRef = doc(db, 'customers', memberId);

        await updateDoc(memberRef, {
            password: newPassword,
            forcePasswordChange: false,
            updatedAt: serverTimestamp()
        });

        return { success: true };
    } catch (err) {
        logger.error(`Error updating member password: ${err.message}`);
        return { success: false, error: 'Failed to update password' };
    }
}

module.exports = { authenticateMember, updateMemberPassword };
