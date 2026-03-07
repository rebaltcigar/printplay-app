// src/utils/drawerService.js
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Triggers the cash drawer to open via the Web Serial API.
 * Matches the ESC/POS command used in PowerShell: ESC p 0 25 250
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
      // If auto-transaction, don't block with a popup prompt
      if (triggerType === 'transaction') {
         console.warn("No authorized device found for auto-trigger.");
         return false;
      }
      port = await navigator.serial.requestPort();
    }

    // 3. OPEN CONNECTION
    // Ensure we aren't trying to open an already open port
    if (!port.readable) {
        await port.open({ baudRate: 9600 });
    }

    // 4. SEND TRIGGER SIGNAL
    try {
        writer = port.writable.getWriter();
        
        // --- THE FIX: SEND THE EXACT SAME SIGNAL AS POWERSHELL ---
        // PowerShell: [char]27 + "p" + [char]0 + [char]25 + [char]250
        // Decimal:    27, 112, 0, 25, 250
        const signal = new Uint8Array([27, 112, 0, 25, 250]);
        
        await writer.write(signal); 
        
        // Wait 100ms to ensure the hardware processes the command
        await new Promise(resolve => setTimeout(resolve, 100));
        
        success = true;
        console.log('Drawer triggered successfully.');
    } finally {
        // CRITICAL: Always release the lock so the port can be closed
        if (writer) {
            writer.releaseLock();
        }
    }

  } catch (err) {
    console.error('Drawer Error:', err);
    errorMsg = err.message;
    success = false;

    if (err.name === 'NotFoundError') {
        errorMsg = 'Device selection cancelled or device disconnected.';
    }
    if (err.name === 'InvalidStateError') {
        errorMsg = 'Device is busy. Try unplugging it and plugging it back in.';
    }
  } finally {
    // 5. CLOSE CONNECTION
    // Always close the port so it's ready for the next click
    if (port && port.readable) {
        try {
            await port.close();
        } catch (closeErr) {
            console.error('Failed to close port:', closeErr);
        }
    }
  }

  // 6. LOG TO FIRESTORE
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
    // Ignore logging errors to keep the UI smooth
    console.warn('Logging failed:', logErr);
  }

  if (!success && triggerType !== 'transaction') {
    throw new Error(errorMsg || 'Failed to trigger drawer.');
  }

  return success;
};