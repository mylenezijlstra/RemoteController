const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cors = require('cors');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = 3000;
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
});

const DEFAULT_PRODUCT = 'Plex Remote Controller';
const DEFAULT_VERSION = '1.0.0';

// Plex headers genereren
function plexHeaders(token, clientId = 'unique-plex-remote-id') {
    const headers = {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': clientId,
        'X-Plex-Product': DEFAULT_PRODUCT,
        'X-Plex-Version': DEFAULT_VERSION,
        'X-Plex-Platform': 'Web',
        'X-Plex-Platform-Version': '1.0',
        'X-Plex-Device': 'Windows',
        'X-Plex-Device-Name': 'Plex Remote Controller',
        'X-Plex-Language': 'nl'
    };
    if (token) {
        headers['X-Plex-Token'] = token;
    }
    return headers;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// =============================================
// API HELPERS
// =============================================

function getClientId(req) {
    return req.headers['x-plex-client-identifier'] || req.query.clientId || 'unique-plex-remote-id';
}

// =============================================
// 1. PIN LOGIN
// =============================================

app.post('/api/auth/pin', async (req, res) => {
    try {
        const cId = getClientId(req);
        console.log(`[AUTH] PIN aanvraag voor ClientID: ${cId}`);
        
        const response = await fetch('https://plex.tv/api/v2/pins?strong=true', {
            method: 'POST',
            headers: plexHeaders(null, cId)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[AUTH] Plex API fout:', response.status, errorText);
            return res.status(response.status).json({ error: 'Fout bij Plex API' });
        }

        const data = await response.json();
        console.log(`[AUTH] PIN Ontvangen: ${data.code} (ID: ${data.id})`);
        res.json({ id: data.id, code: data.code });
    } catch (err) {
        console.error('[AUTH] PIN request failed:', err);
        res.status(500).json({ error: 'Kan geen PIN aanvragen' });
    }
});

app.get('/api/auth/pin/:id', async (req, res) => {
    try {
        const cId = getClientId(req);
        const response = await fetch(`https://plex.tv/api/v2/pins/${req.params.id}`, {
            headers: plexHeaders(null, cId)
        });
        const data = await response.json();
        res.json({ authToken: data.authToken || null });
    } catch (err) {
        console.error('PIN check failed:', err);
        res.status(500).json({ error: 'Kan PIN status niet ophalen' });
    }
});

// =============================================
// 2. RESOURCES (servers + clients)
// =============================================

app.get('/api/resources', async (req, res) => {
    try {
        const { token } = req.query;
        const cId = getClientId(req);
        const headers = plexHeaders(token, cId);
        
        console.log(`[Resources] Ophalen voor token: ${token ? token.substring(0, 5) + '...' : 'MISSING'} (CID: ${cId})`);
        
        // Poging 1: V2 JSON API (clients.plex.tv)
        let data = [];
        try {
            const responsev2 = await fetch('https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', {
                headers: headers
            });
            if (responsev2.ok) {
                const json = await responsev2.json();
                data = Array.isArray(json) ? json : [];
                console.log(`[Resources] V2 API gaf ${data.length} items terug.`);
            }
        } catch (e) {
            console.warn('[Resources] V2 API mislukt:', e.message);
        }

        // Poging 2: V1 API (vaak XML) als V2 leeg is
        if (data.length === 0) {
            console.log('[Resources] V2 leeg of mislukt, probeer V1...');
            const v1Url = `https://plex.tv/api/resources?includeHttps=1&includeRelay=1&X-Plex-Token=${token}`;
            const responsev1 = await fetch(v1Url, { 
                headers: {
                    ...headers,
                    'X-Plex-Token': token // Expliciet toevoegen voor de zekerheid
                }
            });
            
            if (responsev1.ok) {
                const contentType = responsev1.headers.get('content-type') || '';
                const text = await responsev1.text();

                if (contentType.includes('application/json')) {
                    const v1Data = JSON.parse(text);
                    data = (v1Data.MediaContainer && v1Data.MediaContainer.Device) ? v1Data.MediaContainer.Device : [];
                } else {
                    const jsonObj = parser.parse(text);
                    const mc = jsonObj.MediaContainer;
                    if (mc && mc.Device) {
                        data = Array.isArray(mc.Device) ? mc.Device : [mc.Device];
                        data = data.map(device => ({
                            ...device,
                            connections: Array.isArray(device.Connection) ? device.Connection : (device.Connection ? [device.Connection] : [])
                        }));
                    } else if (mc && mc.Server) {
                        data = Array.isArray(mc.Server) ? mc.Server : [mc.Server];
                        data = data.map(server => ({
                            ...server,
                            provides: 'server',
                            connections: Array.isArray(server.Connection) ? server.Connection : (server.Connection ? [server.Connection] : [])
                        }));
                    }
                }
            }
        }

        console.log(`[Resources] Totaal gevonden: ${data.length || 0}`);
        res.json(data);
    } catch (err) {
        console.error('[Resources] FATAL ERROR:', err);
        res.status(500).json({ error: 'Kan resources niet ophalen door serverfout.' });
    }
});

// =============================================
// 3. COMMANDS NAAR PLAYER
// =============================================

app.post('/api/command', async (req, res) => {
    try {
        const { serverUrl, token, clientId, type, command, params } = req.body;
        const cId = getClientId(req);
        
        let url = `${serverUrl}/player/${type}/${command}?X-Plex-Token=${token}&X-Plex-Target-Client-Identifier=${clientId}`;
        
        if (params && Object.keys(params).length > 0) {
            const qs = new URLSearchParams(params).toString();
            url += `&${qs}`;
        }

        console.log(`[Command] Sending ${type}/${command} to ${clientId} via ${serverUrl}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: plexHeaders(token, cId)
        });

        res.json({ ok: response.ok, status: response.status });
    } catch (err) {
        console.error('Command failed:', err);
        res.status(500).json({ error: 'Command mislukt' });
    }
});

// =============================================
// 4. SEARCH & SESSIONS
// =============================================

app.get('/api/search', async (req, res) => {
    try {
        const { serverUrl, token, query } = req.query;
        const cId = getClientId(req);
        const response = await fetch(`${serverUrl}/search?query=${encodeURIComponent(query)}&X-Plex-Token=${token}`, {
            headers: plexHeaders(token, cId)
        });
        const text = await response.text();
        const contentType = response.headers.get('content-type') || '';
        res.json(contentType.includes('json') ? JSON.parse(text) : parser.parse(text));
    } catch (err) {
        res.status(500).json({ error: 'Zoeken mislukt' });
    }
});

app.get('/api/sessions', async (req, res) => {
    try {
        const { serverUrl, token } = req.query;
        const cId = getClientId(req);
        const response = await fetch(`${serverUrl}/status/sessions?X-Plex-Token=${token}`, {
            headers: plexHeaders(token, cId)
        });
        const text = await response.text();
        const contentType = response.headers.get('content-type') || '';
        res.json(contentType.includes('json') ? JSON.parse(text) : parser.parse(text));
    } catch (err) {
        res.status(500).json({ error: 'Sessies mislukt' });
    }
});

app.listen(PORT, () => {
    console.log(`\n🎮 Plex Remote Controller draait op http://localhost:${PORT}\n`);
});
