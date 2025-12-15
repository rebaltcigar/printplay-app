// src/utils/drawerService.js
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const DRAWER_PREF_KEY = 'printplay_drawer_pref';

/**
 * Triggers the cash drawer via Web Serial.
 * UPDATED: Sends the Universal ESC/POS "Kick Drawer" command.
 * * Why this works for your setup:
 * 1. If it's a raw BT100U, it opens on ANY data received.
 * 2. If it's set up as a "Printer" (or is a real printer), it looks for this specific command.
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
    
    // 3. RETRIEVE SAVED FINGERPRINT (Identity Check)
    const savedPref = localStorage.getItem(DRAWER_PREF_KEY);
    
    // 4. SMART SEARCH
    if (!forceConfig && savedPref) {
      try {
        const { vendorId, productId } = JSON.parse(savedPref);
        port = ports.find(p => {
          const info = p.getInfo();
          return info.usbVendorId === vendorId && info.usbProductId === productId;
        });
      } catch (e) {
        console.warn('Invalid drawer preference, requiring re-selection.');
      }
    }

    // 5. DEVICE SELECTION (If not found or forced reset)
    if (!port) {
      if (triggerType === 'transaction') {
        throw new Error('Drawer not configured. Please click "Configure Drawer" in the menu.');
      }
      
      // User selects the device (COM3 / BT100U)
      port = await navigator.serial.requestPort();
      
      const info = port.getInfo();
      if (info.usbVendorId && info.usbProductId) {
        localStorage.setItem(DRAWER_PREF_KEY, JSON.stringify({
          vendorId: info.usbVendorId,
          productId: info.usbProductId
        }));
      }
    }

    // 6. OPEN CONNECTION
    // 9600 baud is the standard for both BT100U and most Receipt Printers
    await port.open({ baudRate: 9600 });

    // 7. SEND UNIVERSAL TRIGGER SIGNAL
    const writer = port.writable.getWriter();
    
    // Command: ESC p m t1 t2
    // Hex: 1B 70 00 19 FA
    // This tells a printer: "Send pulse to Pin 2 (Drawer) for 50ms"
    const kickCommand = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    
    await writer.write(kickCommand);
    writer.releaseLock();

    // 8. CLOSE CONNECTION
    await port.close();
    
    success = true;
    console.log('Drawer triggered successfully.');

  } catch (err) {
    console.error('Drawer Error:', err);
    errorMsg = err.message;
    success = false;
    
    if (err.name === 'NotFoundError') {
        errorMsg = 'Device selection cancelled.';
    } else if (err.name === 'NetworkError') {
        errorMsg = 'Port is busy. Ensure no other "Printer Software" has locked COM3.';
    }
  }

  // 9. LOGGING
  try {
    await addDoc(collection(db, 'drawer_logs'), {
      timestamp: serverTimestamp(),
      staffEmail: user?.email || 'unknown',
      triggerType: triggerType, 
      success: success,
      errorMessage: errorMsg || null,
      device: 'Universal_Trigger'
    });
  } catch (logErr) {
    console.error('Failed to log drawer event:', logErr);
  }

  if (!success && triggerType !== 'transaction') {
    throw new Error(errorMsg || 'Failed to trigger drawer.');
  }

  return success;
};