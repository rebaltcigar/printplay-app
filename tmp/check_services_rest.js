const url = "https://euckwqeyfhtfzbmbdzqg.supabase.co/rest/v1/services?select=id,serviceName,category,active,adminOnly&limit=50";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Y2t3cWV5Zmh0ZnpibWJkenFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjEyMTUsImV4cCI6MjA4ODczNzIxNX0.weHwaO4QgRy0ZBY5pIQGkzcn4Q52Tr4HSCjwHvOt8Hs";

async function check() {
  try {
    const response = await fetch(url.replace('services', 'services'), {
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
    console.log(`Total services fetched: ${data.length}`);
    data.forEach(p => {
      console.log(`[${p.id}] ${p.serviceName} | Cat: ${p.category} | Active: ${p.active} | Admin: ${p.adminOnly}`);
    });
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}
check();
