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
  if (!res || !res.products) { console.log("No products found in RPC"); return; }

  console.log(`Checking ${res.products.length} products:`);
  res.products.forEach(p => {
    console.log(`- [${p.id}] ${p.name} | Cat: ${p.category} | FinCat: ${p.financial_category} | Active: ${p.active} | AdminOnly: ${p.admin_only}`);
  });
}
check();
