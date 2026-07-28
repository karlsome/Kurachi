/**
 * shisakuTablet.js
 * Logic for Shisaku Tablet UI
 */

//const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://localhost:3000";

const state = {
    workerName: localStorage.getItem('shisaku_tablet_worker_name') || null,
    machineName: null,
    filterName: null,
    currentTab: 'pending',
    prototypes: [],
    requests: [],
    currentPrototype: null,
    currentRequest: null,
};

// URL Parsing
function parseParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('machine')) {
        state.machineName = params.get('machine');
        document.getElementById('machineNameTag').textContent = `設備: ${state.machineName}`;
    }
    if (params.has('filter')) {
        state.filterName = params.get('filter');
    }
}

// Worker Management
function initWorker() {
    if (state.workerName) {
        document.getElementById('userInfoBtn').textContent = state.workerName;
        document.getElementById('confirmUserName').textContent = state.workerName;
        document.getElementById('confirmUserModal').classList.add('active');
    } else {
        document.getElementById('userInfoBtn').textContent = 'User';
        document.getElementById('workerModal').classList.add('active');
    }
}

function openWorkerModal() {
    document.getElementById('workerModal').classList.add('active');
}

function selectWorker(name) {
    state.workerName = name;
    localStorage.setItem('shisaku_tablet_worker_name', name);
    document.getElementById('userInfoBtn').textContent = name;
    document.getElementById('workerModal').classList.remove('active');
}

function confirmUser(isSameUser) {
    document.getElementById('confirmUserModal').classList.remove('active');
    if (!isSameUser) {
        openWorkerModal();
    }
}

// Navigation & Tabs
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.currentTab = tab.dataset.status;
            renderPrototypes();
            showView('prototypes');
        });
    });
}

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
}

// Data Fetching
async function fetchPrototypes() {
    try {
        const response = await fetch(`${serverURL}/api/shisaku/list`);
        if (!response.ok) throw new Error('Failed to fetch prototypes');
        state.prototypes = await response.json();
        renderPrototypes();
    } catch (error) {
        console.error(error);
        alert('Error loading prototypes.');
    }
}

async function fetchRequests(shisakudb_id, shisakuNo) {
    try {
        const response = await fetch(`${serverURL}/api/shisaku-request/list?shisakudb_id=${shisakudb_id}&sortColumn=orderNumber&sortDirection=1&limit=1000`);
        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json();
        state.requests = data.rows;
        state.currentPrototype = shisakuNo;
        renderRequests();
        showView('requests');
    } catch (error) {
        console.error(error);
        alert('Error loading requests.');
    }
}

// Rendering
function renderPrototypes() {
    const grid = document.getElementById('prototypesGrid');
    grid.innerHTML = '';

    // Filter by tab status
    const filtered = state.prototypes.filter(p => p.status === state.currentTab);

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">No prototypes found for this status.</div>';
        return;
    }

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => fetchRequests(p._id, p.shisakuNo);

        let deadlineStr = '-';
        if (p.deadline) {
            deadlineStr = p.deadline;
        }

        card.innerHTML = `
            <h3>Prototype #${p.shisakuNo}</h3>
            <p>Deadline: ${deadlineStr}</p>
            <span class="badge ${p.status || 'pending'}">${(p.status || 'pending').toUpperCase()}</span>
        `;
        grid.appendChild(card);
    });
}

function renderRequests() {
    document.getElementById('requestsViewTitle').textContent = `Requests for Prototype #${state.currentPrototype}`;
    const list = document.getElementById('requestsList');
    list.innerHTML = '';

    if (state.requests.length === 0) {
        list.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">No requests found.</div>';
        return;
    }

    state.requests.forEach(r => {
        const row = document.createElement('div');
        row.className = 'request-row';
        row.onclick = () => showRequestDetails(r);

        row.innerHTML = `
            <div class="row-number">#${r.orderNumber || '?'}</div>
            <div class="row-info">
                <div style="margin-bottom: 4px;"><strong>${r.name || 'Unnamed Request'}</strong></div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">
                    Qty: ${r.quantity || '-'} | Box: ${r.boxType || '-'}
                </div>
            </div>
            <div style="color: var(--text-soft); font-size: 1.2rem;">›</div>
        `;
        list.appendChild(row);
    });
}

function parseImageUrl(jpgLink) {
    if (!jpgLink) return '';
    // If it's a firebase URL or a relative /api/ URL, use as is
    if (jpgLink.startsWith('http') && !jpgLink.includes('drive.google.com')) {
        return jpgLink;
    }
    // If it's a google drive URL, extract ID and use /api/shisaku/image/ID
    const driveMatch = jpgLink.match(/id=([a-zA-Z0-9_-]+)|d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
        const id = driveMatch[1] || driveMatch[2];
        return `${serverURL}/api/shisaku/image/${id}`;
    }
    return jpgLink; // Fallback
}

function showRequestDetails(request) {
    state.currentRequest = request;
    const grid = document.getElementById('detailsGrid');
    grid.innerHTML = `
        <div class="detail-item">
            <label>Name</label>
            <span>${request.name || '-'}</span>
        </div>
        <div class="detail-item">
            <label>Quantity</label>
            <span>${request.quantity || '-'}</span>
        </div>
        <div class="detail-item">
            <label>Box Type</label>
            <span>${request.boxType || '-'}</span>
        </div>
        <div class="detail-item">
            <label>Material</label>
            <span>${request.material || '-'}</span>
        </div>
        <div class="detail-item">
            <label>Color</label>
            <span>${request.color || '-'}</span>
        </div>
        <div class="detail-item">
            <label>Okuri Pitch</label>
            <span>${request.okuriPitch || '-'}</span>
        </div>
    `;

    const imgEl = document.getElementById('detailsImage');
    const jpgLink = request.pdf?.jpgLink || request.jpgLink;
    const parsedImgUrl = parseImageUrl(jpgLink);

    if (parsedImgUrl) {
        imgEl.src = parsedImgUrl;
        imgEl.style.display = 'block';
    } else {
        imgEl.style.display = 'none';
        imgEl.src = '';
    }

    showView('details');
}

// Send to Machine Action
function sendToMachine() {
    if (!state.workerName) {
        alert("Please select a user first.");
        openWorkerModal();
        return;
    }

    // Flash screen effect
    const overlay = document.getElementById('flashOverlay');
    overlay.classList.add('show');

    // Play sound if available (like DCP)
    const audio = document.getElementById('alert-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Audio play blocked", e));
    }

    setTimeout(() => {
        overlay.classList.remove('show');
    }, 400);

    // After success flash, we could automatically go back or show a checkmark
    // For now we just stay on the page.
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    parseParams();
    initWorker();
    setupTabs();
    fetchPrototypes();
});
