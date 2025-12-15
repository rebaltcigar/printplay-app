// src/utils/drawerService.js
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Triggers the cash drawer via the local Python background service.
 * * Logic:
 * 1. Web App sends POST request to http://localhost:5000/open-drawer
 * 2. Python Script (running in background) receives it.
 * 3. Python Script sends the raw kick code to the Default Printer (Fake Printer).
 */
export const openDrawer = async (user, triggerType = 'manual') => {
  let success = false;
  let errorMsg = '';

  try {
    // Send signal to the local Python script running on port 5000
    const response = await fetch('http://localhost:5000/open-drawer', {
        method: 'POST',
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (response.ok) {
        success = true;
        console.log('Drawer triggered successfully via Local Service.');
    } else {
        throw new Error('Local Service reached, but it returned an error.');
    }

  } catch (err) {
    console.error('Drawer Error:', err);
    errorMsg = err.message;
    success = false;

    // Provide a helpful error message if the background script is down
    if (err.message.includes('Failed to fetch')) {
        errorMsg = 'Drawer Service is not running. Please start the background script (drawer.py).';
    }
  }

  // Log the attempt to Firebase (Audit Trail)
  try {
    await addDoc(collection(db, 'drawer_logs'), {
      timestamp: serverTimestamp(),
      staffEmail: user?.email || 'unknown',
      triggerType: triggerType, 
      success: success,
      errorMessage: errorMsg || null,
      device: 'Local_Python_Proxy'
    });
  } catch (logErr) {
    console.error('Failed to log drawer event:', logErr);
  }

  // If manual trigger failed, throw error to alert the user
  if (!success && triggerType !== 'transaction') {
    throw new Error(errorMsg || 'Failed to trigger drawer.');
  }

  return success;
};