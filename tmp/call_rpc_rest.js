const url = "https://euckwqeyfhtfzbmbdzqg.supabase.co/rest/v1/rpc/get_pos_catalog";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Y2t3cWV5Zmh0ZnpibWJkenFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjEyMTUsImV4cCI6MjA4ODczNzIxNX0.weHwaO4QgRy0ZBY5pIQGkzcn4Q52Tr4HSCjwHvOt8Hs";

async function check() {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
       console.error("HTTP Error:", response.status, await response.text());
       return;
    }
    const data = await response.json();
    console.log("RPC Data:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}
check();
