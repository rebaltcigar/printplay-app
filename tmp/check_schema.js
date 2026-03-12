
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
    for (const table of ['order_items', 'pc_transactions', 'expenses', 'orders']) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.error(`Error fetching ${table}:`, error.message);
        } else {
            console.log(`Columns in ${table} table:`, Object.keys(data[0] || {}));
        }
    }
}

checkSchema();
