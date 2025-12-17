// src/utils/drawerService.js
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Triggers the cash drawer to open via the Web Serial API.
 * Logs the event to Firestore.
 * @param {Object} user - The current firebase user object (for logging).
 * @param {string} triggerType - 'manual', 'transaction', or 'biometric'.
 * @returns {Promise<boolean>} - Returns true if successful, false otherwise.
 */
export const openDrawer = async (user, triggerType = 'manual') => {
  let port;
  let writer;
  let success = false;
  let errorMsg = '';

  try {
    // 1. CHECK BROWSER SUPPORT
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported in this browser.');
    }

    // 2. FIND OR REQUEST PORT
    const ports = await navigator.serial.getPorts();
    
    if (ports.length > 0) {
      port = ports[0];
    } else {
      // If triggered by a transaction (automatic), we can't pop up a request window 
      // because browsers block hardware requests that aren't user-initiated.
      if (triggerType === 'transaction') {
         console.warn("No authorized device found for auto-trigger.");
         return false;
      }
      port = await navigator.serial.requestPort();
    }

    // 3. OPEN CONNECTION
    // Ensure we aren't trying to open an already open port (rare, but good safety)
    if (!port.readable) {
        await port.open({ baudRate: 9600 });
    }

    // 4. SEND TRIGGER SIGNAL
    // Use a nested try-finally for the writer to ensure the lock is ALWAYS released
    try {
        writer = port.writable.getWriter();
        
        // Send the signal
        await writer.write(new Uint8Array([0x01])); 
        
        // OPTIONAL: Wait 100ms to ensure the hardware registers the pulse before closing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        success = true;
        console.log('Drawer triggered successfully.');
    } finally {
        // CRITICAL: Always release the lock, even if writing failed
        if (writer) {
            writer.releaseLock();
        }
    }

  } catch (err) {
    console.error('Drawer Error:', err);
    errorMsg = err.message;
    success = false;

    if (err.name === 'NotFoundError') {
        errorMsg = 'User cancelled device selection or device disconnected.';
    }
    // Handle the specific "Port already open" error gracefully
    if (err.name === 'InvalidStateError') {
        errorMsg = 'Device is busy or already open. Try again.';
    }
  } finally {
    // 5. CLOSE CONNECTION
    // CRITICAL: Attempt to close the port in the outer finally block
    // to ensure we don't leave it locked for the next time.
    if (port && port.readable) {
        try {
            await port.close();
        } catch (closeErr) {
            console.error('Failed to close port:', closeErr);
        }
    }
  }

  // 6. LOG TO FIRESTORE
  // Log strictly for manual/biometric attempts or failed transactions
  // to avoid cluttering logs if transactions are frequent.
  try {
    await addDoc(collection(db, 'drawer_logs'), {
      timestamp: serverTimestamp(),
      staffEmail: user?.email || 'unknown',
      triggerType: triggerType,
      success: success,
      errorMessage: errorMsg || null,
      device: 'BT100U'
    });
  } catch (logErr) {
    console.error('Failed to log drawer event:', logErr);
  }

  if (!success && triggerType !== 'transaction') {
    // Only throw UI errors for manual triggers. 
    // For transactions, we want the sale to complete even if the drawer fails.
    throw new Error(errorMsg || 'Failed to trigger drawer.');
  }

  return success;
};