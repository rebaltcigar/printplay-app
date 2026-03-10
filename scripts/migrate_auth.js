import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '.env.production' : '.env.development';
const serviceAccountPath = isProd
    ? './firebase-service-account-prod.json'
    : './firebase-service-account-dev.json';

dotenv.config({ path: envFile });

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrateAuth() {
    try {
        console.log('🔄 Fetching users from Firebase Auth...');
        const listUsersResult = await admin.auth().listUsers(1000);
        let fbUsers = listUsersResult.users;

        console.log(`Found ${fbUsers.length} users in Firebase Auth.`);

        // 1. Fetch Firestore Roles and Pins
        const usersSnap = await db.collection('users').get();
        const firestoreUsers = {};
        usersSnap.docs.forEach(d => {
            firestoreUsers[d.id] = d.data();
        });

        // 2. Fetch legacy app_admins
        const adminSnap = await db.collection('app_admins').doc('admin_list').get();
        let appAdmins = [];
        if (adminSnap.exists) {
            appAdmins = adminSnap.data().emails || [];
        }

        for (const fbu of fbUsers) {
            console.log(`\n👨‍💼 Processing: ${fbu.email}`);

            // Generate a secure but temporary password holding
            const tempPassword = 'PrintPlay$' + Math.random().toString(36).slice(-8);

            // Create Supabase Auth User via Admin API
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: fbu.email,
                email_confirm: true,
                password: tempPassword,
                user_metadata: {
                    full_name: fbu.displayName || ''
                }
            });

            if (authError) {
                if (authError.message.includes('already registered')) {
                    console.log(`   🔸 User already exists in Auth, skipping auth creation.`);
                } else {
                    console.error(`   ❌ Failed to create auth user:`, authError.message);
                    continue;
                }
            }

            // If user already exists, we must fetch their UUID to link the Profile
            let supaUserId = authData?.user?.id;
            if (!supaUserId) {
                const { data: existingUser } = await supabase.auth.admin.listUsers();
                const matched = existingUser.users.find(u => u.email === fbu.email);
                if (matched) supaUserId = matched.id;
            }

            if (!supaUserId) {
                console.error(`   ❌ Could not resolve Supabase ID for ${fbu.email}`);
                continue;
            }

            // 3. Reconcile Role & Pin
            let fsUser = firestoreUsers[fbu.uid] || Object.values(firestoreUsers).find(u => u.email === fbu.email);

            let role = 'staff';
            if (appAdmins.includes(fbu.email)) {
                role = 'admin';
            }
            if (fsUser && fsUser.role) {
                if (fsUser.role.toLowerCase() === 'admin') role = 'admin';
                else if (fsUser.role.toLowerCase() === 'owner') role = 'owner';
                else if (fsUser.role.toLowerCase() === 'superadmin') role = 'superadmin';
            }

            const profileData = {
                id: supaUserId,
                email: fbu.email,
                full_name: fbu.displayName || (fsUser ? fsUser.displayName : 'Unknown Staff'),
                role: role,
                pin_code: fsUser ? fsUser.pinCode : null,
                requires_password_reset: true // Force them to set a real password via UI later
            };

            // 4. Upsert into public.profiles
            const { error: profileError } = await supabase.from('profiles').upsert(profileData);
            if (profileError) {
                console.error(`   ❌ Failed to insert profile map:`, profileError.message);
            } else {
                console.log(`   ✅ Success! Created as [${role}] with pin: [${profileData.pin_code || 'None'}]`);
            }
        }

        console.log('\n🚀 ALL USERS AND PROFILES MIGRATED!');
        process.exit(0);

    } catch (e) {
        console.error('💥 Crash:', e);
        process.exit(1);
    }
}

migrateAuth();
