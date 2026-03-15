import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_pos_catalog');
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Data Type:", typeof data);
  console.log("Is Array:", Array.isArray(data));
  if (Array.isArray(data)) {
    console.log("Array Length:", data.length);
    if (data.length > 0) {
      console.log("First Element Keys:", Object.keys(data[0]));
      console.log("data.products exists?", !!data.products);
      console.log("data[0].products exists?", !!data[0].products);
      if (data[0].products) {
        console.log("Products count in data[0]:", data[0].products.length);
      }
    }
  } else {
    console.log("Data Keys:", Object.keys(data));
  }
}
check();
