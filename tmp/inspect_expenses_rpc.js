import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_pos_catalog');
  if (error) { console.error(error); return; }
  const res = Array.isArray(data) ? data[0] : data;
  
  console.log("Keys in RPC response:", Object.keys(res));
  if (res.expense_types) {
    console.log(`Found ${res.expense_types.length} expense_types:`);
    res.expense_types.forEach(e => {
        console.log(`- [${e.id}] ${e.name} | Cat: ${e.category} | FinCat: ${e.financial_category} | Parent: ${e.parent_service_id}`);
    });
  } else {
    console.log("expense_types is MISSING from RPC response.");
  }
}
check();
