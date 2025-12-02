// src/utils/biometrics.js

// --- 1. UTILITY FUNCTIONS (Converts data for storage) ---
const bufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const base64ToBuffer = (base64) => {
  const binary = window.atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// --- 2. REGISTER FINGERPRINT (Used in UserManagement) ---
export const registerFingerprint = async (userEmail, userDisplayName) => {
  if (!window.PublicKeyCredential) {
    throw new Error("Biometrics not supported on this browser/device.");
  }

  // Create a random challenge buffer
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // WebAuthn Registration Options
  const publicKey = {
    challenge: challenge,
    rp: { name: "Print+Play POS" }, // The name shown in the Windows prompt
    user: {
      id: Uint8Array.from(userEmail, c => c.charCodeAt(0)), // Use email as unique ID bytes
      name: userEmail,
      displayName: userDisplayName,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },   // ES256 (Standard)
      { type: "public-key", alg: -257 }, // RS256 (Backup)
    ],
    timeout: 60000,
    authenticatorSelection: {
      // 'platform' tells browser to use Windows Hello (Face/Fingerprint)
      // rather than an external security key like a YubiKey.
      authenticatorAttachment: "platform", 
      userVerification: "required",
    },
  };

  try {
    const credential = await navigator.credentials.create({ publicKey });
    
    // We only need to store the ID to verify them later
    return {
      credentialId: bufferToBase64(credential.rawId),
      success: true
    };
  } catch (err) {
    console.error("Registration failed:", err);
    throw err;
  }
};

// --- 3. VERIFY FINGERPRINT (Used in Login/Dashboard) ---
export const verifyFingerprint = async (storedCredentialId) => {
  if (!storedCredentialId) throw new Error("No fingerprint registered for this user.");

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const publicKey = {
    challenge: challenge,
    allowCredentials: [{
      id: base64ToBuffer(storedCredentialId), // Convert stored string back to binary
      type: "public-key",
    }],
    userVerification: "required",
    timeout: 60000,
  };

  try {
    const assertion = await navigator.credentials.get({ publicKey });
    return !!assertion; // Returns true if Windows verified the fingerprint
  } catch (err) {
    console.error("Verification failed:", err);
    return false;
  }
};