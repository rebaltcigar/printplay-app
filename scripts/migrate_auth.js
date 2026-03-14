// scripts/migrate_auth.js
// CSV-based auth migration — no Firebase dependency.
// Reads exports/users.csv, creates Supabase Auth users + profiles rows.
// staff_id is auto-assigned by the trg_profile_staff_id trigger on insert.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// ---- CSV parser (handles quoted fields, "" escape, BOM) ----
function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    let i = 0;
    const n = text.length;
    let headers = null;
    const records = [];

    function readField() {
        if (i >= n) return '';
        if (text[i] === '"') {
            i++;
            let f = '';
            while (i < n) {
                if (text[i] === '"' && text[i + 1] === '"') { f += '"'; i += 2; }
                else if (text[i] === '"') { i++; break; }
                else f += text[i++];
            }
            return f;
        }
        let f = '';
        while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') f += text[i++];
        return f;
    }

    while (i < n) {
        const fields = [];
        while (i < n && text[i] !== '\r' && text[i] !== '\n') {
            fields.push(readField());
            if (i < n && text[i] === ',') i++;
            else break;
        }
        while (i < n && (text[i] === '\r' || text[i] === '\n')) i++;

        if (!fields.length || (fields.length === 1 && !fields[0])) continue;
        if (!headers) { headers = fields; }
        else {
            const obj = {};
            headers.forEach((h, j) => { obj[h] = fields[j] ?? ''; });
            records.push(obj);
        }
    }
    return records;
}

async function main() {
    const csvPath = path.join(root, 'exports', 'users.csv');
    const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
    console.log(`Found ${rows.length} users in users.csv\n`);

    for (const r of rows) {
        const email = r.email?.trim();
        if (!email) { console.log('Skip: no email'); continue; }

        // Assemble payroll_config from CSV fields
        const defaultRate = parseFloat(r['payroll.defaultRate']) || 0;
        let rateHistory = [];
        if (r['payroll.rateHistory']) {
            try {
                rateHistory = JSON.parse(r['payroll.rateHistory']).map(e => ({
                    rate: e.rate,
                    effectiveFrom: e.effectiveFrom?._seconds
                        ? new Date(e.effectiveFrom._seconds * 1000).toISOString()
                        : (e.effectiveFrom || null)
                }));
            } catch { /* malformed rateHistory — skip */ }
        }

        console.log(`Processing: ${email}`);

        // Create Supabase Auth user
        const tempPassword = 'Kunek$' + Math.random().toString(36).slice(-8);
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email,
            email_confirm: true,
            password: tempPassword,
            user_metadata: { full_name: r.fullName }
        });

        let uid = authData?.user?.id;

        if (authErr) {
            if (authErr.message.match(/already|registered/i)) {
                const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
                uid = list?.users?.find(u => u.email === email)?.id;
                console.log(`  Already exists — uid: ${uid}`);
            } else {
                console.error(`  ❌ Auth error: ${authErr.message}`);
                continue;
            }
        }

        if (!uid) { console.error(`  ❌ Could not resolve UID for ${email}`); continue; }

        // Upsert profile
        // Note: staff_id is auto-assigned by trg_profile_staff_id trigger on insert.
        const role = ['superadmin', 'admin', 'owner', 'staff'].includes(r.role?.toLowerCase())
            ? r.role.toLowerCase() : 'staff';

        const { error: pErr } = await supabase.from('profiles').upsert({
            id: uid,
            email,
            full_name: r.fullName || email.split('@')[0],
            role,
            suspended: r.suspended === 'true',
            payroll_config: { defaultRate, rateHistory },
            requires_password_reset: true,
        });

        if (pErr) console.error(`  ❌ Profile error: ${pErr.message}`);
        else console.log(`  ✅ [${role}]  payroll_config: rate=${defaultRate}, history=${rateHistory.length} entries`);
    }

    console.log('\n✅ Auth migration complete!');
    console.log('\nVerify: check Supabase Auth dashboard — should show', rows.length, 'users.');
    console.log('Next:   node scripts/import-from-csv.mjs');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
