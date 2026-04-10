// ============================================================
// YouTube Remote Controller — Frontend Logic (Smart TV Version)
// ============================================================

const socket = io();

// === STATE ===
const state = {
    isConnected: false,
    currentVolume: 100,
    isPlaying: false
};

// ============================================================
// SOCKET.IO — Connection handling
// ============================================================

socket.on('connect', () => {
    state.isConnected = true;
    updateConnectionStatus();
    showToast('Verbonden met server');
});

socket.on('disconnect', () => {
    state.isConnected = false;
    updateConnectionStatus();
    showToast('Verbinding herstellen...');
});

function updateConnectionStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    if (statusDot && statusText) {
        if (state.isConnected) {
            statusDot.style.background = '#00c853';
            statusText.textContent = 'Verbonden';
        } else {
            statusDot.style.background = '#ff5252';
            statusText.textContent = 'Verbinding herstellen...';
        }
    }
}

// ============================================================
// COMMANDS — Playback & Navigatie
// ============================================================

function sendCommand(type, value) {
    if (!state.isConnected) {
        showToast('Niet verbonden met de server');
        return;
    }
    console.log(`[Remote] Sending ${type}:`, value || '');
    socket.emit('command', { type, value });
}

// Navigation Commands
function cmdNav(dir) { sendCommand('nav', dir); }
function cmdOk() { sendCommand('ok'); }
function cmdHome() { sendCommand('home'); }

// Playback Controls
function cmdPlayPause() {
    state.isPlaying = !state.isPlaying;
    document.getElementById('playPauseBtn').textContent = state.isPlaying ? '⏸' : '▶';
    sendCommand(state.isPlaying ? 'play' : 'pause');
}

function cmdSeek(val) { sendCommand('seek', val); }
function cmdNextVideo() { sendCommand('next'); }
function cmdPrevVideo() { sendCommand('prev'); }

function updateVolume(val) {
    state.currentVolume = val;
    document.getElementById('volumeValue').textContent = val + '%';
    sendCommand('volume', val);
}

// ============================================================
// SEARCH — Zoeken in YouTube
// ============================================================

async function doSearch(query) {
    if (!query) return;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.error) {
            showToast('Zoeken mislukt (API Key nodig)');
            return;
        }
        
        displaySearchResults(data);
    } catch (err) {
        console.error('Zoeken mislukt:', err);
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('searchResults');
    const input = document.getElementById('searchInput');
    container.innerHTML = '';

    if (!Array.isArray(results) || results.length === 0) {
        container.innerHTML = '<div class="no-results">Geen resultaten gevonden</div>';
        container.classList.add('visible');
        return;
    }

    results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `
            <img src="${item.thumbnail}" class="result-thumb">
            <div class="result-info">
                <div class="result-title">${escapeHtml(item.title)}</div>
                <div class="result-meta">${escapeHtml(item.channel)}</div>
            </div>
        `;
        div.addEventListener('click', () => {
            // Wanneer je op een resultaat klikt, start hij op het scherm
            sendCommand('play', item.id);
            container.classList.remove('visible');
            input.value = '';
            state.isPlaying = true;
            document.getElementById('playPauseBtn').textContent = '⏸';
        });
        container.appendChild(div);
    });

    container.classList.add('visible');
}

// ============================================================
// UI HELPERS
// ============================================================

function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3000);
    }
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

    // === DPAD ===
    document.getElementById('dpadUp').addEventListener('click', () => cmdNav('up'));
    document.getElementById('dpadDown').addEventListener('click', () => cmdNav('down'));
    document.getElementById('dpadLeft').addEventListener('click', () => cmdNav('left'));
    document.getElementById('dpadRight').addEventListener('click', () => cmdNav('right'));
    document.getElementById('dpadOk').addEventListener('click', cmdOk);
    document.getElementById('homeBtn').addEventListener('click', cmdHome);

    // === MEDIA ===
    document.getElementById('playPauseBtn').addEventListener('click', cmdPlayPause);
    document.getElementById('seekMinusBtn').addEventListener('click', () => cmdSeek(-10));
    document.getElementById('seekPlusBtn').addEventListener('click', () => cmdSeek(10));
    document.getElementById('nextVideoBtn').addEventListener('click', cmdNextVideo);
    document.getElementById('prevVideoBtn').addEventListener('click', cmdPrevVideo);

    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            updateVolume(parseInt(volumeSlider.value));
        });
    }

    // === SEARCH ===
    let searchTimeout;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            if (query.length >= 2) searchTimeout = setTimeout(() => doSearch(query), 500);
        });
    }

    updateConnectionStatus();
});
