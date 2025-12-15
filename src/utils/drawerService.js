// src/utils/drawerService.js
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const DRAWER_PREF_KEY = 'printplay_drawer_pref';

/**
 * Triggers the cash drawer to open via the Web Serial API.
 * Uses a saved "fingerprint" (VendorID + ProductID) to find the correct device,
 * ignoring other serial devices like printers.
 * * @param {Object} user - The current firebase user object (for logging).
 * @param {string} triggerType - 'manual', 'transaction', 'biometric', or 'setup'.
 * @param {boolean} forceConfig - If true, ignores saved preference and forces a new device selection (User Gesture Required).
 * @returns {Promise<boolean>} - Returns true if successful.
 */
export const openDrawer = async (user, triggerType = 'manual', forceConfig = false) => {
  let port;
  let success = false;
  let errorMsg = '';

  try {
    // 1. CHECK BROWSER SUPPORT
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported in this browser.');
    }

    // 2. GET ALL AUTHORIZED PORTS
    const ports = await navigator.serial.getPorts();
    
    // 3. RETRIEVE SAVED FINGERPRINT
    const savedPref = localStorage.getItem(DRAWER_PREF_KEY);
    
    // 4. SMART SEARCH (If we have a preference and aren't forcing a reset)
    if (!forceConfig && savedPref) {
      try {
        const { vendorId, productId } = JSON.parse(savedPref);
        
        // Find the specific device that matches our saved hardware ID
        port = ports.find(p => {
          const info = p.getInfo();
          return info.usbVendorId === vendorId && info.usbProductId === productId;
        });
        
        if (!port) {
          console.warn('Saved drawer device not found among connected ports.');
        }
      } catch (e) {
        console.warn('Invalid drawer preference found. Requiring re-selection.');
      }
    }

    // 5. IF NO PORT FOUND (OR FORCED RESET), REQUEST ONE
    if (!port) {
      // CRITICAL: 'transaction' triggers happen automatically and CANNOT show a popup.
      // We must fail gracefully if the drawer hasn't been set up yet.
      if (triggerType === 'transaction') {
        throw new Error('Drawer not configured. Please use "Configure Drawer" in the menu once to set it up.');
      }

      // For 'manual', 'biometric', or 'setup', we can show the popup.
      port = await navigator.serial.requestPort();
      
      // SAVE THE NEW FINGERPRINT
      const info = port.getInfo();
      if (info.usbVendorId && info.usbProductId) {
        localStorage.setItem(DRAWER_PREF_KEY, JSON.stringify({
          vendorId: info.usbVendorId,
          productId: info.usbProductId
        }));
      }
    }

    // 6. OPEN CONNECTION
    // 9600 baud is standard for the BT100U trigger.
    await port.open({ baudRate: 9600 });

    // 7. SEND TRIGGER SIGNAL (0x01)
    const writer = port.writable.getWriter();
    await writer.write(new Uint8Array([0x01]));
    writer.releaseLock();

    // 8. CLOSE CONNECTION (Immediately, so we don't lock the port)
    await port.close();
    
    success = true;
    console.log('Drawer triggered successfully.');

  } catch (err) {
    console.error('Drawer Error:', err);
    errorMsg = err.message;
    success = false;
    
    // Ignore "User cancelled" errors to keep logs clean
    if (err.name === 'NotFoundError') {
        errorMsg = 'Device selection cancelled or device disconnected.';
    }
  }

  // 9. LOG TO FIRESTORE
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

  // Rethrow error for manual triggers so the UI can show an alert
  if (!success && triggerType !== 'transaction') {
    throw new Error(errorMsg || 'Failed to trigger drawer.');
  }

  return success;
};