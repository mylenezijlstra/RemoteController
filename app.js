// ============================================================
// Plex Remote Controller — Frontend Logic
// ============================================================

const API_BASE = '';

// === PERSISTENT CLIENT ID ===
// Dit identificeert ONZE app bij Plex (uniek per browser-installatie)
function getAppClientId() {
    let id = localStorage.getItem('plex_app_client_id');
    if (!id) {
        id = 'plex-remote-' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('plex_app_client_id', id);
    }
    return id;
}

// === CHECK ORIGIN ===
if (window.location.port !== '3000' && window.location.hostname === 'localhost') {
    console.warn('⚠️ Waarschuwing: Je gebruikt waarschijnlijk de verkeerde URL (XAMPP).');
    console.warn('Gebruik http://localhost:3000 voor de volledige functionaliteit.');
}

// === STATE ===
const state = {
    token: localStorage.getItem('plex_token') || null,
    serverUrl: localStorage.getItem('plex_server_url') || null,
    serverName: localStorage.getItem('plex_server_name') || null,
    serverId: localStorage.getItem('plex_server_id') || null,
    clientId: localStorage.getItem('plex_client_id') || null,
    clientName: localStorage.getItem('plex_client_name') || null,
    isPlaying: false,
    sessionInterval: null
};

// === HELPER VOOR API CALLS ===
async function plexFetch(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['X-Plex-Client-Identifier'] = getAppClientId();
    return fetch(`${API_BASE}${endpoint}`, options);
}

// ============================================================
// AUTH — PIN-based login
// ============================================================

async function startLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const loginStatus = document.getElementById('loginStatus');

    loginBtn.disabled = true;
    loginBtn.textContent = 'Bezig...';
    loginStatus.textContent = '';

    try {
        // Stap 1: PIN aanvragen
        const pinRes = await plexFetch('/api/auth/pin', { method: 'POST' });
        const { id, code } = await pinRes.json();

        // Stap 2: Open Plex login in nieuw tabblad
        const authUrl = `https://app.plex.tv/auth#?clientID=${getAppClientId()}&code=${code}&context%5Bdevice%5D%5Bproduct%5D=Plex%20Remote%20Controller`;
        window.open(authUrl, '_blank');

        loginStatus.textContent = 'Log in bij Plex in het nieuwe tabblad...';

        // Stap 3: Poll tot de gebruiker heeft ingelogd
        const pollInterval = setInterval(async () => {
            try {
                const checkRes = await plexFetch(`/api/auth/pin/${id}`);
                const { authToken } = await checkRes.json();

                if (authToken) {
                    clearInterval(pollInterval);
                    state.token = authToken;
                    localStorage.setItem('plex_token', authToken);
                    loginStatus.textContent = 'Ingelogd! Laden...';
                    await loadResources();
                    showRemote();
                }
            } catch (e) {
                // Blijf proberen
            }
        }, 2000);

    } catch (err) {
        loginStatus.textContent = 'Fout: ' + err.message;
        loginBtn.disabled = false;
        loginBtn.textContent = 'Inloggen met Plex';
    }
}

// ============================================================
// RESOURCES — Servers & Clients ophalen
// ============================================================

async function loadResources() {
    if (!state.token) return;

    try {
        console.log('[Resources] Bezig met ophalen...');
        const res = await plexFetch(`/api/resources?token=${state.token}`);
        
        if (!res.ok) {
            const text = await res.text();
            console.error('[Resources] Server fout:', res.status, text);
            showToast('Fout bij ophalen resources');
            return;
        }

        const resources = await res.json();
        console.log('[Resources] Totaal aantal items:', resources.length);
        if (resources.length === 0) {
            console.warn('[Resources] Geen apparaten gevonden. Gebruik handmatige invoer indien nodig.');
        }

        // Servers en players scheiden
        const servers = resources.filter(r => {
            const isServer = (r.provides && r.provides.includes('server')) || (r.product === 'Plex Media Server');
            if (isServer) console.log('  -> Gevonden server:', r.name);
            return isServer;
        });

        const players = resources.filter(r => {
            const isPlayer = (r.provides && (r.provides.includes('player') || r.provides.includes('client'))) ||
                            (r.product && (r.product.includes('Plex for') || r.product === 'Plex Web'));
            if (isPlayer) console.log('  -> Gevonden player:', r.name);
            return isPlayer;
        });

        // Server dropdown vullen
        const serverSelect = document.getElementById('serverSelect');
        serverSelect.innerHTML = '<option value="">Kies server...</option>';

        servers.forEach(s => {
            const conns = Array.isArray(s.connections) ? s.connections : (s.Connection ? (Array.isArray(s.Connection) ? s.Connection : [s.Connection]) : []);
            const conn = conns.find(c => c.local) || conns[0];

            if (conn) {
                const opt = document.createElement('option');
                opt.value = conn.uri || `http://${conn.address}:${conn.port}`;
                opt.textContent = s.name || s.device;
                opt.dataset.id = s.clientIdentifier;
                if (opt.value === state.serverUrl) opt.selected = true;
                serverSelect.appendChild(opt);
            }
        });

        // Client dropdown vullen
        const clientSelect = document.getElementById('clientSelect');
        clientSelect.innerHTML = '<option value="">Kies client...</option>';

        players.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.clientIdentifier;
            opt.textContent = p.name || p.device;
            if (p.clientIdentifier === state.clientId) opt.selected = true;
            clientSelect.appendChild(opt);
        });

        updateConnectionStatus();

    } catch (err) {
        console.error('Resources laden mislukt:', err);
        showToast('Resources laden mislukt');
    }
}

// ============================================================
// CONNECTION STATUS
// ============================================================

function updateConnectionStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const connectionStatus = document.getElementById('connectionStatus');

    if (state.serverUrl && state.clientId) {
        statusDot.style.background = 'var(--success)';
        statusText.textContent = 'Verbonden';
    } else if (state.token) {
        statusDot.style.background = 'var(--plex-orange)';
        statusText.textContent = 'Kies device';
    } else {
        statusDot.style.background = 'var(--danger)';
        statusText.textContent = 'Niet ingelogd';
    }
}

// ============================================================
// COMMANDS — Playback & Navigatie
// ============================================================

async function sendCommand(type, command, params) {
    if (!state.serverUrl || !state.clientId) {
        showToast('Selecteer eerst een server en client');
        return;
    }

    try {
        const res = await plexFetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serverUrl: state.serverUrl,
                token: state.token,
                clientId: state.clientId,
                type: type,
                command: command,
                params: params || null
            })
        });
        const data = await res.json();
    } catch (err) {
        console.error('Command mislukt:', err);
        showToast('Command mislukt');
    }
}

// Playback commands
function cmdPlayPause() {
    state.isPlaying = !state.isPlaying;
    document.getElementById('playPauseBtn').textContent = state.isPlaying ? '⏸' : '▶';
    sendCommand('playback', state.isPlaying ? 'play' : 'pause');
}

function cmdNext() { sendCommand('playback', 'skipNext'); }
function cmdPrev() { sendCommand('playback', 'skipPrevious'); }

// Navigation commands
function cmdUp() { sendCommand('navigation', 'moveUp'); }
function cmdDown() { sendCommand('navigation', 'moveDown'); }
function cmdLeft() { sendCommand('navigation', 'moveLeft'); }
function cmdRight() { sendCommand('navigation', 'moveRight'); }
function cmdSelect() { sendCommand('navigation', 'select'); }
function cmdBack() { sendCommand('navigation', 'back'); }
function cmdHome() { sendCommand('navigation', 'home'); }

// Volume
function cmdVolume(value) {
    sendCommand('playback', 'setParameters', { volume: value });
}

// ============================================================
// SEARCH — Zoeken in Plex library
// ============================================================

async function doSearch(query) {
    if (!state.serverUrl || !query) return;

    try {
        const url = `/api/search?serverUrl=${encodeURIComponent(state.serverUrl)}&token=${state.token}&query=${encodeURIComponent(query)}`;
        const res = await plexFetch(url);
        const data = await res.json();
        displaySearchResults(data);
    } catch (err) {
        console.error('Zoeken mislukt:', err);
    }
}

function displaySearchResults(data) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '';

    const metadata = data.MediaContainer ? (data.MediaContainer.Metadata || data.MediaContainer.Device || []) : [];
    if (metadata.length === 0) {
        container.innerHTML = '<div class="no-results">Geen resultaten gevonden</div>';
        container.classList.add('visible');
        return;
    }

    const results = Array.isArray(metadata) ? metadata.slice(0, 8) : [metadata];

    results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `
            <div class="result-info">
                <div class="result-title">${escapeHtml(item.title || item.name)}</div>
                <div class="result-meta">${item.type || ''} ${item.year ? ' · ' + item.year : ''}</div>
            </div>
        `;
        div.addEventListener('click', () => {
            playMedia(item.key, item.type);
            container.classList.remove('visible');
            document.getElementById('searchInput').value = '';
        });
        container.appendChild(div);
    });

    container.classList.add('visible');
}

async function playMedia(key, type) {
    if (!state.serverUrl || !state.clientId) {
        showToast('Selecteer eerst een server en client');
        return;
    }

    try {
        const serverHost = new URL(state.serverUrl);
        await sendCommand('playback', 'playMedia', {
            key: key,
            address: serverHost.hostname,
            port: serverHost.port || '32400',
            protocol: serverHost.protocol.replace(':', ''),
            machineIdentifier: state.serverId || '',
            token: state.token
        });
        showToast('Afspelen gestart');
    } catch (err) {
        console.error('Play media mislukt:', err);
        showToast('Afspelen mislukt');
    }
}

// ============================================================
// NOW PLAYING — Sessie polling
// ============================================================

async function pollSessions() {
    if (!state.serverUrl || !state.token) return;

    try {
        const url = `/api/sessions?serverUrl=${encodeURIComponent(state.serverUrl)}&token=${state.token}`;
        const res = await plexFetch(url);
        const data = await res.json();

        const nowPlaying = document.getElementById('nowPlaying');
        const mc = data.MediaContainer;

        if (mc && mc.Metadata && (Array.isArray(mc.Metadata) ? mc.Metadata.length > 0 : true)) {
            const sessions = Array.isArray(mc.Metadata) ? mc.Metadata : [mc.Metadata];
            const session = sessions.find(s => s.Player && s.Player.machineIdentifier === state.clientId) || sessions[0];

            document.querySelector('.now-playing-title').textContent = session.title || 'Onbekend';
            document.querySelector('.now-playing-subtitle').textContent = session.grandparentTitle || session.parentTitle || session.type || '';
            
            if (session.Player) {
                state.isPlaying = session.Player.state === 'playing';
                document.getElementById('playPauseBtn').textContent = state.isPlaying ? '⏸' : '▶';
            }

            nowPlaying.style.display = 'flex';
        } else {
            nowPlaying.style.display = 'none';
        }
    } catch (err) {
        // Stille fout
    }
}

// ============================================================
// UI HELPERS
// ============================================================

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('remoteScreen').style.display = 'none';
}

function showRemote() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('remoteScreen').style.display = 'flex';

    if (state.sessionInterval) clearInterval(state.sessionInterval);
    state.sessionInterval = setInterval(pollSessions, 5000);
    pollSessions();
    updateConnectionStatus();
}

function logout() {
    state.token = null;
    localStorage.removeItem('plex_token');
    if (state.sessionInterval) clearInterval(state.sessionInterval);
    showLogin();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// INIT — Event Listeners
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('loginBtn').addEventListener('click', startLogin);
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // === DEVICE SELECTIE ===
    document.getElementById('serverSelect').addEventListener('change', (e) => {
        const selected = e.target.selectedOptions[0];
        state.serverUrl = e.target.value;
        state.serverName = selected ? selected.textContent : '';
        state.serverId = selected ? selected.dataset.id : '';
        localStorage.setItem('plex_server_url', state.serverUrl);
        localStorage.setItem('plex_server_name', state.serverName);
        localStorage.setItem('plex_server_id', state.serverId);
        updateConnectionStatus();
        pollSessions();
    });

    document.getElementById('clientSelect').addEventListener('change', (e) => {
        const selected = e.target.selectedOptions[0];
        state.clientId = e.target.value;
        state.clientName = selected ? selected.textContent : '';
        localStorage.setItem('plex_client_id', state.clientId);
        localStorage.setItem('plex_client_name', state.clientName);
        updateConnectionStatus();
    });

    // === HANDMATIG VERBINDEN ===
    const toggleBtn = document.getElementById('toggleManualBtn');
    const manualForm = document.getElementById('manualForm');
    const saveBtn = document.getElementById('saveManualBtn');

    toggleBtn.addEventListener('click', () => {
        manualForm.classList.toggle('hidden');
    });

    saveBtn.addEventListener('click', () => {
        const ip = document.getElementById('manualServerIp').value.trim();
        const cid = document.getElementById('manualClientId').value.trim();

        if (!ip || !cid) {
            showToast('Vul beide velden in');
            return;
        }

        state.serverUrl = ip.startsWith('http') ? ip : `http://${ip}`;
        state.clientId = cid;
        
        localStorage.setItem('plex_server_url', state.serverUrl);
        localStorage.setItem('plex_client_id', state.clientId);
        
        showToast('Handmatige instellingen opgeslagen');
        manualForm.classList.add('hidden');
        updateConnectionStatus();
        pollSessions();
    });

    // === CONTROLS ===
    document.getElementById('dpadUp').addEventListener('click', cmdUp);
    document.getElementById('dpadDown').addEventListener('click', cmdDown);
    document.getElementById('dpadLeft').addEventListener('click', cmdLeft);
    document.getElementById('dpadRight').addEventListener('click', cmdRight);
    document.getElementById('dpadOk').addEventListener('click', cmdSelect);
    document.getElementById('backBtn').addEventListener('click', cmdBack);
    document.getElementById('homeBtn').addEventListener('click', cmdHome);
    document.getElementById('playPauseBtn').addEventListener('click', cmdPlayPause);
    document.getElementById('prevBtn').addEventListener('click', cmdPrev);
    document.getElementById('nextBtn').addEventListener('click', cmdNext);

    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    volumeSlider.addEventListener('input', () => volumeValue.textContent = volumeSlider.value + '%');
    volumeSlider.addEventListener('change', () => cmdVolume(volumeSlider.value));

    // === SEARCH ===
    let searchTimeout;
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length >= 2) searchTimeout = setTimeout(() => doSearch(query), 500);
    });

    // === STARTUP ===
    if (state.token) {
        showRemote();
        loadResources();
    } else {
        showLogin();
    }
});
