import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Triggers the cash drawer via the local Node.js backend using a COM Port.
 */
export const openDrawer = async (user, triggerType = 'manual') => {
  let success = false;
  let errorMsg = '';
  
  // 1. Get the configured port
  const portName = localStorage.getItem('drawer_com_port');

  if (!portName) {
      console.warn("No COM port configured. Skipping drawer trigger.");
      if (triggerType === 'manual') {
          alert("Please configure the Cash Drawer COM Port in Settings first.");
      }
      return false;
  }

  try {
    // 2. Send signal to backend
    const response = await fetch('http://localhost:5000/open-drawer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ portName })
    });

    if (response.ok) {
        success = true;
        console.log(`Drawer triggered on ${portName}`);
    } else {
        const data = await response.json();
        throw new Error(data.error || 'Server returned an error.');
    }

  } catch (err) {
    console.error('Drawer Error:', err);
    errorMsg = err.message;
    success = false;

    if (err.message.includes('Failed to fetch')) {
        errorMsg = 'Backend Service is not running on Port 5000.';
    }
  }

  // 3. Log to Firebase
  try {
    await addDoc(collection(db, 'drawer_logs'), {
      timestamp: serverTimestamp(),
      staffEmail: user?.email || 'unknown',
      triggerType: triggerType, 
      success: success,
      errorMessage: errorMsg || null,
      device: portName
    });
  } catch (logErr) {
    console.error('Failed to log drawer event:', logErr);
  }

  // Alert user if manual trigger failed
  if (!success && triggerType !== 'transaction') {
    throw new Error(errorMsg || 'Failed to trigger drawer.');
  }

  return success;
};