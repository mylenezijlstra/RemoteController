// ============================================================
// YouTube Remote Controller — Frontend Logic
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
    showToast('Verbinding verbroken');
});

function updateConnectionStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    if (state.isConnected) {
        statusDot.style.background = '#00c853'; // Success groen
        statusText.textContent = 'Verbonden';
    } else {
        statusDot.style.background = '#ff5252'; // Danger rood
        statusText.textContent = 'Verbinding herstellen...';
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

// Playback commands
function cmdPlayPause() {
    state.isPlaying = !state.isPlaying;
    document.getElementById('playPauseBtn').textContent = state.isPlaying ? '⏸' : '▶';
    sendCommand(state.isPlaying ? 'play' : 'pause');
}

function cmdNext() { sendCommand('seek', 10); } // 10s vooruit
function cmdPrev() { sendCommand('seek', -10); } // 10s achteruit

// Navigation commands
function cmdUp() { sendCommand('volume', Math.min(100, state.currentVolume + 10)); state.currentVolume += 10; updateVolumeUI(); }
function cmdDown() { sendCommand('volume', Math.max(0, state.currentVolume - 10)); state.currentVolume -= 10; updateVolumeUI(); }
function cmdLeft() { sendCommand('seek', -5); }
function cmdRight() { sendCommand('seek', 5); }
function cmdSelect() { sendCommand('play'); }
function cmdBack() { sendCommand('stop'); }
function cmdHome() { window.location.reload(); }

function updateVolumeUI() {
    const slider = document.getElementById('volumeSlider');
    const val = document.getElementById('volumeValue');
    slider.value = state.currentVolume;
    val.textContent = state.currentVolume + '%';
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
            showToast('API Key nodig in server.js');
            console.error('Search error:', data.error);
            return;
        }
        
        displaySearchResults(data);
    } catch (err) {
        console.error('Zoeken mislukt:', err);
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('searchResults');
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
            playMedia(item.id);
            container.classList.remove('visible');
            document.getElementById('searchInput').value = '';
        });
        container.appendChild(div);
    });

    container.classList.add('visible');
}

function playMedia(videoId) {
    state.isPlaying = true;
    document.getElementById('playPauseBtn').textContent = '⏸';
    sendCommand('play', videoId);
    showToast('Video gestart op scherm');
}

// ============================================================
// UI HELPERS
// ============================================================

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
    volumeSlider.addEventListener('input', () => {
        state.currentVolume = parseInt(volumeSlider.value);
        volumeValue.textContent = state.currentVolume + '%';
    });
    volumeSlider.addEventListener('change', () => {
        sendCommand('volume', state.currentVolume);
    });

    // === SEARCH ===
    let searchTimeout;
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length >= 2) searchTimeout = setTimeout(() => doSearch(query), 500);
    });

    updateConnectionStatus();
});
