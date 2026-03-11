import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.development', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log(`Total products: ${data.length}`);
  const categories = new Set();
  const finCategories = new Set();
  data.forEach(d => {
    categories.add(d.category);
    finCategories.add(d.financial_category);
  });
  console.log('Categories found:', Array.from(categories));
  console.log('Financial categories found:', Array.from(finCategories));
}
check();
