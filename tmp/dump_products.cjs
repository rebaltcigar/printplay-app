const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.development', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function dump() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log(`Total products: ${data.length}`);
  data.forEach(p => {
    console.log(`[${p.id}] Name: ${p.name}, Cat: ${p.category}, FinCat: ${p.financial_category}, Active: ${p.active}, Admin: ${p.admin_only}, Parent: ${p.parent_service_id}`);
  });
}
dump();
