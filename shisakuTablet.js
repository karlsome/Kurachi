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
    currentPrototype: localStorage.getItem('shisaku_tablet_prototype') || null,
    currentPrototypeId: localStorage.getItem('shisaku_tablet_prototype_id') || null,
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

async function resetAll() {
    if (!confirm("Are you sure you want to reset all selections? This will clear the locked prototype and revert active requests.")) return;
    
    // 1. Revert the database statuses BEFORE we wipe our local memory
    if (state.currentPrototypeId) {
        let hasCompleted = false;
        
        try {
            // Force fetch the LATEST database state so we don't rely on local arrays that might be out of sync
            const reqRes = await fetch(`${serverURL}/api/shisaku-request/list?shisakudb_id=${state.currentPrototypeId}&limit=1000`);
            if (reqRes.ok) {
                const reqData = await reqRes.json();
                
                // Revert any in-progress requests back to pending
                for (const req of reqData.rows) {
                    const reqStatus = req.status || 'pending';
                    if (reqStatus === 'completed') {
                        hasCompleted = true;
                    } else if (reqStatus === 'in-progress') {
                        const reqId = req._id?.$oid || req._id;
                        if (reqId) {
                            try {
                                await fetch(`${serverURL}/api/shisaku-request/update/${reqId}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: 'pending' })
                                });
                            } catch (e) {
                                console.error('Failed to reset request status', e);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch latest request status for reset', e);
        }
        
        // 2. Revert Parent Prototype if there are zero completed requests
        if (!hasCompleted) {
            try {
                await fetch(`${serverURL}/api/shisaku/update-status/${state.currentPrototypeId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'pending' })
                });
            } catch (e) {
                console.error('Failed to reset prototype status', e);
            }
        }
    }

    // 3. Now it is safe to wipe the tablet's memory
    state.currentPrototype = null;
    state.currentPrototypeId = null;
    state.requests = [];
    state.currentRequest = null;
    
    localStorage.removeItem('shisaku_tablet_prototype');
    localStorage.removeItem('shisaku_tablet_prototype_id');
    
    initWorker();
    updateTabLocks();
    switchMainTab(0); // Jump back to User Tab
    
    // Refresh prototype view to show all
    fetchPrototypes();
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

        if (state.currentPrototype) {
            mainTabs[2].classList.remove('locked');
            mainTabs[3].classList.remove('locked');
            mainTabs[4].classList.remove('locked');
            mainTabs[5].classList.remove('locked');
        } else {
            mainTabs[2].classList.add('locked');
            mainTabs[3].classList.add('locked');
            mainTabs[4].classList.add('locked');
            mainTabs[5].classList.add('locked');
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

    container.style.transform = `translateX(-${index * (100 / 6)}%)`;
    state.currentMainTab = index;
    sessionStorage.setItem('shisaku_tablet_main_tab', index);

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
    
    if (viewId !== 'details') {
        sessionStorage.removeItem('shisaku_tablet_current_request_id');
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

let pendingSelection = null;

function showPrototypeView(viewId) {
    document.getElementById('view-prototype-list').classList.remove('active');
    document.getElementById('view-prototype-details').classList.remove('active');
    
    if (viewId === 'list') {
        document.getElementById('view-prototype-list').classList.add('active');
    } else {
        document.getElementById('view-prototype-details').classList.add('active');
    }
}

async function previewPrototype(shisakudb_id, shisakuNo) {
    try {
        // Fetch full prototype details
        const protoRes = await fetch(`${serverURL}/api/shisaku/${shisakudb_id}`);
        if (!protoRes.ok) throw new Error('Failed to fetch prototype details');
        const protoData = await protoRes.json();
        
        // Fetch requests for parts needed calculation
        const reqRes = await fetch(`${serverURL}/api/shisaku-request/list?shisakudb_id=${shisakudb_id}&sortColumn=orderNumber&sortDirection=1&limit=1000`);
        if (!reqRes.ok) throw new Error('Failed to fetch requests');
        const reqData = await reqRes.json();
        
        pendingSelection = {
            shisakudb_id,
            shisakuNo,
            protoData,
            requests: reqData.rows
        };
        
        renderPrototypePreview();
        showPrototypeView('details');
    } catch (error) {
        console.error(error);
        alert('Error loading prototype details.');
    }
}

function renderPrototypePreview() {
    if (!pendingSelection) return;
    const { shisakuNo, protoData, requests } = pendingSelection;
    
    document.getElementById('protoPreviewTitle').textContent = `Prototype #${shisakuNo}`;
    
    // Render basic info
    const grid = document.getElementById('protoPreviewGrid');
    
    let deadlineStr = '-';
    if (protoData.deadline) {
        // Parse date from string or { $date: ... }
        deadlineStr = typeof protoData.deadline === 'object' && protoData.deadline.$date ? new Date(protoData.deadline.$date).toLocaleDateString() : new Date(protoData.deadline).toLocaleDateString();
    }

    grid.innerHTML = `
        <div class="detail-item"><span>Deadline:</span> <strong>${deadlineStr}</strong></div>
        <div class="detail-item"><span>Event:</span> <strong>${protoData.eventName || '-'}</strong></div>
        <div class="detail-item"><span>Model:</span> <strong>${protoData.modelName || '-'}</strong></div>
        <div class="detail-item"><span>Customer:</span> <strong>${protoData.customerName || '-'}</strong></div>
    `;
    
    // Calculate box counts based on requests
    const boxCounts = {};
    requests.forEach(r => {
        if (r.boxType) {
            boxCounts[r.boxType] = (boxCounts[r.boxType] || 0) + 1; // 1 pc per request
        }
    });
    
    const boxesContainer = document.getElementById('protoPreviewBoxes');
    boxesContainer.innerHTML = '';
    
    if (Object.keys(boxCounts).length === 0) {
        boxesContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">No boxes required.</div>';
    } else {
        for (const [boxType, count] of Object.entries(boxCounts)) {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.padding = '12px 16px';
            row.style.background = 'var(--bg-subtle)';
            row.style.borderRadius = 'var(--btn-radius)';
            row.style.border = '1px solid var(--border)';
            
            row.innerHTML = `
                <span style="font-weight: 700; color: var(--text-main);">${boxType}</span>
                <span style="font-weight: 800; color: var(--brand);">${count} pc(s)</span>
            `;
            boxesContainer.appendChild(row);
        }
    }

    // Calculate material length based on okuriPitch and pcPerCycle
    const materialLengths = {};
    requests.forEach(r => {
        if (r.material && r.okuriPitch && r.quantity) {
            const pitch = parseFloat(r.okuriPitch) || 0;
            const qty = parseInt(r.quantity) || 0;
            const pcPerCycle = parseInt(r.pcPerCycle) || 1; // Default to 1 if missing or 0
            
            // Calculate total cycles needed
            const cycles = Math.ceil(qty / pcPerCycle);
            const length = cycles * pitch;
            
            if (length > 0) {
                const colorLabel = r.color ? ` - ${r.color}` : '';
                const matKey = `${r.material}${colorLabel}`;
                materialLengths[matKey] = (materialLengths[matKey] || 0) + length;
            }
        }
    });

    const materialsContainer = document.getElementById('protoPreviewMaterials');
    materialsContainer.innerHTML = '';
    
    if (Object.keys(materialLengths).length === 0) {
        materialsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">No materials calculated.</div>';
    } else {
        for (const [material, totalLength] of Object.entries(materialLengths)) {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.padding = '12px 16px';
            row.style.background = 'var(--bg-subtle)';
            row.style.borderRadius = 'var(--btn-radius)';
            row.style.border = '1px solid var(--border)';
            
            row.innerHTML = `
                <span style="font-weight: 700; color: var(--text-main);">${material}</span>
                <span style="font-weight: 800; color: var(--brand);">${totalLength} mm</span>
            `;
            materialsContainer.appendChild(row);
        }
    }

    const requestsContainer = document.getElementById('protoPreviewRequests');
    requestsContainer.innerHTML = '';

    if (requests.length === 0) {
        requestsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">No requests found.</div>';
    } else {
        requests.forEach(r => {
            const reqName = r.name || 'Unnamed';
            const reqQty = r.quantity || 0;
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.padding = '12px 16px';
            row.style.background = 'var(--bg-subtle)';
            row.style.borderRadius = 'var(--btn-radius)';
            row.style.border = '1px solid var(--border)';
            
            row.innerHTML = `
                <span style="font-weight: 700; color: var(--text-main);">${reqName}</span>
                <span style="font-weight: 800; color: var(--brand);">${reqQty} pc(s)</span>
            `;
            requestsContainer.appendChild(row);
        });
    }
}

function confirmPrototypeSelection() {
    if (!pendingSelection) return;
    
    const { shisakudb_id, shisakuNo, requests } = pendingSelection;
    
    state.requests = requests;
    state.currentPrototype = shisakuNo;
    state.currentPrototypeId = shisakudb_id;
    
    localStorage.setItem('shisaku_tablet_prototype', shisakuNo);
    localStorage.setItem('shisaku_tablet_prototype_id', shisakudb_id);
    
    updateTabLocks();
    renderRequests();
    showRequestView('requests');
    switchMainTab(2); // Jump to Request tab
}

// Keep fetchRequests for initialization when already locked (page refresh)
async function fetchRequests(shisakudb_id, shisakuNo) {
    try {
        const response = await fetch(`${serverURL}/api/shisaku-request/list?shisakudb_id=${shisakudb_id}&sortColumn=orderNumber&sortDirection=1&limit=1000`);
        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json();

        state.requests = data.rows;
        state.currentPrototype = shisakuNo;
        state.currentPrototypeId = shisakudb_id;
        
        updateTabLocks();
        renderRequests();
        
        // Restore request view state if available
        const savedReqId = sessionStorage.getItem('shisaku_tablet_current_request_id');
        if (savedReqId) {
            const req = state.requests.find(r => (r._id?.$oid || r._id) === savedReqId);
            if (req) {
                showRequestDetails(req);
                return;
            }
        }
        
        showRequestView('requests');
    } catch (error) {
        console.error(error);
        alert('Error loading requests.');
    }
}

function renderPrototypes() {
    const grid = document.getElementById('prototypesGrid');
    grid.innerHTML = '';
    
    // We already fetched by currentPrototypeStatus, so state.prototypes is the filtered list.
    // If locked to a prototype, ONLY show that prototype.
    const filtered = state.currentPrototype 
        ? state.prototypes.filter(p => p.shisakuNo === state.currentPrototype) 
        : state.prototypes;
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">No prototypes found for this status.</div>';
        return;
    }

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => {
            if (state.currentPrototype) {
                // If already locked, just jump straight to requests
                switchMainTab(2);
            } else {
                // If not locked, show detailed preview first
                previewPrototype(p.shisakudb_id, p.shisakuNo);
            }
        };

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

        const reqStatus = r.status || 'pending';
        row.innerHTML = `
            <div class="row-number">#${r.orderNumber || '?'}</div>
            <div class="row-info">
                <div style="margin-bottom: 4px; display: flex; align-items: center;">
                    <strong>${r.name || 'Unnamed Request'}</strong>
                    <span class="status-badge ${reqStatus}">${reqStatus}</span>
                </div>
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
    const idStr = request._id?.$oid || request._id;
    if (idStr) {
        sessionStorage.setItem('shisaku_tablet_current_request_id', idStr);
    }
    
    const startBtn = document.getElementById('startRequestBtn');
    if (startBtn) {
        startBtn.textContent = `Start request #${request.orderNumber || '?'}`;
    }

    const grid = document.getElementById('detailsGrid');
    grid.innerHTML = `
        <div class="detail-item">
            <label>Prototype Number</label>
            <span>${state.currentPrototype || '-'}</span>
        </div>
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
        <div class="detail-item">
            <label>Pc/Cycle</label>
            <span>${request.pcPerCycle || '-'}</span>
        </div>
        <div class="detail-item">
            <label>Times</label>
            <span>${Math.ceil((parseInt(request.quantity) || 0) / (parseInt(request.pcPerCycle) || 1))}</span>
        </div>
    `;

    const imgEl = document.getElementById('detailsImage');
    const jpgLink = request.pdf?.jpgLink || request.jpgLink;
    const parsedImgUrl = parseImageUrl(jpgLink);
    const pdfLink = request.pdf?.link;

    if (parsedImgUrl || pdfLink) {
        if (parsedImgUrl) {
            imgEl.src = parsedImgUrl;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
        
        imgEl.onclick = () => {
            if (typeof window.openPreview === 'function') {
                if (pdfLink) {
                    let rawPdfUrl = parseImageUrl(pdfLink) || pdfLink;
                    window.openPreview(parsedImgUrl, '', 'pdf', rawPdfUrl);
                } else {
                    window.openPreview(parsedImgUrl, '', 'image');
                }
            }
        };
    } else {
        imgEl.style.display = 'none';
        imgEl.onclick = null;
        imgEl.src = '';
    }

    showRequestView('details');
    
    // Refresh Data/Images tabs if they happen to be currently open (e.g. after reload)
    if (typeof refreshDataTab === 'function') refreshDataTab();
}

async function sendToMachine() {
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

    // 1. Get machine name from URL
    const urlParams = new URLSearchParams(window.location.search);
    const machineName = urlParams.get('machine');
    if (!machineName) {
        console.error("No machine parameter found in URL");
        alert("Machine name not found in URL.");
        return;
    }

    // 2. Fetch IP address from Google Sheets
    const ipURL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';
    let ipAddress = null;
    try {
        const ipResponse = await fetch(`${ipURL}?filter=${encodeURIComponent(machineName)}`);
        if (!ipResponse.ok) throw new Error(`Failed to fetch IP for ${machineName}`);
        
        ipAddress = await ipResponse.text();
        ipAddress = ipAddress.trim();
        
        if (!ipAddress || ipAddress.includes('Error')) {
            throw new Error(`Invalid IP retrieved: ${ipAddress}`);
        }
    } catch (e) {
        console.error("IP Fetch Error:", e);
        alert(`Failed to get IP address for machine ${machineName}.`);
        return;
    }

    // 3. Get PCE filename from current request
    if (!state.currentRequest) {
        alert("No request is currently active.");
        return;
    }
    
    let pceName = state.currentRequest?.pce?.name || state.currentRequest?.name;
    if (!pceName) {
        console.error("No PCE filename found in current request");
        alert("Could not determine PCE filename for this request.");
        return;
    }

    // Strip .pce if present so we can reliably append it later
    if (pceName.toLowerCase().endsWith('.pce')) {
        pceName = pceName.slice(0, -4);
    }

    // 4. Dispatch the request to the machine
    const sendURL = `http://${ipAddress}:5000/request?filename=${encodeURIComponent(pceName)}.pce&mode=shisaku`;
    console.log(`📤 Sending to machine: ${sendURL}`);

    try {
        await fetch(sendURL, { method: 'GET', mode: 'no-cors' });
    } catch (error) {
        console.error("Failed to send to machine in background, using fallback tab:", error);
        const newTab = window.open(sendURL, '_blank');
        setTimeout(() => {
            if (newTab) newTab.close();
        }, 3000);
    }
}

async function startRequest() {
    if (!state.currentRequest) return;
    
    // Change status from pending to in-progress
    try {
        const id = state.currentRequest._id?.$oid || state.currentRequest._id;
        if (id) {
            const reqStatus = state.currentRequest.status || 'pending';
            if (reqStatus === 'pending') {
                const response = await fetch(`${serverURL}/api/shisaku-request/update/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'in-progress' })
                });
                
                if (response.ok) {
                    state.currentRequest.status = 'in-progress';
                    // Update in the local list so the badge changes
                    const index = state.requests.findIndex(r => (r._id?.$oid || r._id) === id);
                    if (index !== -1) {
                        state.requests[index].status = 'in-progress';
                        renderRequests();
                    }
                    
                    // Also update the parent prototype to in-progress if it's currently pending
                    if (state.currentPrototypeStatus === 'pending' && state.currentPrototypeId) {
                        try {
                            const protoResponse = await fetch(`${serverURL}/api/shisaku/update-status/${state.currentPrototypeId}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'in-progress' })
                            });
                            if (protoResponse.ok) {
                                state.currentPrototypeStatus = 'in-progress';
                            }
                        } catch (pe) {
                            console.error('Failed to update prototype status:', pe);
                        }
                    }
                } else {
                    console.error('Failed to update status to in-progress');
                }
            }
        }
    } catch (e) {
        console.error('Error starting request:', e);
    }

    // Navigate to Data tab
    const tabs = document.querySelectorAll('#mainTabBar .tab-btn');
    if (tabs[3] && !tabs[3].classList.contains('locked')) {
        switchMainTab(3);
    }
}

// -----------------------------------------------------
// Image Preview Modal
// -----------------------------------------------------

function setViewportZoomable(zoomable) {
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        if (zoomable) {
            metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
        } else {
            metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
    }
}

let imgPreviewScale = 1;
let imgPreviewTranslateX = 0;
let imgPreviewTranslateY = 0;

function updateImgPreviewTransform() {
    const img = document.getElementById('imgPreviewTarget');
    if (img) {
        img.style.transform = `translate(${imgPreviewTranslateX}px, ${imgPreviewTranslateY}px) scale(${imgPreviewScale})`;
    }
}

function openPreview(src, titleText = '', type = 'image', originalLink = '') {
    if (!src) return;
    const m = document.getElementById('imgPreviewModal');
    const img = document.getElementById('imgPreviewTarget');
    const extBtn = document.getElementById('imgPreviewOpenExt');
    if (!m) return;
    
    if (extBtn) {
        if (originalLink) {
            extBtn.style.display = 'flex';
            extBtn.href = originalLink;
        } else {
            extBtn.style.display = 'none';
        }
    }
    
    if (img) {
        img.style.display = 'block';
        img.src = src;
        
        // Reset zoom and pan
        imgPreviewScale = 1;
        imgPreviewTranslateX = 0;
        imgPreviewTranslateY = 0;
        updateImgPreviewTransform();
    }
    
    let titleEl = document.getElementById('imgPreviewTitle');
    if (!titleEl) {
        titleEl = document.createElement('div');
        titleEl.id = 'imgPreviewTitle';
        titleEl.style.cssText = 'position:absolute; top:10%; left:50%; transform:translateX(-50%); color:var(--text-main, #333); font-size:1.5rem; font-weight:700; background: var(--bg-surface, #fff); padding: 10px 24px; border-radius: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); pointer-events:none; z-index: 100010; white-space:nowrap; border: 1px solid var(--border, #eee); font-family: inherit;';
        m.appendChild(titleEl);
    }
    
    if (titleText) {
        titleEl.textContent = titleText;
        titleEl.style.display = 'block';
    } else {
        titleEl.style.display = 'none';
    }

    m.classList.add('open');
}
window.openPreview = openPreview;

function bindPreviewClose() {
    const m = document.getElementById('imgPreviewModal');
    const close = document.getElementById('imgPreviewClose');

    const closeModal = () => {
        m.classList.remove('open');
        setViewportZoomable(false); // Always reset to no zoom when closed
    };

    if (close) close.addEventListener('click', closeModal);
    if (m) m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
}

function bindPreviewZoomAndPan() {
    const img = document.getElementById('imgPreviewTarget');
    if (!img) return;

    let isPointerDown = false;
    let pointers = [];
    let lastPanPosition = { x: 0, y: 0 };
    let lastDistance = 0;

    img.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isPointerDown = true;
        pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
        if (pointers.length === 1) {
            lastPanPosition = { x: e.clientX, y: e.clientY };
        } else if (pointers.length === 2) {
            lastDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        }
        img.setPointerCapture(e.pointerId);
    });

    img.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        
        const pointer = pointers.find(p => p.id === e.pointerId);
        if (pointer) {
            pointer.x = e.clientX;
            pointer.y = e.clientY;
        }

        if (pointers.length === 1) {
            // Pan
            const dx = e.clientX - lastPanPosition.x;
            const dy = e.clientY - lastPanPosition.y;
            imgPreviewTranslateX += dx;
            imgPreviewTranslateY += dy;
            lastPanPosition = { x: e.clientX, y: e.clientY };
            updateImgPreviewTransform();
        } else if (pointers.length === 2) {
            // Zoom
            const currentDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
            if (lastDistance > 0) {
                const distanceDelta = currentDistance - lastDistance;
                const zoomDelta = distanceDelta * 0.01;
                imgPreviewScale += zoomDelta;
                if (imgPreviewScale < 0.5) imgPreviewScale = 0.5;
                if (imgPreviewScale > 5) imgPreviewScale = 5;
                updateImgPreviewTransform();
            }
            lastDistance = currentDistance;
        }
    });

    const pointerUp = (e) => {
        pointers = pointers.filter(p => p.id !== e.pointerId);
        if (pointers.length === 0) {
            isPointerDown = false;
        } else if (pointers.length === 1) {
            lastPanPosition = { x: pointers[0].x, y: pointers[0].y };
        }
    };

    img.addEventListener('pointerup', pointerUp);
    img.addEventListener('pointercancel', pointerUp);
    img.addEventListener('pointerout', pointerUp);

    // Mouse wheel zoom
    img.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        imgPreviewScale += zoomDelta;
        if (imgPreviewScale < 0.5) imgPreviewScale = 0.5;
        if (imgPreviewScale > 5) imgPreviewScale = 5;
        updateImgPreviewTransform();
    });
}

// -----------------------------------------------------
// Initialization
// -----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    parseParams();
    setupMainTabs();
    setupSubTabs();
    initWorker();
    bindPreviewClose();
    bindPreviewZoomAndPan();
    fetchWorkersFromMongoDB(); // Fetch names immediately

    // If we have a locked prototype on load, fetch its requests
    if (state.currentPrototypeId && state.currentPrototype) {
        fetchRequests(state.currentPrototypeId, state.currentPrototype);
    } else {
        showRequestView('placeholder');
    }

    // Restore previously active tab from sessionStorage if it is unlocked
    const savedTab = sessionStorage.getItem('shisaku_tablet_main_tab');
    if (savedTab !== null) {
        const tabIndex = parseInt(savedTab, 10);
        const tabs = document.querySelectorAll('#mainTabBar .tab-btn');
        if (tabs[tabIndex] && !tabs[tabIndex].classList.contains('locked')) {
            switchMainTab(tabIndex);
        }
    }
});
const DATA_DB_NAME = 'ShisakuTabletDB';
const DATA_DB_VERSION = 1;
let dataDbPromise = null;

function getDB() {
    if (!dataDbPromise) {
        dataDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DATA_DB_NAME, DATA_DB_VERSION);
            request.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('photos')) {
                    db.createObjectStore('photos', { keyPath: 'id' });
                }
            };
            request.onsuccess = e => resolve(e.target.result);
            request.onerror = e => reject(e.target.error);
        });
    }
    return dataDbPromise;
}

async function savePhotoToDB(id, reqId, type, base64) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        store.put({ id, reqId, type, base64, timestamp: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e.target.error);
    });
}

async function getPhotosFromDB(reqId) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readonly');
        const store = tx.objectStore('photos');
        const req = store.getAll();
        req.onsuccess = e => {
            const all = e.target.result;
            resolve(all.filter(p => p.reqId === reqId).sort((a,b) => b.timestamp - a.timestamp));
        };
        req.onerror = e => reject(e.target.error);
    });
}

let cycleTimerInterval = null;
let cycleTimerSeconds = 0;

function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function startCycleTimer() {
    const reqId = state.currentRequest?._id?.$oid || state.currentRequest?._id;
    if (!reqId) { alert("Select a request first"); return; }
    
    const modal = document.getElementById('timerModal');
    const display = document.getElementById('fullScreenTimerDisplay');
    modal.classList.add('open');
    
    cycleTimerSeconds = parseInt(localStorage.getItem(`cycleTimer_${reqId}`)) || 0;
    display.textContent = formatTime(cycleTimerSeconds);
    
    cycleTimerInterval = setInterval(() => {
        cycleTimerSeconds++;
        display.textContent = formatTime(cycleTimerSeconds);
        localStorage.setItem(`cycleTimer_${reqId}`, cycleTimerSeconds);
    }, 1000);
}

function stopCycleTimer() {
    clearInterval(cycleTimerInterval);
    document.getElementById('timerModal').classList.remove('open');
    refreshDataTab();
}

function savePiecesCreated() {
    const reqId = state.currentRequest?._id?.$oid || state.currentRequest?._id;
    if (!reqId) return;
    const val = document.getElementById('inputPiecesCreated').value;
    localStorage.setItem(`piecesCreated_${reqId}`, val);
}

async function refreshDataTab() {
    const reqId = state.currentRequest?._id?.$oid || state.currentRequest?._id;
    const dataPlaceholder = document.getElementById('dataPlaceholder');
    const viewData = document.getElementById('view-data');
    const imagesPlaceholder = document.getElementById('imagesPlaceholder');
    const viewImages = document.getElementById('view-images');

    if (!reqId) {
        if(dataPlaceholder) dataPlaceholder.style.display = 'block';
        if(viewData) viewData.style.display = 'none';
        if(imagesPlaceholder) imagesPlaceholder.style.display = 'block';
        if(viewImages) viewImages.style.display = 'none';
        return;
    }
    
    if(dataPlaceholder) dataPlaceholder.style.display = 'none';
    if(viewData) viewData.style.display = 'block';
    if(imagesPlaceholder) imagesPlaceholder.style.display = 'none';
    if(viewImages) viewImages.style.display = 'block';

    // Restore cycle time
    const savedTime = parseInt(localStorage.getItem(`cycleTimer_${reqId}`)) || 0;
    document.getElementById('cycleTimeDisplay').textContent = formatTime(savedTime);

    // Restore pieces
    document.getElementById('inputPiecesCreated').value = localStorage.getItem(`piecesCreated_${reqId}`) || '';

    // Load images
    const photos = await getPhotosFromDB(reqId);
    
    // Reset thumbnails
    ['MaterialSide', 'ReleasePaper', 'MaterialLabel'].forEach(type => {
        const p = photos.find(x => x.type === type);
        const thumb = document.getElementById(`thumb${type}`);
        const btn = thumb.previousElementSibling;
        if (p) {
            thumb.src = p.base64;
            thumb.classList.remove('hidden');
            btn.classList.add('has-photo');
            btn.querySelector('span').textContent = '📷 Retake';
        } else {
            thumb.src = '';
            thumb.classList.add('hidden');
            btn.classList.remove('has-photo');
            btn.querySelector('span').textContent = '📷 Take Photo';
        }
    });

    const others = photos.filter(x => x.type === 'Other');
    const container = document.getElementById('otherPhotosContainer');
    container.innerHTML = '';
    others.forEach(p => {
        const img = document.createElement('img');
        img.src = p.base64;
        img.className = 'photo-thumb';
        img.onclick = () => openPreview(p.base64, 'Other / Problem');
        container.appendChild(img);
    });

    // Populate images tab
    const grid = document.getElementById('imagesGridContainer');
    grid.innerHTML = '';
    photos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.innerHTML = `
            <img src="${p.base64}" onclick="openPreview(this.src, '${p.type}')" style="cursor: pointer;">
            <div class="img-title">${p.type}</div>
        `;
        grid.appendChild(card);
    });
}

// Intercept tab switching to refresh data
const originalSwitchMainTab = switchMainTab;
window.switchMainTab = function(index) {
    originalSwitchMainTab(index);
    if (index === 2 || index === 3) {
        refreshDataTab();
    }
};

// Annotator State
let annotatorState = {
    drawing: false,
    ctx: null,
    base64: null,
    type: null,
    pointerId: null
};

function setupPhotoInput(inputId, type) {
    const input = document.getElementById(inputId);
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            openAnnotator(ev.target.result, type);
        };
        reader.readAsDataURL(file);
    });
}

function initPhotoInputs() {
    setupPhotoInput('fileMaterialSide', 'MaterialSide');
    setupPhotoInput('fileReleasePaper', 'ReleasePaper');
    setupPhotoInput('fileMaterialLabel', 'MaterialLabel');
    setupPhotoInput('fileOtherPhotos', 'Other');
}

function openAnnotator(base64Image, type) {
    annotatorState.type = type;
    annotatorState.base64 = base64Image;
    
    const overlay = document.getElementById('annotatorOverlay');
    const bgCanvas = overlay.querySelector('.annotator-bg-canvas');
    const drawCanvas = overlay.querySelector('.annotator-draw-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    const drawCtx = drawCanvas.getContext('2d');
    annotatorState.ctx = drawCtx;
    
    const img = new Image();
    img.onload = () => {
        // limit size for performance
        let w = img.width, h = img.height;
        const max = 1200;
        if (w > max || h > max) {
            const ratio = Math.min(max/w, max/h);
            w *= ratio; h *= ratio;
        }
        
        bgCanvas.width = w; bgCanvas.height = h;
        drawCanvas.width = w; drawCanvas.height = h;
        
        bgCtx.drawImage(img, 0, 0, w, h);
        
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.strokeStyle = 'red';
        drawCtx.lineWidth = Math.max(3, w * 0.005);
        
        overlay.classList.remove('hidden');
    };
    img.src = base64Image;
}

function closeAnnotator() {
    document.getElementById('annotatorOverlay').classList.add('hidden');
    const drawCtx = annotatorState.ctx;
    if (drawCtx) drawCtx.clearRect(0, 0, drawCtx.canvas.width, drawCtx.canvas.height);
}

function clearAnnotator() {
    const drawCtx = annotatorState.ctx;
    if (drawCtx) drawCtx.clearRect(0, 0, drawCtx.canvas.width, drawCtx.canvas.height);
}

async function saveAnnotator() {
    const reqId = state.currentRequest?._id?.$oid || state.currentRequest?._id;
    if (!reqId) return;

    const overlay = document.getElementById('annotatorOverlay');
    const bgCanvas = overlay.querySelector('.annotator-bg-canvas');
    const drawCanvas = overlay.querySelector('.annotator-draw-canvas');
    
    // Merge
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bgCanvas.width;
    tempCanvas.height = bgCanvas.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(bgCanvas, 0, 0);
    tCtx.drawImage(drawCanvas, 0, 0);
    
    const finalB64 = tempCanvas.toDataURL('image/jpeg', 0.8);
    
    const id = annotatorState.type === 'Other' 
        ? `${reqId}_Other_${Date.now()}` 
        : `${reqId}_${annotatorState.type}`;
        
    await savePhotoToDB(id, reqId, annotatorState.type, finalB64);
    closeAnnotator();
    refreshDataTab();
}

// Drawing events
document.addEventListener('DOMContentLoaded', () => {
    initPhotoInputs();
    
    const drawCanvas = document.querySelector('.annotator-draw-canvas');
    if (!drawCanvas) return;
    
    function getPos(e) {
        const rect = drawCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = drawCanvas.width / rect.width;
        const scaleY = drawCanvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }
    
    const startDraw = (e) => {
        e.preventDefault();
        annotatorState.drawing = true;
        annotatorState.pointerId = e.pointerId;
        const pos = getPos(e);
        annotatorState.ctx.beginPath();
        annotatorState.ctx.moveTo(pos.x, pos.y);
    };
    
    const moveDraw = (e) => {
        if (!annotatorState.drawing || (e.pointerId && e.pointerId !== annotatorState.pointerId)) return;
        e.preventDefault();
        const pos = getPos(e);
        annotatorState.ctx.lineTo(pos.x, pos.y);
        annotatorState.ctx.stroke();
    };
    
    const endDraw = (e) => {
        annotatorState.drawing = false;
        annotatorState.pointerId = null;
    };
    
    drawCanvas.addEventListener('pointerdown', startDraw);
    drawCanvas.addEventListener('pointermove', moveDraw);
    window.addEventListener('pointerup', endDraw);
    window.addEventListener('pointercancel', endDraw);
});
