import { supabase } from './src/supabase.js';

async function test() {
  try {
    const { data, error } = await supabase.from('payroll_runs').select('id, display_id').limit(5);
    if (error) {
      console.error('Error:', error);
      return;
    }
    console.log('Recent Payroll Runs:', data);
  } catch (e) {
    console.error('Catch:', e);
  }
}

test();
