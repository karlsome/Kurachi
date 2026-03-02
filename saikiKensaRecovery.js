const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// Recovery System Backend
let allWorkers = [];
let recentWorkers = [];
let allSebanggo = [];
let recentSebanggo = [];
let selectedDefectType = null;
let recoveryList = [];
let selectedPressMatch = null;
let lookupDebounceTimer = null;
let lastLookupKey = '';
let lastLookupSource = '';

// Get filter parameter from URL
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
const selectedFactory = getQueryParam('filter') || '小瀬';
const PAGE_PREFIX = `${location.pathname.split('/').pop()}_${selectedFactory}_`;

// ========== PERSISTENCE HELPERS ==========

function saveFieldsToStorage() {
    ['sub-dropdown-input', 'process', 'Machine Operator', '製造ロット'].forEach(id => {
        const el = document.getElementById(id);
        if (el) localStorage.setItem(PAGE_PREFIX + id, el.value);
    });
}

function saveListToStorage() {
    localStorage.setItem(PAGE_PREFIX + '_recoveryList', JSON.stringify(recoveryList));
    localStorage.setItem(PAGE_PREFIX + '_selectedPressMatch', JSON.stringify(selectedPressMatch));
    localStorage.setItem(PAGE_PREFIX + '_selectedDefectType', selectedDefectType || '');
}

function clearStorage() {
    Object.keys(localStorage)
        .filter(k => k.startsWith(PAGE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
}

function restoreFromStorage() {
    // Restore simple fields
    ['sub-dropdown-input', 'process', 'Machine Operator', '製造ロット'].forEach(id => {
        const val = localStorage.getItem(PAGE_PREFIX + id);
        const el = document.getElementById(id);
        if (val && el) el.value = val;
    });

    // Restore selectedPressMatch
    try {
        const pm = localStorage.getItem(PAGE_PREFIX + '_selectedPressMatch');
        if (pm) selectedPressMatch = JSON.parse(pm);
    } catch(e) {}

    // Restore selectedDefectType
    const sdt = localStorage.getItem(PAGE_PREFIX + '_selectedDefectType');
    if (sdt) {
        selectedDefectType = sdt;
        document.querySelectorAll('.recovery-defect-btn').forEach(b => {
            b.classList.toggle('selected', b.dataset.defect === sdt);
        });
        updateDefectLimit();
    }

    // Restore press lookup status
    if (selectedPressMatch) {
        const sourceLabel = (lastLookupSource === 'exact') ? '完全一致' : '±2日候補';
        const dateText = selectedPressMatch.Date || selectedPressMatch['製造ロット'] || '-';
        const defects = [
            `疵引不良: ${selectedPressMatch['疵引不良'] ?? '-'}`,
            `加工不良: ${selectedPressMatch['加工不良'] ?? '-'}`,
            `その他: ${selectedPressMatch['その他'] ?? '-'}`
        ].join('　｜　');
        updatePressLookupStatus(`pressDB ${sourceLabel}を選択済み: ${dateText}　｜　${defects}`, 'success');
    }

    // Restore recovery list
    try {
        const list = localStorage.getItem(PAGE_PREFIX + '_recoveryList');
        if (list) {
            recoveryList = JSON.parse(list);
            displayRecoveryList();
        }
    } catch(e) {}
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async function() {
    // Set factory value
    document.getElementById('selected工場').value = selectedFactory;
    document.getElementById('factory').value = selectedFactory;
    
    // Load worker data
    await loadWorkerData();
    
    // Load sebanggo data
    await loadSebanggoData();
    
    // Setup worker selection modal
    setupWorkerSelection();
    
    // Setup sebanggo selection modal
    setupSebanggoSelection();
    
    // Setup recovery form
    setupRecoveryForm();
    
    // Setup form submission
    document.querySelector('form').addEventListener('submit', submitRecovery);

    // Restore persisted data
    restoreFromStorage();
});

// ========== WORKER MANAGEMENT ==========

async function loadWorkerData() {
    try {
        const response = await fetch(`${serverURL}/getWorkerNames?selectedFactory=${encodeURIComponent(selectedFactory)}`);
        if (!response.ok) throw new Error("Failed to fetch worker names");
        const data = await response.json();
        allWorkers = data.sort((a, b) => a.localeCompare(b));
        recentWorkers = JSON.parse(localStorage.getItem('recentWorkers')) || [];
    } catch (error) {
        console.error('Error loading workers:', error);
        allWorkers = [];
    }
}

function setupWorkerSelection() {
    const workerInput = document.getElementById('Machine Operator');
    const closeBtn = document.getElementById('closeWorkerModal');
    const manualBtn = document.getElementById('manualEntryBtn');

    // Open modal when clicking on worker input
    workerInput.addEventListener('click', (e) => {
        if (workerInput.readOnly && allWorkers.length > 0) {
            e.preventDefault();
            openWorkerModal();
        }
    });

    // Open modal when focusing on worker input
    workerInput.addEventListener('focus', (e) => {
        if (workerInput.readOnly && allWorkers.length > 0) {
            e.preventDefault();
            openWorkerModal();
        }
    });

    // Prevent keyboard from showing on touch devices
    workerInput.addEventListener('touchstart', (e) => {
        if (workerInput.readOnly && allWorkers.length > 0) {
            e.preventDefault();
            openWorkerModal();
        }
    });

    closeBtn.addEventListener('click', () => {
        closeWorkerModal();
    });

    manualBtn.addEventListener('click', () => {
        const name = prompt('作業者名を入力してください / Enter worker name:');
        if (name && name.trim()) {
            selectWorker(name.trim());
            closeWorkerModal();
        }
    });
}

function openWorkerModal() {
    const modal = document.getElementById('workerNameModal');
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    document.body.style.overflow = 'hidden';
    renderWorkerModal();
}

function closeWorkerModal() {
    const modal = document.getElementById('workerNameModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function renderWorkerModal() {
    const container = document.getElementById('workerNamesContainer');
    container.innerHTML = '';

    // Recent workers
    if (recentWorkers.length > 0) {
        const recentSection = document.createElement('div');
        recentSection.className = 'worker-section recent-section';
        
        const header = document.createElement('div');
        header.className = 'worker-section-header';
        header.textContent = '最近 / Recent';
        recentSection.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'worker-names-grid';

        recentWorkers.forEach(name => {
            const wrapper = document.createElement('div');
            const btn = document.createElement('button');
            btn.className = 'worker-name-btn';
            btn.type = 'button';
            btn.textContent = name;
            btn.onclick = () => {
                selectWorker(name);
            };
            wrapper.appendChild(btn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-recent-btn';
            deleteBtn.type = 'button';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                recentWorkers = recentWorkers.filter(w => w !== name);
                localStorage.setItem('recentWorkers', JSON.stringify(recentWorkers));
                renderWorkerModal();
            };
            wrapper.style.position = 'relative';
            wrapper.appendChild(deleteBtn);
            grid.appendChild(wrapper);
        });

        recentSection.appendChild(grid);
        container.appendChild(recentSection);
    }

    // All workers
    const allSection = document.createElement('div');
    allSection.className = 'worker-section';
    
    const header = document.createElement('div');
    header.className = 'worker-section-header';
    header.textContent = '全て / All Workers';
    allSection.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'worker-names-grid';

    allWorkers.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'worker-name-btn';
        btn.type = 'button';
        btn.textContent = name;
        btn.onclick = () => {
            selectWorker(name);
        };
        grid.appendChild(btn);
    });

    allSection.appendChild(grid);
    container.appendChild(allSection);
}

function selectWorker(name) {
    const input = document.getElementById('Machine Operator');
    input.value = name;
    
    // Add to recent
    recentWorkers = recentWorkers.filter(w => w !== name);
    recentWorkers.unshift(name);
    recentWorkers = recentWorkers.slice(0, 10);
    localStorage.setItem('recentWorkers', JSON.stringify(recentWorkers));
    
    // Save to localStorage
    localStorage.setItem(PAGE_PREFIX + (input.id || input.name), name);
    
    // Close modal
    closeWorkerModal();
    
    // Trigger change event
    input.dispatchEvent(new Event('change'));
}

// ========== SEBANGGO/品番 MANAGEMENT ==========

async function loadSebanggoData() {
    try {
        const response = await fetch(`${serverURL}/getSeBanggoListPressAndHinban?all=true`);
        const data = await response.json();
        
        // Extract 背番号 and 品番 from the response
        const sebanggoList = data.map(item => item.背番号).filter(Boolean);
        const hinbanList = data.map(item => item.品番).filter(Boolean);
        
        // Sort both lists
        sebanggoList.sort((a, b) => a.localeCompare(b));
        hinbanList.sort((a, b) => a.localeCompare(b));
        
        // Combine into one list
        allSebanggo = [...sebanggoList, ...hinbanList];
        recentSebanggo = JSON.parse(localStorage.getItem('recentSebanggo')) || [];
    } catch (error) {
        console.error('Error loading sebanggo:', error);
        allSebanggo = [];
    }
}

function setupSebanggoSelection() {
    const input = document.getElementById('sub-dropdown-input');
    const scanBtn = document.getElementById('scan-button');
    const modal = document.getElementById('sebanggoModal');
    const closeBtn = document.getElementById('close-sebanggo-modal');
    const searchInput = document.getElementById('sebanggo-search');

    input.addEventListener('click', () => {
        renderSebanggoModal();
        modal.style.display = 'block';
    });

    scanBtn.addEventListener('click', scanBarcode);

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    searchInput.addEventListener('input', filterSebanggo);

    // Clear recent
    document.getElementById('clear-recent-sebanggo')?.addEventListener('click', () => {
        recentSebanggo = [];
        localStorage.setItem('recentSebanggo', JSON.stringify(recentSebanggo));
        renderSebanggoModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

function renderSebanggoModal() {
    const allGrid = document.getElementById('all-sebanggo-grid');
    const recentSection = document.getElementById('recent-sebanggo-section');
    const recentGrid = document.getElementById('recent-sebanggo-grid');

    // Render all sebanggo
    allGrid.innerHTML = '';
    allSebanggo.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'sebanggo-btn';
        btn.type = 'button';
        btn.textContent = item;
        btn.onclick = () => selectSebanggo(item);
        allGrid.appendChild(btn);
    });

    // Render recent
    if (recentSebanggo.length > 0) {
        recentSection.style.display = 'block';
        recentGrid.innerHTML = '';
        recentSebanggo.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'sebanggo-btn';
            btn.type = 'button';
            btn.textContent = item;
            btn.onclick = () => selectSebanggo(item);
            recentGrid.appendChild(btn);
        });
    } else {
        recentSection.style.display = 'none';
    }
}

function selectSebanggo(item) {
    document.getElementById('sub-dropdown-input').value = item;
    document.getElementById('sub-dropdown-input').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('sebanggoModal').style.display = 'none';
    
    // Add to recent
    recentSebanggo = recentSebanggo.filter(s => s !== item);
    recentSebanggo.unshift(item);
    recentSebanggo = recentSebanggo.slice(0, 10);
    localStorage.setItem('recentSebanggo', JSON.stringify(recentSebanggo));
}

function filterSebanggo(e) {
    const query = e.target.value.toLowerCase();
    const allGrid = document.getElementById('all-sebanggo-grid');
    const noResults = document.getElementById('no-results');
    
    allGrid.innerHTML = '';
    const filtered = allSebanggo.filter(item => item.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        noResults.style.display = 'block';
    } else {
        noResults.style.display = 'none';
        filtered.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'sebanggo-btn';
            btn.type = 'button';
            btn.textContent = item;
            btn.onclick = () => selectSebanggo(item);
            allGrid.appendChild(btn);
        });
    }
}

// ========== BARCODE SCANNING ==========

async function scanBarcode() {
    const input = document.getElementById('sub-dropdown-input');
    try {
        const html5QrCode = new Html5Qrcode("reader");
        
        const modal = document.createElement('div');
        modal.id = 'scan-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: black;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        `;
        
        const reader = document.createElement('div');
        reader.id = 'reader';
        reader.style.width = '100%';
        reader.style.height = '80%';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Cancel';
        closeBtn.style.cssText = `
            margin-top: 20px;
            padding: 15px 40px;
            background: red;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
        `;
        
        modal.appendChild(reader);
        modal.appendChild(closeBtn);
        document.body.appendChild(modal);
        
        html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
                input.value = decodedText;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                html5QrCode.stop();
                document.body.removeChild(modal);
            }
        );
        
        closeBtn.addEventListener('click', () => {
            html5QrCode.stop();
            document.body.removeChild(modal);
        });
    } catch (err) {
        console.error('Error starting QR code scanner:', err);
        alert('Camera access denied or not available');
    }
}

// ========== RECOVERY FORM LOGIC ==========

function setupRecoveryForm() {
    document.getElementById('add-recovery-btn').addEventListener('click', addToRecoveryList);

    initializePressLookupUI();

    const sebanggoInput = document.getElementById('sub-dropdown-input');
    const lotInput = document.getElementById('製造ロット');
    const processSelect = document.getElementById('process');

    ['input', 'change', 'blur'].forEach(eventType => {
        sebanggoInput.addEventListener(eventType, schedulePressLookup);
        lotInput.addEventListener(eventType, schedulePressLookup);
    });

    // Persist fields on every change
    sebanggoInput.addEventListener('input', saveFieldsToStorage);
    lotInput.addEventListener('input', saveFieldsToStorage);
    processSelect.addEventListener('change', saveFieldsToStorage);
    // Worker_Name is saved inside selectWorker() — covered
}

function initializePressLookupUI() {
    const lotInput = document.getElementById('製造ロット');
    if (!lotInput) return;

    let status = document.getElementById('press-lookup-status');
    if (!status) {
        status = document.createElement('div');
        status.id = 'press-lookup-status';
        status.style.cssText = 'margin-top: 8px; font-size: 12px; color: #555; min-height: 16px;';
        lotInput.insertAdjacentElement('afterend', status);
    }

    ensurePressLookupModal();
}

function updatePressLookupStatus(message, type = 'info') {
    const status = document.getElementById('press-lookup-status');
    if (!status) return;

    const colorMap = {
        info: '#555',
        success: '#2e7d32',
        warning: '#ef6c00',
        error: '#c62828'
    };

    status.style.color = colorMap[type] || colorMap.info;
    status.textContent = message || '';
}

function schedulePressLookup() {
    if (lookupDebounceTimer) {
        clearTimeout(lookupDebounceTimer);
    }

    lookupDebounceTimer = setTimeout(() => {
        searchPressRecordsForCurrentInput();
    }, 350);
}

function normalizeLotToIsoDate(lotValue) {
    if (!lotValue) return null;

    const trimmed = lotValue.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }

    const compact = trimmed.replace(/[\s\-\/\.]/g, '');

    if (/^\d{6}$/.test(compact)) {
        const yy = parseInt(compact.slice(0, 2), 10);
        const mm = compact.slice(2, 4);
        const dd = compact.slice(4, 6);
        const year = 2000 + yy;
        return `${year}-${mm}-${dd}`;
    }

    if (/^\d{8}$/.test(compact)) {
        const yyyy = compact.slice(0, 4);
        const mm = compact.slice(4, 6);
        const dd = compact.slice(6, 8);
        return `${yyyy}-${mm}-${dd}`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
    }

    return null;
}

async function searchPressDbExact(sebanggo, lot) {
    try {
        const response = await fetch(`${serverURL}/api/search-pressdb-exact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 背番号: sebanggo, 製造ロット: lot })
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Exact pressDB lookup failed:', error);
        return [];
    }
}

async function searchPressDbNearby(sebanggo, isoDate) {
    try {
        const response = await fetch(`${serverURL}/api/search-pressdb-nearby`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 背番号: sebanggo, date: isoDate })
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Nearby pressDB lookup failed:', error);
        return [];
    }
}

async function searchPressRecordsForCurrentInput() {
    const sebanggo = (document.getElementById('sub-dropdown-input').value || '').trim();
    const lot = (document.getElementById('製造ロット').value || '').trim();

    if (!sebanggo || !lot) {
        selectedPressMatch = null;
        lastLookupKey = '';
        lastLookupSource = '';
        updatePressLookupStatus('');
        updateDefectLimit();
        return;
    }

    const lookupKey = `${sebanggo}__${lot}`;
    if (lookupKey === lastLookupKey) {
        return;
    }

    lastLookupKey = lookupKey;
    selectedPressMatch = null;
    lastLookupSource = '';
    updateDefectLimit();

    updatePressLookupStatus('pressDBを検索中... / Searching pressDB...', 'info');

    const exactMatches = await searchPressDbExact(sebanggo, lot);
    if (exactMatches.length === 1) {
        handlePressLookupSelection(exactMatches[0], 'exact');
        return;
    }

    if (exactMatches.length > 1) {
        showPressLookupCandidates(exactMatches, 'exact');
        updatePressLookupStatus(`完全一致が${exactMatches.length}件あります。候補を選択してください。`, 'warning');
        return;
    }

    const isoDate = normalizeLotToIsoDate(lot);
    if (!isoDate) {
        updatePressLookupStatus('完全一致なし。製造ロット日付を判定できないため±2日検索は未実行です。', 'warning');
        return;
    }

    const nearbyMatches = await searchPressDbNearby(sebanggo, isoDate);
    if (nearbyMatches.length === 1) {
        handlePressLookupSelection(nearbyMatches[0], 'nearby');
        return;
    }

    if (nearbyMatches.length > 1) {
        showPressLookupCandidates(nearbyMatches, 'nearby');
        updatePressLookupStatus(`完全一致なし。±2日で${nearbyMatches.length}件見つかりました。候補を選択してください。`, 'warning');
        return;
    }

    updatePressLookupStatus('pressDBに一致データがありません（完全一致・±2日とも0件）。', 'error');
}

function toSafeString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function buildPressCandidateLabel(item) {
    const date = toSafeString(item.Date || item.製造ロット || '-');
    const hinban = toSafeString(item.品番 || '-');
    const machine = toSafeString(item.設備 || '-');
    const worker = toSafeString(item.Worker_Name || '-');
    const procQty = item.Process_Quantity !== undefined ? item.Process_Quantity : '-';
    const kizuval = item.疵引不良 !== undefined ? item.疵引不良 : '-';
    const kakoval = item.加工不良 !== undefined ? item.加工不良 : '-';
    const sonoval = item.その他 !== undefined ? item.その他 : '-';
    return [
        `Date: ${date} | 品番: ${hinban}`,
        `設備: ${machine} | Worker: ${worker} | 加工数: ${procQty}`,
        `疵引不良: ${kizuval} | 加工不良: ${kakoval} | その他: ${sonoval}`
    ].join('<br>');
}

function mapPressMatch(item, source) {
    const parseNum = (v) => (v !== undefined && v !== null && v !== '') ? parseInt(v, 10) : null;
    return {
        source,
        id: item && item._id ? (item._id.$oid || item._id.toString?.() || item._id) : null,
        背番号: toSafeString(item.背番号),
        製造ロット: toSafeString(item.製造ロット || item.Date),
        Date: toSafeString(item.Date),
        品番: toSafeString(item.品番),
        設備: toSafeString(item.設備),
        Worker_Name: toSafeString(item.Worker_Name),
        Process_Quantity: parseNum(item.Process_Quantity),
        疵引不良: parseNum(item.疵引不良),
        加工不良: parseNum(item.加工不良),
        その他: parseNum(item.その他)
    };
}

function handlePressLookupSelection(item, source) {
    selectedPressMatch = mapPressMatch(item, source);
    lastLookupSource = source;

    const sourceLabel = source === 'exact' ? '完全一致' : '±2日候補';
    const dateText = selectedPressMatch.Date || selectedPressMatch.製造ロット || '-';
    const kizu = selectedPressMatch.疵引不良 !== null ? selectedPressMatch.疵引不良 : '-';
    const kako = selectedPressMatch.加工不良 !== null ? selectedPressMatch.加工不良 : '-';
    const sono = selectedPressMatch.その他 !== null ? selectedPressMatch.その他 : '-';
    updatePressLookupStatus(
        `pressDB ${sourceLabel}を選択済み: ${dateText}　｜　疵引不良: ${kizu}  加工不良: ${kako}  その他: ${sono}`,
        'success'
    );

    closePressLookupModal();
    updateDefectLimit();
}

function updateDefectLimit() {
    const qtyInput = document.getElementById('recovery-quantity');
    if (!qtyInput) return;

    let hint = document.getElementById('quantity-limit-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'quantity-limit-hint';
        hint.style.cssText = 'margin-top:6px; font-size:12px; min-height:16px;';
        qtyInput.insertAdjacentElement('afterend', hint);
    }

    if (!selectedPressMatch || !selectedDefectType) {
        qtyInput.removeAttribute('max');
        hint.textContent = '';
        return;
    }

    const limitNum = selectedPressMatch[selectedDefectType];
    if (limitNum !== null && limitNum !== undefined && !Number.isNaN(limitNum)) {
        qtyInput.setAttribute('max', limitNum);
        const color = limitNum === 0 ? '#c62828' : '#e65100';
        hint.style.color = color;
        hint.textContent = `上限 / Max: ${limitNum}個 (pressDB ${selectedDefectType})`;
    } else {
        qtyInput.removeAttribute('max');
        hint.style.color = '#9e9e9e';
        hint.textContent = `pressDB ${selectedDefectType}: 上限データなし`;
    }
}

function ensurePressLookupModal() {
    if (document.getElementById('pressLookupModal')) return;

    const modal = document.createElement('div');
    modal.id = 'pressLookupModal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        z-index: 10001;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
    `;

    modal.innerHTML = `
        <div style="background:#fff; border-radius:10px; width:100%; max-width:640px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
            <div style="padding:14px 16px; border-bottom:1px solid #eee; font-weight:700; font-size:18px;" id="pressLookupTitle">pressDB候補</div>
            <div id="pressLookupList" style="padding:12px; overflow:auto; display:grid; gap:8px;"></div>
            <div style="display:flex; gap:10px; padding:12px; border-top:1px solid #eee;">
                <button type="button" id="pressLookupSkipBtn" style="flex:1; padding:10px; border:none; border-radius:6px; background:#9e9e9e; color:#fff; font-weight:600; cursor:pointer;">選択せず閉じる / Close</button>
                <button type="button" id="pressLookupCloseBtn" style="flex:1; padding:10px; border:none; border-radius:6px; background:#1976d2; color:#fff; font-weight:600; cursor:pointer;">閉じる / Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('pressLookupCloseBtn').addEventListener('click', closePressLookupModal);
    document.getElementById('pressLookupSkipBtn').addEventListener('click', closePressLookupModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closePressLookupModal();
        }
    });
}

function showPressLookupCandidates(candidates, source) {
    ensurePressLookupModal();

    const modal = document.getElementById('pressLookupModal');
    const title = document.getElementById('pressLookupTitle');
    const list = document.getElementById('pressLookupList');

    if (!modal || !title || !list) return;

    title.textContent = source === 'exact'
        ? `完全一致候補 (${candidates.length}件)`
        : `±2日候補 (${candidates.length}件)`;

    list.innerHTML = '';

    candidates.forEach(candidate => {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText = `
            text-align:left;
            border:1px solid #ddd;
            border-radius:8px;
            background:#fafafa;
            padding:10px;
            cursor:pointer;
            font-size:13px;
            line-height:1.5;
        `;
        button.innerHTML = `<strong>背番号: ${toSafeString(candidate.背番号 || '-')}</strong><br>${buildPressCandidateLabel(candidate)}`;
        button.style.lineHeight = '1.6';
        button.addEventListener('click', () => handlePressLookupSelection(candidate, source));
        list.appendChild(button);
    });

    modal.style.display = 'flex';
}

function closePressLookupModal() {
    const modal = document.getElementById('pressLookupModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function selectRecoveryDefect(btn) {
    // Remove selection from other buttons
    document.querySelectorAll('.recovery-defect-btn').forEach(b => {
        b.classList.remove('selected');
    });
    
    // Add selection to clicked button
    btn.classList.add('selected');
    selectedDefectType = btn.dataset.defect;
    updateDefectLimit();
}

function addToRecoveryList() {
    const sebanggo = document.getElementById('sub-dropdown-input').value;
    const table = document.getElementById('process').value;
    const worker = document.getElementById('Machine Operator').value;
    const lot = document.getElementById('製造ロット').value;
    const quantity = parseInt(document.getElementById('recovery-quantity').value);

    if (!sebanggo) {
        alert('Please select 背番号 / 品番');
        return;
    }
    if (!table) {
        alert('Please select 検査テーブル名');
        return;
    }
    if (!worker) {
        alert('Please select Worker');
        return;
    }
    if (!lot) {
        alert('Please enter 製造ロット');
        return;
    }
    if (!selectedDefectType) {
        alert('Please select a defect type');
        return;
    }
    if (!quantity || quantity <= 0) {
        alert('Please enter a valid quantity');
        return;
    }

    // Enforce pressDB defect limit
    if (selectedPressMatch && selectedDefectType) {
        const limitNum = selectedPressMatch[selectedDefectType];
        if (limitNum !== null && limitNum !== undefined && !Number.isNaN(limitNum)) {
            if (quantity > limitNum) {
                alert(`数量 (${quantity}) が pressDB の ${selectedDefectType} 上限 (${limitNum}) を超えています。\nQuantity (${quantity}) exceeds the pressDB limit for ${selectedDefectType} (${limitNum}).`);
                return;
            }
        }
    }

    // Add to recovery list
    const entry = {
        id: Date.now(),
        sebanggo,
        hinban: (selectedPressMatch && selectedPressMatch.品番) ? selectedPressMatch.品番 : '',
        table,
        worker,
        lot,
        defectType: selectedDefectType,
        quantity,
        pressMatch: selectedPressMatch,
        pressLookupSource: lastLookupSource || null
    };

    recoveryList.push(entry);
    displayRecoveryList();
    saveListToStorage();
    
    // Reset defect selection and quantity
    selectedDefectType = null;
    document.querySelectorAll('.recovery-defect-btn').forEach(b => {
        b.classList.remove('selected');
    });
    document.getElementById('recovery-quantity').value = '';
    updateDefectLimit();
}

function displayRecoveryList() {
    const container = document.getElementById('recovery-list-container');
    const count = document.getElementById('recovery-count');

    count.textContent = recoveryList.length;

    if (recoveryList.length === 0) {
        container.innerHTML = '<p class="empty-msg">リストに追加していません / No items added</p>';
        return;
    }

    let html = `
    <table class="recovery-table">
        <thead>
            <tr>
                <th>背番号</th>
                <th>品番</th>
                <th>製造ロット</th>
                <th>不良タイプ</th>
                <th>数量</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
    `;

    recoveryList.forEach((entry, index) => {
        const defectClass = entry.defectType === '疵引不良' ? 'defect-kizu'
                          : entry.defectType === '加工不良' ? 'defect-kako'
                          : 'defect-other';
        html += `
            <tr>
                <td class="col-sebanggo">${entry.sebanggo}</td>
                <td class="col-hinban">${entry.hinban || '-'}</td>
                <td class="col-lot">${entry.lot}</td>
                <td><span class="defect-badge ${defectClass}">${entry.defectType}</span></td>
                <td class="col-qty">${entry.quantity}<span style="font-size:10px;margin-left:1px;font-weight:400">個</span></td>
                <td class="col-actions">
                    <button type="button" class="recovery-edit-btn" onclick="editRecoveryItem(${index})">Edit</button>
                    <button type="button" class="recovery-delete-btn" onclick="deleteRecoveryItem(${index})">Del</button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function editRecoveryItem(index) {
    const entry = recoveryList[index];
    document.getElementById('sub-dropdown-input').value = entry.sebanggo;
    document.getElementById('process').value = entry.table;
    document.getElementById('Machine Operator').value = entry.worker;
    document.getElementById('製造ロット').value = entry.lot;
    document.getElementById('recovery-quantity').value = entry.quantity;

    selectedPressMatch = entry.pressMatch || null;
    lastLookupSource = entry.pressLookupSource || '';
    if (selectedPressMatch) {
        const sourceLabel = lastLookupSource === 'exact' ? '完全一致' : '±2日候補';
        const dateText = selectedPressMatch.Date || selectedPressMatch.製造ロット || '-';
        updatePressLookupStatus(`pressDB ${sourceLabel}を選択済み: ${dateText}`, 'success');
    } else {
        updatePressLookupStatus('');
    }
    
    // Select defect type
    selectedDefectType = entry.defectType;
    document.querySelectorAll('.recovery-defect-btn').forEach(b => {
        if (b.dataset.defect === entry.defectType) {
            b.classList.add('selected');
        } else {
            b.classList.remove('selected');
        }
    });
    
    // Remove from list
    recoveryList.splice(index, 1);
    displayRecoveryList();
    saveListToStorage();
    saveFieldsToStorage();
}

function deleteRecoveryItem(index) {
    if (confirm('Are you sure you want to delete this entry?')) {
        recoveryList.splice(index, 1);
        displayRecoveryList();
        saveListToStorage();
    }
}

function clearAllRecovery() {
    if (confirm('Clear all recovery entries? (This cannot be undone)')) {
        recoveryList = [];
        displayRecoveryList();
        clearStorage();
    }
}

// ========== FORM SUBMISSION ==========

async function submitRecovery(e) {
    e.preventDefault();

    if (recoveryList.length === 0) {
        alert('Please add at least one recovery entry');
        return;
    }

    const uploadingModal = document.getElementById('uploadingModal');
    uploadingModal.style.display = 'flex';

    try {
        // Group flat entries by 背番号 + 製造ロット to match server structure
        const grouped = {};
        for (const entry of recoveryList) {
            const key = `${entry.sebanggo}__${entry.lot}`;
            if (!grouped[key]) {
                grouped[key] = {
                    背番号: entry.sebanggo,
                    品番: entry.pressMatch ? entry.pressMatch.品番 : '',
                    製造ロット: entry.lot,
                    検査テーブル名: entry.table,
                    userId: entry.worker,
                    factory: selectedFactory,
                    timestamp: new Date().toISOString(),
                    pressMatch: entry.pressMatch || null,
                    pressDB_id: entry.pressMatch ? entry.pressMatch.id : null,
                    recoveries: []
                };
            }
            grouped[key].recoveries.push({
                defectType: entry.defectType,
                quantity: entry.quantity
            });
        }

        const payload = { recoveries: Object.values(grouped) };

        const response = await fetch(`${serverURL}/api/save-recovery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        uploadingModal.style.display = 'none';

        if (response.ok) {
            alert('Recovery data submitted successfully!');
            recoveryList = [];
            selectedPressMatch = null;
            selectedDefectType = null;
            displayRecoveryList();
            clearStorage();
            document.querySelector('form').reset();
            document.getElementById('selected工場').value = selectedFactory;
            document.getElementById('factory').value = selectedFactory;
        } else {
            alert('Error submitting recovery data: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        uploadingModal.style.display = 'none';
        console.error('Error:', error);
        alert('Error submitting recovery data: ' + error.message);
    }
}

// ========== NUMERIC KEYPAD FUNCTIONALITY ==========

window.openDirectNumericKeypad = function(inputId) {
    window.currentDirectInputId = inputId;
    const modal = document.getElementById('numericKeypadModalDirect');
    const display = document.getElementById('numericDisplayDirect');
    const currentInput = document.getElementById(inputId);

    if (modal && display && currentInput) {
        display.value = currentInput.value || '';
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';

        // Update keypad title
        const keypadTitle = modal.querySelector('h2');
        if (keypadTitle) {
            if (inputId === '製造ロット') {
                keypadTitle.textContent = '製造ロットを入力';
            } else if (inputId === 'recovery-quantity') {
                keypadTitle.textContent = '回収数量を入力';
            }
        }

        // Show/hide hyphen button based on input field
        const hyphenButton = document.getElementById('hyphenButton');
        if (hyphenButton) {
            if (inputId === '製造ロット') {
                hyphenButton.style.display = 'block';
            } else {
                hyphenButton.style.display = 'none';
            }
        }

        // Setup keyboard event handling
        window.directKeypadKeydownHandler = function(event) {
            if (modal.style.display === 'block') {
                event.preventDefault();

                if (event.key >= '0' && event.key <= '9') {
                    window.addToDirectNumericDisplay(event.key);
                } else if (event.key === 'Backspace') {
                    window.backspaceDirectNumericDisplay();
                } else if (event.key === 'Enter') {
                    window.confirmDirectNumericInput();
                } else if (event.key === 'Escape') {
                    window.closeDirectNumericKeypad();
                } else if (event.key === 'Delete' || event.key.toLowerCase() === 'c') {
                    window.clearDirectNumericDisplay();
                } else if (event.key === '-' && inputId === '製造ロット') {
                    window.addToDirectNumericDisplay('-');
                } else if (event.key === ' ') {
                    window.addToDirectNumericDisplay(' ');
                }
            }
        };

        document.addEventListener('keydown', window.directKeypadKeydownHandler);
    }
};

window.closeDirectNumericKeypad = function() {
    const modal = document.getElementById('numericKeypadModalDirect');
    if (modal) {
        modal.style.display = 'none';
        window.currentDirectInputId = null;
        document.body.style.overflow = 'auto';

        if (window.directKeypadKeydownHandler) {
            document.removeEventListener('keydown', window.directKeypadKeydownHandler);
            window.directKeypadKeydownHandler = null;
        }
    }
};

window.addToDirectNumericDisplay = function(digit) {
    const display = document.getElementById('numericDisplayDirect');
    if (display) {
        display.value += digit;
    }
};

window.backspaceDirectNumericDisplay = function() {
    const display = document.getElementById('numericDisplayDirect');
    if (display && display.value.length > 0) {
        display.value = display.value.slice(0, -1);
    }
};

window.clearDirectNumericDisplay = function() {
    const display = document.getElementById('numericDisplayDirect');
    if (display) {
        display.value = '';
    }
};

window.confirmDirectNumericInput = function() {
    if (!window.currentDirectInputId) return;

    const display = document.getElementById('numericDisplayDirect');
    const targetInput = document.getElementById(window.currentDirectInputId);

    if (display && targetInput) {
        const value = display.value;

        if (window.currentDirectInputId === '製造ロット') {
            if (value !== '' && !/^[0-9\-\s]*$/.test(value)) {
                alert('数字、ハイフン、スペースのみを入力してください');
                return;
            }
        } else if (window.currentDirectInputId === 'recovery-quantity') {
            if (value !== '') {
                const numericValue = value.replace(/\s/g, '');
                if (numericValue !== '' && (isNaN(numericValue) || parseInt(numericValue) < 0)) {
                    alert('有効な数字を入力してください');
                    return;
                }
            }
        }

        targetInput.value = value;
        const event = new Event('input', { bubbles: true });
        targetInput.dispatchEvent(event);
        window.closeDirectNumericKeypad();
    }
};

// Initialize numeric keypad on page load
window.addEventListener('load', function() {
    // Create the keypad modal HTML
    const modalHTML = `
        <div id="numericKeypadModalDirect" style="
            display: none;
            position: fixed;
            z-index: 10000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            overflow: auto;
        ">
            <div style="
                position: relative;
                margin: 5% auto;
                padding: 30px;
                background-color: white;
                width: 90%;
                max-width: 400px;
                border-radius: 10px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">入力</h2>
                    <span onclick="window.closeDirectNumericKeypad()" style="color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
                </div>

                <div style="margin-bottom: 15px;">
                    <input type="text" id="numericDisplayDirect" readonly style="
                        width: 100%;
                        padding: 15px;
                        font-size: 24px;
                        text-align: right;
                        border: 2px solid #007bff;
                        border-radius: 5px;
                        box-sizing: border-box;
                        background-color: #f8f9fa;
                        box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
                    ">
                </div>

                <div id="keypadContainerDirect" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <!-- Number buttons will be added via JavaScript -->
                </div>

                <button onclick="window.confirmDirectNumericInput()" style="
                    width: 100%;
                    margin-top: 15px;
                    padding: 15px;
                    background-color: #28a745;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    font-size: 18px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: background-color 0.2s;
                " onmouseover="this.style.backgroundColor='#218838'" onmouseout="this.style.backgroundColor='#28a745'">
                    確定 (Enter)
                </button>
            </div>
        </div>
    `;

    // Append modal to body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);

    // Add number buttons dynamically
    const keypadContainer = document.getElementById('keypadContainerDirect');
    if (keypadContainer) {
        // Add number buttons 1-9
        for (let i = 1; i <= 9; i++) {
            const btn = document.createElement('button');
            btn.textContent = i.toString();
            const digit = i.toString();
            btn.onclick = function() { window.addToDirectNumericDisplay(digit); };
            btn.style.cssText = `
                padding: 20px;
                font-size: 24px;
                background-color: #f1f1f1;
                border: 1px solid #ccc;
                border-radius: 5px;
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            btn.addEventListener('mouseover', function() {
                this.style.backgroundColor = '#d0d0d0';
            });
            btn.addEventListener('mouseout', function() {
                this.style.backgroundColor = '#f1f1f1';
            });
            btn.addEventListener('touchstart', function() {
                this.style.backgroundColor = '#d0d0d0';
            });
            btn.addEventListener('touchend', function() {
                this.style.backgroundColor = '#f1f1f1';
            });
            keypadContainer.appendChild(btn);
        }

        // Add C button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'C';
        clearBtn.onclick = function() { window.clearDirectNumericDisplay(); };
        clearBtn.style.cssText = `
            padding: 20px;
            font-size: 24px;
            background-color: #ff6b6b;
            color: white;
            border: 1px solid #ff5252;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-weight: bold;
        `;
        clearBtn.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#ff5252';
        });
        clearBtn.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#ff6b6b';
        });
        clearBtn.addEventListener('touchstart', function() {
            this.style.backgroundColor = '#ff5252';
        });
        clearBtn.addEventListener('touchend', function() {
            this.style.backgroundColor = '#ff6b6b';
        });

        // Add 0 button
        const zeroBtn = document.createElement('button');
        zeroBtn.textContent = '0';
        zeroBtn.onclick = function() { window.addToDirectNumericDisplay('0'); };
        zeroBtn.style.cssText = `
            padding: 20px;
            font-size: 24px;
            background-color: #f1f1f1;
            border: 1px solid #ccc;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
        `;
        zeroBtn.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#d0d0d0';
        });
        zeroBtn.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#f1f1f1';
        });
        zeroBtn.addEventListener('touchstart', function() {
            this.style.backgroundColor = '#d0d0d0';
        });
        zeroBtn.addEventListener('touchend', function() {
            this.style.backgroundColor = '#f1f1f1';
        });

        // Add backspace button
        const backBtn = document.createElement('button');
        backBtn.innerHTML = '&larr;';
        backBtn.onclick = function() { window.backspaceDirectNumericDisplay(); };
        backBtn.style.cssText = `
            padding: 20px;
            font-size: 24px;
            background-color: #ffc107;
            color: white;
            border: 1px solid #ffb300;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-weight: bold;
        `;
        backBtn.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#ffb300';
        });
        backBtn.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#ffc107';
        });
        backBtn.addEventListener('touchstart', function() {
            this.style.backgroundColor = '#ffb300';
        });
        backBtn.addEventListener('touchend', function() {
            this.style.backgroundColor = '#ffc107';
        });

        // Add hyphen button (for 製造ロット)
        const hyphenBtn = document.createElement('button');
        hyphenBtn.id = 'hyphenButton';
        hyphenBtn.textContent = '-';
        hyphenBtn.onclick = function() { window.addToDirectNumericDisplay('-'); };
        hyphenBtn.style.cssText = `
            padding: 20px;
            font-size: 24px;
            background-color: #17a2b8;
            color: white;
            border: 1px solid #138496;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-weight: bold;
            display: none;
        `;
        hyphenBtn.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#138496';
        });
        hyphenBtn.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#17a2b8';
        });
        hyphenBtn.addEventListener('touchstart', function() {
            this.style.backgroundColor = '#138496';
        });
        hyphenBtn.addEventListener('touchend', function() {
            this.style.backgroundColor = '#17a2b8';
        });

        // Add space button
        const spaceBtn = document.createElement('button');
        spaceBtn.textContent = '␣';
        spaceBtn.onclick = function() { window.addToDirectNumericDisplay(' '); };
        spaceBtn.style.cssText = `
            padding: 20px;
            font-size: 24px;
            background-color: #6c757d;
            color: white;
            border: 1px solid #5a6268;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-weight: bold;
            grid-column: span 2;
        `;
        spaceBtn.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#5a6268';
        });
        spaceBtn.addEventListener('mouseout', function() {
            this.style.backgroundColor = '#6c757d';
        });
        spaceBtn.addEventListener('touchstart', function() {
            this.style.backgroundColor = '#5a6268';
        });
        spaceBtn.addEventListener('touchend', function() {
            this.style.backgroundColor = '#6c757d';
        });

        // Append all buttons
        keypadContainer.appendChild(clearBtn);
        keypadContainer.appendChild(zeroBtn);
        keypadContainer.appendChild(backBtn);
        keypadContainer.appendChild(hyphenBtn);
        keypadContainer.appendChild(spaceBtn);
    }

    // Configure 製造ロット input to use the keypad
    const manufacturingLotInput = document.getElementById('製造ロット');
    if (manufacturingLotInput) {
        manufacturingLotInput.readOnly = true;

        manufacturingLotInput.addEventListener('click', function() {
            window.openDirectNumericKeypad('製造ロット');
        });

        manufacturingLotInput.addEventListener('focus', function() {
            this.blur();
            window.openDirectNumericKeypad('製造ロット');
        });

        manufacturingLotInput.addEventListener('touchstart', function(e) {
            e.preventDefault();
            window.openDirectNumericKeypad('製造ロット');
        });

        // Style the input
        manufacturingLotInput.style.cssText = `
            cursor: pointer;
            background-color: #f0f8ff;
            border: 2px solid #007bff;
            border-radius: 5px;
            padding: 8px 10px;
            font-size: 16px;
            width: 100%;
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
            background-repeat: no-repeat;
            background-position: right 8px center;
            background-size: 16px 16px;
            padding-right: 30px;
        `;

        console.log('製造ロット input configured with numeric keypad');
    }

    // Optional: Configure recovery-quantity input to use the keypad as well
    const quantityInput = document.getElementById('recovery-quantity');
    if (quantityInput) {
        quantityInput.readOnly = true;

        quantityInput.addEventListener('click', function() {
            window.openDirectNumericKeypad('recovery-quantity');
        });

        quantityInput.addEventListener('focus', function() {
            this.blur();
            window.openDirectNumericKeypad('recovery-quantity');
        });

        quantityInput.addEventListener('touchstart', function(e) {
            e.preventDefault();
            window.openDirectNumericKeypad('recovery-quantity');
        });

        // Style the input
        quantityInput.style.cssText = `
            cursor: pointer;
            background-color: #f0f8ff;
            border: 2px solid #007bff;
            border-radius: 5px;
            padding: 8px 10px;
            font-size: 16px;
            width: 100%;
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
            background-repeat: no-repeat;
            background-position: right 8px center;
            background-size: 16px 16px;
            padding-right: 30px;
        `;

        console.log('回収数量 input configured with numeric keypad');
    }
});
