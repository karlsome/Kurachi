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

function resetAll() {
    if (!confirm("Are you sure you want to reset all selections? This will clear the locked prototype.")) return;
    
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
        mainTabs[3].classList.remove('locked');
        mainTabs[4].classList.remove('locked');
        mainTabs[5].classList.remove('locked');

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
            const req = state.requests.find(r => r._id?.$oid === savedReqId);
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
    if (request._id && request._id.$oid) {
        sessionStorage.setItem('shisaku_tablet_current_request_id', request._id.$oid);
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
        titleEl.style.cssText = 'position:absolute; top:15%; left:50%; transform:translateX(-50%); color:#fff; font-size:3rem; font-weight:900; text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 4px 12px rgba(0,0,0,0.9); background: rgba(0,0,0,0.5); padding: 12px 32px; border-radius: 16px; pointer-events:none; z-index: 100010; white-space:nowrap; letter-spacing:3px; border: 3px solid rgba(255,255,255,0.3);';
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
