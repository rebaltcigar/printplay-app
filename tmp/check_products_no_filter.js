const url = "https://euckwqeyfhtfzbmbdzqg.supabase.co/rest/v1/products?select=*&limit=10";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Y2t3cWV5Zmh0ZnpibWJkenFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjEyMTUsImV4cCI6MjA4ODczNzIxNX0.weHwaO4QgRy0ZBY5pIQGkzcn4Q52Tr4HSCjwHvOt8Hs";

async function check() {
  try {
    const response = await fetch(url, { headers: { "apikey": key, "Authorization": `Bearer ${key}` } });
    const data = await response.json();
    console.log(`Total products (no filter): ${data.length}`);
    if (data.length > 0) {
      console.log("Sample:", data[0]);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
check();
