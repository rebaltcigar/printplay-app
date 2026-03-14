import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCategories() {
    const { data: categories, error } = await supabase
        .from('order_items')
        .select('financial_category')
        .order('financial_category');
    
    if (error) {
        console.error(error);
        return;
    }

    const counts = {};
    categories.forEach(c => {
        const cat = c.financial_category || 'NULL';
        counts[cat] = (counts[cat] || 0) + 1;
    });

    console.log('Financial Categories in order_items:');
    console.log(JSON.stringify(counts, null, 2));
}

checkCategories();
