const allServices = [
  { id: '1', name: 'Service A', financial_category: 'Service', parent_service_id: null },
  { id: '2', name: 'Retail B', financial_category: 'Retail', parent_service_id: null },
  { id: '3', name: 'Electricity', financial_category: 'Expense', parent_service_id: '100' },
  { id: '4', name: 'Water', financial_category: 'Expense', parent_service_id: '100' }
];

// simulate mapRow
const allServicesWithAliases = allServices.map(d => ({
  ...d,
  serviceName: d.name,
  financialCategory: d.financial_category,
  parentServiceId: d.parent_service_id
}));

const expenseParentId = null; // simulate missing "Expenses" item

// My new filter logic:
const serviceList = allServicesWithAliases.filter(
    (i) =>
        i.active !== false &&
        i.financialCategory !== 'Expense' &&
        (expenseParentId ? (i.id !== expenseParentId && i.parent_service_id !== expenseParentId) : true)
);

const expenseTypes = allServicesWithAliases.filter(
    (i) => {
        const isExpense = expenseParentId 
            ? i.parentServiceId === expenseParentId 
            : (i.financialCategory === 'Expense' && i.serviceName !== 'Expenses');
        return isExpense && i.active !== false;
    }
);

console.log("Service List (Regular Items):");
serviceList.forEach(i => console.log(`- ${i.serviceName}`));

console.log("\nExpense Types:");
expenseTypes.forEach(i => console.log(`- ${i.serviceName}`));

if (serviceList.length === 2 && expenseTypes.length === 2) {
  console.log("\n✅ SUCCESS: Logic correctly separates items even with null expenseParentId.");
} else {
  console.log("\n❌ FAILURE: Logic still incorrect.");
}
