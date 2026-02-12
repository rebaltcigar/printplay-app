
import { db } from "./src/firebase.js"; // Adjust path if needed
import { collection, getDocs, limit, query } from "firebase/firestore";

async function inspectShift() {
    try {
        const q = query(collection(db, "shifts"), limit(5));
        const snap = await getDocs(q);

        console.log("--- Shift Document Inspection ---");
        snap.forEach((doc) => {
            const data = doc.data();
            console.log(`Document ID: ${doc.id}`);
            console.log("Keys found:", Object.keys(data));
            if (data.displayId) console.log(`Found 'displayId': ${data.displayId}`);
            if (data.displayID) console.log(`Found 'displayID': ${data.displayID}`);
            if (data.DisplayId) console.log(`Found 'DisplayId': ${data.DisplayId}`);
            console.log("--------------------------------");
        });
    } catch (e) {
        console.error("Error inspecting shifts:", e);
    }
}

inspectShift();
