const url = "https://euckwqeyfhtfzbmbdzqg.supabase.co/rest/v1/";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Y2t3cWV5Zmh0ZnpibWJkenFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjEyMTUsImV4cCI6MjA4ODczNzIxNX0.weHwaO4QgRy0ZBY5pIQGkzcn4Q52Tr4HSCjwHvOt8Hs";

async function check() {
  try {
    // Calling an empty path with GET usually returns the PostgREST OpenAPI spec or similar depending on config
    // But we can also just try to fetch the schema information if available via rpc or just try common names
    console.log("Checking common table names...");
    const tables = ["products", "services", "items", "catalog", "pos_items", "pos_catalog"];
    for (const table of tables) {
       const res = await fetch(`${url}${table}?select=count`, { headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Prefer": "count=exact" } });
       if (res.ok) {
         const count = res.headers.get("content-range");
         console.log(`Table '${table}' exists. Count: ${count}`);
       } else {
         console.log(`Table '${table}' does not exist or error: ${res.status}`);
       }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
check();
