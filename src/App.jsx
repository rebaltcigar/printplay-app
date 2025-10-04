import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Typography } from '@mui/material';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#f44336',
    },
  },
});

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [activeShiftId, setActiveShiftId] = useState(null);
  const [activeShiftPeriod, setActiveShiftPeriod] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const role = userDocSnap.data().role;
          setUserRole(role);
          setCurrentUser(user);

          if (role === 'staff') {
            const statusRef = doc(db, "app_status", "current_shift");
            const statusSnap = await getDoc(statusRef);
            if (statusSnap.exists() && statusSnap.data().staffEmail === user.email) {
              const shiftId = statusSnap.data().activeShiftId;
              const shiftDocRef = doc(db, "shifts", shiftId);
              const shiftDocSnap = await getDoc(shiftDocRef);
              if(shiftDocSnap.exists()) {
                setActiveShiftId(shiftId);
                setActiveShiftPeriod(shiftDocSnap.data().shiftPeriod);
              }
            }
          }
        } else {
          signOut(auth);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setActiveShiftId(null);
        setActiveShiftPeriod('');
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleStaffLogin = async (email, password, shiftPeriod) => {
    const statusRef = doc(db, "app_status", "current_shift");
    const statusSnap = await getDoc(statusRef);
    const lockData = statusSnap.data();

    if (lockData && lockData.activeShiftId) {
      if (lockData.staffEmail === email) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          // Manually set state for immediate re-render
          const shiftDocRef = doc(db, "shifts", lockData.activeShiftId);
          const shiftDocSnap = await getDoc(shiftDocRef);
          setCurrentUser(userCredential.user);
          setUserRole('staff');
          setActiveShiftId(lockData.activeShiftId);
          if (shiftDocSnap.exists()) {
            setActiveShiftPeriod(shiftDocSnap.data().shiftPeriod);
          }
        } catch (error) {
          alert("Login failed: Incorrect password.");
        }
      } else {
        alert(`Login failed: Staff member ${lockData.staffEmail} already has an active shift.`);
      }
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists() && userDocSnap.data().role === 'staff') {
        const shiftData = { staffEmail: userCredential.user.email, shiftPeriod, startTime: new Date(), endTime: null };
        const shiftDocRef = await addDoc(collection(db, "shifts"), shiftData);
        await setDoc(statusRef, { activeShiftId: shiftDocRef.id, staffEmail: userCredential.user.email });
        
        // Manually set state for immediate re-render
        setCurrentUser(userCredential.user);
        setUserRole('staff');
        setActiveShiftId(shiftDocRef.id);
        setActiveShiftPeriod(shiftPeriod);
      } else {
        alert("Access Denied: This is not a valid staff account.");
        signOut(auth);
      }
    } catch (error) {
      alert(`Login Failed: ${error.message}`);
    }
  };

  const handleAdminLogin = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists() && userDocSnap.data().role === 'superadmin') {
        // Manually set state for immediate re-render
        setCurrentUser(userCredential.user);
        setUserRole('superadmin');
      } else {
        alert("Access Denied: Not a superadmin account.");
        signOut(auth);
      }
    } catch (error) {
      alert(`Admin Login Failed: ${error.message}`);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <Typography>Loading...</Typography>;
    }

    if (currentUser && userRole === 'superadmin') {
      return <AdminDashboard user={currentUser} />;
    }
    
    if (currentUser && userRole === 'staff' && activeShiftId) {
      return <Dashboard user={currentUser} activeShiftId={activeShiftId} shiftPeriod={activeShiftPeriod} />;
    }
    
    // Default to login if not loading and no valid session is found
    return <Login onLogin={handleStaffLogin} onAdminLogin={handleAdminLogin} />;
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {renderContent()}
      </Box>
    </ThemeProvider>
  );
}

export default App;