/**
 * shisakuTablet.js
 * Logic for Shisaku Tablet UI
 */

//const serverURL = "http://localhost:3000";
//const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://192.168.0.77:3000";

const state = {
    workerName: localStorage.getItem('shisaku_tablet_worker_name') || null,
    machineName: null,
    filterName: null, // "第一工場"

    currentMainTab: 0, // 0: User, 1: Prototype, 2: Request, 3: Images, 4: Submit
    currentPrototypeStatus: 'pending',

    prototypes: [],
    requests: [],
    currentPrototype: null,
    currentRequest: null,
};

// -----------------------------------------------------
// URL Parsing
// -----------------------------------------------------
function parseParams() {
    let searchStr = window.location.search;
    while (searchStr.startsWith('?')) {
        searchStr = searchStr.substring(1);
    }
    const params = new URLSearchParams(searchStr);

    // Also support if the parameter itself got named '?filter'
    if (params.has('machine') || params.has('?machine')) {
        state.machineName = params.get('machine') || params.get('?machine');
        document.getElementById('machineNameTag').textContent = `設備: ${state.machineName}`;
    }
    if (params.has('filter') || params.has('?filter')) {
        state.filterName = params.get('filter') || params.get('?filter');
    }
}

// -----------------------------------------------------
// Worker Setup & Modal Logic (DCP Interactive style)
// -----------------------------------------------------
let workerNamesData = [];

// Initialize view on load
function initWorker() {
    if (state.workerName) {
        document.getElementById('welcomeBackContainer').classList.add('active');
        document.getElementById('newWorkerContainer').classList.remove('active');
        document.getElementById('confirmUserName').textContent = state.workerName;
    } else {
        document.getElementById('welcomeBackContainer').classList.remove('active');
        document.getElementById('newWorkerContainer').classList.add('active');
    }
    updateTabLocks();
}

async function fetchWorkersFromMongoDB() {
    if (!state.filterName) return;
    try {
        const response = await fetch(`${serverURL}/getWorkerNames?selectedFactory=${encodeURIComponent(state.filterName)}`);
        if (!response.ok) throw new Error("Failed to fetch worker names");
        const workers = await response.json();

        workerNamesData = workers;

        const dataList = document.getElementById("machine-operator-suggestions");
        dataList.innerHTML = "";
        workerNamesData.forEach(name => {
            const option = document.createElement("option");
            option.value = name;
            dataList.appendChild(option);
        });

    } catch (error) {
        console.error("Error fetching worker names from MongoDB:", error);
    }
}

function getRecentWorkers() {
    try {
        return JSON.parse(localStorage.getItem('shisaku_recent_workers') || '[]');
    } catch {
        return [];
    }
}

function saveRecentWorker(name) {
    if (!name) return;
    let recent = getRecentWorkers();
    recent = recent.filter(w => w !== name);
    recent.unshift(name);
    if (recent.length > 5) recent.pop();
    localStorage.setItem('shisaku_recent_workers', JSON.stringify(recent));
}

function removeFromRecentWorkers(name) {
    let recent = getRecentWorkers();
    recent = recent.filter(w => w !== name);
    localStorage.setItem('shisaku_recent_workers', JSON.stringify(recent));
    renderWorkerNames(); // Re-render modal
}

function groupNamesByLetter(names) {
    const grouped = {};
    names.forEach(name => {
        let firstChar = name.charAt(0).toUpperCase();
        if (/[A-Z]/.test(firstChar)) {
            firstChar = firstChar;
        } else if (/[ぁ-ん]/.test(name.charAt(0))) {
            const index = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".indexOf(name.charAt(0));
            if (index !== -1) firstChar = "あかさたなはまやらわ"[Math.floor(index / 5)] || "あ";
            else firstChar = "あ";
        } else if (/[ァ-ン]/.test(name.charAt(0))) {
            const index = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン".indexOf(name.charAt(0));
            if (index !== -1) firstChar = "アカサタナハマヤラワ"[Math.floor(index / 5)] || "ア";
            else firstChar = "ア";
        } else if (/[\u4E00-\u9FFF]/.test(firstChar)) {
            firstChar = "漢字";
        } else {
            firstChar = "#";
        }

        if (!grouped[firstChar]) grouped[firstChar] = [];
        grouped[firstChar].push(name);
    });
    return grouped;
}

function renderWorkerNames() {
    const container = document.getElementById('workerNamesContainer');
    container.innerHTML = '';

    const recentWorkers = getRecentWorkers();

    if (recentWorkers.length > 0) {
        const recentSection = document.createElement('div');
        recentSection.className = 'worker-section recent-section';
        const header = document.createElement('div');
        header.className = 'worker-section-header';
        header.textContent = '⭐ 最近使用 / Recent';
        recentSection.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'worker-names-grid';

        recentWorkers.forEach(name => {
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'worker-name-btn';
            btn.textContent = name;
            btn.onclick = () => selectWorkerName(name);

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'delete-recent-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                removeFromRecentWorkers(name);
            };

            wrapper.appendChild(btn);
            wrapper.appendChild(deleteBtn);
            grid.appendChild(wrapper);
        });

        recentSection.appendChild(grid);
        container.appendChild(recentSection);
    }

    const grouped = groupNamesByLetter(workerNamesData);
    const sortedKeys = Object.keys(grouped).sort();

    sortedKeys.forEach(letter => {
        const section = document.createElement('div');
        section.className = 'worker-section';

        const header = document.createElement('div');
        header.className = 'worker-section-header';
        header.textContent = letter;
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'worker-names-grid';

        grouped[letter].forEach(name => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'worker-name-btn';
            btn.textContent = name;
            btn.onclick = () => selectWorkerName(name);
            grid.appendChild(btn);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
}

// User Actions
function selectWorkerName(name) {
    state.workerName = name;
    localStorage.setItem('shisaku_tablet_worker_name', name);
    document.getElementById("workerInput").value = name;
    saveRecentWorker(name);

    document.getElementById('workerNameModal').style.display = 'none';

    initWorker();
    switchMainTab(1); // Jump to Prototype Tab
}

function proceedFromStep0() {
    const val = document.getElementById("workerInput").value;
    if (!val) {
        alert("Please select a worker first.");
        return;
    }
    selectWorkerName(val);
}

function confirmWorkerName() {
    // "Yes, that's me"
    updateTabLocks();
    switchMainTab(1); // Jump to Prototype Tab
}

function changeWorkerName() {
    // Switch to Selection State
    state.workerName = null;
    localStorage.removeItem('shisaku_tablet_worker_name');
    document.getElementById("workerInput").value = '';
    initWorker();
}

// Modal event listeners
const workerInputEl = document.getElementById('workerInput');

function openWorkerModal(e) {
    if (workerInputEl.readOnly) {
        e.preventDefault();
        if (workerNamesData && workerNamesData.length > 0) {
            renderWorkerNames();
            document.getElementById('workerNameModal').style.display = 'flex';
        } else {
            console.warn("Worker names not loaded yet or empty.");
            // optionally try fetching again here
        }
    }
}

workerInputEl.addEventListener('click', openWorkerModal);
workerInputEl.addEventListener('focus', openWorkerModal);
workerInputEl.addEventListener('touchstart', openWorkerModal);

document.getElementById('closeWorkerModal').addEventListener('click', () => {
    document.getElementById('workerNameModal').style.display = 'none';
});

document.getElementById('manualEntryBtn').addEventListener('click', () => {
    const inputField = document.getElementById('workerInput');
    inputField.readOnly = false;
    inputField.focus();
    document.getElementById('workerNameModal').style.display = 'none';
});

document.getElementById('workerInput').addEventListener('blur', (e) => {
    e.target.readOnly = true;
});

// -----------------------------------------------------
// Main Tab Navigation & Locking
// -----------------------------------------------------
function updateTabLocks() {
    const mainTabs = document.querySelectorAll('#mainTabBar .tab-btn');
    if (!state.workerName) {
        mainTabs.forEach((btn, index) => {
            if (index !== 0) btn.classList.add('locked');
        });
    } else {
        mainTabs[1].classList.remove('locked');
        mainTabs[3].classList.remove('locked');
        mainTabs[4].classList.remove('locked');

        if (state.currentPrototype) {
            mainTabs[2].classList.remove('locked');
        } else {
            mainTabs[2].classList.add('locked');
        }
    }
}

function setupMainTabs() {
    const tabs = document.querySelectorAll('#mainTabBar .tab-btn');

    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('locked')) return;
            switchMainTab(index);
        });
    });
}

function switchMainTab(index) {
    const tabs = document.querySelectorAll('#mainTabBar .tab-btn');
    const container = document.getElementById('tabPanelsContainer');

    tabs.forEach(t => t.classList.remove('active'));
    tabs[index].classList.add('active');

    container.style.transform = `translateX(-${index * 20}%)`;
    state.currentMainTab = index;

    if (index === 1) {
        fetchPrototypes();
    }
}

// -----------------------------------------------------
// Prototype & Request Logic
// -----------------------------------------------------
function setupSubTabs() {
    const tabs = document.querySelectorAll('.sub-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.currentPrototypeStatus = tab.dataset.status;
            fetchPrototypes();
        });
    });
}

function showRequestView(viewId) {
    document.getElementById('requestPlaceholder').style.display = 'none';
    document.getElementById('view-requests').classList.remove('active');
    document.getElementById('view-details').classList.remove('active');

    if (viewId === 'placeholder') {
        document.getElementById('requestPlaceholder').style.display = 'block';
    } else {
        document.getElementById(`view-${viewId}`).classList.add('active');
    }
}

async function fetchPrototypes() {
    try {
        const response = await fetch(`${serverURL}/api/shisaku-request/grouped-list?status=${encodeURIComponent(state.currentPrototypeStatus)}&limit=1000`);
        if (!response.ok) throw new Error('Failed to fetch prototypes');
        const data = await response.json();
        state.prototypes = data.rows || [];
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

        updateTabLocks();
        renderRequests();
        showRequestView('requests');
        switchMainTab(2); // Jump to Request tab

    } catch (error) {
        console.error(error);
        alert('Error loading requests.');
    }
}

function renderPrototypes() {
    const grid = document.getElementById('prototypesGrid');
    grid.innerHTML = '';

    // We already fetched by currentPrototypeStatus, so state.prototypes is the filtered list.
    const filtered = state.prototypes;

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">No prototypes found for this status.</div>';
        return;
    }

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => fetchRequests(p.shisakudb_id, p.shisakuNo);

        let dateStr = '-';
        if (p.latestDate) {
            const d = new Date(p.latestDate);
            dateStr = d.toLocaleDateString();
        }

        card.innerHTML = `
            <h3>Prototype #${p.shisakuNo || '?'}</h3>
            <p>Requests: ${p.totalRequests}</p>
            <p>Last Updated: ${dateStr}</p>
            <span class="badge ${state.currentPrototypeStatus}">${state.currentPrototypeStatus.toUpperCase()}</span>
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
    if (jpgLink.startsWith('http') && !jpgLink.includes('drive.google.com')) {
        return jpgLink;
    }
    const driveMatch = jpgLink.match(/id=([a-zA-Z0-9_-]+)|d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
        const id = driveMatch[1] || driveMatch[2];
        return `${serverURL}/api/shisaku/image/${id}`;
    }
    return jpgLink;
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

    showRequestView('details');
}

function sendToMachine() {
    const overlay = document.getElementById('flashOverlay');
    overlay.classList.add('show');

    const audio = document.getElementById('alert-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Audio play blocked", e));
    }

    setTimeout(() => {
        overlay.classList.remove('show');
    }, 400);
}

// -----------------------------------------------------
// Initialization
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    parseParams();
    setupMainTabs();
    setupSubTabs();
    initWorker();
    fetchWorkersFromMongoDB(); // Fetch names immediately

    showRequestView('placeholder');
});
