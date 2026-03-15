const allServices = [
  { id: '1', name: 'Service A', financial_category: 'Service' }, // tagged as products/variants later
  { id: '2', name: 'Retail B', financial_category: 'Retail' },   // tagged as products/variants later
  { id: '3', name: 'Electricity', financial_category: 'Expense', _isExpense: true },
  { id: '4', name: 'Water', financial_category: 'Expense', _isExpense: true }
];

// simulate mapRow
const allServicesWithAliases = allServices.map(d => ({
  ...d,
  serviceName: d.name,
  financialCategory: d.financial_category,
  _isExpense: d._isExpense
}));

const expenseParentId = null; // simulate missing "Expenses" item

// My updated filter logic in usePOSServices:
const serviceList = allServicesWithAliases.filter(
    (i) =>
        i.active !== false &&
        i.financialCategory !== 'Expense' &&
        !i._isExpense &&
        (expenseParentId ? (i.id !== expenseParentId && i.parentServiceId !== expenseParentId) : true)
);

const expenseTypes = allServicesWithAliases.filter(
    (i) => {
        const isExpense = i._isExpense || (expenseParentId && i.parentServiceId === expenseParentId);
        return isExpense && i.active !== false;
    }
);

console.log("Service List (Regular Items):");
serviceList.forEach(i => console.log(`- ${i.serviceName}`));

console.log("\nExpense Types:");
expenseTypes.forEach(i => console.log(`- ${i.serviceName}`));

if (serviceList.length === 2 && expenseTypes.length === 2) {
  console.log("\n✅ SUCCESS: Logic correctly separates products and expenses using the _isExpense tag.");
} else {
  console.log("\n❌ FAILURE: Logic still incorrect.");
}
