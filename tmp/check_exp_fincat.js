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
  
  if (res.expense_types) {
    console.log(`Found ${res.expense_types.length} expense_types.`);
    const finCats = new Set();
    res.expense_types.forEach(e => {
        finCats.add(e.financial_category);
        console.log(`Item: ${e.name} | FinCat: ${e.financial_category}`);
    });
    console.log("Distinct Financial Categories in expense_types:", [...finCats]);
  } else {
    console.log("expense_types is MISSING.");
  }
}
check();
