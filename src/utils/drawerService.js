// src/utils/drawerService.js
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Triggers the cash drawer to open via the Web Serial API.
 * Logs the event to Firestore.
 * * @param {Object} user - The current firebase user object (for logging).
 * @param {string} triggerType - 'manual' or 'transaction'.
 * @returns {Promise<boolean>} - Returns true if successful, false otherwise.
 */
export const openDrawer = async (user, triggerType = 'manual') => {
  let port;
  let success = false;
  let errorMsg = '';

  try {
    // 1. CHECK BROWSER SUPPORT
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported in this browser.');
    }

    // 2. FIND OR REQUEST PORT
    // We check if the user has already granted permission to a device.
    const ports = await navigator.serial.getPorts();
    
    if (ports.length > 0) {
      // Use the first available port (usually the one previously selected)
      port = ports[0];
    } else {
      // If no port is authorized, prompt the user to select one.
      // They should select the device that appears as "COM3" or "USB Serial Device".
      port = await navigator.serial.requestPort();
    }

    // 3. OPEN CONNECTION
    // 9600 baud is standard for these triggers, but BT100U is often baud-agnostic.
    await port.open({ baudRate: 9600 });

    // 4. SEND TRIGGER SIGNAL
    // Writing any data triggers the BT100U. We send a single byte.
    const writer = port.writable.getWriter();
    await writer.write(new Uint8Array([0x01])); // Sending 0x01
    writer.releaseLock();

    // 5. CLOSE CONNECTION
    // We close it immediately so it doesn't block other tabs or refreshes.
    await port.close();
    
    success = true;
    console.log('Drawer triggered successfully.');

  } catch (err) {
    console.error('Drawer Error:', err);
    errorMsg = err.message;
    success = false;
    
    // User cancelled the port picker is a common "error" we can ignore logging if desired,
    // but logging it helps debug why it didn't open.
    if (err.name === 'NotFoundError') {
        errorMsg = 'User cancelled device selection or device disconnected.';
    }
  }

  // 6. LOG TO FIRESTORE
  // We log the attempt regardless of hardware success, to track usage and errors.
  try {
    await addDoc(collection(db, 'drawer_logs'), {
      timestamp: serverTimestamp(),
      staffEmail: user?.email || 'unknown',
      triggerType: triggerType, // 'manual' or 'transaction'
      success: success,
      errorMessage: errorMsg || null,
      device: 'BT100U'
    });
  } catch (logErr) {
    console.error('Failed to log drawer event:', logErr);
  }

  if (!success) {
    throw new Error(errorMsg || 'Failed to trigger drawer.');
  }

  return true;
};