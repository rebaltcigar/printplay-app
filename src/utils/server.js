const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// --- ROUTES ---

// 1. Get List of Available COM Ports
app.get('/ports', async (req, res) => {
    try {
        const ports = await SerialPort.list();
        res.json(ports);
    } catch (err) {
        console.error('Error listing ports:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Open Drawer via COM Port
app.post('/open-drawer', (req, res) => {
    const { portName } = req.body;

    if (!portName) {
        return res.status(400).json({ error: "COM Port not configured in settings." });
    }

    try {
        const port = new SerialPort({
            path: portName,
            baudRate: 9600, // Standard for most drawers
            autoOpen: false 
        });

        port.open((err) => {
            if (err) {
                console.error(`Error opening ${portName}:`, err.message);
                return res.status(500).json({ error: `Failed to open ${portName}. Is it in use?` });
            }

            // Send trigger signal (Hex 07 / Bell)
            port.write('\x07', (err) => {
                if (err) {
                    console.error('Error writing to port:', err.message);
                    port.close();
                    return res.status(500).json({ error: 'Failed to write signal' });
                }

                // Close port shortly after to finish the pulse
                setTimeout(() => {
                    port.close();
                    res.json({ success: true, message: 'Drawer Triggered' });
                }, 100);
            });
        });

    } catch (error) {
        console.error('Server Exception:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});