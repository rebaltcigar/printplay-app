const url = "https://euckwqeyfhtfzbmbdzqg.supabase.co/rest/v1/products?select=id,name,category,financial_category,active,admin_only&limit=50";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Y2t3cWV5Zmh0ZnpibWJkenFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjEyMTUsImV4cCI6MjA4ODczNzIxNX0.weHwaO4QgRy0ZBY5pIQGkzcn4Q52Tr4HSCjwHvOt8Hs";

async function check() {
  try {
    const response = await fetch(url, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`
      }
    });
    if (!response.ok) {
       console.error("HTTP Error:", response.status, await response.text());
       return;
    }
    const data = await response.json();
    console.log(`Total products fetched: ${data.length}`);
    data.forEach(p => {
      console.log(`[${p.id}] ${p.name} | Cat: ${p.category} | FinCat: ${p.financial_category} | Active: ${p.active} | Admin: ${p.admin_only}`);
    });
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}
check();
