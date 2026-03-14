const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.development' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkShifts() {
    console.log('Checking shifts table...');
    const { data: shifts, error } = await supabase
        .from('shifts')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching shifts:', error);
        return;
    }

    console.log(`Found ${shifts.length} recent shifts:`);
    shifts.forEach(s => {
        console.log(`ID: ${s.display_id || s.id}, Start: ${s.start_time}, Staff: ${s.staff_id}, Period: ${s.shift_period}`);
    });

    const { data: countData, error: countError } = await supabase
        .from('shifts')
        .select('*', { count: 'exact', head: true });
    
    if (countError) {
        console.error('Error counting shifts:', countError);
    } else {
        console.log(`Total shifts in DB: ${countData.count}`);
    }
}

checkShifts();
