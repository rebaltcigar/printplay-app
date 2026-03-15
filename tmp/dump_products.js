import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.development' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.development');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function dump() {
  try {
    const { data, error } = await supabase.from('products').select('*').limit(20);
    if (error) {
      console.error('Error fetching products:', error);
      return;
    }
    console.log(`Successfully fetched ${data.length} products:`);
    data.forEach(p => {
      console.log(`[${p.id}] "${p.name}" | Category: ${p.category} | FinCat: ${p.financial_category} | Active: ${p.active} | Admin: ${p.admin_only} | Parent: ${p.parent_service_id}`);
    });
  } catch (err) {
    console.error('Exception:', err);
  }
}
dump();
