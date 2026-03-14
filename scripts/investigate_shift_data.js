import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.development' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function investigateShift(displayId) {
    console.log(`Investigating Shift: ${displayId}`);
    
    const { data: shift, error: sError } = await supabase
        .from('shifts')
        .select('*')
        .eq('display_id', displayId)
        .single();
    
    if (sError) {
        console.error('Error fetching shift:', sError);
        return;
    }

    const shiftId = shift.id;

    const { data: orderItems } = await supabase.from('order_items').select('*').eq('shift_id', shiftId);
    const { data: pcTransactions } = await supabase.from('pc_transactions').select('*').eq('shift_id', shiftId);
    const { data: expenses } = await supabase.from('expenses').select('*').eq('shift_id', shiftId);

    let output = `Investigating Shift: ${displayId}\n`;
    output += `Shift ID: ${shiftId}\n`;
    output += `\n--- Shift Record ---\n${JSON.stringify(shift, null, 2)}\n`;

    output += `\n--- Order Items ---\n`;
    (orderItems || []).forEach(oi => {
        output += `- ${oi.name}: ₱${oi.amount} (${oi.payment_method}) [Cat: ${oi.financial_category}] ${oi.is_deleted ? '[DELETED]' : ''}\n`;
    });

    output += `\n--- PC Transactions ---\n`;
    (pcTransactions || []).forEach(pt => {
        output += `- ${pt.type}: ₱${pt.amount} (${pt.payment_method}) ${pt.is_deleted ? '[DELETED]' : ''}\n`;
    });

    output += `\n--- Expenses ---\n`;
    (expenses || []).forEach(e => {
        output += `- ${e.expense_type}: ₱${e.amount} ${e.is_deleted ? '[DELETED]' : ''}\n`;
    });

    const oiTotal = (orderItems || []).reduce((sum, oi) => sum + (oi.is_deleted ? 0 : Number(oi.amount)), 0);
    const pcTotal = (pcTransactions || []).reduce((sum, pt) => sum + (pt.is_deleted ? 0 : Number(pt.amount)), 0);
    const exTotal = (expenses || []).reduce((sum, e) => sum + (e.is_deleted ? 0 : Number(e.amount)), 0);

    const arPayments = (orderItems || []).filter(oi => !oi.is_deleted && oi.name === 'AR Payment').reduce((sum, oi) => sum + Number(oi.amount), 0);

    output += `\n--- Summary Analysis ---\n`;
    output += `Stored pc_rental_total: ₱${shift.pc_rental_total}\n`;
    output += `Sum of pc_transactions table total: ₱${pcTotal}\n`;
    output += `Sum of order_items (exc. AR Payment): ₱${oiTotal - arPayments}\n`;
    output += `Sum of AR Payments: ₱${arPayments}\n`;
    output += `Sum of expenses: ₱${exTotal}\n`;
    
    output += `\nCalculation: (OI exc AR) + (PC Stored) = ₱${(oiTotal - arPayments) + Number(shift.pc_rental_total)}\n`;
    output += `Calculation: (OI inc AR) + (PC Table) = ₱${oiTotal + pcTotal}\n`;

    fs.writeFileSync('investigation_log.txt', output);
    console.log('Results written to investigation_log.txt');
}

investigateShift('SHIFT-001021');
