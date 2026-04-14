const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

// CONFIGURATIE 
// Voeg hier je YouTube API Key toe (v3)
// https://console.cloud.google.com/apis/library/youtube.googleapis.com
const YOUTUBE_API_KEY = 'AIzaSyB_TjKdDf1ibb36DvVpk4X0_ddFfrBKOZU';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// YOUTUBE SEARCH API PROXY

app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Geen zoekterm opgegeven' });

        if (!YOUTUBE_API_KEY) {
            console.warn('[YouTube] Geen API-key geconfigureerd.');
            return res.status(500).json({ error: 'YouTube API Key ontbreekt in server.js' });
        }

        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(q)}&type=video&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error('[YouTube] API Fout:', data.error);
            return res.status(data.error.code || 500).json(data.error);
        }

        // Simpel formaat terugsturen
        const results = data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.default.url
        }));

        res.json(results);
    } catch (err) {
        console.error('Search failed:', err);
        res.status(500).json({ error: 'Zoeken mislukt' });
    }
});


// YOUTUBE POPULAR API (voor Home Grid)

app.get('/api/popular', async (req, res) => {
    try {
        if (!YOUTUBE_API_KEY) {
            return res.status(500).json({ error: 'YouTube API Key ontbreekt' });
        }

        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxResults=12&regionCode=NL&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return res.status(data.error.code || 500).json(data.error);
        }

        const results = data.items.map(item => ({
            id: item.id,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.medium.url
        }));

        res.json(results);
    } catch (err) {
        console.error('Popular failed:', err);
        res.status(500).json({ error: 'Laden van populaire video\'s mislukt' });
    }
});

// SOCKET.IO SIGNALING (Remote -> Screen)
io.on('connection', (socket) => {
    console.log('📱 Nieuwe client verbonden:', socket.id);

    // Wanneer de remote een commando stuurt
    socket.on('command', (data) => {
        console.log(`[Command] ${data.type}:`, data.value || '');
        // Stuur door naar alle andere clients (het scherm)
        socket.broadcast.emit('execute', data);
    });

    socket.on('disconnect', () => {
        console.log('👋 Client ontkoppeld');
    });
});

server.listen(PORT, () => {
    console.log(`\n🔴 YouTube Remote Controller draait op http://localhost:${PORT}`);
    console.log(`🖥️  Open http://localhost:${PORT}/screen.html op je PC`);
    console.log(`📱 Open http://localhost:${PORT} op je telefoon\n`);
});
