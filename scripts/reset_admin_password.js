import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey || !supabaseUrl) {
    console.error(`❌ VITE_SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL is missing from ${envFile}`);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEMP_PASSWORD = 'password123';

async function resetAdminPasswords() {
    console.log(`🔐 Resetting admin passwords on ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} Supabase...`);
    console.log(`   Target: ${supabaseUrl}`);

    // Fetch all admin/owner/superadmin profiles
    const { data: adminProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role, full_name')
        .in('role', ['admin', 'owner', 'superadmin']);

    if (profileError) {
        console.error('❌ Failed to fetch admin profiles:', profileError.message);
        process.exit(1);
    }

    if (!adminProfiles || adminProfiles.length === 0) {
        console.log('⚠️  No admin profiles found.');
        process.exit(0);
    }

    console.log(`\nFound ${adminProfiles.length} admin account(s):\n`);

    for (const profile of adminProfiles) {
        console.log(`👤 ${profile.full_name || 'Unknown'} <${profile.email}> [${profile.role}]`);

        // Reset auth password
        const { error: pwError } = await supabase.auth.admin.updateUserById(profile.id, {
            password: TEMP_PASSWORD
        });

        if (pwError) {
            console.error(`   ❌ Failed to reset password: ${pwError.message}`);
            continue;
        }

        // Set requires_password_reset flag
        const { error: flagError } = await supabase
            .from('profiles')
            .update({ requires_password_reset: true })
            .eq('id', profile.id);

        if (flagError) {
            console.warn(`   ⚠️  Password reset but could not set requires_password_reset flag: ${flagError.message}`);
        } else {
            console.log(`   ✅ Password set to "${TEMP_PASSWORD}" — must change on next login`);
        }
    }

    console.log('\n✨ Done. Log in with password123 and change your password immediately.');
}

resetAdminPasswords();
