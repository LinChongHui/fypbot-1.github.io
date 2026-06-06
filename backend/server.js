const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // npm install uuid

const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const DATA_PATH = path.join(__dirname, '../ai-engine/psm_output/report.json');

app.use(cors());
app.use(express.json());

const REPORT_PATH = path.join(__dirname, '../ai-engine/psm_output/report.json');

// API to send data to React AdminView
app.get('/api/admin/data', (req, res) => {
  fs.readFile(REPORT_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: "File not found" });
    res.json(JSON.parse(data));
  });
});

// API to receive corrected data from React and save to file
app.post('/api/admin/save', (req, res) => {
  const updatedData = JSON.stringify(req.body, null, 4);
  fs.writeFile(REPORT_PATH, updatedData, 'utf8', (err) => {
    if (err) return res.status(500).json({ error: "Failed to write" });
    res.json({ message: "Success" });
  });
});
// ✅ Cache
const cache = new Map();
const MAX_CACHE_SIZE = 100;

// ✅ Store async jobs
const jobs = new Map();

// ✅ Axios
const api = axios.create({
    baseURL: 'http://127.0.0.1:8000',
    timeout: 30000 // allow longer processing in background
});

// ✅ Retry
const fetchWithRetry = async (fn, retries = 2) => {
    try {
        return await fn();
    } catch (err) {
        if (retries === 0) throw err;
        console.log("🔁 Retrying Python API...");
        return fetchWithRetry(fn, retries - 1);
    }
};

// Get Data for Admin
app.get('/api/admin/data', (req, res) => {
    fs.readFile(DATA_PATH, 'utf8', (err, data) => {
        if (err) return res.status(500).send("Error reading file");
        res.json(JSON.parse(data));
    });
});

// Save Data from Admin
app.post('/api/admin/save', (req, res) => {
    const updatedData = JSON.stringify(req.body, null, 4);
    fs.writeFile(DATA_PATH, updatedData, 'utf8', (err) => {
        if (err) return res.status(500).send("Error saving file");
        res.send("Data updated successfully");
    });
});

app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.message;

    console.log("\n==============================");
    console.log("📩 FROM REACT:", userMessage);

    // 1. Check Cache
    if (cache.has(userMessage)) {
        console.log("⚡ CACHE HIT");
        return res.json({ reply: cache.get(userMessage) });
    }

    try {
        console.log("🐢 Calling Python AI (Ollama)...");
        
        // 2. WAIT for the Python response
        const pythonResponse = await fetchWithRetry(() =>
            api.post('/predict', { message: userMessage })
        );

        const reply = pythonResponse.data.reply;
        console.log("🐍 FROM PYTHON:", reply);

        // 3. Save to Cache
        if (cache.size >= MAX_CACHE_SIZE) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        cache.set(userMessage, reply);

        // 4. Return the ACTUAL reply to React
        res.json({ reply: reply });

    } catch (error) {
        console.error("❌ ERROR:", error.message);
        res.status(500).json({ reply: "The AI server is currently busy or offline." });
    }
});


// ✅ NEW: Check result endpoint
app.get('/api/result/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);

    if (!job) {
        return res.status(404).json({ error: "Job not found" });
    }

    res.json(job);
});


app.listen(5000, () => console.log('🚀 Node server running on port 5000'));