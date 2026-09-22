/**
 * firstKojoNippo.js
 * Logic for First Factory Nippo (第一工場 日報) Tablet UI
 */

//const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";
const serverURL = "http://192.168.0.39:3000";

function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const savedInitialTab = localStorage.getItem('firstkojo_nippo_main_tab');
const initialTabIndex = (savedInitialTab !== null && !isNaN(parseInt(savedInitialTab, 10)))
    ? parseInt(savedInitialTab, 10)
    : 0;

const state = {
    workerName: localStorage.getItem('firstkojo_nippo_worker_name') || null,
    machineName: null,
    filterName: "第一工場",

    currentMainTab: initialTabIndex, // 0: User, 1: List, 2: Queue, 3: Info, 4: History, 5: Production, 6: Submit

    selectedDate: sessionStorage.getItem('firstkojo_nippo_date') || getTodayDateString(),
    dailySchedule: null,
    scheduledItems: [],
    selectedItem: (() => {
        try {
            return JSON.parse(sessionStorage.getItem('firstkojo_nippo_selected_item') || 'null');
        } catch {
            return null;
        }
    })(),
    isLoadingSchedule: false,
    listViewMode: localStorage.getItem('firstkojo_list_view_mode') || 'card',

    // Staging Queue & Feed Modal State
    stagingQueue: [],
    isQueueCollapsed: localStorage.getItem('firstkojo_queue_collapsed') === 'true',
    expandedGroups: new Set(),
    activeRollPhotoTarget: null, // { itemId, gIdx, rIdx }
    historyFilter: 'all', // 'all', 'enqueued', 'excluded'
    historyView: 'card', // 'card' | 'list'
    masterData: [],
    currentFeedItem: null,
    currentFeedGroup: null,
    capturedPhotoBase64: null,
    uploadedPhotoUrl: null,
    cameraStream: null,

    // Learned QR patterns cached locally (zero scan latency)
    learnedQRPatterns: (() => {
        try {
            return JSON.parse(localStorage.getItem('firstkojo_learned_qr_patterns') || '[]');
        } catch (e) {
            return [];
        }
    })(),
    currentModalHinban: '',
    currentModalLotNo: '',
    currentModalRawQR: '',
    currentModalCustomSlices: {}
};

// -----------------------------------------------------
// URL Parameter Parsing
// -----------------------------------------------------
function parseParams() {
    let searchStr = window.location.search;
    while (searchStr.startsWith('?')) {
        searchStr = searchStr.substring(1);
    }
    const params = new URLSearchParams(searchStr);

    if (params.has('machine') || params.has('?machine')) {
        state.machineName = params.get('machine') || params.get('?machine');
        const tag = document.getElementById('machineNameTag');
        if (tag) tag.textContent = `${_t('fk_machine_prefix')}${state.machineName}`;
    }
    if (params.has('filter') || params.has('?filter')) {
        state.filterName = params.get('filter') || params.get('?filter');
    }
    if (params.has('date') || params.has('?date')) {
        const d = params.get('date') || params.get('?date');
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            state.selectedDate = d;
        }
    }
}

// -----------------------------------------------------
// Worker Setup & Modal Logic
// -----------------------------------------------------
let workerNamesData = [];

function initWorker() {
    const welcomeBack = document.getElementById('welcomeBackContainer');
    const newWorker = document.getElementById('newWorkerContainer');
    const confirmName = document.getElementById('confirmUserName');

    if (state.workerName) {
        if (welcomeBack) welcomeBack.classList.add('active');
        if (newWorker) newWorker.classList.remove('active');
        if (confirmName) confirmName.textContent = state.workerName;
    } else {
        if (welcomeBack) welcomeBack.classList.remove('active');
        if (newWorker) newWorker.classList.add('active');
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
        if (dataList) {
            dataList.innerHTML = "";
            workerNamesData.forEach(name => {
                const option = document.createElement("option");
                option.value = name;
                dataList.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error fetching worker names:", error);
    }
}

function getRecentWorkers() {
    try {
        return JSON.parse(localStorage.getItem('firstkojo_recent_workers') || '[]');
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
    localStorage.setItem('firstkojo_recent_workers', JSON.stringify(recent));
}

function removeFromRecentWorkers(name) {
    let recent = getRecentWorkers();
    recent = recent.filter(w => w !== name);
    localStorage.setItem('firstkojo_recent_workers', JSON.stringify(recent));
    renderWorkerNames();
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
    if (!container) return;
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

function selectWorkerName(name) {
    state.workerName = name;
    localStorage.setItem('firstkojo_nippo_worker_name', name);
    const input = document.getElementById("workerInput");
    if (input) input.value = name;
    saveRecentWorker(name);

    const modal = document.getElementById('workerNameModal');
    if (modal) modal.style.display = 'none';

    initWorker();
    switchMainTab(1); // Jump to List tab
}

function proceedFromStep0() {
    const val = document.getElementById("workerInput")?.value;
    if (!val) {
        alert("作業者を選択してください。(Please select a worker first.)");
        return;
    }
    selectWorkerName(val);
}

function confirmWorkerName() {
    updateTabLocks();
    switchMainTab(1); // Jump to List tab
}

function changeWorkerName() {
    state.workerName = null;
    localStorage.removeItem('firstkojo_nippo_worker_name');
    localStorage.setItem('firstkojo_nippo_main_tab', '0');
    const input = document.getElementById("workerInput");
    if (input) input.value = '';
    initWorker();
    switchMainTab(0);
}

// -----------------------------------------------------
// Main Tab Navigation & Locking (5 Tabs)
// -----------------------------------------------------
function updateTabLocks() {
    const mainTabs = document.querySelectorAll('#mainTabBar .tab-btn');
    if (!state.workerName) {
        mainTabs.forEach((btn, index) => {
            if (index !== 0) btn.classList.add('locked');
        });
    } else {
        mainTabs.forEach(btn => btn.classList.remove('locked'));
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

    updateTabLocks();

    // Restore previously active tab from localStorage on reload
    const savedTabStr = localStorage.getItem('firstkojo_nippo_main_tab');
    if (state.workerName && savedTabStr !== null) {
        const tabIndex = parseInt(savedTabStr, 10);
        if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length) {
            switchMainTab(tabIndex, true);
            return;
        }
    }

    // Default to List tab (tab 1) if worker is already logged in, otherwise User tab (tab 0)
    if (state.workerName) {
        switchMainTab(1, true);
    } else {
        switchMainTab(0, true);
    }
}

function switchMainTab(index, skipAnimation = false) {
    const tabs = document.querySelectorAll('#mainTabBar .tab-btn');
    const container = document.getElementById('tabPanelsContainer');

    tabs.forEach(t => t.classList.remove('active'));
    if (tabs[index]) tabs[index].classList.add('active');

    // 7 tabs => 100 / 7 = 14.285714% shift per tab
    if (container) {
        if (skipAnimation) {
            const origTransition = container.style.transition;
            container.style.transition = 'none';
            container.style.transform = `translateX(-${index * (100 / 7)}%)`;
            void container.offsetHeight; // Force reflow
            container.style.transition = origTransition;
        } else {
            container.style.transform = `translateX(-${index * (100 / 7)}%)`;
        }
    }
    state.currentMainTab = index;
    localStorage.setItem('firstkojo_nippo_main_tab', String(index));
    sessionStorage.setItem('firstkojo_nippo_main_tab', String(index));

    if (index === 1) {
        fetchDailySchedule(state.selectedDate);
    }
    if (index === 2) {
        fetchProductionQueue();
    }
    if (index === 3) {
        loadItemDetail(state.selectedItem);
    }
    if (index === 4) {
        renderHistoryList();
        fetchProductionQueue();
    }
}

// -----------------------------------------------------
// Schedule Calculation & Time Logic
// -----------------------------------------------------
function computeTimeSchedule(items, startTimeStr) {
    if (!Array.isArray(items)) return [];

    let current = new Date(`2000-01-01T${startTimeStr || '08:00'}:00`);
    if (isNaN(current.getTime())) current = new Date(`2000-01-01T08:00:00`);

    return items.map((item, idx) => {
        const start = current.toTimeString().substring(0, 5);
        const duration = Number(item.duration) || 0;
        current = new Date(current.getTime() + duration * 60000);
        const end = current.toTimeString().substring(0, 5);

        const dateKey = state.selectedDate || 'day';
        const itemId = item.id || item._id || `${dateKey}_${item.hinban || 'item'}_${idx + 1}`;
        return {
            ...item,
            id: itemId,
            orderIndex: idx + 1,
            startTime: start,
            endTime: end,
            duration
        };
    });
}

// -----------------------------------------------------
// Fetch & Render Daily Schedule from firstFactorySchedule
// -----------------------------------------------------
async function fetchDailySchedule(dateStr) {
    const container = document.getElementById('scheduleListContainer');
    if (!container) return;

    state.selectedDate = dateStr;
    sessionStorage.setItem('firstkojo_nippo_date', dateStr);

    fetchProductionQueue();
    setupProductionSSE();

    const dateInput = document.getElementById('scheduleDateInput');
    if (dateInput && dateInput.value !== dateStr) {
        dateInput.value = dateStr;
    }

    const [year, monthNum, dayNum] = dateStr.split('-');
    const month = `${year}-${monthNum}`;
    const date = Number(dayNum);

    // Show loading skeleton
    container.innerHTML = `
        <div class="loading-skeleton">
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
        </div>
    `;

    try {
        state.isLoadingSchedule = true;

        // Try direct daily endpoint first, fallback to month query
        let scheduleDoc = null;
        try {
            const dailyRes = await fetch(`${serverURL}/api/production/schedule/daily?month=${encodeURIComponent(month)}&date=${date}`);
            if (dailyRes.ok) {
                const dailyData = await dailyRes.json();
                if (dailyData.success && dailyData.schedule) {
                    scheduleDoc = dailyData.schedule;
                }
            }
        } catch (e) {
            console.warn("Direct daily schedule endpoint failed, trying month route:", e);
        }

        if (!scheduleDoc) {
            const res = await fetch(`${serverURL}/api/production/schedule?month=${encodeURIComponent(month)}`);
            if (res.ok) {
                const json = await res.json();
                if (json.data && Array.isArray(json.data)) {
                    state.masterData = json.data;
                }
                if (json.success && Array.isArray(json.schedules)) {
                    scheduleDoc = json.schedules.find(s => s.month === month && Number(s.date) === date) || null;
                }
            }
        } else {
            ensureMasterData(month);
        }

        state.dailySchedule = scheduleDoc;

        if (scheduleDoc && Array.isArray(scheduleDoc.scheduleOrder) && scheduleDoc.scheduleOrder.length > 0) {
            const startTime = scheduleDoc.startTime || '08:00';
            state.scheduledItems = computeTimeSchedule(scheduleDoc.scheduleOrder, startTime);

            // Sync live status and active queue from server (submittedDB.firstFactoryProduction & firstFactoryQueue)
            await fetchProductionStatus(dateStr);
            await fetchProductionQueue();

            renderScheduleList(state.scheduledItems, startTime);
        } else {
            state.scheduledItems = [];
            renderEmptySchedule(dateStr);
        }

    } catch (error) {
        console.error("Error fetching schedule:", error);
        container.innerHTML = `
            <div class="placeholder-state">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <h3>スケジュール取得エラー (Error Loading Schedule)</h3>
                <p>${error.message || 'Failed to connect to server'}</p>
                <button type="button" class="btn btn-secondary" style="margin-top: 15px;" onclick="fetchDailySchedule('${dateStr}')">再試行 (Retry)</button>
            </div>
        `;
    } finally {
        state.isLoadingSchedule = false;
    }
}

// -----------------------------------------------------
// Server Sync for Production Status (firstFactoryProduction)
// -----------------------------------------------------
async function fetchProductionStatus(dateStr) {
    try {
        const res = await fetch(`${serverURL}/api/production/status?date=${encodeURIComponent(dateStr)}&machine=${encodeURIComponent(state.machineName || 'PSA2')}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.records)) {
            const storageKey = `firstkojo_lifecycle_${dateStr}`;
            const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
            data.records.forEach(rec => {
                if (rec.groupId) {
                    const normStatus = (rec.status === 'running') ? 'in-progress' : rec.status;
                    stored[rec.groupId] = {
                        status: normStatus,
                        actualStartTime: rec.actualStartTime,
                        startEpoch: rec.startEpoch,
                        actualEndTime: rec.actualEndTime,
                        endEpoch: rec.endEpoch,
                        actualDurationMins: rec.actualDurationMins,
                        worker: rec.worker,
                        printHistory: rec.printHistory || []
                    };
                }
            });
            localStorage.setItem(storageKey, JSON.stringify(stored));
            console.log(`🌐 Synced ${data.records.length} production record(s) from server for ${dateStr}`);
        }
    } catch (err) {
        console.warn('Could not fetch server production status:', err);
    }
}

async function syncProductionStatusToServer(group, patch) {
    if (!group || !state.selectedDate) return;
    try {
        const lifecycle = { ...getGroupLifecycle(group.groupId), ...patch };
        const payload = {
            scheduleId: state.dailySchedule?._id || null,
            groupId: group.groupId,
            date: state.selectedDate,
            machine: state.machineName || 'PSA2',
            worker: state.workerName || '',
            hinban: group.hinban,
            hinmei: group.hinmei || '',
            kizai: group.kizai || '',
            color: group.color || '',
            zuban: group.zuban || '',
            totalRolls: group.items ? group.items.length : 1,
            totalMeters: group.totalMeters || 0,
            status: lifecycle.status || 'pending',
            actualStartTime: lifecycle.actualStartTime || null,
            startEpoch: lifecycle.startEpoch || null,
            actualEndTime: lifecycle.actualEndTime || null,
            endEpoch: lifecycle.endEpoch || null,
            actualDurationMins: lifecycle.actualDurationMins !== undefined ? lifecycle.actualDurationMins : null,
            items: group.items || []
        };

        const res = await fetch(`${serverURL}/api/production/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const resData = await res.json();
        console.log('📡 Synced status to firstFactoryProduction:', resData);
    } catch (err) {
        console.warn('Error syncing production status to server:', err);
    }
}

function updateScheduleStats(items, startTimeStr) {
    const totalItemsVal = document.getElementById('statTotalItemsVal');
    const startTimeVal = document.getElementById('statStartTimeVal');
    const totalDurationVal = document.getElementById('statTotalDurationVal');
    const endTimeVal = document.getElementById('statEndTimeVal');

    const totalCount = items.length;
    const totalMins = items.reduce((sum, i) => sum + (Number(i.duration) || 0), 0);
    const lastItem = items[items.length - 1];
    const estimatedEnd = lastItem ? lastItem.endTime : '--:--';

    if (totalItemsVal) totalItemsVal.textContent = `${totalCount} 件`;
    if (startTimeVal) startTimeVal.textContent = startTimeStr || '08:00';
    if (totalDurationVal) totalDurationVal.textContent = `${totalMins} 分`;
    if (endTimeVal) endTimeVal.textContent = estimatedEnd;
}

function groupScheduledItems(items) {
    if (!Array.isArray(items)) return [];
    const groups = [];
    let currentGroup = null;

    items.forEach((item, idx) => {
        if (item.type === 'setup') {
            groups.push({
                type: 'setup',
                groupId: `setup_${item.id || idx}`,
                items: [item],
                itemIndexStart: idx,
                totalDuration: Number(item.duration) || 0,
                totalMeters: 0,
                startTime: item.startTime,
                endTime: item.endTime
            });
            currentGroup = null;
            return;
        }

        // Hinban item: group consecutive items with the same hinban
        if (currentGroup && currentGroup.type === 'hinban' && currentGroup.hinban === item.hinban) {
            currentGroup.items.push(item);
            currentGroup.totalDuration += Number(item.duration) || 0;
            currentGroup.totalMeters += Number(item.meters) || 0;
            currentGroup.endTime = item.endTime;
        } else {
            currentGroup = {
                type: 'hinban',
                groupId: `group_${item.hinban}_${idx}`,
                hinban: item.hinban,
                hinmei: item.hinmei || '',
                kizai: item.kizai || '',
                color: item.color || '',
                shori: item.shori || '',
                habanaga: item.habanaga || '',
                shippingDest: item.shippingDest || '',
                labelHinban: item.labelHinban || '',
                okyakuHinban: item.okyakuHinban || '',
                zuban: item.zuban || '',
                items: [item],
                itemIndexStart: idx,
                totalDuration: Number(item.duration) || 0,
                totalMeters: Number(item.meters) || 0,
                startTime: item.startTime,
                endTime: item.endTime
            };
            groups.push(currentGroup);
        }
    });

    return groups;
}

// -----------------------------------------------------
// Special Kinuura (衣浦) Hinban Patterns
// -----------------------------------------------------
const SPECIAL_KINUURA_PATTERNS = [
    "CNU/C2E2SB*/D/***WA8",
    "CNU/C2Z1YG*/D/***WA8",
    "CNU/CMX70B*GD/***W48",
    "CNU/CMH70G*GD/***W48",
    "CNU/BLZ02B*GD/***W48",
    "CNU/85ULBB*GD/***W48",
    "CNU/B0474B*GD/***W*6"
];

function isSpecialKinuuraHinban(hinban) {
    if (!hinban) return false;
    return SPECIAL_KINUURA_PATTERNS.some(pattern => {
        let escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        escaped = escaped.replace(/\*/g, '.');
        return new RegExp(`^${escaped}$`).test(hinban);
    });
}

// -----------------------------------------------------
// Brother Label Printing Helpers (iOS / Android)
// -----------------------------------------------------
function buildBrotherPrintFields(group, rollItem, rollIndex, totalRolls) {
    // Auto calculated lot number: yymmdd-rollIndex
    let yymmdd = '';
    if (state.selectedDate && state.selectedDate.includes('-')) {
        const parts = state.selectedDate.split('-');
        yymmdd = `${parts[0].slice(-2)}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`;
    } else {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        yymmdd = `${yy}${mm}${dd}`;
    }

    const lotNo = `${yymmdd}-${rollIndex}`;
    const hinban = group.hinban || rollItem.hinban || '';
    const okyakuHinban = group.okyakuHinban || rollItem.okyakuHinban || group.materialInfo?.rawMaster?.['品目マスタ']?.['お客様品番'] || rollItem.materialInfo?.rawMaster?.['品目マスタ']?.['お客様品番'] || '';
    const color = group.color || rollItem.color || '';
    const hinmei = group.hinmei || rollItem.hinmei || '';
    const shippingDest = group.shippingDest || rollItem.shippingDest || '';
    const meters = rollItem.meters || 100;

    const isSpecial = isSpecialKinuuraHinban(hinban);

    let filename = 'firstkojo4.lbx';
    let textHinban = hinban;
    let textSebangou = '';
    let barcode = '';

    if (isSpecial) {
        // Special Kinuura Label Mapping
        filename = 'kinuuraLabel.lbx';
        textHinban = okyakuHinban || hinban;
        textSebangou = hinmei || '';
        barcode = okyakuHinban || hinban;
    } else {
        // Standard Printing Mapping
        const rawLabel = group.labelHinban ?? rollItem.labelHinban ?? group.materialInfo?.rawMaster?.['品目マスタ']?.['ラベル品番'] ?? rollItem.materialInfo?.rawMaster?.['品目マスタ']?.['ラベル品番'] ?? '';
        const labelHinban = (rawLabel && String(rawLabel).trim() !== '' && rawLabel !== 'null' && rawLabel !== 'undefined') ? String(rawLabel).trim() : '';

        if (labelHinban === 'NC2') {
            filename = 'NC21.lbx';
        }
        textHinban = hinban;
        textSebangou = labelHinban;
        barcode = `${labelHinban || hinban},${lotNo},${meters}`;
    }

    return {
        filename: filename,
        size: 'RollW62',
        copies: 1,
        text_品番: textHinban,
        text_収容数: String(rollItem.orderIndex !== undefined ? rollItem.orderIndex : (rollIndex || 1)),
        text_背番号: textSebangou,
        text_color: color,
        text_品名: hinmei,
        text_location: shippingDest ? `${shippingDest}へ` : '',
        text_DateT: lotNo,
        barcode_barcode: barcode
    };
}

async function executeBrotherPrint(fields) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const params = `filename=${encodeURIComponent(fields.filename)}&size=${encodeURIComponent(fields.size)}&copies=${fields.copies}` +
        `&text_品番=${encodeURIComponent(fields.text_品番 || '')}` +
        `&text_背番号=${encodeURIComponent(fields.text_背番号 || '')}` +
        `&text_収容数=${encodeURIComponent(fields.text_収容数 || '')}` +
        `&text_color=${encodeURIComponent(fields.text_color || '')}` +
        `&text_品名=${encodeURIComponent(fields.text_品名 || '')}` +
        `&text_location=${encodeURIComponent(fields.text_location || '')}` +
        `&text_DateT=${encodeURIComponent(fields.text_DateT || '')}` +
        `&barcode_barcode=${encodeURIComponent(fields.barcode_barcode || '')}`;

    if (isIOS) {
        const url = `brotherwebprint://print?${params}`;
        console.log('🖨️ [iOS] Brother Print URL:', url, fields);
        window.location.href = url;
        await new Promise(resolve => setTimeout(resolve, 3500));
        return { success: true };
    } else {
        const url = `http://localhost:8088/print?${params}`;
        console.log('🖨️ [Android/Desktop] Brother Print URL:', url, fields);
        try {
            const response = await Promise.race([
                fetch(url).then(res => res.text()),
                new Promise((_, reject) => setTimeout(() => reject(new Error('プリンター応答タイムアウト (30秒)')), 30000))
            ]);
            if (response && response.includes('<result>SUCCESS</result>')) {
                return { success: true, response };
            } else {
                const errorMsg = response.includes('PrinterStatusErrorCoverOpen')
                    ? 'プリンターのカバーが開いています (Cover Open)'
                    : (response.includes('<error>') ? response : 'プリンターエラー (Printer Error)');
                return { success: false, error: errorMsg, response };
            }
        } catch (err) {
            console.warn('Print request error:', err);
            const isConnectionRefused = err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'));
            return {
                success: false,
                error: isConnectionRefused
                    ? 'プリンター未接続 (Connection Refused - localhost:8088)'
                    : err.message
            };
        }
    }
}

async function logPrintToServer(group, rollItem, rollIndex, totalRolls, fields) {
    const worker = state.currentUser?.name || state.workerName || '担当者';
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const printEntry = {
        rollIndex: Number(rollIndex),
        totalRolls: Number(totalRolls),
        lotNo: fields.text_DateT,
        barcode: fields.barcode_barcode,
        worker: worker,
        machine: state.machineName || 'PSA2',
        timestamp: now.toISOString(),
        timeStr: timeStr
    };

    // Update local storage lifecycle
    const lc = getGroupLifecycle(group.groupId);
    const printHistory = Array.isArray(lc.printHistory) ? [...lc.printHistory, printEntry] : [printEntry];
    setGroupLifecycle(group.groupId, { printHistory });

    // Refresh UI to update printed badge immediately
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');

    // Post to MongoDB endpoint
    try {
        await fetch(`${serverURL}/api/production/print-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduleId: state.dailySchedule?._id || null,
                groupId: group.groupId,
                date: state.selectedDate,
                machine: state.machineName || 'PSA2',
                worker: worker,
                hinban: group.hinban,
                rollIndex: Number(rollIndex),
                totalRolls: Number(totalRolls),
                lotNo: fields.text_DateT,
                barcode: fields.barcode_barcode,
                timestamp: now.toISOString(),
                timeStr: timeStr
            })
        });
        console.log(`💾 Logged print for roll ${rollIndex}/${totalRolls} to MongoDB`);
    } catch (err) {
        console.warn('Could not save print log to server:', err);
    }
}

let isPrintCancelled = false;

function showPrintProgressModal(title, detailText) {
    isPrintCancelled = false;
    const modal = document.getElementById('printProgressModal');
    const titleEl = document.getElementById('printModalTitle');
    const detailEl = document.getElementById('printModalDetail');
    const iconEl = document.getElementById('printModalIcon');
    const subEl = document.getElementById('printModalSub');

    if (titleEl) titleEl.textContent = title || '印刷中...';
    if (detailEl) detailEl.textContent = detailText || '';
    if (iconEl) iconEl.textContent = '🖨️';
    if (subEl) subEl.innerHTML = 'プリンターに印刷データを送信しています。<br>しばらくお待ちください。';

    if (modal) {
        modal.classList.add('open', 'active');
        modal.style.display = 'flex';
    }
}

function updatePrintProgressModal(detailText) {
    const detailEl = document.getElementById('printModalDetail');
    if (detailEl) detailEl.textContent = detailText;
}

function finishPrintProgressModal(successMessage) {
    const titleEl = document.getElementById('printModalTitle');
    const detailEl = document.getElementById('printModalDetail');
    const iconEl = document.getElementById('printModalIcon');
    const subEl = document.getElementById('printModalSub');

    if (iconEl) iconEl.textContent = '✅';
    if (titleEl) titleEl.textContent = '印刷完了';
    if (detailEl) detailEl.textContent = successMessage || '正常に印刷されました';
    if (subEl) subEl.textContent = '';

    setTimeout(() => {
        closePrintProgressModal(false);
    }, 700);
}

function closePrintProgressModal(userDismissed) {
    if (userDismissed) {
        isPrintCancelled = true;
    }
    const modal = document.getElementById('printProgressModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
}

async function printSingleRoll(groupIndex, rollIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    const rollItem = group.items[rollIndex];
    if (!rollItem) return;

    const actualRollIndex = rollItem.rollIndex || (rollIndex + 1);
    const totalRolls = group.items.length;
    const fields = buildBrotherPrintFields(group, rollItem, actualRollIndex, totalRolls);

    showPrintProgressModal('ラベル印刷中...', `#${rollItem.orderIndex} • ${actualRollIndex} / ${totalRolls} 巻き (${fields.text_DateT})`);
    const printResult = await executeBrotherPrint(fields);

    if (printResult.success) {
        await logPrintToServer(group, rollItem, actualRollIndex, totalRolls, fields);
        finishPrintProgressModal(`Roll #${rollItem.orderIndex} 印刷完了`);
    } else {
        closePrintProgressModal(false);
        alert(`❌ 印刷エラー (Roll #${rollItem.orderIndex} • ${actualRollIndex}/${totalRolls} 巻き)\n\n【エラー内容】 ${printResult.error || 'プリンターからの応答がありません。'}\n\nBrother Web Print サービス (localhost:8088) またはプリンターの電源・USB/Wi-Fi接続を確認してください。`);
    }
}

function printBatchGroup(groupIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    const lifecycle = getGroupLifecycle(group.groupId);

    const printedRollIndices = new Set(
        (lifecycle.printHistory || []).map(p => Number(p.rollIndex))
    );

    const alreadyPrintedList = [];
    const unprintedList = [];

    group.items.forEach((item, idx) => {
        const actualRollIndex = item.rollIndex || (idx + 1);
        if (printedRollIndices.has(Number(actualRollIndex))) {
            alreadyPrintedList.push({ item, idx, actualRollIndex });
        } else {
            unprintedList.push({ item, idx, actualRollIndex });
        }
    });

    // If some or all items are already printed, prompt modal with choices
    if (alreadyPrintedList.length > 0) {
        const printedRollsText = alreadyPrintedList.map(r => `#${r.item.orderIndex} (${r.actualRollIndex}/${group.items.length}巻き)`).join(', ');

        const bodyHTML = `
            <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: var(--btn-radius); padding: 14px; margin-bottom: 16px;">
                <div style="font-size: 0.85rem; font-weight: 800; color: #15803D; margin-bottom: 4px;">🖨️ 既に印刷済みの巻きがあります</div>
                <div style="font-size: 1.05rem; font-weight: 900; color: #166534;">${group.kizai || group.hinban}</div>
                <div style="font-size: 0.85rem; color: #15803D; margin-top: 4px;">
                    印刷済: <strong>${alreadyPrintedList.length} / ${group.items.length} 巻き</strong> (${printedRollsText})
                </div>
            </div>
            <p style="font-size: 0.9rem; color: var(--text-soft); line-height: 1.6; margin-bottom: 16px;">
                一括印刷の実行方法を選択してください:
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${unprintedList.length > 0 ? `
                <button type="button" class="btn btn-primary" style="background: #10B981; border-color: #10B981; text-align: left; padding: 12px 16px;" onclick="closeBatchModal(); executeBatchPrint(${groupIndex}, true)">
                    <strong>⏩ 未印刷の巻きのみ印刷 (${unprintedList.length} 巻き)</strong><br>
                    <span style="font-size: 0.8rem; font-weight: normal; opacity: 0.95;">印刷済みの巻きをスキップし、残りのみ印刷します。</span>
                </button>
                ` : `
                <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; color: #64748B;">
                    ※ すべての巻き（${group.items.length}巻き）が既に印刷済みです。
                </div>
                `}
                <button type="button" class="btn btn-secondary" style="text-align: left; padding: 12px 16px;" onclick="closeBatchModal(); executeBatchPrint(${groupIndex}, false)">
                    <strong>🖨️ 全て再印刷 (${group.items.length} 巻き)</strong><br>
                    <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">印刷済みの巻きも含め、全巻きを最初から印刷します。</span>
                </button>
            </div>
        `;

        const actionsHTML = `
            <button type="button" class="btn btn-secondary" onclick="closeBatchModal()">戻る (Cancel)</button>
        `;

        showBatchModal('一括印刷の確認 (Batch Print)', bodyHTML, actionsHTML);
        return;
    }

    // No rolls printed yet, directly execute all
    executeBatchPrint(groupIndex, false);
}

async function executeBatchPrint(groupIndex, skipPrinted) {
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    const totalRolls = group.items.length;
    const lifecycle = getGroupLifecycle(group.groupId);

    const printedRollIndices = new Set(
        (lifecycle.printHistory || []).map(p => Number(p.rollIndex))
    );

    const targetRolls = [];
    for (let r = 0; r < totalRolls; r++) {
        const rollItem = group.items[r];
        const actualRollIndex = rollItem.rollIndex || (r + 1);
        if (skipPrinted && printedRollIndices.has(Number(actualRollIndex))) {
            continue; // Skip already printed
        }
        targetRolls.push({ rollItem, actualRollIndex });
    }

    if (targetRolls.length === 0) {
        alert('印刷対象の巻きはありません（すべて印刷済みです）');
        return;
    }

    showPrintProgressModal(`一括印刷中 (全${targetRolls.length}巻き)`, `1 / ${targetRolls.length} 巻き目 (${group.kizai || group.hinban})`);

    let successCount = 0;
    for (let i = 0; i < targetRolls.length; i++) {
        if (isPrintCancelled) {
            console.log('🛑 Batch printing cancelled by user');
            break;
        }

        const { rollItem, actualRollIndex } = targetRolls[i];
        const fields = buildBrotherPrintFields(group, rollItem, actualRollIndex, totalRolls);

        updatePrintProgressModal(`${i + 1} / ${targetRolls.length} 巻き目 (#${rollItem.orderIndex} • ${fields.text_DateT})`);
        const printResult = await executeBrotherPrint(fields);

        if (printResult.success) {
            await logPrintToServer(group, rollItem, actualRollIndex, totalRolls, fields);
            successCount++;
            if (i < targetRolls.length - 1 && !isPrintCancelled) {
                await new Promise(res => setTimeout(res, 1200));
            }
        } else {
            closePrintProgressModal(false);
            console.error(`❌ Batch printing halted at roll ${actualRollIndex}/${totalRolls}:`, printResult.error);
            alert(`❌ 一括印刷が中断されました\n\n【進捗】 ${successCount} / ${targetRolls.length} 巻き完了\n【失敗した巻き】 ${actualRollIndex} 巻き目 (#${rollItem.orderIndex} • ${fields.text_DateT})\n【エラー原因】 ${printResult.error || 'プリンター応答なし'}\n\nプリンター接続を確認後、未印刷の巻きの「🖨️ 印刷」ボタンから個別印刷を行ってください。`);
            return;
        }
    }

    if (!isPrintCancelled) {
        finishPrintProgressModal(`全 ${successCount} 巻きの印刷が完了しました`);
    }
}

// -----------------------------------------------------
// Production Lifecycle State Helpers (Storage)
// -----------------------------------------------------
function getGroupLifecycle(groupId) {
    if (!state.selectedDate || !groupId) return { status: 'pending' };
    const storageKey = `firstkojo_lifecycle_${state.selectedDate}`;
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const lc = stored[groupId] || { status: 'pending' };
        if (lc.status === 'running') lc.status = 'in-progress';
        return lc;
    } catch (e) {
        return { status: 'pending' };
    }
}

function setGroupLifecycle(groupId, patch) {
    if (!state.selectedDate || !groupId) return;
    const storageKey = `firstkojo_lifecycle_${state.selectedDate}`;
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
        stored[groupId] = { ...(stored[groupId] || { status: 'pending' }), ...patch };
        localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch (e) {
        console.error('Error saving group lifecycle:', e);
    }
}

// -----------------------------------------------------
// Item State & Persistence Helpers (LocalStorage)
// -----------------------------------------------------
function getItemStateStorageKey() {
    const date = state.selectedDate || (state.dailySchedule && state.dailySchedule.date) || new Date().toISOString().split('T')[0];
    return `firstkojo_item_state_${date}`;
}

function getItemEdits() {
    try {
        return JSON.parse(localStorage.getItem(getItemStateStorageKey()) || '{}');
    } catch (e) {
        return {};
    }
}

function getItemKey(item, gIdx, rIdx) {
    if (item && item.id) return item.id;
    const date = state.selectedDate || 'day';
    const hinban = (item && (item.hinban || item.kizai)) || `g${gIdx !== undefined ? gIdx : 0}`;
    const order = (item && item.orderIndex) || (rIdx !== undefined ? rIdx + 1 : 1);
    return `${date}_${hinban}_${order}`;
}

function getItemEdit(itemId, defaultItem = {}) {
    if (!itemId) return { meters: 100, isExcluded: false, photoUrl: '', photoBase64: '', enqueued: false, socho: '', shiki: '', bicho: '', qrScanned: '' };
    const edits = getItemEdits();
    const existing = edits[itemId] || {};
    const defaultMeters = Number(defaultItem.meters) || 100;
    const bichoVal = existing.bicho !== undefined && existing.bicho !== '' ? existing.bicho : (existing.meters !== undefined ? existing.meters : defaultMeters);
    return {
        meters: bichoVal,
        bicho: bichoVal,
        socho: existing.socho !== undefined ? existing.socho : '',
        shiki: existing.shiki !== undefined ? existing.shiki : '',
        qrScanned: existing.qrScanned || '',
        isExcluded: existing.isExcluded === true,
        photoUrl: existing.photoUrl || '',
        photoBase64: existing.photoBase64 || '',
        enqueued: existing.enqueued === true,
        enqueuedAt: existing.enqueuedAt || null,
        lotNo: existing.lotNo || defaultItem.lotNo || '',
        hinban: existing.hinban || defaultItem.hinban || '',
        kizai: existing.kizai || defaultItem.kizai || '',
        orderIndex: existing.orderIndex || defaultItem.orderIndex || 1,
        rollIndex: existing.rollIndex || defaultItem.rollIndex || 1,
        totalRolls: existing.totalRolls || defaultItem.totalRolls || 1,
        shippingDest: existing.shippingDest || defaultItem.shippingDest || '',
        color: existing.color || defaultItem.color || '',
        zuban: existing.zuban || defaultItem.zuban || ''
    };
}

function setItemEdit(itemId, patch) {
    if (!itemId) return;
    try {
        const key = getItemStateStorageKey();
        const edits = getItemEdits();
        const safePatch = { ...patch };
        // Never store heavy base64 images in localStorage to prevent QuotaExceededError
        if (safePatch.photoBase64) {
            safePatch.hasPhoto = true;
            delete safePatch.photoBase64;
        }
        edits[itemId] = { ...(edits[itemId] || {}), ...safePatch };
        localStorage.setItem(key, JSON.stringify(edits));
    } catch (e) {
        console.error('Error saving item edit:', e);
    }
}

function updateRollMeters(itemId, newMeters, gIdx, rIdx) {
    const metersVal = Math.max(1, Number(newMeters) || 0);
    setItemEdit(itemId, { meters: metersVal });
    updateCardSummaryChip(gIdx);
}

function toggleRollItemExclude(itemId, gIdx, rIdx, event) {
    if (event) event.stopPropagation();
    const edit = getItemEdit(itemId);
    const newExcluded = !edit.isExcluded;
    setItemEdit(itemId, { isExcluded: newExcluded });
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
    updateHistoryBadges();
}

function updateCardSummaryChip(gIdx) {
    if (!state.currentGroups || !state.currentGroups[gIdx]) return;
    const group = state.currentGroups[gIdx];
    const card = document.querySelector(`.batch-group-card[data-group-idx="${gIdx}"]`);
    if (!card) return;

    const remainingItems = group.items.filter((rollItem, rIdx) => {
        const k = getItemKey(rollItem, gIdx, rIdx);
        return !getItemEdit(k, rollItem).enqueued;
    });

    const activeItems = remainingItems.filter((rollItem, rIdx) => {
        const k = getItemKey(rollItem, gIdx, rIdx);
        return !getItemEdit(k, rollItem).isExcluded;
    });

    const activeMeters = activeItems.reduce((acc, rollItem, rIdx) => {
        const k = getItemKey(rollItem, gIdx, rIdx);
        return acc + (Number(getItemEdit(k, rollItem).meters) || Number(rollItem.meters) || 0);
    }, 0);

    const rollTag = card.querySelector('.batch-chips-row .roll-tag');
    if (rollTag) {
        rollTag.textContent = `残り ${activeItems.length} 巻き (${activeMeters} m)`;
    }
}

async function enqueueSingleRollItem(itemId, gIdx, rIdx, event) {
    if (event) event.stopPropagation();
    const group = state.currentGroups?.[gIdx];
    const item = group?.items?.[rIdx] || (group && group.items.find(it => getItemKey(it, gIdx) === itemId));
    if (!item) {
        alert('対象の巻きが見つかりませんでした');
        return;
    }

    const edit = getItemEdit(itemId, item);
    if (edit.isExcluded) {
        alert('この巻きは「除外中」です。キューに追加する場合は先に「復帰」ボタンを押してください。');
        return;
    }

    // MANDATORY PHOTO VALIDATION
    if (!edit.photoUrl && !edit.photoBase64) {
        alert(`投入できません：Roll #${item.rollIndex || (rIdx + 1)} の材料ラベル写真が未撮影です。\n\n「写真撮影」ボタンを押してラベル写真を撮影してください。`);
        return;
    }

    const btn = event?.currentTarget;
    if (btn) {
        btn.disabled = true;
        btn.textContent = '投入中...';
    }

    try {
        const lotNoVal = edit.lotNo || `${(state.selectedDate || '').replace(/-/g, '').slice(2)}-${item.rollIndex || rIdx + 1}`;
        let photoUrl = edit.photoUrl || '';

        // Upload to storage if base64 and not uploaded yet
        if (edit.photoBase64 && (!photoUrl || !photoUrl.startsWith('http'))) {
            try {
                photoUrl = await uploadLabelPhotoToServer(edit.photoBase64, lotNoVal, item.hinban);
                setItemEdit(itemId, { photoUrl: photoUrl });
            } catch (err) {
                console.warn('Photo upload failed, using base64:', err);
                photoUrl = edit.photoBase64;
            }
        }

        const enqueuePayload = {
            date: state.selectedDate,
            machine: state.machineName || 'PSA2',
            worker: state.workerName || '作業者',
            groupId: group?.groupId || item.groupId || item.id,
            itemId: itemId,
            orderIndex: item.orderIndex || (rIdx + 1),
            hinban: item.hinban || '',
            hinmei: item.hinmei || '',
            kizai: item.kizai || group?.kizai || '',
            color: item.color || group?.color || '',
            zuban: item.zuban || group?.zuban || '',
            okyakuHinban: item.okyakuHinban || '',
            labelHinban: item.labelHinban || '',
            shippingDest: item.shippingDest || group?.shippingDest || '',
            totalRolls: Number(item.totalRolls) || Number(group?.items?.length) || 1,
            totalMeters: Number(group?.totalMeters) || Number(edit.meters) || 0,
            rollMeters: Number(edit.meters) || Number(item.meters) || 0,
            meters: Number(edit.meters) || Number(item.meters) || 0,
            rollIndex: Number(item.rollIndex) || (rIdx + 1),
            lotNo: lotNoVal,
            rawMaterialQR: edit.qrScanned || '',
            rawMaterialLength: String(edit.meters || item.meters || ''),
            manufacturerUid: '',
            photoUrl: photoUrl || ''
        };

        const res = await fetch(`${serverURL}/api/production/queue/enqueue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enqueuePayload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'キュー追加に失敗しました');
        }

        const mongoId = data._id || data.item?._id || '';
        const assignedStatus = data.item?.status || 'in-progress';
        const timeNow = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        setItemEdit(itemId, {
            enqueued: true,
            enqueuedAt: timeNow,
            mongoProductionId: mongoId,
            status: assignedStatus,
            lotNo: lotNoVal,
            hinban: item.hinban || '',
            kizai: item.kizai || group?.kizai || '',
            orderIndex: item.orderIndex || (rIdx + 1),
            rollIndex: item.rollIndex || (rIdx + 1),
            meters: edit.meters
        });

        notifyPdfDisplayer(item, item.zuban);
        showToast(`Roll #${item.rollIndex || (rIdx + 1)} を投入キューに追加しました`, 'success', 3000);

        await fetchProductionQueue();
        renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
        updateHistoryBadges();

    } catch (err) {
        console.error('Error in enqueueSingleRollItem:', err);
        alert(`投入エラー: ${err.message}`);
        if (btn) {
            btn.disabled = false;
            btn.textContent = '投入';
        }
    }
}

async function enqueueBatchGroup(gIdx, event) {
    if (event) event.stopPropagation();
    const group = state.currentGroups?.[gIdx];
    if (!group) return;

    // Filter remaining non-enqueued items
    const remainingItems = group.items.map((rollItem, rIdx) => ({
        item: rollItem,
        rIdx,
        itemId: getItemKey(rollItem, gIdx, rIdx),
        edit: getItemEdit(getItemKey(rollItem, gIdx, rIdx), rollItem)
    })).filter(entry => !entry.edit.enqueued);

    if (remainingItems.length === 0) {
        alert('このカードの全巻きは既に投入済です。');
        return;
    }

    // Filter active items (not excluded)
    const activeEntries = remainingItems.filter(entry => !entry.edit.isExcluded);
    if (activeEntries.length === 0) {
        alert('投入可能な巻きがありません（すべて除外中です。「除外解除」を行ってください）。');
        return;
    }

    // MANDATORY PHOTO VALIDATION FOR ALL ACTIVE ITEMS
    const missingPhotos = activeEntries.filter(entry => !entry.edit.photoUrl && !entry.edit.photoBase64);
    if (missingPhotos.length > 0) {
        const rollList = missingPhotos.map(e => `・Roll #${e.item.rollIndex || (e.rIdx + 1)}`).join('\n');
        alert(`投入できません：以下の巻きの材料ラベル写真が未撮影です。\n${rollList}\n\n対象の巻きの写真撮影を行ってから再度投入してください。`);
        return;
    }

    const btn = event?.currentTarget;
    if (btn) {
        btn.disabled = true;
        btn.textContent = '投入中...';
    }

    try {
        let enqueuedCount = 0;

        for (const entry of activeEntries) {
            const { item, rIdx, itemId, edit } = entry;
            const lotNoVal = edit.lotNo || `${(state.selectedDate || '').replace(/-/g, '').slice(2)}-${item.rollIndex || rIdx + 1}`;
            let photoUrl = edit.photoUrl || '';

            if (edit.photoBase64 && (!photoUrl || !photoUrl.startsWith('http'))) {
                try {
                    photoUrl = await uploadLabelPhotoToServer(edit.photoBase64, lotNoVal, item.hinban);
                    setItemEdit(itemId, { photoUrl: photoUrl });
                } catch (err) {
                    photoUrl = edit.photoBase64;
                }
            }

            const enqueuePayload = {
                date: state.selectedDate,
                machine: state.machineName || 'PSA2',
                worker: state.workerName || '作業者',
                groupId: group.groupId,
                hinban: item.hinban || '',
                hinmei: item.hinmei || '',
                kizai: item.kizai || group.kizai || '',
                color: item.color || group.color || '',
                zuban: item.zuban || group.zuban || '',
                okyakuHinban: item.okyakuHinban || '',
                labelHinban: item.labelHinban || '',
                shippingDest: item.shippingDest || group.shippingDest || '',
                totalRolls: Number(item.totalRolls) || Number(group.items.length) || 1,
                totalMeters: Number(group.totalMeters) || Number(edit.meters) || 0,
                rollMeters: Number(edit.meters) || Number(item.meters) || 0,
                rollIndex: Number(item.rollIndex) || (rIdx + 1),
                lotNo: lotNoVal,
                rawMaterialQR: '',
                rawMaterialLength: String(edit.meters || item.meters || ''),
                manufacturerUid: '',
                photoUrl: photoUrl || ''
            };

            const res = await fetch(`${serverURL}/api/production/queue/enqueue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enqueuePayload)
            });

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data.success) {
                    const timeNow = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                    setItemEdit(itemId, {
                        enqueued: true,
                        enqueuedAt: timeNow,
                        lotNo: lotNoVal,
                        hinban: item.hinban || '',
                        kizai: item.kizai || group.kizai || '',
                        orderIndex: item.orderIndex || (rIdx + 1),
                        rollIndex: item.rollIndex || (rIdx + 1),
                        meters: edit.meters
                    });
                    enqueuedCount++;
                }
            }
        }

        if (activeEntries[0]) {
            notifyPdfDisplayer(activeEntries[0].item, activeEntries[0].item.zuban);
        }

        showToast(`「${group.kizai || group.hinban}」${enqueuedCount} 巻を投入キューに追加しました`, 'success', 3500);

        await fetchProductionQueue();
        renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
        updateHistoryBadges();

    } catch (err) {
        console.error('Error in enqueueBatchGroup:', err);
        alert(`一括投入エラー: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '投入';
        }
    }
}

// -----------------------------------------------------
// Modal & Batch Action Popup Helpers
// -----------------------------------------------------
function showBatchModal(title, bodyHTML, actionsHTML) {
    console.log('📢 Opening batch modal:', title);
    const modal = document.getElementById('batchActionModal');
    const titleEl = document.getElementById('batchModalTitle');
    const bodyEl = document.getElementById('batchModalBody');
    const actionsEl = document.getElementById('batchModalActions');

    if (!modal) {
        console.error('❌ #batchActionModal element not found in DOM!');
        return;
    }
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHTML;
    if (actionsEl) actionsEl.innerHTML = actionsHTML;

    modal.classList.add('open', 'active');
    modal.style.display = 'flex';
}

function closeBatchModal() {
    console.log('🔒 Closing batch modal');
    const modal = document.getElementById('batchActionModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
}

function switchListViewMode(mode) {
    state.listViewMode = mode;
    localStorage.setItem('firstkojo_list_view_mode', mode);
    updateViewModeButtons();
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
}

function updateViewModeButtons() {
    const btnCard = document.getElementById('btnViewCard');
    const btnTable = document.getElementById('btnViewTable');
    if (btnCard) btnCard.classList.toggle('active', state.listViewMode === 'card');
    if (btnTable) btnTable.classList.toggle('active', state.listViewMode === 'table');
}

// Check whether a roll is already enqueued, in-progress, completed, or active across any connected tablet
function isRollEnqueuedOrProcessed(rollItem, group, gIdx, rIdx) {
    if (!rollItem) return false;
    const itemId = getItemKey(rollItem, gIdx, rIdx);
    const edit = getItemEdit(itemId, rollItem);

    if (!state.stagingQueue || !Array.isArray(state.stagingQueue) || state.stagingQueue.length === 0) {
        return Boolean(edit.enqueued);
    }

    const targetRollIdx = Number(rollItem.rollIndex || (rIdx !== undefined ? rIdx + 1 : 1));
    const targetOrderIdx = Number(rollItem.orderIndex);
    const targetGroupId = group?.groupId || rollItem.groupId;
    const targetHinban = rollItem.hinban || group?.hinban;
    const targetKizai = rollItem.kizai || group?.kizai;

    const found = state.stagingQueue.find(doc => {
        if (!doc) return false;
        if (doc.status === 'cancelled' || doc.status === 'deleted') return false;

        // 1. Direct itemId / rollItem.id match
        if (doc.itemId && (doc.itemId === itemId || doc.itemId === rollItem.id)) {
            return true;
        }

        // 2. Direct mongoId match
        if (edit.mongoProductionId && doc._id && String(doc._id) === String(edit.mongoProductionId)) {
            return true;
        }

        // 3. Exact groupId + rollIndex match
        if (targetGroupId && doc.groupId && doc.groupId === targetGroupId) {
            if (Number(doc.rollIndex) === targetRollIdx) {
                return true;
            }
        }

        // 4. Exact orderIndex match
        if (targetOrderIdx && Number(doc.orderIndex) === targetOrderIdx) {
            return true;
        }

        return false;
    });

    if (found) {
        // Sync to local edits so that future checks and history tab immediately have accurate status
        if (!edit.enqueued) {
            setItemEdit(itemId, {
                enqueued: true,
                mongoProductionId: found._id,
                status: found.status || 'in-progress',
                photoUrl: found.photoUrl || found.imageUrl || edit.photoUrl || '',
                lotNo: found.lotNo || edit.lotNo || '',
                bicho: found.bicho || found.meters || edit.bicho,
                meters: found.meters || found.bicho || edit.meters
            });
        }
        return true;
    } else {
        // If stagingQueue is loaded and item is NOT in the queue (e.g. was deleted or cancelled),
        // clear any stale enqueued flag in local edits so it doesn't linger as processed
        if (edit.enqueued) {
            setItemEdit(itemId, {
                enqueued: false,
                status: 'pending',
                mongoProductionId: null
            });
        }
    }

    return false;
}

// -----------------------------------------------------
// Print-style Schedule & History Table Shared Helpers
// -----------------------------------------------------
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function ensureMasterData(month) {
    if (state.masterData && state.masterData.length > 0) return state.masterData;
    try {
        const m = month || (state.selectedDate ? state.selectedDate.substring(0, 7) : new Date().toISOString().substring(0, 7));
        const res = await fetch(`${serverURL}/api/production/schedule?month=${encodeURIComponent(m)}`);
        if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                state.masterData = json.data;
                return state.masterData;
            }
        }
    } catch (e) {
        console.warn('Could not load masterData:', e);
    }
    return [];
}

function getScheduleMasterInfo(hinban) {
    const found = (state.masterData || []).find(d => d.hinban === hinban);
    const rawMaster = found?.materialInfo?.rawMaster || {};
    const hinmoku = rawMaster['品目マスタ'] || {};
    const segments = rawMaster['品番構造']?.segments || [];

    const kizaiSeg = segments.find(s => s.segment === '基材コード');
    const kizai = kizaiSeg?.name || kizaiSeg?.['得意先'] || kizaiSeg?.['入出荷先'] || rawMaster['基材コード'] || found?.kizai || '—';

    const shoriSeg = segments.find(s => s.segment === '処理コード');
    const shori = shoriSeg?.name || shoriSeg?.['得意先'] || shoriSeg?.['入出荷先'] || rawMaster['処理コード'] || found?.shori || '—';

    const colorSeg = segments.find(s => s.segment === '色コード');
    const color = colorSeg?.name || colorSeg?.['得意先'] || colorSeg?.['入出荷先'] || rawMaster['色コード'] || found?.color || '—';

    const habanagaSeg = segments.find(s => s.segment === '幅長コード');
    const habanaga = habanagaSeg?.name || habanagaSeg?.['得意先'] || habanagaSeg?.['入出荷先'] || rawMaster['幅長コード'] || found?.habanaga || '—';

    const shippingDest = hinmoku['出荷先名'] || hinmoku['入出荷先名'] || hinmoku['得意先名'] || found?.shippingDest || '—';
    const kataban = hinmoku['型番'] || found?.materialInfo?.kataban || '—';
    const zuban = hinmoku['図番'] || '—';
    const hinmei = hinmoku['品名'] || found?.hinmei || '—';
    const labelHinban = hinmoku['ラベル品番'] || found?.labelHinban || '—';

    const bom = Array.isArray(rawMaster.BOM) ? rawMaster.BOM : [];
    const p2010 = bom.find(b => Number(b['工程コード']) === 2010 || b['工程名'] === '粘着工程');
    const timeOption = p2010?.['時間オプション'] || found?.materialInfo?.timeOption || '';
    const rawUnit = p2010?.['生産単位'] || found?.materialInfo?.rawUnit || null;
    const unitName = typeof rawUnit === 'object' ? rawUnit?.name : String(rawUnit || '');
    const unit = (unitName === '枚' || found?.materialInfo?.unit === '枚') ? '枚' : 'm';

    return {
        kizai,
        shori,
        color,
        habanaga,
        shippingDest,
        kataban,
        timeOption,
        unit,
        zuban,
        hinmei,
        labelHinban
    };
}

function isScheduleRowProcessed(item, idx, groups) {
    if (!item) return false;
    if (item.type === 'setup') return false;

    // 1. Try finding matching group and roll in current groups
    let matchedGroup = null;
    let matchedGIdx = -1;
    let matchedRIdx = -1;

    if (groups && Array.isArray(groups)) {
        for (let gi = 0; gi < groups.length; gi++) {
            const grp = groups[gi];
            if (grp && grp.items) {
                const ri = grp.items.findIndex(it => 
                    it === item || 
                    (it.id && item.id && it.id === item.id) ||
                    (it.orderIndex !== undefined && item.orderIndex !== undefined && Number(it.orderIndex) === Number(item.orderIndex))
                );
                if (ri !== -1) {
                    matchedGroup = grp;
                    matchedGIdx = gi;
                    matchedRIdx = ri;
                    break;
                }
            }
        }
    }

    if (matchedGroup && matchedGIdx !== -1 && matchedRIdx !== -1) {
        return isRollEnqueuedOrProcessed(item, matchedGroup, matchedGIdx, matchedRIdx);
    }

    return isRollEnqueuedOrProcessed(item, null, undefined, idx);
}

function renderScheduleTableView(groups, items) {
    let scheduleItems = state.scheduledItems;
    if (!scheduleItems || scheduleItems.length === 0) {
        if (state.dailySchedule && Array.isArray(state.dailySchedule.scheduleOrder) && state.dailySchedule.scheduleOrder.length > 0) {
            scheduleItems = computeTimeSchedule(state.dailySchedule.scheduleOrder, state.dailySchedule.startTime || '08:00');
            state.scheduledItems = scheduleItems;
        } else if (items && items.length > 0) {
            scheduleItems = items;
        }
    }

    if (!scheduleItems || scheduleItems.length === 0) {
        return `
            <div class="schedule-empty-state">
                <h3>この日の生産予定はありません</h3>
                <p>上部の日付選択から他の日付を選択するか、再読込ボタンを押してください。</p>
            </div>
        `;
    }

    let totalMeters = 0;
    let totalPieces = 0;
    let totalMins = 0;
    let rollCount = 0;
    let lastKizai = null;
    const rows = [];

    scheduleItems.forEach((item, idx) => {
        totalMins += Number(item.duration) || 0;

        if (item.type === 'setup') {
            const displayName = item.comment ? `${item.name} ${item.comment}` : (item.name || '段取');
            rows.push(`
                <tr class="setup-row">
                    <td class="center font-bold">${idx + 1}</td>
                    <td class="center font-bold time-cell">${escapeHtml(item.startTime)}<br><span class="text-sub">～ ${escapeHtml(item.endTime)}</span></td>
                    <td colspan="7" class="left font-bold setup-name">⚙️ 段取り / 段替: ${escapeHtml(displayName)} (${item.duration}分)</td>
                    <td class="center font-bold">—</td>
                </tr>
            `);
            lastKizai = null;
            return;
        }

        rollCount++;
        const qtyVal = Number(item.meters) || 0;
        const info = getScheduleMasterInfo(item.hinban);
        const itemUnit = item.unit || info.unit || 'm';

        if (itemUnit === '枚') {
            totalPieces += qtyVal;
        } else {
            totalMeters += qtyVal;
        }

        const cmVal = qtyVal * 100;
        const kizaiDisplay = (info.kizai && info.kizai !== '—') ? info.kizai : (item.kizai || '—');
        const currentKizai = kizaiDisplay;

        // If 基材コード changes to a different one, insert a blank black separator row
        if (lastKizai !== null && lastKizai !== currentKizai) {
            rows.push(`
                <tr class="separator-black-row">
                    <td colspan="10"></td>
                </tr>
            `);
        }
        lastKizai = currentKizai;

        const rawDest = (info.shippingDest && info.shippingDest !== '—') ? info.shippingDest : (item.shippingDest || '—');
        const formattedDest = escapeHtml(rawDest).replace(/\n/g, '<br>');

        const shoriDisplay = (info.shori && info.shori !== '—') ? info.shori : (item.shori || '—');
        const colorDisplay = (info.color && info.color !== '—') ? info.color : (item.color || '—');
        const habanagaDisplay = (info.habanaga && info.habanaga !== '—') ? info.habanaga : (item.habanaga || '—');

        const katabanVal = (info.kataban && info.kataban !== '—') ? info.kataban : (item.kataban || '—');
        const timeOptionVal = info.timeOption || item.timeOption || '';
        const katabanDisplay = (katabanVal !== '—')
            ? `${escapeHtml(katabanVal)}${timeOptionVal ? `<br><span class="text-sub">(${escapeHtml(timeOptionVal)})</span>` : ''}`
            : '—';

        const qtyDisplay = itemUnit === '枚'
            ? `${qtyVal.toLocaleString()} 枚`
            : `${cmVal.toLocaleString()} cm (${qtyVal}m)`;

        const isProcessed = isScheduleRowProcessed(item, idx, groups);

        // Map item to corresponding group and roll index in groups
        let matchedGIdx = 0;
        let matchedRIdx = 0;
        if (groups && Array.isArray(groups)) {
            for (let gi = 0; gi < groups.length; gi++) {
                const grp = groups[gi];
                if (grp && grp.items) {
                    const ri = grp.items.findIndex(it => 
                        it === item || 
                        (it.id && item.id && it.id === item.id) ||
                        (it.orderIndex !== undefined && item.orderIndex !== undefined && Number(it.orderIndex) === Number(item.orderIndex))
                    );
                    if (ri !== -1) {
                        matchedGIdx = gi;
                        matchedRIdx = ri;
                        break;
                    }
                }
            }
        }
        const itemId = getItemKey(item, matchedGIdx, matchedRIdx);

        rows.push(`
            <tr class="item-row ${isProcessed ? 'is-processed' : ''}" data-item-id="${escapeHtml(itemId)}" onclick="openMaterialFeedModalForRollItem('${escapeHtml(itemId)}', ${matchedGIdx}, ${matchedRIdx}, event)" style="cursor: pointer;" title="${isProcessed ? '処理済み (キューに追加済)' : _t('fk_btn_feed')}">
                <td class="center font-bold">${idx + 1}</td>
                <td class="center time-cell">
                    <strong>${escapeHtml(item.startTime || '—')}</strong><br>
                    <span class="text-sub">～ ${escapeHtml(item.endTime || '—')}</span>
                </td>
                <td class="center dest-cell">${formattedDest}</td>
                <td class="left kizai-cell">${escapeHtml(kizaiDisplay)}</td>
                <td class="center shori-cell">${escapeHtml(shoriDisplay)}</td>
                <td class="center color-cell">${escapeHtml(colorDisplay)}</td>
                <td class="center habanaga-cell">${escapeHtml(habanagaDisplay)}</td>
                <td class="center kataban-cell">${katabanDisplay}</td>
                <td class="center roll-cell font-bold">${item.rollIndex || 1}/${item.totalRolls || 1}</td>
                <td class="right qty-cell font-bold">${qtyDisplay}</td>
            </tr>
        `);
    });

    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const timeFormatted = `${hours}時間 ${mins}分 (${totalMins}分)`;

    const overallStartTime = scheduleItems.length > 0 ? (scheduleItems[0].startTime || '09:00') : '09:00';
    const overallEndTime = scheduleItems.length > 0 ? (scheduleItems[scheduleItems.length - 1].endTime || '—') : '—';
    const plannedTimeSpan = `${overallStartTime} ～ ${overallEndTime}`;

    const totalProdFormatted = `${totalMeters > 0 ? `${totalMeters.toLocaleString()} m` : ''}${totalMeters > 0 && totalPieces > 0 ? ' / ' : ''}${totalPieces > 0 ? `${totalPieces.toLocaleString()} 枚` : ''}${totalMeters > 0 ? ` (${(totalMeters * 100).toLocaleString()} cm)` : ''}`;

    return `
        <div class="history-sheet">
            <div class="history-summary-strip">
                <span>予定時: <strong>${escapeHtml(plannedTimeSpan)}</strong> (${escapeHtml(timeFormatted)})</span>
                <span>予定総数: <strong>${rollCount} 巻/束</strong> (${scheduleItems.length} 工程)</span>
                <span>予定総生産量: <strong>${totalProdFormatted}</strong></span>
            </div>

            <table class="history-schedule-table">
                <thead>
                    <tr>
                        <th style="width: 4%;">No.</th>
                        <th style="width: 8%;">時間</th>
                        <th style="width: 14%;">出荷先名</th>
                        <th style="width: 22%;">基材コード</th>
                        <th style="width: 8%;">処理コード</th>
                        <th style="width: 9%;">色コード</th>
                        <th style="width: 9%;">幅長コード</th>
                        <th style="width: 9%;">型番</th>
                        <th style="width: 6%;">巻数</th>
                        <th style="width: 11%;">生産数量</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderScheduleList(items, startTimeStr) {
    const container = document.getElementById('scheduleListContainer');
    if (!container) return;

    updateScheduleStats(items, startTimeStr);
    updateViewModeButtons();

    const groups = groupScheduledItems(items);
    state.currentGroups = groups;

    if (state.listViewMode === 'table') {
        container.innerHTML = renderScheduleTableView(groups, items);
        return;
    }

    let html = '';

    groups.forEach((group, gIdx) => {
        const isGroupTinted = (gIdx % 2 === 0);
        const lifecycle = getGroupLifecycle(group.groupId);

        if (group.type === 'setup') {
            const setupItem = group.items[0];
            html += `
                <div class="schedule-setup-row" data-id="${setupItem.id}">
                    <div class="schedule-setup-left">
                        <span class="setup-tag-pill">#${setupItem.orderIndex} 段替</span>
                        <span class="setup-title-text">${setupItem.name || '段替え'}</span>
                    </div>
                    <div class="setup-time-text">${setupItem.startTime} - ${setupItem.endTime} (${setupItem.duration} 分)</div>
                </div>
            `;
        } else {
            // Check remaining items that have not been enqueued yet across all tablets
            const remainingItems = group.items.filter((rollItem, rIdx) => {
                return !isRollEnqueuedOrProcessed(rollItem, group, gIdx, rIdx);
            });

            // When all items in a card are enqueued, the card disappears from the List tab!
            if (remainingItems.length === 0) {
                return;
            }

            const firstItem = remainingItems[0];
            const lastItem = remainingItems[remainingItems.length - 1];
            const orderRangeText = remainingItems.length > 1 ? `#${firstItem.orderIndex} — #${lastItem.orderIndex}` : `#${firstItem.orderIndex}`;

            const kizaiCode = group.kizai || group.hinban || '基材未設定';

            // Check active items (not excluded)
            const activeItems = remainingItems.filter((rollItem, rIdx) => {
                const origRIdx = group.items.indexOf(rollItem);
                const safeRIdx = origRIdx >= 0 ? origRIdx : rIdx;
                const itemId = getItemKey(rollItem, gIdx, safeRIdx);
                return !getItemEdit(itemId, rollItem).isExcluded;
            });

            const activeMeters = activeItems.reduce((acc, rollItem, rIdx) => {
                const origRIdx = group.items.indexOf(rollItem);
                const safeRIdx = origRIdx >= 0 ? origRIdx : rIdx;
                const itemId = getItemKey(rollItem, gIdx, safeRIdx);
                return acc + (Number(getItemEdit(itemId, rollItem).meters) || Number(rollItem.meters) || 0);
            }, 0);

            const excludedCount = remainingItems.length - activeItems.length;

            const queuedItem = state.stagingQueue.find(q =>
                (q.groupId === group.groupId || q.hinban === group.hinban || q.kizai === group.kizai) &&
                (q.status === 'active' || q.status === 'in-progress' || q.status === 'queued' || q.status === 'queue')
            );
            const isQueueActive = queuedItem && (queuedItem.status === 'active' || queuedItem.status === 'in-progress');
            const isQueued = queuedItem && (queuedItem.status === 'queued' || queuedItem.status === 'queue');

            let statusTagHTML = '';
            if (lifecycle.status === 'completed') {
                statusTagHTML = `<span class="batch-status-tag status-completed">${_t('fk_status_completed')} (${lifecycle.actualDurationMins || ''}${_t('fk_min_unit')})</span>`;
            } else if (isQueueActive) {
                statusTagHTML = `<span class="batch-status-tag status-active">${_t('fk_status_laminating')}</span>`;
            } else if (isQueued) {
                statusTagHTML = `<span class="batch-status-tag status-queued">${_t('fk_status_queued')}</span>`;
            } else if (lifecycle.status === 'in-progress' || lifecycle.status === 'running') {
                statusTagHTML = `<span class="batch-status-tag status-active">${_t('fk_status_in_progress')}</span>`;
            } else {
                statusTagHTML = `<span class="batch-status-tag status-pending">${_t('fk_waiting_tag')}</span>`;
            }

            const destText = group.shippingDest ? `<span class="batch-meta-divider">•</span><span class="batch-meta-item"><span class="batch-meta-label">${_t('fk_shipping_dest')}</span> <span class="batch-meta-val">${group.shippingDest}</span></span>` : '';
            const colorText = group.color ? `<span class="batch-meta-divider">•</span><span class="batch-meta-item"><span class="batch-meta-label">${_t('fk_color')}</span> <span class="batch-meta-val">${group.color}</span></span>` : '';
            let rollSummaryText = '';
            if (excludedCount > 0) {
                rollSummaryText = `<span class="batch-meta-divider">•</span><span class="tag-pill tag-excluded" style="font-size: 0.75rem; padding: 2px 7px;">${_t('fk_btn_exclude')}: ${excludedCount} ${_t('fk_roll_count')}</span>`;
            }

            const isExpanded = state.expandedGroups && state.expandedGroups.has(group.groupId);

            html += `
                <div class="batch-group-card ${isGroupTinted ? 'group-tinted' : ''} ${isExpanded ? 'is-expanded' : ''}" 
                     data-group-id="${group.groupId}" 
                     data-group-idx="${gIdx}"
                     data-total-rolls="${remainingItems.length}">
                    
                    <div class="batch-header" onclick="toggleBatchGroupExpand(${gIdx}, event)" title="タップして内訳を展開/折りたたみ">
                        <div class="batch-header-left">
                            <span class="batch-order-range">${orderRangeText}</span>
                            <div class="batch-title-and-meta">
                                <div class="batch-hinban-title">${kizaiCode}</div>
                                <div class="batch-chips-row">
                                    <span class="batch-time-text">${group.startTime} - ${group.endTime}</span>
                                    ${destText}
                                    ${colorText}
                                    ${rollSummaryText}
                                </div>
                            </div>
                        </div>

                        <div class="batch-header-right">
                            <div class="batch-top-status">
                                ${statusTagHTML}
                            </div>
                            <button type="button" class="btn-detail-secondary" onclick="previewBatchGroup(${gIdx}, event)" title="${_t('fk_btn_detail')}">
                                ${_t('fk_btn_detail')}
                            </button>
                            <div class="batch-expand-icon" title="${isExpanded ? '内訳を閉じる' : '内訳を展開'}">
                                <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                            </div>
                        </div>
                    </div>

                    <div class="batch-rolls-list">
                        ${remainingItems.map((rollItem, rIdx) => {
                const origRIdx = group.items.indexOf(rollItem);
                const safeRIdx = origRIdx >= 0 ? origRIdx : rIdx;
                const itemId = getItemKey(rollItem, gIdx, safeRIdx);
                const edit = getItemEdit(itemId, rollItem);
                const isExcluded = edit.isExcluded === true;
                const currentMeters = edit.bicho || edit.meters || (Number(rollItem.meters) || 100);
                const hasPhoto = Boolean(edit.photoUrl);
                const actualRollIndex = rollItem.rollIndex || (safeRIdx + 1);

                if (isExcluded) {
                    return `
                                    <div class="batch-roll-row is-excluded-row" data-item-id="${itemId}">
                                        <div class="roll-row-left">
                                            <span class="roll-sub-badge">#${rollItem.orderIndex}</span>
                                            <span class="roll-time">${rollItem.startTime} - ${rollItem.endTime}</span>
                                            <span class="tag-pill roll-tag" style="font-size: 0.8rem; padding: 2px 8px;">${actualRollIndex} / ${rollItem.totalRolls || group.items.length} ${_t('fk_roll_unit')}</span>
                                            <span class="tag-pill meter-tag" style="font-size: 0.8rem; padding: 2px 8px;">${currentMeters} m</span>
                                            <span class="tag-pill tag-excluded" style="font-size: 0.775rem; padding: 2px 8px;">${_t('fk_status_excluded')}</span>
                                        </div>
                                        <div class="roll-row-right" onclick="event.stopPropagation()" style="display: flex; gap: 6px; align-items: center;">
                                            <button type="button" class="btn-roll-exclude is-excluded" onclick="toggleRollItemExclude('${itemId}', ${gIdx}, ${safeRIdx}, event)" title="${_t('fk_btn_restore')}">
                                                ${_t('fk_btn_restore')}
                                            </button>
                                            <button type="button" class="btn-detail-secondary" onclick="previewBatchGroup(${gIdx}, event, ${safeRIdx})" title="${_t('fk_btn_detail')}">
                                                ${_t('fk_btn_detail')}
                                            </button>
                                        </div>
                                    </div>
                                `;
                }

                return `
                                <div class="batch-roll-row" data-item-id="${itemId}" onclick="openMaterialFeedModalForRollItem('${itemId}', ${gIdx}, ${safeRIdx}, event)" title="${_t('fk_btn_feed')}">
                                    <div class="roll-row-left">
                                        <span class="roll-sub-badge">#${rollItem.orderIndex}</span>
                                        <span class="roll-time">${rollItem.startTime} - ${rollItem.endTime}</span>
                                        <span class="tag-pill roll-tag" style="font-size: 0.8rem; padding: 2px 8px;">${actualRollIndex} / ${rollItem.totalRolls || group.items.length} ${_t('fk_roll_unit')}</span>

                                        <!-- Length Display -->
                                        <span class="tag-pill meter-tag" style="font-size: 0.8rem; padding: 2px 8px;" title="美長 / 純長">${currentMeters ? currentMeters + ' m' : '-'}</span>

                                        <!-- Flat Camera Status Pill -->
                                        <span class="flat-camera-pill ${hasPhoto ? 'is-shot' : 'is-unshot'}" title="${hasPhoto ? _t('fk_status_shot') : _t('fk_status_unshot')}">
                                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2 3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                                            ${hasPhoto ? _t('fk_status_shot') : _t('fk_status_unshot')}
                                        </span>
                                    </div>

                                    <div class="roll-row-right" onclick="event.stopPropagation()" style="display: flex; gap: 6px; align-items: center;">
                                        <button type="button" class="btn-roll-exclude" onclick="toggleRollItemExclude('${itemId}', ${gIdx}, ${safeRIdx}, event)" title="${_t('fk_btn_exclude')}">
                                            ${_t('fk_btn_exclude')}
                                        </button>
                                        <button type="button" class="btn-feed-row-flat" onclick="openMaterialFeedModalForRollItem('${itemId}', ${gIdx}, ${safeRIdx}, event)" title="${_t('fk_btn_feed')}">
                                            ${_t('fk_btn_feed')}
                                        </button>
                                        <button type="button" class="btn-detail-secondary" onclick="previewBatchGroup(${gIdx}, event, ${safeRIdx})" title="${_t('fk_btn_detail')}">
                                            ${_t('fk_btn_detail')}
                                        </button>
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}

function toggleBatchGroupExpand(groupIndex, event) {
    if (event) event.stopPropagation();
    const card = document.querySelector(`.batch-group-card[data-group-idx="${groupIndex}"]`);
    if (!card) return;

    if (!state.expandedGroups) state.expandedGroups = new Set();
    const groupId = card.getAttribute('data-group-id') || String(groupIndex);

    const isExpanded = card.classList.toggle('is-expanded');
    if (isExpanded) {
        state.expandedGroups.add(groupId);
    } else {
        state.expandedGroups.delete(groupId);
    }

    const expandIcon = card.querySelector('.batch-expand-icon');
    if (expandIcon) {
        expandIcon.title = isExpanded ? '内訳を閉じる' : '内訳を展開';
    }

    const toggleBtn = card.querySelector('.btn-card-expand-toggle');
    if (toggleBtn) {
        const totalRolls = card.getAttribute('data-total-rolls') || '1';
        const label = toggleBtn.querySelector('.toggle-label');
        if (label) label.textContent = isExpanded ? '閉じる' : `内訳 (${totalRolls}巻)`;
    }
}

// -----------------------------------------------------
// Batch Lifecycle Action Handlers
// -----------------------------------------------------

// 1. Preview Specs (Tablet Only - DOES NOT touch overhead monitor)
function previewBatchGroup(groupIndex, event, rollIndex = 0) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    if (group.type === 'setup') {
        selectScheduleItem(group.itemIndexStart);
        return;
    }

    const targetItem = group.items[rollIndex] || group.items[0];
    state.selectedItem = targetItem;
    state.selectedGroup = group;
    sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(targetItem));

    // Jump to Info tab without broadcasting to pdfDisplayer
    switchMainTab(3);
    loadItemDetail(targetItem);
}

function getCurrentlyRunningGroup() {
    if (!state.currentGroups) return null;
    for (let i = 0; i < state.currentGroups.length; i++) {
        const g = state.currentGroups[i];
        const lc = getGroupLifecycle(g.groupId);
        if (lc && (lc.status === 'in-progress' || lc.status === 'running')) {
            return { group: g, index: i, lifecycle: lc };
        }
    }
    return null;
}

// 2. Start Production (Records Start Time & Locks pdfDisplayer)
function startBatchGroup(groupIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];

    // Single Active Lot Guard: Prevent starting if another group is currently running
    const activeRunning = getCurrentlyRunningGroup();
    if (activeRunning && activeRunning.group.groupId !== group.groupId) {
        console.warn('⚠️ Cannot start lot. Another lot is currently running:', activeRunning.group.hinban);
        const bodyHTML = `
            <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: var(--btn-radius); padding: 14px; margin-bottom: 16px;">
                <div style="font-size: 0.85rem; font-weight: 800; color: #DC2626; margin-bottom: 4px;">⚠️ 他のロットが生産中です</div>
                <div style="font-size: 1.05rem; font-weight: 900; color: #991B1B;">${activeRunning.group.hinban}</div>
                <div style="font-size: 0.8rem; color: #7F1D1D; margin-top: 4px;">開始時間: ${activeRunning.lifecycle.actualStartTime || '--:--'} (現在モニター表示中)</div>
            </div>
            <p style="font-size: 0.9rem; color: var(--text-soft); line-height: 1.6;">
                1台のマシンで同時に複数のロットを開始することはできません。<br>
                新しいロット「<strong>${group.hinban}</strong>」を開始する前に、進行中のロットを<strong>完了</strong>または<strong>中断</strong>してください。
            </p>
        `;
        const actionsHTML = `
            <button type="button" class="btn btn-secondary" onclick="closeBatchModal()">戻る</button>
            <button type="button" class="btn btn-primary" style="background: #10B981; border-color: #10B981;" onclick="closeBatchModal(); showDoneConfirmation(${activeRunning.index})">進行中ロットを完了する</button>
        `;
        showBatchModal('生産開始の制限 (Single Active Lot)', bodyHTML, actionsHTML);
        return;
    }

    const now = new Date();
    const startTimeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    setGroupLifecycle(group.groupId, {
        status: 'in-progress',
        actualStartTime: startTimeStr,
        startEpoch: now.getTime(),
        actualEndTime: null,
        actualDurationMins: null
    });

    // Sync to backend collection (firstFactoryProduction)
    syncProductionStatusToServer(group, {
        status: 'in-progress',
        actualStartTime: startTimeStr,
        startEpoch: now.getTime(),
        actualEndTime: null,
        actualDurationMins: null
    });

    state.selectedItem = group.items[0];
    state.selectedGroup = group;
    sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(group.items[0]));

    // Broadcast to pdfDisplayer
    if (group.zuban) {
        notifyPdfDisplayer(group.items[0], group.zuban);
    }

    // Refresh UI & switch to Info tab
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
    switchMainTab(3);
    loadItemDetail(group.items[0]);
}

// 3. Show Done Confirmation Modal
function showDoneConfirmation(groupIndex, event) {
    if (event) event.stopPropagation();
    console.log('🔴 showDoneConfirmation called for groupIndex:', groupIndex);
    if (!state.currentGroups || !state.currentGroups[groupIndex]) {
        console.error('❌ Group not found for index:', groupIndex, state.currentGroups);
        return;
    }
    const group = state.currentGroups[groupIndex];
    const lifecycle = getGroupLifecycle(group.groupId);

    const now = new Date();
    const endTimeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const startEpoch = lifecycle.startEpoch || (now.getTime() - 10 * 60 * 1000);
    const elapsedMins = Math.max(1, Math.round((now.getTime() - startEpoch) / (60 * 1000)));

    const bodyHTML = `
        <div style="background: var(--bg-subtle); padding: 14px; border-radius: var(--btn-radius); margin-bottom: 12px;">
            <div style="font-size: 1.1rem; font-weight: 900; color: var(--text-main); margin-bottom: 4px;">${group.hinban}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">全 ${group.items.length} 巻き (${group.totalMeters} m)</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center;">
            <div style="background: #FFFFFF; border: 1px solid var(--border); padding: 10px; border-radius: 6px;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">開始時間</div>
                <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main);">${lifecycle.actualStartTime || '--:--'}</div>
            </div>
            <div style="background: #FFFFFF; border: 1px solid var(--border); padding: 10px; border-radius: 6px;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">終了時間 (現在)</div>
                <div style="font-size: 1.05rem; font-weight: 800; color: var(--brand);">${endTimeStr}</div>
            </div>
            <div style="background: #ECFDF5; border: 1px solid #A7F3D0; padding: 10px; border-radius: 6px;">
                <div style="font-size: 0.75rem; color: #059669;">実稼働時間</div>
                <div style="font-size: 1.05rem; font-weight: 900; color: #047857;">${elapsedMins} 分</div>
            </div>
        </div>
        <p style="margin-top: 14px; text-align: center; color: var(--text-soft); font-weight: 600;">このロットの生産を完了として記録しますか？</p>
    `;

    const actionsHTML = `
        <button type="button" class="btn btn-secondary" onclick="closeBatchModal()">戻る (Cancel)</button>
        <button type="button" class="btn btn-primary" style="background: #10B981; border-color: #10B981;" onclick="confirmDoneBatch(${groupIndex})">完了確定 (Confirm Done)</button>
    `;

    showBatchModal('生産完了の確認 (Confirm Completion)', bodyHTML, actionsHTML);
}

// 4. Confirm Done
function confirmDoneBatch(groupIndex) {
    console.log('✅ confirmDoneBatch confirmed for groupIndex:', groupIndex);
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    const lifecycle = getGroupLifecycle(group.groupId);

    const now = new Date();
    const endTimeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const startEpoch = lifecycle.startEpoch || (now.getTime() - 10 * 60 * 1000);
    const elapsedMins = Math.max(1, Math.round((now.getTime() - startEpoch) / (60 * 1000)));

    // Save previous state for Undo
    state.lastDoneGroup = {
        groupId: group.groupId,
        groupIndex: groupIndex,
        prevState: { ...lifecycle }
    };

    setGroupLifecycle(group.groupId, {
        status: 'completed',
        actualEndTime: endTimeStr,
        endEpoch: now.getTime(),
        actualDurationMins: elapsedMins
    });

    // Sync to backend collection (firstFactoryProduction)
    syncProductionStatusToServer(group, {
        status: 'completed',
        actualEndTime: endTimeStr,
        endEpoch: now.getTime(),
        actualDurationMins: elapsedMins
    });

    // Deselect finished group from tablet so it is no longer highlighted
    if (state.selectedItem && group.items.some(it => it.id === state.selectedItem.id)) {
        state.selectedItem = null;
        state.selectedGroup = null;
        sessionStorage.removeItem('firstkojo_nippo_selected_item');
    }

    closeBatchModal();

    // Release pdfDisplayer monitor
    clearPdfDisplayer();

    // Re-render schedule list
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');

    // Trigger floating undo toast
    showUndoSnackbar(`ロット「${group.hinban}」を完了しました (${elapsedMins}分)`);
}

// 5. Cancel Batch
function cancelBatchGroup(groupIndex, event) {
    if (event) event.stopPropagation();
    console.log('✕ cancelBatchGroup called for groupIndex:', groupIndex);
    if (!state.currentGroups || !state.currentGroups[groupIndex]) {
        console.error('❌ Group not found for index:', groupIndex, state.currentGroups);
        return;
    }
    const group = state.currentGroups[groupIndex];

    const bodyHTML = `
        <p style="text-align: center; margin: 10px 0 20px 0; font-size: 1rem; color: var(--text-main);">
            ロット「<strong>${group.hinban}</strong>」の生産を中断し、<strong>待機中</strong>に戻しますか？<br>
            <span style="font-size: 0.85rem; color: var(--text-muted); display: block; margin-top: 6px;">※モニター表示も解除されます。</span>
        </p>
    `;

    const actionsHTML = `
        <button type="button" class="btn btn-secondary" onclick="closeBatchModal()">戻る</button>
        <button type="button" class="btn btn-alert" onclick="confirmCancelBatch(${groupIndex})">中断・待機に戻す</button>
    `;

    showBatchModal('生産中断の確認', bodyHTML, actionsHTML);
}

function confirmCancelBatch(groupIndex) {
    console.log('⚠️ confirmCancelBatch confirmed for groupIndex:', groupIndex);
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];

    setGroupLifecycle(group.groupId, {
        status: 'pending',
        actualStartTime: null,
        startEpoch: null,
        actualEndTime: null,
        actualDurationMins: null
    });

    // Sync to backend collection (firstFactoryProduction)
    syncProductionStatusToServer(group, {
        status: 'pending',
        actualStartTime: null,
        startEpoch: null,
        actualEndTime: null,
        actualDurationMins: null
    });

    closeBatchModal();
    clearPdfDisplayer();
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
}

// 6. Reopen Modal
function showReopenModal(groupIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    const lifecycle = getGroupLifecycle(group.groupId);

    const bodyHTML = `
        <div style="background: var(--bg-subtle); padding: 14px; border-radius: var(--btn-radius); margin-bottom: 16px;">
            <div style="font-size: 1.1rem; font-weight: 900; color: var(--text-main); margin-bottom: 4px;">${group.hinban}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">
                完了記録: ${lifecycle.actualStartTime} - ${lifecycle.actualEndTime} (${lifecycle.actualDurationMins}分)
            </div>
        </div>
        <p style="color: var(--text-soft); font-size: 0.9rem; margin-bottom: 16px;">
            完了状態の変更方法を選択してください:
        </p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <button type="button" class="btn btn-primary" style="background: #10B981; border-color: #10B981; text-align: left; padding: 12px 16px;" onclick="resumeBatchGroup(${groupIndex})">
                <strong>▶ 生産を再開 (Resume)</strong><br>
                <span style="font-size: 0.8rem; font-weight: normal; opacity: 0.9;">開始時間 (${lifecycle.actualStartTime}) を維持して「生産中」に戻し、モニターに再表示します。</span>
            </button>
            <button type="button" class="btn btn-secondary" style="text-align: left; padding: 12px 16px;" onclick="resetBatchGroup(${groupIndex})">
                <strong>↺ 完全にリセット (Reset)</strong><br>
                <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">開始・終了記録を消去し、「待機中」に戻します。</span>
            </button>
        </div>
    `;

    const actionsHTML = `
        <button type="button" class="btn btn-secondary" onclick="closeBatchModal()">閉じる (Close)</button>
    `;

    showBatchModal('ロット再開・リセット (Reopen / Reset)', bodyHTML, actionsHTML);
}

function resumeBatchGroup(groupIndex) {
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];

    // Single Active Lot Guard
    const activeRunning = getCurrentlyRunningGroup();
    if (activeRunning && activeRunning.group.groupId !== group.groupId) {
        alert(`現在、別のロット「${activeRunning.group.hinban}」が生産中です。\n先に現在のロットを完了または中断してください。`);
        return;
    }

    setGroupLifecycle(group.groupId, {
        status: 'in-progress',
        actualEndTime: null,
        actualDurationMins: null
    });

    // Sync to backend collection (firstFactoryProduction)
    syncProductionStatusToServer(group, {
        status: 'in-progress',
        actualEndTime: null,
        actualDurationMins: null
    });

    closeBatchModal();

    if (group.zuban) {
        notifyPdfDisplayer(group.items[0], group.zuban);
    }

    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
}

function resetBatchGroup(groupIndex) {
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];

    setGroupLifecycle(group.groupId, {
        status: 'pending',
        actualStartTime: null,
        startEpoch: null,
        actualEndTime: null,
        actualDurationMins: null
    });

    // Sync to backend collection (firstFactoryProduction)
    syncProductionStatusToServer(group, {
        status: 'pending',
        actualStartTime: null,
        startEpoch: null,
        actualEndTime: null,
        actualDurationMins: null
    });

    closeBatchModal();
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
}

// 7. Undo Last Done
function undoLastDoneBatch() {
    if (!state.lastDoneGroup) return;
    const { groupId, groupIndex, prevState } = state.lastDoneGroup;

    setGroupLifecycle(groupId, prevState);
    hideUndoSnackbar();

    const group = state.currentGroups && state.currentGroups[groupIndex];
    if (group) {
        syncProductionStatusToServer(group, prevState);
        if (group.zuban && (prevState.status === 'in-progress' || prevState.status === 'running')) {
            notifyPdfDisplayer(group.items[0], group.zuban);
        }
    }

    state.lastDoneGroup = null;
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
}

// Clear PDF Displayer Monitor
async function clearPdfDisplayer() {
    try {
        const payload = {
            machineId: state.machineName || 'PSA2',
            timestamp: new Date().toISOString(),
            action: 'clear',
            additionalData: { action: 'clear' },
            zuban: null,
            hinban: null
        };
        await fetch(`${serverURL}/api/broadcast-scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('📡 Sent clear to pdfDisplayer');
    } catch (err) {
        console.warn('Could not send clear broadcast to pdfDisplayer:', err);
    }
}

function renderEmptySchedule(dateStr) {
    const container = document.getElementById('scheduleListContainer');
    if (!container) return;

    updateScheduleStats([], '08:00');

    container.innerHTML = `
        <div class="placeholder-state">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <h3>本日のスケジュールがありません</h3>
            <p><strong>${dateStr}</strong> に登録された生産計画はありません。<br>管理画面 (Admin) で作成されたスケジュールが表示されます。</p>
        </div>
    `;
}

function selectSpecificRoll(globalIndex, event) {
    if (event) event.stopPropagation();
    selectScheduleItem(globalIndex);
}

function selectScheduleItem(index) {
    const item = state.scheduledItems[index];
    if (!item) return;

    state.selectedItem = item;
    sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(item));

    // Re-render schedule list to highlight the unified batch card and roll sub-row
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');

    // Jump to Info tab (tab index 3) and load full details
    switchMainTab(3);

    // Broadcast to pdfDisplayer monitor
    if (item.zuban) {
        notifyPdfDisplayer(item, item.zuban);
    }

    loadItemDetail(item);
}

// -----------------------------------------------------
// PDF Displayer Synchronization via Server SSE Broadcast
// -----------------------------------------------------
async function notifyPdfDisplayer(item, zuban) {
    if (!item || (!zuban && !item.hinban)) return;

    const machineId = state.machineName || 'FIRST_FACTORY';
    console.log(`📡 Notifying pdfDisplayer -> Machine: ${machineId}, 図番: ${zuban}, 品番: ${item.hinban}`);

    try {
        await fetch(`${serverURL}/api/broadcast-scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                machineId: machineId,
                zuban: zuban || '',
                hinban: item.hinban || '',
                timestamp: new Date().toISOString(),
                additionalData: {
                    factory: state.filterName || '第一工場',
                    工場: state.filterName || '第一工場',
                    Worker_Name: state.workerName || '',
                    lotIndex: item.rollIndex || 1,
                    totalRolls: item.totalRolls || 1,
                    meters: item.meters || 0,
                    action: 'scan',
                    language: localStorage.getItem('appLanguage') || 'ja'
                }
            })
        });
    } catch (err) {
        console.warn('⚠️ Error notifying pdfDisplayer:', err);
    }
}

document.addEventListener('languageChanged', (e) => {
    const lang = e.detail?.lang || localStorage.getItem('appLanguage') || 'ja';
    const machineId = state.machineName || 'PSA2';
    fetch(`${serverURL}/api/broadcast-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            machineId: machineId,
            action: 'language_change',
            additionalData: { action: 'language_change', language: lang }
        })
    }).catch(err => console.warn('Could not broadcast language change:', err));

    // Update machine name tag
    const tag = document.getElementById('machineNameTag');
    if (tag) tag.textContent = `${_t('fk_machine_prefix')}${state.machineName || '-'}`;

    // Dynamically re-render all list, queue, history, and status elements
    if (state.scheduledItems) {
        renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
    }
    renderStagingQueue();
    renderHistoryList();
    updateHistoryBadges();
});

// -----------------------------------------------------
// Info Tab: Load & Render Product and Ingredient Details
// -----------------------------------------------------
async function loadItemDetail(item) {
    const container = document.getElementById('infoTabContainer');
    if (!container) return;

    if (!item || item.type !== 'hinban' || !item.hinban) {
        if (item && item.type === 'setup') {
            container.innerHTML = `
                <div class="info-card">
                    <div class="info-card-header">
                        <div>
                            <span class="info-badge-title" style="background: var(--amber-soft); color: var(--amber);">段取り (Setup)</span>
                            <div class="info-main-title">⚙️ ${item.name || '段取り / 段替'}</div>
                            <div class="info-sub-title">所要時間: <strong>${item.duration} 分</strong> | 予定時間: ${item.startTime} - ${item.endTime}</div>
                        </div>
                    </div>
                    <div class="info-sub-section">
                        <p style="color: var(--text-muted); font-size: 0.95rem;">金型の交換、材料のセッティング、初期調整を行ってください。</p>
                    </div>
                </div>
            `;
            return;
        }
        container.innerHTML = `
            <div class="card">
                <h2>指示・詳細情報 (Information & Instructions)</h2>
                <div class="placeholder-state">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <h3>ロットが選択されていません (No Lot Selected)</h3>
                    <p>生産一覧 (List) タブから対象のロットを選択すると、品番構造や構成材料の詳細情報が表示されます。</p>
                    <button type="button" class="btn btn-primary" style="margin-top: 16px;" onclick="switchMainTab(1)">一覧へ戻る (Go to List)</button>
                </div>
            </div>
        `;
        return;
    }

    // Show loading skeleton
    container.innerHTML = `
        <div class="loading-skeleton">
            <div class="skeleton-row" style="height: 140px;"></div>
            <div class="skeleton-row" style="height: 200px;"></div>
            <div class="skeleton-row" style="height: 200px;"></div>
        </div>
    `;

    try {
        const res = await fetch(`${serverURL}/api/production/material-detail?hinban=${encodeURIComponent(item.hinban)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) {
            await renderInfoTab(data, item);
        } else {
            throw new Error(data.error || 'Failed to load details');
        }
    } catch (err) {
        console.error("Error loading material detail:", err);
        container.innerHTML = `
            <div class="placeholder-state">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <h3>詳細情報の取得に失敗しました (Error Loading Details)</h3>
                <p>${err.message || 'Failed to fetch'}</p>
                <button type="button" class="btn btn-secondary" style="margin-top: 15px;" onclick="loadItemDetail(state.selectedItem)">再試行 (Retry)</button>
            </div>
        `;
    }
}

async function renderInfoTab(data, item) {
    const container = document.getElementById('infoTabContainer');
    if (!container) return;

    const product = data.product || {};
    const bomData = data.bom || [];
    const ingredient = data.ingredient || null;
    const ingredientHinban = data.ingredientHinban || 'N/A';

    const productSegments = product['品番構造']?.segments || [];
    const productMaster = product['品目マスタ'] || {};
    const process2010 = Array.isArray(bomData) ? bomData.find(b => b['工程コード'] === 2010) : null;

    // --- Part 1: Product Structure Chips ---
    let productStructureHTML = '';
    if (productSegments.length > 0) {
        productStructureHTML = productSegments.map(s => {
            const val = s.name || s['得意先'] || s['入出荷先'];
            if (!val) return '';
            return `
                <div class="structure-chip">
                    <span class="structure-chip-label">${s.segment}</span>
                    <span class="structure-chip-val">${val}</span>
                </div>
            `;
        }).join('');
    }

    // Product Master Data Items
    const masterFields = [
        { label: '梱包数 (Pack Qty)', val: productMaster['梱包数'] },
        { label: '生産単位数 (Prod Unit)', val: productMaster['生産単位数'] },
        { label: '発注ロット数 (Order Lot)', val: productMaster['発注ロット数'] },
        { label: '品目区分 (Category)', val: productMaster['品目区分'] },
        { label: '出荷先名 (Shipping Dest)', val: productMaster['出荷先名'] },
        { label: '受注先コード (Customer Code)', val: productMaster['受注先コード'] },
        { label: '図番 (Drawing No.)', val: productMaster['図番'] },
        { label: '仕様 (Specs)', val: productMaster['仕様'] },
        { label: '型番 (Model)', val: productMaster['型番'] },
        { label: '速度 (Speed)', val: productMaster['速度'] },
        { label: 'ライン形態 (Line Form)', val: productMaster['ライン形態'] },
        { label: '繰出機 (Unwinder)', val: productMaster['繰出機'] },
        {
            label: '接着剤有無 (Adhesive)',
            val: productMaster['接着剤有無'] === 1 ? '有 (Yes)' : productMaster['接着剤有無'] === 2 ? '無 (No)' : productMaster['接着剤有無']
        },
        { label: 'クリーン度 (Cleanliness)', val: productMaster['クリーン度'] },
        { label: '乾燥温度 (Dry Temp)', val: productMaster['乾燥温度'] },
        { label: 'ロール温度 (Roll Temp)', val: productMaster['ロール温度'] },
        { label: '基材厚 (Base Thick)', val: productMaster['基材厚'] },
        { label: '基材幅 (Base Width)', val: productMaster['基材幅'] },
        { label: '基材長 (Base Length)', val: productMaster['基材長'] },
        { label: '粘着剤厚 (Adhesive Thick)', val: productMaster['粘着剤厚'] },
        { label: '粘着剤幅 (Adhesive Width)', val: productMaster['粘着剤幅'] },
        { label: '粘着剤長 (Adhesive Length)', val: productMaster['粘着剤長'] },
        { label: '粘着倍率 (Adhesive Ratio)', val: productMaster['粘着倍率'] },
    ];

    const masterDataHTML = masterFields.filter(f => f.val !== undefined && f.val !== null && f.val !== '').map(f => `
        <div class="master-data-item">
            <span class="master-data-label">${f.label}</span>
            <span class="master-data-val">${f.val}</span>
        </div>
    `).join('');

    // --- Part 2: Ingredient (材料・構成品番) ---
    let ingredientHTML = '';
    if (ingredient) {
        const ingSegments = ingredient['品番構造']?.segments || [];
        const ingMaster = ingredient['品目マスタ'] || {};

        let ingStructureHTML = '';
        if (ingSegments.length > 0) {
            ingStructureHTML = ingSegments.map(s => {
                const val = s.name || s['得意先'] || s['入出荷先'];
                if (!val) return '';
                return `
                    <div class="structure-chip" style="border-color: rgba(109, 40, 217, 0.25); background: #FAF5FF;">
                        <span class="structure-chip-label" style="color: #7E22CE;">${s.segment}</span>
                        <span class="structure-chip-val">${val}</span>
                    </div>
                `;
            }).join('');
        }

        const ingFields = [
            { label: '品目区分 (Category)', val: ingMaster['品目区分'] },
            { label: '手配先コード (Supplier)', val: ingMaster['手配先コード'] },
            { label: '生産単位数 (Prod Unit)', val: ingMaster['生産単位数'] },
            { label: '発注ロット数 (Order Lot)', val: ingMaster['発注ロット数'] },
            { label: '出荷先名 (Shipping Dest)', val: ingMaster['出荷先名'] },
            { label: '仕様 (Specs)', val: ingMaster['仕様'] },
            { label: '型番 (Model)', val: ingMaster['型番'] },
            {
                label: '接着剤有無 (Adhesive)',
                val: ingMaster['接着剤有無'] === 1 ? '有 (Yes)' : ingMaster['接着剤有無'] === 2 ? '無 (No)' : ingMaster['接着剤有無']
            },
            { label: '基材厚 (Base Thick)', val: ingMaster['基材厚'] },
            { label: '基材幅 (Base Width)', val: ingMaster['基材幅'] },
            { label: '基材長 (Base Length)', val: ingMaster['基材長'] },
            { label: '粘着剤厚 (Adhesive Thick)', val: ingMaster['粘着剤厚'] },
            { label: '粘着剤幅 (Adhesive Width)', val: ingMaster['粘着剤幅'] },
            { label: '粘着剤長 (Adhesive Length)', val: ingMaster['粘着剤長'] },
        ];

        const ingDataHTML = ingFields.filter(f => f.val !== undefined && f.val !== null && f.val !== '').map(f => `
            <div class="master-data-item">
                <span class="master-data-label">${f.label}</span>
                <span class="master-data-val">${f.val}</span>
            </div>
        `).join('');

        ingredientHTML = `
            <div class="ingredient-section-card">
                <div class="info-card-header" style="border-color: rgba(109, 40, 217, 0.2);">
                    <div>
                        <span class="info-badge-title material-badge">構成材料・原材料 (Ingredient / Material)</span>
                        <div class="info-main-title" style="color: #6D28D9;">${ingredient['品番']}</div>
                        <div class="info-sub-title">${ingMaster['品名'] || ''} ${ingMaster['仕様'] ? `— ${ingMaster['仕様']}` : ''}</div>
                    </div>
                </div>

                ${ingStructureHTML ? `
                    <div class="info-sub-section">
                        <div class="info-sub-section-title" style="color: #6D28D9;">材料品番構造 (Material Structure)</div>
                        <div class="structure-grid">${ingStructureHTML}</div>
                    </div>
                ` : ''}

                ${ingDataHTML ? `
                    <div class="info-sub-section">
                        <div class="info-sub-section-title" style="color: #6D28D9;">材料マスタ (Material Master Data)</div>
                        <div class="master-data-grid">${ingDataHTML}</div>
                    </div>
                ` : ''}
            </div>
        `;
    } else if (ingredientHinban && ingredientHinban !== 'N/A') {
        ingredientHTML = `
            <div class="ingredient-section-card">
                <div class="info-card-header" style="border-color: rgba(109, 40, 217, 0.2);">
                    <div>
                        <span class="info-badge-title material-badge">構成材料・原材料 (Ingredient / Material)</span>
                        <div class="info-main-title" style="color: #6D28D9;">${ingredientHinban}</div>
                    </div>
                </div>
                <p style="color: var(--text-muted); font-size: 0.9rem;">材料マスタの詳細は未登録です。</p>
            </div>
        `;
    }

    // Calculate duration in minutes if not already present on item
    const durationMins = item.duration || (process2010 && process2010['作業時間'] ? Math.round((Number(process2010['作業時間']) * (Number(item.meters) || 100) * 100) / 60) : 0);

    // Group Lifecycle Info & Banner
    const targetGroup = state.currentGroups ? state.currentGroups.find(g => g.items.some(it => it.id === item.id)) : null;
    const groupIdx = state.currentGroups && targetGroup ? state.currentGroups.indexOf(targetGroup) : -1;
    const lifecycle = targetGroup ? getGroupLifecycle(targetGroup.groupId) : { status: 'pending' };

    let bannerHTML = '';
    if (lifecycle.status === 'in-progress' || lifecycle.status === 'running') {
        bannerHTML = `
            <div class="info-preview-banner running-banner" style="background: #FAF5FF; border-color: #C084FC;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.3rem;">🟣</span>
                    <div>
                        <strong style="color: #6B21A8; font-size: 0.95rem;">現在生産中 (Currently in Production)</strong>
                        <div style="font-size: 0.8rem; color: #7E22CE;">開始時間: ${lifecycle.actualStartTime || '--:--'} • モニター表示中</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary" style="background: var(--brand); font-weight: 800; padding: 6px 14px;" onclick="openMaterialFeedModalForCurrentItem()">材料投入・キュー追加</button>
                    <button type="button" class="btn-batch-action btn-batch-done" onclick="showDoneConfirmation(${groupIdx}, event)">生産完了</button>
                </div>
            </div>
        `;
    } else if (lifecycle.status === 'completed') {
        bannerHTML = `
            <div class="info-preview-banner" style="background: #DEF7EC; border-color: #A7F3D0;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div>
                        <strong style="color: #03543F; font-size: 0.95rem;">生産完了済み (Completed)</strong>
                        <div style="font-size: 0.8rem; color: #047857;">実績: ${lifecycle.actualStartTime} - ${lifecycle.actualEndTime} (${lifecycle.actualDurationMins}分)</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary" style="background: var(--brand); font-weight: 800; padding: 6px 14px;" onclick="openMaterialFeedModalForCurrentItem()">材料投入・キュー追加</button>
                    <button type="button" class="btn-batch-action btn-batch-reopen" onclick="showReopenModal(${groupIdx}, event)">再開・リセット</button>
                </div>
            </div>
        `;
    } else {
        // Pending (Preview Mode)
        bannerHTML = `
            <div class="info-preview-banner">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div>
                        <strong style="color: #1E40AF; font-size: 0.95rem;">事前確認中 (Preview Mode)</strong>
                        <div style="font-size: 0.8rem; color: #3B82F6;">※タブレット上での事前確認です。モニター表示には影響しません。</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary" style="background: var(--brand); font-weight: 800; padding: 6px 14px;" onclick="openMaterialFeedModalForCurrentItem()">材料投入・キュー追加</button>
                    ${groupIdx >= 0 ? `<button type="button" class="btn-batch-action btn-batch-start" onclick="startBatchGroup(${groupIdx}, event)">このロットを開始</button>` : ''}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <!-- Contextual Status Banner -->
        ${bannerHTML}

        <!-- PART 1: Top Part - Product Info -->
        <div class="info-card">
            <div class="info-card-header">
                <div>
                    <span class="info-badge-title product-badge">製品情報 (Product Info)</span>
                    <div class="info-main-title">${item.hinban}</div>
                    <div class="info-sub-title">${productMaster['品名'] || item.hinmei || ''} ${productMaster['仕様'] ? `— ${productMaster['仕様']}` : ''}</div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                    <button type="button" class="btn btn-primary" style="background: var(--brand); font-weight: 800; padding: 6px 14px;" onclick="openMaterialFeedModalForCurrentItem()">材料投入・キュー追加</button>
                    <span class="tag-pill roll-tag" style="font-size: 0.9rem; padding: 6px 12px;">Roll ${item.rollIndex || 1} / ${item.totalRolls || 1}</span>
                    <span class="tag-pill meter-tag" style="font-size: 0.9rem; padding: 6px 12px;">${item.meters || 0} m</span>
                    <span class="tag-pill" style="font-size: 0.9rem; padding: 6px 12px; font-weight: 800;">${item.startTime || '--:--'} - ${item.endTime || '--:--'}</span>
                    <span class="tag-pill" style="font-size: 0.9rem; padding: 6px 12px; font-weight: 800; background: #ECFDF5; color: #059669; border-color: rgba(5, 150, 105, 0.3);">${durationMins} 分</span>
                </div>
            </div>

            <!-- Structure Segments -->
            ${productStructureHTML ? `
                <div class="info-sub-section">
                    <div class="info-sub-section-title">品番構造 (Structure)</div>
                    <div class="structure-grid">${productStructureHTML}</div>
                </div>
            ` : ''}

            <!-- Process 2010 Data -->
            ${process2010 ? `
                <div class="info-sub-section">
                    <div class="info-sub-section-title">工程データ (Process Data - 2010)</div>
                    <div class="process-cards-grid">
                        <div class="process-stat-card">
                            <span class="process-stat-label">作業時間 (Work Time)</span>
                            <span class="process-stat-val">${process2010['作業時間'] ?? 'N/A'}</span>
                        </div>
                        <div class="process-stat-card">
                            <span class="process-stat-label">段取時間 (Setup Time)</span>
                            <span class="process-stat-val">${process2010['段取時間'] ?? 'N/A'}</span>
                        </div>
                        <div class="process-stat-card">
                            <span class="process-stat-label">型番 (Model)</span>
                            <span class="process-stat-val">${process2010['型番'] ?? 'N/A'}</span>
                        </div>
                        <div class="process-stat-card" style="background: #ECFDF5; border-color: rgba(5, 150, 105, 0.25);">
                            <span class="process-stat-label" style="color: #059669;">所要時間 (Duration)</span>
                            <span class="process-stat-val" style="color: #047857;">${durationMins} 分</span>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Master Data -->
            ${masterDataHTML ? `
                <div class="info-sub-section">
                    <div class="info-sub-section-title">製品マスタ (Product Master Data)</div>
                    <div class="master-data-grid">${masterDataHTML}</div>
                </div>
            ` : ''}
        </div>

        <!-- PART 2: Next Part - Ingredient Info -->
        ${ingredientHTML}
    `;
}

// ===========================================================================
// FAST-PACED MATERIAL FEEDING & STAGING QUEUE (Tablet 1 - Feeding Station)
// ===========================================================================

// --- Toast & Snackbar System ---
let undoSnackbarTimer = null;

function showToast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `app-toast toast-${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `
        <span style="font-size: 1.1rem;">${icon}</span>
        <span style="line-height: 1.4;">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => {
            if (toast.parentElement) toast.parentElement.removeChild(toast);
        }, 250);
    }, duration);
}

function showUndoSnackbar(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    hideUndoSnackbar();

    const toast = document.createElement('div');
    toast.id = 'undoSnackbar';
    toast.className = 'app-toast toast-success';
    toast.innerHTML = `
        <span>✅</span>
        <span style="flex: 1;">${message}</span>
        <button type="button" class="btn btn-secondary" onclick="undoLastDoneBatch()" style="min-height: 30px; padding: 0 10px; font-size: 0.8rem; background: #FFFFFF; color: var(--text-main); font-weight: 800;">取り消す (Undo)</button>
    `;
    container.appendChild(toast);

    undoSnackbarTimer = setTimeout(() => {
        hideUndoSnackbar();
    }, 8000);
}

function hideUndoSnackbar() {
    if (undoSnackbarTimer) {
        clearTimeout(undoSnackbarTimer);
        undoSnackbarTimer = null;
    }
    const el = document.getElementById('undoSnackbar');
    if (el && el.parentElement) {
        el.parentElement.removeChild(el);
    }
}

// --- USB QR Scanner Keystroke Burst Listener ---
let scannerBurstBuffer = '';
let lastKeypressTime = 0;
const SCANNER_BURST_MAX_DELTA_MS = 65;
const SCANNER_MIN_BURST_CHARS = 3;

function setupUSBScannerListener() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const now = Date.now();
            if (scannerBurstBuffer.length >= SCANNER_MIN_BURST_CHARS && (now - lastKeypressTime) < 260) {
                const scannedText = scannerBurstBuffer.trim();
                scannerBurstBuffer = '';
                e.preventDefault();
                e.stopPropagation();
                handleUSBBarcodeScanned(scannedText);
                return;
            }
            scannerBurstBuffer = '';
            return;
        }

        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const now = Date.now();
            if (now - lastKeypressTime > SCANNER_BURST_MAX_DELTA_MS) {
                scannerBurstBuffer = e.key;
            } else {
                scannerBurstBuffer += e.key;
            }
            lastKeypressTime = now;
        }
    }, true);
}

// =====================================================
// =====================================================
// Cloud-Synchronized QR Code Learning System
// (Database: Sasaki_Coating_MasterDB, Collection: firstKojoLearnedQR)
// =====================================================

async function fetchLearnedQRPatterns() {
    try {
        const res = await fetch(`${serverURL}/api/firstkojo/learned-qr`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.success && Array.isArray(data.patterns)) {
            state.learnedQRPatterns = data.patterns;
            localStorage.setItem('firstkojo_learned_qr_patterns', JSON.stringify(data.patterns));
            console.log(`[QR Learning] Synced ${data.patterns.length} learned QR patterns from MongoDB.`);
        }
    } catch (err) {
        console.warn('[QR Learning] Failed to fetch patterns from MongoDB, relying on local storage cache:', err);
    }
}

function findLearnedPatternForKizai(kizai, rawBarcode) {
    if (!Array.isArray(state.learnedQRPatterns) || state.learnedQRPatterns.length === 0) return null;
    const cleanKizai = kizai ? String(kizai).trim().toUpperCase() : '';
    const cleanBarcode = rawBarcode ? String(rawBarcode).trim().toUpperCase() : '';

    if (cleanKizai) {
        // 1. Exact kizai match
        let match = state.learnedQRPatterns.find(p => p.kizai && String(p.kizai).trim().toUpperCase() === cleanKizai);
        if (match) return match;

        // 2. Contains match
        match = state.learnedQRPatterns.find(p => p.kizai && (cleanKizai.includes(String(p.kizai).trim().toUpperCase()) || String(p.kizai).trim().toUpperCase().includes(cleanKizai)));
        if (match) return match;

        // 3. Prefix match
        match = state.learnedQRPatterns.find(p => p.kizaiPrefix && cleanKizai.startsWith(String(p.kizaiPrefix).trim().toUpperCase()));
        if (match) return match;
    }

    if (cleanBarcode) {
        // 4. Barcode contains learned kizai or prefix
        let match = state.learnedQRPatterns.find(p => p.kizai && cleanBarcode.includes(String(p.kizai).trim().toUpperCase()));
        if (match) return match;
        match = state.learnedQRPatterns.find(p => p.kizaiPrefix && p.kizaiPrefix.length >= 3 && cleanBarcode.includes(String(p.kizaiPrefix).trim().toUpperCase()));
        if (match) return match;
    }

    return null;
}

function splitQRIntoTokens(barcode, delimiter) {
    if (!barcode) return [];
    const str = barcode.trim();
    if (delimiter === 'whitespace' || delimiter === ' ' || !delimiter) {
        if (str.includes(',') && !/\s{2,}/.test(str)) return str.split(',').map(s => s.trim());
        if (str.includes('\t')) return str.split('\t').map(s => s.trim());
        return str.split(/\s+/);
    }
    if (delimiter === ',' && !str.includes(',') && str.includes('\t')) {
        return str.split('\t').map(s => s.trim());
    }
    if (str.includes(delimiter)) {
        return str.split(delimiter).map(s => s.trim());
    }
    return str.split(/\s+/);
}

// -----------------------------------------------------
// Comprehensive Date Normalization & Candidate Detection
// (Supports all 18+ formats: yyyy/mm/dd, yyyy-mm-dd, yyyy.mm.dd, yyyy_mm_dd,
//  yyyymmdd, yy/mm/dd, yy-mm-dd, yy.mm.dd, yy_mm_dd, yymmdd,
//  yyyy/mmdd, yyyy-mmdd, yy/mmdd, yy-mmdd, yyyymm/dd, yyyymm-dd, yymm/dd, yymm-dd)
// -----------------------------------------------------
function normalizeDateStringToISO(str) {
    if (!str) return '';
    const trimmed = String(str).trim();
    if (!trimmed) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    function formatYMD(y, m, d) {
        let yNum = parseInt(y, 10);
        const mNum = parseInt(m, 10);
        const dNum = parseInt(d, 10);
        if (isNaN(mNum) || mNum < 1 || mNum > 12) return null;
        if (isNaN(dNum) || dNum < 1 || dNum > 31) return null;
        if (y.length === 2) {
            yNum = yNum >= 70 ? (1900 + yNum) : (2000 + yNum);
        } else if (yNum < 1970 || yNum > 2099) {
            return null;
        }
        return `${yNum}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    }

    let m;
    // 1. Two separators: YYYY/MM/DD, YY/MM/DD with /, -, ., _
    if ((m = trimmed.match(/^(\d{4}|\d{2})[/.\-_](\d{1,2})[/.\-_](\d{1,2})$/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }

    // 2. Japanese format: YYYY年MM月DD日
    if ((m = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }

    // 3. Single separator: year / mmdd -> 2026/0918, 2026-0918, 26/0918, 26-0918, 2026.0918, 2026_0918
    if ((m = trimmed.match(/^(\d{4}|\d{2})[/.\-_](\d{2})(\d{2})$/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }

    // 4. Single separator: yyyymm / dd or yymm / dd -> 202609/18, 202609-18, 2609/18, 2609-18
    if ((m = trimmed.match(/^(\d{4})(\d{2})[/.\-_](\d{1,2})$/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }
    if ((m = trimmed.match(/^(\d{2})(\d{2})[/.\-_](\d{1,2})$/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }

    // 5. 8 digits compact: YYYYMMDD -> 20260918
    if ((m = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }

    // 6. 6 digits compact: YYMMDD -> 260918
    if ((m = trimmed.match(/^(\d{2})(\d{2})(\d{2})$/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }

    // 7. Embedded date inside string: e.g. "14002026/09/03" or "140020260918"
    if ((m = trimmed.match(/(20\d{2}|19\d{2})[/.\-_](\d{1,2})[/.\-_](\d{1,2})/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }
    if ((m = trimmed.match(/(20\d{2}|19\d{2})[/.\-_](\d{2})(\d{2})/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }
    if ((m = trimmed.match(/(20\d{2}|19\d{2})(\d{2})[/.\-_](\d{1,2})/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }
    if ((m = trimmed.match(/(20\d{2}|19\d{2})(\d{2})(\d{2})/))) {
        const res = formatYMD(m[1], m[2], m[3]);
        if (res) return res;
    }

    return trimmed;
}

function extractDateCandidatesFromToken(tokenStr) {
    if (!tokenStr) return [];
    const str = String(tokenStr);
    const candidates = [];

    function formatYMD(y, m, d) {
        let yNum = parseInt(y, 10);
        const mNum = parseInt(m, 10);
        const dNum = parseInt(d, 10);
        if (isNaN(mNum) || mNum < 1 || mNum > 12) return null;
        if (isNaN(dNum) || dNum < 1 || dNum > 31) return null;
        if (y.length === 2) {
            yNum = yNum >= 70 ? (1900 + yNum) : (2000 + yNum);
        } else if (yNum < 1970 || yNum > 2099) {
            return null;
        }
        return `${yNum}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    }

    const regexes = [
        /(20\d{2}|19\d{2})[/.\-_](\d{1,2})[/.\-_](\d{1,2})/g,
        /(20\d{2}|19\d{2})[/.\-_](\d{2})(\d{2})/g,
        /(20\d{2}|19\d{2})(\d{2})[/.\-_](\d{1,2})/g,
        /(20\d{2}|19\d{2})(\d{2})(\d{2})/g,
        /(?:^|[^0-9])(\d{2})[/.\-_](\d{1,2})[/.\-_](\d{1,2})/g,
        /(?:^|[^0-9])(\d{2})[/.\-_](\d{2})(\d{2})/g,
        /(?:^|[^0-9])(\d{2})(\d{2})[/.\-_](\d{1,2})/g,
        /(?:^|[^0-9])(\d{2})(\d{2})(\d{2})(?:$|[^0-9])/g
    ];

    const seen = new Set();
    regexes.forEach(rgx => {
        let match;
        while ((match = rgx.exec(str)) !== null) {
            let start = match.index;
            let raw = match[0];
            let y = match[1], m = match[2], d = match[3];
            if (raw.length > 0 && !/[0-9]/.test(raw[0])) {
                start += 1;
                raw = raw.slice(1);
            }
            if (raw.length > 0 && !/[0-9]/.test(raw[raw.length - 1])) {
                raw = raw.slice(0, -1);
            }
            const norm = formatYMD(y, m, d);
            const key = `${start}:${raw.length}`;
            if (norm && !seen.has(key)) {
                seen.add(key);
                candidates.push({
                    rawDate: raw,
                    normDate: norm,
                    start: start,
                    length: raw.length
                });
            }
        }
    });

    return candidates;
}

function findSubstringSliceInTokens(tokens, targetVal) {
    if (!tokens || !targetVal) return null;
    const cleanTarget = String(targetVal).trim();
    if (!cleanTarget) return null;

    // 1. Direct match
    for (let idx = 0; idx < tokens.length; idx++) {
        const tok = tokens[idx];
        const pos = tok.toUpperCase().indexOf(cleanTarget.toUpperCase());
        if (pos >= 0) {
            return {
                tokenIndex: idx,
                start: pos,
                length: cleanTarget.length,
                isDate: /^\d{4}-\d{2}-\d{2}$/.test(cleanTarget)
            };
        }
    }

    // 2. Date match
    const dateNormTarget = normalizeDateStringToISO(cleanTarget);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateNormTarget)) {
        for (let idx = 0; idx < tokens.length; idx++) {
            const dateCands = extractDateCandidatesFromToken(tokens[idx]);
            const found = dateCands.find(c => c.normDate === dateNormTarget);
            if (found) {
                return {
                    tokenIndex: idx,
                    start: found.start,
                    length: found.length,
                    isDate: true
                };
            }
        }
    }

    return null;
}

function parseBarcodeWithLearnedPattern(pattern, barcode) {
    if (!pattern || !barcode) return null;
    if (pattern.hasQR === false) return null;

    const tokens = splitQRIntoTokens(barcode, pattern.delimiter);
    if (!tokens || tokens.length === 0) return null;

    const mapping = pattern.mapping || {};
    let socho = '';
    let shiki = '0';
    let bicho = null;
    let hinban = '';
    let lotNo = '';

    if (mapping.sochoIndex !== null && mapping.sochoIndex !== undefined && tokens[mapping.sochoIndex] !== undefined) {
        const num = parseFloat(tokens[mapping.sochoIndex]);
        if (!isNaN(num)) socho = String(num);
    }

    if (mapping.shikiIndex !== null && mapping.shikiIndex !== undefined && tokens[mapping.shikiIndex] !== undefined) {
        const num = parseFloat(tokens[mapping.shikiIndex]);
        if (!isNaN(num)) shiki = String(num);
    }

    if (mapping.bichoIndex !== null && mapping.bichoIndex !== undefined && tokens[mapping.bichoIndex] !== undefined) {
        const num = parseFloat(tokens[mapping.bichoIndex]);
        if (!isNaN(num)) bicho = num;
    }

    if (mapping.hinbanIndex !== null && mapping.hinbanIndex !== undefined && tokens[mapping.hinbanIndex] !== undefined) {
        hinban = tokens[mapping.hinbanIndex];
    }

    // Support substring lotSlice (e.g. date extracted from 14002026/09/03)
    if (mapping.lotSlice && tokens[mapping.lotSlice.tokenIndex] !== undefined) {
        const fullTok = tokens[mapping.lotSlice.tokenIndex];
        const sliced = fullTok.substring(mapping.lotSlice.start, mapping.lotSlice.start + mapping.lotSlice.length);
        lotNo = normalizeDateStringToISO(sliced);
    } else if (mapping.lotIndex !== null && mapping.lotIndex !== undefined && tokens[mapping.lotIndex] !== undefined) {
        lotNo = normalizeDateStringToISO(tokens[mapping.lotIndex]);
    }

    // Auto-calculate bicho if socho and shiki are given but bicho was omitted in QR
    if (bicho === null && socho !== '') {
        const so = parseFloat(socho) || 0;
        const sh = parseFloat(shiki) || 0;
        bicho = Math.max(0, parseFloat((so - sh).toFixed(2)));
    }

    if (bicho !== null && !isNaN(bicho)) {
        return { socho, shiki, bicho, hinban, lotNo, isLearned: true };
    }
    return null;
}

function parseBarcodeHeuristics(barcode) {
    let sochoVal = '';
    let shikiVal = '0';
    let bichoVal = null;
    let hinbanVal = '';
    let lotVal = '';
    let matched = false;

    // Pattern 1: Labels with Japanese headers (e.g. 総長: 42.1 / S引: 0.35 / 実長/純長/美長: 41.5)
    const sochoMatch = barcode.match(/総長\s*[:：=]?\s*([0-9.]+)/i);
    const shikiMatch = barcode.match(/S引[長]?\s*[:：=]?\s*([0-9.]+)/i);
    const bichoMatch = barcode.match(/(?:実長|純長|美長)\s*[:：=]?\s*([0-9.]+)/i);
    const hinbanMatch = barcode.match(/(?:品番|基材|型番)\s*[:：=]?\s*([A-Za-z0-9\-_/*]+)/i);
    const lotMatch = barcode.match(/(?:ロット|LOT|LotNo|ロット番号)\s*[:：=]?\s*([A-Za-z0-9\-_/]+)/i);

    if (sochoMatch) { sochoVal = sochoMatch[1]; matched = true; }
    if (shikiMatch) { shikiVal = shikiMatch[1]; matched = true; }
    if (bichoMatch) { bichoVal = parseFloat(bichoMatch[1]); matched = true; }
    if (hinbanMatch) { hinbanVal = hinbanMatch[1].trim(); }
    if (lotMatch) { lotVal = lotMatch[1].trim(); }

    if (sochoMatch && shikiMatch && bichoVal === null) {
        bichoVal = Math.max(0, parseFloat((parseFloat(sochoMatch[1]) - parseFloat(shikiMatch[1])).toFixed(2)));
    }

    // Pattern 2: Multi-space, comma, tab, or semicolon separated format
    if (!matched) {
        let parts = [];
        if (barcode.includes(',')) parts = barcode.split(',').map(s => s.trim());
        else if (barcode.includes('\t')) parts = barcode.split('\t').map(s => s.trim());
        else if (barcode.includes(';')) parts = barcode.split(';').map(s => s.trim());
        else if (/\s{2,}/.test(barcode)) parts = barcode.trim().split(/\s+/);
        else if (barcode.includes(' ')) parts = barcode.trim().split(/\s+/);

        if (parts.length > 1) {
            const decimalNumbers = [];
            const nonNumbers = [];

            parts.forEach((p, idx) => {
                const n = parseFloat(p);
                // Numbers that look like lengths (e.g. 42.1, 0.4, 41.5)
                if (!isNaN(n) && (p.includes('.') || (n >= 5 && n <= 500 && !/^\d{4}$/.test(p)))) {
                    decimalNumbers.push({ str: p, num: n, idx });
                } else if (isNaN(n) || /^[A-Za-z]/.test(p) || p.includes('/') || p.includes('-')) {
                    nonNumbers.push({ str: p, idx });
                }
            });

            if (decimalNumbers.length >= 3) {
                sochoVal = String(decimalNumbers[0].str);
                shikiVal = String(decimalNumbers[1].str);
                bichoVal = decimalNumbers[2].num;
                matched = true;
            } else if (decimalNumbers.length === 2) {
                sochoVal = String(decimalNumbers[0].str);
                shikiVal = String(decimalNumbers[1].str);
                bichoVal = Math.max(0, parseFloat((decimalNumbers[0].num - decimalNumbers[1].num).toFixed(2)));
                matched = true;
            } else if (decimalNumbers.length === 1) {
                bichoVal = decimalNumbers[0].num;
                matched = true;
            }

            // Identify potential lot and hinban candidates
            nonNumbers.forEach(item => {
                const s = item.str;
                if ((s.includes('/') || s.includes('-') || /^\d{6,}$/.test(s)) && !lotVal) {
                    lotVal = s;
                } else if (/^[A-Za-z0-9\-_]{4,}$/.test(s) && !hinbanVal) {
                    hinbanVal = s;
                }
            });
        }
    }

    // Pattern 3: Standalone single number
    if (!matched) {
        const singleNum = parseFloat(barcode.trim());
        if (!isNaN(singleNum) && singleNum > 0) {
            bichoVal = singleNum;
            matched = true;
        }
    }

    if (lotVal) {
        lotVal = normalizeDateStringToISO(lotVal);
    }

    return {
        socho: sochoVal,
        shiki: shikiVal,
        bicho: bichoVal,
        hinban: hinbanVal,
        lotNo: lotVal,
        matched
    };
}

function checkLearnQRBannerEligibility() {
    const banner = document.getElementById('feedLearnQRBanner');
    if (!banner) return;
    if (state.currentModalRawQR && state.currentModalRawQR.trim().length > 0) {
        banner.style.display = 'block';
        const snippet = document.getElementById('feedLearnQRSnippet');
        if (snippet) {
            snippet.textContent = state.currentModalRawQR.slice(0, 100) + (state.currentModalRawQR.length > 100 ? '...' : '');
        }
    } else {
        banner.style.display = 'none';
    }
}

let currentPickerTargetField = null;

function detectQRDelimiter(rawQR) {
    if (!rawQR) return 'whitespace';
    if (rawQR.includes(',')) return ',';
    if (rawQR.includes('\t')) return '\t';
    if (rawQR.includes(';')) return ';';
    if (rawQR.includes('|')) return '|';
    if (/\s{2,}/.test(rawQR)) return 'whitespace';
    if (rawQR.includes(' ')) return 'whitespace';
    return 'whitespace';
}

function openFieldPickerModal(fieldKey) {
    currentPickerTargetField = fieldKey;
    const rawQR = (state.currentModalRawQR || document.getElementById('feedRawQRInput')?.value || '').trim();
    const delimiter = detectQRDelimiter(rawQR);
    const tokens = splitQRIntoTokens(rawQR, delimiter);

    // If no QR was scanned or no tokens exist, open manual entry directly
    if (tokens.length === 0) {
        handleValuePickerManualEntry();
        return;
    }

    const titleEl = document.getElementById('feedValuePickerTitle');
    const subEl = document.getElementById('feedValuePickerSubtitle');
    const listEl = document.getElementById('feedValuePickerTokensList');
    const modalEl = document.getElementById('feedValuePickerModal');

    const fieldLabels = {
        hinban: '品番 / 基材コード',
        lot: 'メーカーロット / 日付',
        socho: '総長 (m)',
        shiki: 'S引き長 (m)',
        bicho: '美長 / 実長 (m)'
    };

    const label = fieldLabels[fieldKey] || '項目';
    if (titleEl) titleEl.textContent = `${label} を選択`;
    if (subEl) subEl.textContent = `QRコードから検出された値（全 ${tokens.length} 件）\n※長押しまたは「分割」で一部を取り出せます`;

    // Determine current value to highlight
    let currentVal = '';
    if (fieldKey === 'hinban') currentVal = state.currentModalHinban;
    else if (fieldKey === 'lot') currentVal = state.currentModalLotNo;
    else if (fieldKey === 'socho') currentVal = state.currentModalSocho;
    else if (fieldKey === 'shiki') currentVal = state.currentModalShiki;
    else if (fieldKey === 'bicho') currentVal = state.currentModalBicho;

    currentVal = (currentVal !== undefined && currentVal !== null) ? String(currentVal).trim() : '';

    if (listEl) {
        listEl.innerHTML = '';
        tokens.forEach((tok, idx) => {
            const rowDiv = document.createElement('div');
            rowDiv.setAttribute('role', 'button');
            rowDiv.setAttribute('tabindex', '0');
            rowDiv.className = 'feed-token-choice-btn';
            rowDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; user-select: none; -webkit-user-select: none; font-family: inherit;';

            // Check if selected
            const isSelected = (currentVal !== '' && (currentVal === tok || (fieldKey === 'lot' && normalizeDateStringToISO(tok) === currentVal)));
            if (isSelected) rowDiv.classList.add('is-selected');

            // Left side: Index badge + Token text (with smart preview for date)
            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; overflow: hidden; flex: 1; pointer-events: none;';

            const badge = document.createElement('span');
            badge.className = 'feed-token-index-badge';
            badge.textContent = `#${idx + 1}`;

            const textWrap = document.createElement('div');
            textWrap.style.cssText = 'display: flex; flex-direction: column; overflow: hidden;';

            const textSpan = document.createElement('span');
            textSpan.style.cssText = 'font-size: 1.05rem; font-weight: 700; word-break: break-all; font-family: inherit;';
            textSpan.textContent = tok;
            textWrap.appendChild(textSpan);

            // If this is lot selection and token contains a date, show subtle preview
            if (fieldKey === 'lot') {
                const norm = normalizeDateStringToISO(tok);
                if (/^\d{4}-\d{2}-\d{2}$/.test(norm) && norm !== tok) {
                    const normSpan = document.createElement('span');
                    normSpan.style.cssText = 'font-size: 0.72rem; color: #047857; font-weight: 700; margin-top: 1px; font-family: inherit;';
                    normSpan.textContent = `変換後: ${norm}`;
                    textWrap.appendChild(normSpan);
                }
            }

            leftDiv.appendChild(badge);
            leftDiv.appendChild(textWrap);
            rowDiv.appendChild(leftDiv);

            // Right side: Selected badge + Split button
            const rightDiv = document.createElement('div');
            rightDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

            if (isSelected) {
                const selTag = document.createElement('span');
                selTag.style.cssText = 'font-size: 0.75rem; background: var(--blue); color: #fff; padding: 2px 8px; border-radius: 9999px; font-weight: 700; white-space: nowrap; font-family: inherit;';
                selTag.textContent = '選択中';
                rightDiv.appendChild(selTag);
            }

            // Dedicated Split Button (clean, no emoji)
            const splitBtn = document.createElement('button');
            splitBtn.type = 'button';
            splitBtn.className = 'feed-token-split-btn';
            splitBtn.title = '文字列の一部を切り取って抽出';
            splitBtn.textContent = '分割';
            splitBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openTokenSplitModal(tok, idx, fieldKey);
            });
            rightDiv.appendChild(splitBtn);

            rowDiv.appendChild(rightDiv);

            // Setup Long-press (hold 450ms)
            let pressTimer = null;
            let isLongPress = false;
            let startX = 0, startY = 0;

            const startPress = (e) => {
                isLongPress = false;
                if (e.touches && e.touches[0]) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (navigator.vibrate) navigator.vibrate(50);
                    rowDiv.style.transform = 'scale(0.97)';
                    setTimeout(() => { rowDiv.style.transform = ''; }, 150);
                    openTokenSplitModal(tok, idx, fieldKey);
                }, 450);
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            };

            const checkMove = (e) => {
                if (e.touches && e.touches[0]) {
                    const diffX = Math.abs(e.touches[0].clientX - startX);
                    const diffY = Math.abs(e.touches[0].clientY - startY);
                    if (diffX > 10 || diffY > 10) {
                        cancelPress();
                    }
                }
            };

            rowDiv.addEventListener('touchstart', startPress, { passive: true });
            rowDiv.addEventListener('touchmove', checkMove, { passive: true });
            rowDiv.addEventListener('touchend', cancelPress, { passive: true });
            rowDiv.addEventListener('touchcancel', cancelPress, { passive: true });

            rowDiv.addEventListener('mousedown', startPress);
            rowDiv.addEventListener('mouseup', cancelPress);
            rowDiv.addEventListener('mouseleave', cancelPress);

            rowDiv.addEventListener('click', () => {
                if (isLongPress) {
                    isLongPress = false;
                    return;
                }
                selectFieldTokenValue(fieldKey, tok);
            });

            listEl.appendChild(rowDiv);
        });
    }

    if (modalEl) {
        modalEl.classList.add('open');
        modalEl.style.display = 'flex';
    }
}

function closeFeedValuePickerModal() {
    const modalEl = document.getElementById('feedValuePickerModal');
    if (modalEl) {
        modalEl.classList.remove('open');
        modalEl.style.display = 'none';
    }
    currentPickerTargetField = null;
}

// -----------------------------------------------------
// Token Substring / Split Modal Controllers
// -----------------------------------------------------
let currentSplitContext = {
    originalToken: '',
    tokenIndex: -1,
    fieldKey: '',
    startIndex: 0,
    length: 1,
    extractedValue: '',
    convertedValue: '',
    anchorCharIdx: null
};

function openTokenSplitModal(tokenStr, tokenIndex, fieldKey) {
    if (!tokenStr) return;
    const cleanToken = String(tokenStr);

    currentSplitContext = {
        originalToken: cleanToken,
        tokenIndex: tokenIndex,
        fieldKey: fieldKey,
        startIndex: 0,
        length: cleanToken.length,
        extractedValue: cleanToken,
        convertedValue: cleanToken,
        anchorCharIdx: null
    };

    const modalEl = document.getElementById('qrTokenSplitModal');
    const titleEl = document.getElementById('splitModalTitle');
    const badgeEl = document.getElementById('splitModalTokenBadge');
    const origEl = document.getElementById('splitModalOriginalToken');
    const suggestionsListEl = document.getElementById('splitModalSuggestionsList');
    const charBoxesEl = document.getElementById('splitModalCharBoxes');
    const startInput = document.getElementById('splitStartIndex');
    const lenInput = document.getElementById('splitLength');

    const fieldLabels = {
        hinban: '品番 / 基材コード',
        lot: 'メーカーロット / 日付',
        socho: '総長 (m)',
        shiki: 'S引き長 (m)',
        bicho: '美長 / 実長 (m)'
    };
    const label = fieldLabels[fieldKey] || '項目';
    if (titleEl) titleEl.textContent = `${label} の一部を抽出`;
    if (badgeEl) badgeEl.textContent = `#${tokenIndex + 1}`;
    if (origEl) origEl.textContent = cleanToken;

    // 1. Generate Smart Suggestions (All 18+ Date Formats & Numbers)
    const suggestions = [];
    const dateCands = extractDateCandidatesFromToken(cleanToken);

    dateCands.forEach(cand => {
        suggestions.push({
            label: `日付: ${cand.normDate}`,
            start: cand.start,
            length: cand.length,
            isDate: true,
            priority: 1
        });

        // Portion before date (e.g. 1400 in 14002026/09/03)
        if (cand.start > 0) {
            const prefixVal = cleanToken.substring(0, cand.start);
            const isNum = !isNaN(parseFloat(prefixVal));
            suggestions.push({
                label: `${isNum ? '幅/数値' : '前部'}: ${prefixVal}`,
                start: 0,
                length: cand.start,
                isDate: false,
                priority: 2
            });
        }

        // Portion after date
        const afterIdx = cand.start + cand.length;
        if (afterIdx < cleanToken.length) {
            const suffixVal = cleanToken.substring(afterIdx);
            suggestions.push({
                label: `後部: ${suffixVal}`,
                start: afterIdx,
                length: suffixVal.length,
                isDate: false,
                priority: 3
            });
        }
    });

    // Populate suggestions chips
    if (suggestionsListEl) {
        suggestionsListEl.innerHTML = '';
        if (suggestions.length === 0) {
            const emptySpan = document.createElement('span');
            emptySpan.style.cssText = 'font-size: 0.78rem; color: var(--text-muted); font-style: italic; font-family: inherit;';
            emptySpan.textContent = '自動検出候補はありません。下の文字一覧から範囲を選択してください。';
            suggestionsListEl.appendChild(emptySpan);
        } else {
            suggestions.forEach(sug => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'feed-split-chip';
                chip.textContent = sug.label;
                chip.addEventListener('click', () => {
                    applySplitRange(sug.start, sug.length);
                });
                suggestionsListEl.appendChild(chip);
            });
        }
    }

    // Default Selection:
    // If fieldKey is 'lot' and a date suggestion exists, pre-select the date!
    const dateSug = suggestions.find(s => s.isDate);
    if (fieldKey === 'lot' && dateSug) {
        currentSplitContext.startIndex = dateSug.start;
        currentSplitContext.length = dateSug.length;
    } else {
        currentSplitContext.startIndex = 0;
        currentSplitContext.length = cleanToken.length;
    }

    // Build Interactive Character Boxes
    if (charBoxesEl) {
        charBoxesEl.innerHTML = '';
        for (let i = 0; i < cleanToken.length; i++) {
            const charBox = document.createElement('div');
            charBox.className = 'feed-split-char-box';
            charBox.setAttribute('data-char-idx', String(i));

            const idxSpan = document.createElement('span');
            idxSpan.className = 'char-idx';
            idxSpan.textContent = String(i);

            const letterSpan = document.createElement('span');
            letterSpan.className = 'char-letter';
            letterSpan.textContent = cleanToken[i];

            charBox.appendChild(idxSpan);
            charBox.appendChild(letterSpan);

            charBox.addEventListener('click', () => {
                onSplitCharBoxClick(i);
            });

            charBoxesEl.appendChild(charBox);
        }
    }

    if (startInput) startInput.value = currentSplitContext.startIndex;
    if (lenInput) lenInput.value = currentSplitContext.length;

    updateSplitModalVisuals();
    updateSplitModalPreview();

    if (modalEl) {
        modalEl.classList.add('open');
        modalEl.style.display = 'flex';
    }
}

function closeTokenSplitModal() {
    const modalEl = document.getElementById('qrTokenSplitModal');
    if (modalEl) {
        modalEl.classList.remove('open');
        modalEl.style.display = 'none';
    }
}

function onSplitCharBoxClick(charIdx) {
    if (currentSplitContext.anchorCharIdx === null) {
        // First click: anchor start
        currentSplitContext.anchorCharIdx = charIdx;
        currentSplitContext.startIndex = charIdx;
        currentSplitContext.length = 1;
    } else {
        // Second click: range between anchor and clicked
        const start = Math.min(currentSplitContext.anchorCharIdx, charIdx);
        const end = Math.max(currentSplitContext.anchorCharIdx, charIdx);
        currentSplitContext.startIndex = start;
        currentSplitContext.length = (end - start) + 1;
        currentSplitContext.anchorCharIdx = null;
    }

    const startInput = document.getElementById('splitStartIndex');
    const lenInput = document.getElementById('splitLength');
    if (startInput) startInput.value = currentSplitContext.startIndex;
    if (lenInput) lenInput.value = currentSplitContext.length;

    updateSplitModalVisuals();
    updateSplitModalPreview();
}

function applySplitRange(start, length) {
    const totalLen = currentSplitContext.originalToken.length;
    const clampedStart = Math.max(0, Math.min(totalLen - 1, start));
    const clampedLen = Math.max(1, Math.min(totalLen - clampedStart, length));

    currentSplitContext.startIndex = clampedStart;
    currentSplitContext.length = clampedLen;
    currentSplitContext.anchorCharIdx = null;

    const startInput = document.getElementById('splitStartIndex');
    const lenInput = document.getElementById('splitLength');
    if (startInput) startInput.value = clampedStart;
    if (lenInput) lenInput.value = clampedLen;

    updateSplitModalVisuals();
    updateSplitModalPreview();
}

function adjustSplitRange(type, delta) {
    if (type === 'start') {
        const newStart = currentSplitContext.startIndex + delta;
        applySplitRange(newStart, currentSplitContext.length);
    } else if (type === 'len') {
        const newLen = currentSplitContext.length + delta;
        applySplitRange(currentSplitContext.startIndex, newLen);
    }
}

function onSplitRangeInputChange() {
    const startInput = document.getElementById('splitStartIndex');
    const lenInput = document.getElementById('splitLength');
    const s = parseInt(startInput?.value, 10) || 0;
    const l = parseInt(lenInput?.value, 10) || 1;
    applySplitRange(s, l);
}

function updateSplitModalVisuals() {
    const boxes = document.querySelectorAll('#splitModalCharBoxes .feed-split-char-box');
    const start = currentSplitContext.startIndex;
    const end = start + currentSplitContext.length - 1;

    boxes.forEach((box, i) => {
        if (i >= start && i <= end) {
            box.classList.add('in-range');
        } else {
            box.classList.remove('in-range');
        }
    });
}

function updateSplitModalPreview() {
    const str = currentSplitContext.originalToken;
    const start = currentSplitContext.startIndex;
    const len = currentSplitContext.length;
    const rawSlice = str.substring(start, start + len);
    currentSplitContext.extractedValue = rawSlice;

    // Automatic Date Conversion to YYYY-MM-DD
    let converted = rawSlice;
    let isDateConverted = false;

    if (currentSplitContext.fieldKey === 'lot' || /(20\d{2}|19\d{2})[./-]?\d{2}[./-]?\d{2}/.test(rawSlice)) {
        const norm = normalizeDateStringToISO(rawSlice);
        if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
            converted = norm;
            isDateConverted = true;
        }
    }

    currentSplitContext.convertedValue = converted;

    const previewEl = document.getElementById('splitModalPreviewText');
    const noticeEl = document.getElementById('splitModalDateNotice');

    if (previewEl) {
        previewEl.textContent = converted || '(未選択)';
    }

    if (noticeEl) {
        if (isDateConverted) {
            noticeEl.style.display = 'block';
            noticeEl.textContent = `日付形式 (${converted}) に自動変換されます`;
        } else {
            noticeEl.style.display = 'none';
        }
    }
}

function confirmTokenSplitSelection() {
    if (!currentSplitContext.fieldKey) return;

    let finalVal = currentSplitContext.convertedValue || currentSplitContext.extractedValue;
    if (currentSplitContext.fieldKey === 'lot') {
        finalVal = normalizeDateStringToISO(finalVal);
    }

    // Save custom slice rule
    if (!state.currentModalCustomSlices) state.currentModalCustomSlices = {};
    state.currentModalCustomSlices[currentSplitContext.fieldKey] = {
        tokenIndex: currentSplitContext.tokenIndex,
        start: currentSplitContext.startIndex,
        length: currentSplitContext.length,
        isDate: (currentSplitContext.fieldKey === 'lot' || /^\d{4}-\d{2}-\d{2}$/.test(finalVal))
    };

    closeTokenSplitModal();
    selectFieldTokenValue(currentSplitContext.fieldKey, finalVal);
}

function selectFieldTokenValue(fieldKey, tokenVal) {
    if (fieldKey === 'hinban') {
        state.currentModalHinban = tokenVal;
    } else if (fieldKey === 'lot') {
        // Auto-convert to YYYY-MM-DD on the input box
        state.currentModalLotNo = normalizeDateStringToISO(tokenVal);
    } else if (fieldKey === 'socho') {
        state.currentModalSocho = tokenVal;
        const so = parseFloat(tokenVal) || 0;
        const sh = parseFloat(state.currentModalShiki) || 0;
        state.currentModalBicho = Math.max(0, parseFloat((so - sh).toFixed(2)));
    } else if (fieldKey === 'shiki') {
        state.currentModalShiki = tokenVal || '0';
        const so = parseFloat(state.currentModalSocho) || 0;
        const sh = parseFloat(tokenVal) || 0;
        if (state.currentModalSocho) {
            state.currentModalBicho = Math.max(0, parseFloat((so - sh).toFixed(2)));
        }
    } else if (fieldKey === 'bicho') {
        state.currentModalBicho = tokenVal;
    }

    updateManualDisplays();
    saveCurrentModalManualEdits();
    checkLearnQRBannerEligibility();
    closeFeedValuePickerModal();

    const fieldLabels = {
        hinban: '品番',
        lot: 'ロット',
        socho: '総長',
        shiki: 'S引き長',
        bicho: '美長'
    };
    const displayVal = (fieldKey === 'lot') ? state.currentModalLotNo : tokenVal;
    showToast(`${fieldLabels[fieldKey] || '項目'} を「${displayVal}」に設定しました`, 'info', 1800);
}

function handleValuePickerManualEntry() {
    const target = currentPickerTargetField;
    closeFeedValuePickerModal();

    if (target === 'hinban') {
        const current = state.currentModalHinban || '';
        const newVal = prompt('品番 / 基材コードを手動入力してください:', current);
        if (newVal !== null) {
            state.currentModalHinban = newVal.trim();
            updateManualDisplays();
            saveCurrentModalManualEdits();
            checkLearnQRBannerEligibility();
        }
    } else if (target === 'lot') {
        const current = state.currentModalLotNo || '';
        const newVal = prompt('メーカーロット / 日付を手動入力してください (例: 2026-09-18):', current);
        if (newVal !== null) {
            state.currentModalLotNo = normalizeDateStringToISO(newVal.trim());
            updateManualDisplays();
            saveCurrentModalManualEdits();
            checkLearnQRBannerEligibility();
        }
    } else if (target === 'socho' || target === 'shiki' || target === 'bicho') {
        openMaterialKeypad(target);
    }
}

function promptEditManualHinban() {
    openFieldPickerModal('hinban');
}

function promptEditManualLot() {
    openFieldPickerModal('lot');
}

async function learnQRFromCurrentInputs() {
    const rawQR = (state.currentModalRawQR || document.getElementById('feedRawQRInput')?.value || '').trim();
    if (!rawQR) {
        alert('学習用のQRコードがまだスキャンされていません。\nバーコードリーダーでQRをスキャンしてから学習ボタンを押してください。');
        return;
    }

    const kizai = (state.currentModalHinban ||
                   state.currentModalRollContext?.item?.kizai ||
                   state.currentModalRollContext?.group?.kizai ||
                   state.currentModalRollContext?.item?.hinban ||
                   '').trim();

    if (!kizai) {
        alert('基材コードまたは品番が見つかりません。品番欄を入力してください。');
        return;
    }

    const delimiter = detectQRDelimiter(rawQR);
    const tokens = splitQRIntoTokens(rawQR, delimiter);

    const bichoVal = parseFloat(state.currentModalBicho);
    const sochoVal = parseFloat(state.currentModalSocho);
    const shikiVal = parseFloat(state.currentModalShiki);
    const hinbanVal = (state.currentModalHinban || '').trim().toUpperCase();
    const lotVal = (state.currentModalLotNo || '').trim().toUpperCase();

    let bichoIndex = null;
    let sochoIndex = null;
    let shikiIndex = null;
    let hinbanIndex = null;
    let lotIndex = null;

    // Check custom substring slices (or auto-detect if lot is a slice of a token)
    let lotSlice = state.currentModalCustomSlices?.lot || null;
    if (!lotSlice && lotVal) {
        lotSlice = findSubstringSliceInTokens(tokens, state.currentModalLotNo || lotVal);
    }
    if (lotSlice) {
        lotIndex = lotSlice.tokenIndex;
    }

    // Pass 1: Exact matches
    tokens.forEach((tok, idx) => {
        const upper = tok.toUpperCase();
        const num = parseFloat(tok);

        if (hinbanVal && upper === hinbanVal && hinbanIndex === null) {
            hinbanIndex = idx;
        }
        if (lotVal && upper === lotVal && lotIndex === null) {
            lotIndex = idx;
        }

        // Check number matches
        if (!isNaN(num)) {
            if (!isNaN(bichoVal) && Math.abs(num - bichoVal) < 0.001 && bichoIndex === null) {
                bichoIndex = idx;
            } else if (!isNaN(sochoVal) && Math.abs(num - sochoVal) < 0.001 && sochoIndex === null) {
                sochoIndex = idx;
            } else if (!isNaN(shikiVal) && Math.abs(num - shikiVal) < 0.001 && shikiIndex === null) {
                shikiIndex = idx;
            }
        }
    });

    // Pass 2: Partial matches for text if still null
    tokens.forEach((tok, idx) => {
        const upper = tok.toUpperCase();
        if (idx !== hinbanIndex && idx !== lotIndex && idx !== bichoIndex && idx !== sochoIndex && idx !== shikiIndex) {
            if (hinbanVal && hinbanIndex === null && (upper.includes(hinbanVal) || hinbanVal.includes(upper))) {
                hinbanIndex = idx;
            }
            if (lotVal && lotIndex === null && (upper.includes(lotVal) || lotVal.includes(upper))) {
                lotIndex = idx;
            }
        }
    });

    if (bichoIndex === null && (isNaN(bichoVal) || bichoVal <= 0)) {
        alert('美長 / 実長（必須）が正しく入力されていません。美長欄に数値を入力してください。');
        return;
    }

    const prefix = kizai.split(/[-_ /]/)[0] || kizai.slice(0, 5);

    const payload = {
        kizai: kizai,
        kizaiPrefix: prefix,
        supplier: '',
        sampleRawQR: rawQR,
        patternType: 'delimited',
        delimiter: delimiter,
        fieldsPresent: {
            hasSocho: sochoIndex !== null,
            hasShiki: shikiIndex !== null,
            hasBicho: bichoIndex !== null,
            hasHinban: hinbanIndex !== null,
            hasLot: (lotIndex !== null || lotSlice !== null)
        },
        mapping: {
            hinbanIndex,
            lotIndex,
            lotSlice,
            sochoIndex,
            shikiIndex,
            bichoIndex
        },
        hasQR: true,
        learnedBy: state.workerName || '作業者',
        updatedAt: new Date().toISOString()
    };

    try {
        const res = await fetch(`${serverURL}/api/firstkojo/learned-qr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result && result.success) {
            const pData = result.pattern || payload;
            const existingIdx = state.learnedQRPatterns.findIndex(p => p.kizai && p.kizai.toUpperCase() === kizai.toUpperCase());
            if (existingIdx >= 0) {
                state.learnedQRPatterns[existingIdx] = pData;
            } else {
                state.learnedQRPatterns.unshift(pData);
            }
            localStorage.setItem('firstkojo_learned_qr_patterns', JSON.stringify(state.learnedQRPatterns));

            const banner = document.getElementById('feedLearnQRBanner');
            if (banner) banner.style.display = 'none';

            const proceedBtn = document.getElementById('btnManualProceedPhoto');
            if (proceedBtn) proceedBtn.textContent = '確認して写真撮影へ進む →';

            showToast(`「${kizai}」のQR形式を学習しました。全端末に即時共有されました。`, 'success', 3500);
        } else {
            alert('学習の保存に失敗しました: ' + (result?.message || 'Server error'));
        }
    } catch (err) {
        console.error('Failed to post learned QR pattern:', err);
        alert('サーバー通信エラー: 学習の保存に失敗しました。');
    }
}

async function markCurrentMaterialAsNoQR() {
    const kizai = (state.currentModalHinban ||
                   state.currentModalRollContext?.item?.kizai ||
                   state.currentModalRollContext?.group?.kizai ||
                   state.currentModalRollContext?.item?.hinban ||
                   '').trim();

    if (!kizai) {
        alert('基材コードが見つかりません。');
        return;
    }

    const ok = confirm(`「${kizai}」はQRコード無しとして登録しますか？\n登録すると、次回から全端末で手動入力画面が直接開きます。`);
    if (!ok) return;

    const prefix = kizai.split(/[-_ /]/)[0] || kizai.slice(0, 5);
    const payload = {
        kizai: kizai,
        kizaiPrefix: prefix,
        hasQR: false,
        sampleRawQR: '',
        fieldsPresent: { hasSocho: false, hasShiki: false, hasBicho: true, hasHinban: true, hasLot: true },
        mapping: {},
        learnedBy: state.workerName || '作業者',
        updatedAt: new Date().toISOString()
    };

    try {
        const res = await fetch(`${serverURL}/api/firstkojo/learned-qr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result && result.success) {
            const pData = result.pattern || payload;
            const existingIdx = state.learnedQRPatterns.findIndex(p => p.kizai && p.kizai.toUpperCase() === kizai.toUpperCase());
            if (existingIdx >= 0) {
                state.learnedQRPatterns[existingIdx] = pData;
            } else {
                state.learnedQRPatterns.unshift(pData);
            }
            localStorage.setItem('firstkojo_learned_qr_patterns', JSON.stringify(state.learnedQRPatterns));
            showToast(`✓ 「${kizai}」をQRなし基材として登録しました（全端末共有）`, 'success', 3000);
        } else {
            alert('登録に失敗しました: ' + (result?.message || 'Server error'));
        }
    } catch (err) {
        console.error('Failed to register no-QR material:', err);
        alert('サーバー通信エラー: 登録に失敗しました。');
    }
}

function handleUSBBarcodeScanned(barcode) {
    console.log('⚡ USB Barcode Burst Detected:', barcode);

    const headerPill = document.getElementById('scannerHeaderStatus');
    if (headerPill) {
        headerPill.textContent = `✓ スキャン: ${barcode.slice(0, 16)}`;
        headerPill.style.background = '#FEF3C7';
        headerPill.style.borderColor = '#FDE68A';
        headerPill.style.color = '#92400E';
        setTimeout(() => {
            headerPill.textContent = '🟢 スキャナー待機中';
            headerPill.style.background = '#ECFDF5';
            headerPill.style.borderColor = '#A7F3D0';
            headerPill.style.color = '#065F46';
        }, 3500);
    }

    const feedModal = document.getElementById('materialFeedModal');
    const isFeedOpen = feedModal && (feedModal.classList.contains('open') || feedModal.style.display === 'flex');

    if (isFeedOpen && state.currentModalRollContext) {
        state.currentModalRawQR = barcode;
        const qrInput = document.getElementById('feedRawQRInput');
        if (qrInput) qrInput.value = barcode;

        const currentKizai = (state.currentModalRollContext?.item?.kizai ||
                              state.currentModalRollContext?.group?.kizai ||
                              state.currentModalRollContext?.item?.hinban ||
                              state.currentModalRollContext?.group?.hinban ||
                              state.currentModalHinban || '').trim();

        // 1. Try learned pattern matching first
        const learnedPattern = findLearnedPatternForKizai(currentKizai, barcode);
        let parsed = null;
        if (learnedPattern) {
            parsed = parseBarcodeWithLearnedPattern(learnedPattern, barcode);
        }

        const isKnownLearnedPattern = (parsed && parsed.isLearned === true);

        // 2. If no learned pattern or parsing returned null, use heuristics to pre-populate candidate fields
        if (!parsed) {
            parsed = parseBarcodeHeuristics(barcode);
        }

        let sochoVal = parsed.socho || '';
        let shikiVal = parsed.shiki || '0';
        let bichoVal = parsed.bicho;
        let hinbanVal = parsed.hinban || '';
        let lotVal = parsed.lotNo || '';

        if (bichoVal === null || isNaN(bichoVal)) {
            bichoVal = Number(state.currentModalRollContext.item?.meters) || 100;
        }

        state.currentModalSocho = sochoVal;
        state.currentModalShiki = shikiVal;
        state.currentModalBicho = bichoVal;
        if (hinbanVal) state.currentModalHinban = hinbanVal;
        if (lotVal) state.currentModalLotNo = normalizeDateStringToISO(lotVal);

        saveCurrentModalManualEdits();
        updateManualDisplays();

        const badge = document.getElementById('feedScannerLiveBadge');
        if (badge) {
            badge.textContent = `読取: ${bichoVal} m`;
            badge.className = 'feed-scanner-badge is-scanned';
        }

        // Always switch to manual confirmation view so the user can verify
        // the 3 lengths, date/lot, and hinban before taking the photo!
        switchFeedModalView('manual');

        const proceedBtn = document.getElementById('btnManualProceedPhoto');

        if (isKnownLearnedPattern) {
            // Already learned format: Hide teaching banner, prompt user confirmation
            const banner = document.getElementById('feedLearnQRBanner');
            if (banner) banner.style.display = 'none';
            if (proceedBtn) proceedBtn.textContent = '確認して写真撮影へ進む →';
            showToast(`学習済QR読取完了 (${bichoVal}m)。内容を確認して写真撮影へ進んでください`, 'success', 2500);
        } else {
            // Unlearned format: Show teaching banner so user can verify and teach it
            checkLearnQRBannerEligibility();
            if (proceedBtn) proceedBtn.textContent = '写真撮影へ進む →';
            showToast('未学習のQR形式です。各項目を確認し、必要に応じて学習してください。', 'info', 3000);
        }
    } else {
        showToast(`バーコード読取: ${barcode}`, 'info', 2500);
    }
}

function setupFeedRawQRInput() {
    const input = document.getElementById('feedRawQRInput');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (val) {
                handleUSBBarcodeScanned(val);
            }
        }
    });
}

// --- Keypad and Manual Input State ---
let currentKeypadTarget = null; // 'socho' | 'shiki' | 'bicho'
let currentKeypadBuffer = '';

function switchFeedModalView(view) {
    const scanView = document.getElementById('feedScanView');
    const manualView = document.getElementById('feedManualView');

    // Ensure virtual keyboard never pops up on tablet
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    if (view === 'manual') {
        if (scanView) scanView.style.display = 'none';
        if (manualView) manualView.style.display = 'flex';
        updateManualDisplays();
        checkLearnQRBannerEligibility();
    } else {
        if (scanView) scanView.style.display = 'flex';
        if (manualView) manualView.style.display = 'none';
    }
}

function validateModalRequiredFields(optCtx) {
    const ctx = optCtx || state.currentModalRollContext;
    const edit = (ctx && ctx.itemId) ? getItemEdit(ctx.itemId, ctx.item) : null;
    const missing = [];

    // 1. 総長 (m)
    const rawSocho = (state.currentModalSocho !== undefined && state.currentModalSocho !== null && state.currentModalSocho !== '')
        ? state.currentModalSocho
        : (edit?.socho ?? '');
    const sochoStr = String(rawSocho).trim();
    const sochoNum = parseFloat(sochoStr);
    const isSochoValid = Boolean(sochoStr !== '' && !isNaN(sochoNum) && sochoNum > 0);
    if (!isSochoValid) {
        missing.push({ field: 'socho', name: '総長 (m)' });
    }

    // 2. S引き長 (m) (0 m is valid)
    const rawShiki = (state.currentModalShiki !== undefined && state.currentModalShiki !== null && state.currentModalShiki !== '')
        ? state.currentModalShiki
        : (edit?.shiki ?? '');
    const shikiStr = String(rawShiki).trim();
    const shikiNum = parseFloat(shikiStr);
    const isShikiValid = Boolean(shikiStr !== '' && !isNaN(shikiNum) && shikiNum >= 0);
    if (!isShikiValid) {
        missing.push({ field: 'shiki', name: 'S引き長 (m)' });
    }

    // 3. 美長 / 実長 (m)
    const rawBicho = (state.currentModalBicho !== undefined && state.currentModalBicho !== null && state.currentModalBicho !== '')
        ? state.currentModalBicho
        : (edit?.bicho ?? '');
    const bichoStr = String(rawBicho).trim();
    const bichoNum = parseFloat(bichoStr);
    const isBichoValid = Boolean(bichoStr !== '' && !isNaN(bichoNum) && bichoNum > 0);
    if (!isBichoValid) {
        missing.push({ field: 'bicho', name: '美長 / 実長 (m)' });
    }

    // 4. 品番 / 基材コード
    const rawHinban = (state.currentModalHinban || edit?.hinban || '').trim();
    const isHinbanValid = Boolean(rawHinban && rawHinban !== '-' && rawHinban !== '未入力');
    if (!isHinbanValid) {
        missing.push({ field: 'hinban', name: '品番 / 基材コード' });
    }

    // 5. メーカーロット / 日付
    const rawLot = (state.currentModalLotNo || edit?.lotNo || '').trim();
    const isLotValid = Boolean(rawLot && rawLot !== '-' && rawLot !== '未入力');
    if (!isLotValid) {
        missing.push({ field: 'lot', name: 'メーカーロット / 日付' });
    }

    return {
        isValid: missing.length === 0,
        missing: missing,
        status: {
            socho: isSochoValid,
            shiki: isShikiValid,
            bicho: isBichoValid,
            hinban: isHinbanValid,
            lot: isLotValid
        }
    };
}

function updateManualDisplays() {
    const sochoEl = document.getElementById('manualSochoDisplay');
    const shikiEl = document.getElementById('manualShikiDisplay');
    const bichoEl = document.getElementById('manualBichoDisplay');
    const hinbanEl = document.getElementById('manualHinbanDisplay');
    const lotEl = document.getElementById('manualLotDisplay');

    const v = validateModalRequiredFields();

    if (sochoEl) {
        sochoEl.textContent = v.status.socho ? `${state.currentModalSocho} m` : '未入力';
        const card = sochoEl.closest('.feed-numpad-field');
        if (card) {
            card.classList.toggle('is-missing', !v.status.socho);
            card.classList.toggle('is-filled', v.status.socho);
        }
    }
    if (shikiEl) {
        shikiEl.textContent = v.status.shiki ? `${state.currentModalShiki} m` : '未入力';
        const card = shikiEl.closest('.feed-numpad-field');
        if (card) {
            card.classList.toggle('is-missing', !v.status.shiki);
            card.classList.toggle('is-filled', v.status.shiki);
        }
    }
    if (bichoEl) {
        bichoEl.textContent = v.status.bicho ? `${state.currentModalBicho} m` : '未入力';
        const card = bichoEl.closest('.feed-numpad-field');
        if (card) {
            card.classList.toggle('is-missing', !v.status.bicho);
            card.classList.toggle('is-filled', v.status.bicho);
        }
    }
    if (hinbanEl) {
        hinbanEl.textContent = v.status.hinban ? state.currentModalHinban : '未入力';
        const card = hinbanEl.closest('.feed-numpad-field');
        if (card) {
            card.classList.toggle('is-missing', !v.status.hinban);
            card.classList.toggle('is-filled', v.status.hinban);
        }
    }
    if (lotEl) {
        lotEl.textContent = v.status.lot ? state.currentModalLotNo : '未入力';
        const card = lotEl.closest('.feed-numpad-field');
        if (card) {
            card.classList.toggle('is-missing', !v.status.lot);
            card.classList.toggle('is-filled', v.status.lot);
        }
    }

    const proceedBtn = document.getElementById('btnManualProceedPhoto');
    if (proceedBtn) {
        if (!v.isValid) {
            proceedBtn.classList.add('is-incomplete');
            proceedBtn.title = `未入力の項目があります: ${v.missing.map(m => m.name).join(', ')}`;
        } else {
            proceedBtn.classList.remove('is-incomplete');
            proceedBtn.title = '確認して写真撮影へ進む';
        }
    }
}

function saveCurrentModalManualEdits() {
    const ctx = state.currentModalRollContext;
    if (!ctx || !ctx.itemId) return;

    const bichoVal = parseFloat(state.currentModalBicho);
    const metersVal = !isNaN(bichoVal) ? bichoVal : (parseFloat(state.currentModalSocho) || 100);

    setItemEdit(ctx.itemId, {
        socho: state.currentModalSocho,
        shiki: state.currentModalShiki,
        bicho: !isNaN(bichoVal) ? bichoVal : '',
        meters: metersVal,
        hinban: state.currentModalHinban,
        lotNo: state.currentModalLotNo,
        rawQR: state.currentModalRawQR
    });

    const row = document.querySelector(`.batch-roll-row[data-item-id="${ctx.itemId}"]`);
    if (row) {
        const meterTag = row.querySelector('.meter-tag');
        if (meterTag) meterTag.textContent = `${metersVal} m`;
    }
}

// --- Numeric Keypad Handlers (Copied from DCP interactive) ---
function openMaterialKeypad(targetField) {
    currentKeypadTarget = targetField;
    const titleEl = document.getElementById('materialKeypadTitle');
    const dispEl = document.getElementById('materialKeypadValue');
    const keypadModal = document.getElementById('materialKeypadModal');

    if (targetField === 'socho') {
        if (titleEl) titleEl.textContent = '総長 (m) を入力';
        currentKeypadBuffer = (state.currentModalSocho !== undefined && state.currentModalSocho !== '') ? String(state.currentModalSocho) : '';
    } else if (targetField === 'shiki') {
        if (titleEl) titleEl.textContent = 'S引き長 (m) を入力';
        currentKeypadBuffer = (state.currentModalShiki !== undefined && state.currentModalShiki !== '') ? String(state.currentModalShiki) : '0';
    } else {
        if (titleEl) titleEl.textContent = '美長 / 純長 (m) を入力';
        currentKeypadBuffer = (state.currentModalBicho !== undefined && state.currentModalBicho !== '') ? String(state.currentModalBicho) : '';
    }

    if (dispEl) dispEl.textContent = currentKeypadBuffer || '0';
    if (keypadModal) {
        keypadModal.classList.add('open');
        keypadModal.style.display = 'flex';
    }
}

function closeMaterialKeypad() {
    const keypadModal = document.getElementById('materialKeypadModal');
    if (keypadModal) {
        keypadModal.classList.remove('open');
        keypadModal.style.display = 'none';
    }
    currentKeypadTarget = null;
    currentKeypadBuffer = '';
}

function materialKeypadPress(char) {
    const dispEl = document.getElementById('materialKeypadValue');
    if (currentKeypadBuffer === '0' && char !== '.') {
        currentKeypadBuffer = char;
    } else if (char === '.' && currentKeypadBuffer.includes('.')) {
        return;
    } else {
        currentKeypadBuffer += char;
    }
    if (dispEl) dispEl.textContent = currentKeypadBuffer || '0';
}

function materialKeypadClear() {
    currentKeypadBuffer = '';
    const dispEl = document.getElementById('materialKeypadValue');
    if (dispEl) dispEl.textContent = '0';
}

function materialKeypadBackspace() {
    currentKeypadBuffer = currentKeypadBuffer.slice(0, -1);
    const dispEl = document.getElementById('materialKeypadValue');
    if (dispEl) dispEl.textContent = currentKeypadBuffer || '0';
}

function materialKeypadConfirm() {
    const val = currentKeypadBuffer;
    if (currentKeypadTarget === 'socho') {
        state.currentModalSocho = val;
        const so = parseFloat(val) || 0;
        const sh = parseFloat(state.currentModalShiki) || 0;
        state.currentModalBicho = Math.max(0, parseFloat((so - sh).toFixed(2)));
    } else if (currentKeypadTarget === 'shiki') {
        state.currentModalShiki = val || '0';
        const so = parseFloat(state.currentModalSocho) || 0;
        const sh = parseFloat(val) || 0;
        if (state.currentModalSocho) {
            state.currentModalBicho = Math.max(0, parseFloat((so - sh).toFixed(2)));
        }
    } else if (currentKeypadTarget === 'bicho') {
        state.currentModalBicho = val;
    }

    updateManualDisplays();
    saveCurrentModalManualEdits();
    closeMaterialKeypad();
}

function proceedToCameraFromManual() {
    const validation = validateModalRequiredFields();
    if (!validation.isValid) {
        const missingNames = validation.missing.map(m => `・${m.name}`).join('\n');
        alert(`以下の必須項目が未入力です。各項目をタップして入力・確認してください：\n\n${missingNames}`);
        return;
    }

    const socho = parseFloat(state.currentModalSocho);
    const bicho = parseFloat(state.currentModalBicho);
    if (!isNaN(socho) && !isNaN(bicho) && socho < bicho) {
        alert(`総長（${socho} m）が美長（${bicho} m）より短くなっています。\n数値を再確認してください。`);
        return;
    }

    saveCurrentModalManualEdits();
    triggerNativeCameraForModal();
}

// --- Feed Modal Control (Item-by-Item, Clean Scan UI) ---
function openMaterialFeedModalForRollItem(itemId, gIdx, rIdx, event) {
    if (event) event.stopPropagation();

    if (!state.currentGroups || state.currentGroups.length === 0) {
        if (state.scheduledItems && state.scheduledItems.length > 0) {
            state.currentGroups = groupScheduledItems(state.scheduledItems);
        }
    }

    let group = (state.currentGroups && gIdx !== undefined && gIdx !== null && gIdx >= 0) ? state.currentGroups[gIdx] : null;
    let item = (group && group.items && rIdx !== undefined && rIdx !== null && rIdx >= 0) ? group.items[rIdx] : null;

    // Fallback: search by itemId across groups if not directly found
    if ((!group || !item) && state.currentGroups) {
        for (let gi = 0; gi < state.currentGroups.length; gi++) {
            const grp = state.currentGroups[gi];
            if (grp && grp.items) {
                const ri = grp.items.findIndex(it => 
                    (it.id && itemId && it.id === itemId) || 
                    getItemKey(it, gi, ri) === itemId
                );
                if (ri !== -1) {
                    group = grp;
                    item = grp.items[ri];
                    gIdx = gi;
                    rIdx = ri;
                    break;
                }
            }
        }
    }

    if (!group || !item) {
        console.warn('Group or item not found for index/id:', { itemId, gIdx, rIdx });
        return;
    }
    if (group.type === 'setup') return;

    if (isRollEnqueuedOrProcessed(item, group, gIdx, rIdx)) {
        showToast('ℹ️ この巻きは既にキューに追加または処理されています', 'info', 2500);
        return;
    }

    const resolvedItemId = itemId || getItemKey(item, gIdx, rIdx);
    state.currentModalRollContext = { itemId: resolvedItemId, gIdx, rIdx, item, group };
    state.currentFeedItem = item;
    state.currentFeedGroup = group;

    const edit = getItemEdit(resolvedItemId, item);

    const modal = document.getElementById('materialFeedModal');
    if (!modal) return;

    // 1. Set Title: 基材コード - #8 (Show overall schedule order number)
    const kizai = item.kizai || group?.kizai || item.hinban || group?.hinban || '基材コード';
    let orderNum = item.orderIndex;
    if (!orderNum && state.scheduledItems) {
        const sItem = state.scheduledItems.find(s => (s.id && s.id === item.id) || (s.itemId && s.itemId === item.id));
        if (sItem && sItem.orderIndex) orderNum = sItem.orderIndex;
    }
    if (!orderNum) {
        orderNum = item.orderIndex || (item.rollIndex || (rIdx + 1));
    }
    const titleEl = document.getElementById('feedModalHeaderTitle');
    if (titleEl) {
        titleEl.textContent = `${kizai}  - #${orderNum}`;
    }

    // 2. Initialize length and metadata values
    state.currentModalSocho = edit.socho || '';
    state.currentModalShiki = edit.shiki || '0';
    state.currentModalBicho = edit.bicho || (edit.meters !== undefined ? edit.meters : (item.meters || ''));
    state.currentModalHinban = edit.hinban || item.kizai || item.hinban || group?.kizai || group?.hinban || '';
    state.currentModalLotNo = normalizeDateStringToISO(edit.lotNo || '');
    state.currentModalRawQR = edit.rawQR || '';
    state.currentModalCustomSlices = {};

    // Check if this material is registered as NO QR
    const learnedPattern = findLearnedPatternForKizai(kizai);
    if (learnedPattern && learnedPattern.hasQR === false) {
        switchFeedModalView('manual');
        showToast(`ℹ️ 「${kizai}」はQRなし登録基材です（手動入力モード）`, 'info', 2200);
    } else {
        switchFeedModalView('scan');
    }

    const badge = document.getElementById('feedScannerLiveBadge');
    if (badge) {
        badge.textContent = '🟢 ' + _t('fk_scanner_ready');
        badge.className = 'feed-scanner-badge';
    }

    const qrInput = document.getElementById('feedRawQRInput');
    if (qrInput) {
        qrInput.value = '';
    }

    // Explicitly blur any active element so tablet virtual keyboard never opens
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    // 4. Update Exclude button text with proper localization
    const excludeBtn = document.querySelector('.feed-link-exclude');
    if (excludeBtn) {
        excludeBtn.textContent = edit.isExcluded ? _t('fk_btn_restore_roll') : _t('fk_btn_exclude_roll');
        excludeBtn.style.color = edit.isExcluded ? 'var(--brand)' : 'var(--text-muted)';
    }

    // 5. Open modal
    modal.classList.add('open', 'active');
    modal.style.display = 'flex';
}

function openMaterialFeedModalForGroup(groupIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    if (group.type === 'setup') return;

    let targetIdx = -1;
    for (let i = 0; i < group.items.length; i++) {
        const it = group.items[i];
        if (!isRollEnqueuedOrProcessed(it, group, groupIndex, i)) {
            targetIdx = i;
            break;
        }
    }
    if (targetIdx === -1) {
        showToast('ℹ️ このロットの全巻きは既に投入済です', 'info', 2500);
        return;
    }
    const targetItem = group.items[targetIdx];
    const targetKey = getItemKey(targetItem, groupIndex, targetIdx);
    openMaterialFeedModalForRollItem(targetKey, groupIndex, targetIdx, event);
}

function openMaterialFeedModalForRoll(groupIndex, rollIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    const rollItem = group.items[rollIndex];
    if (!rollItem) return;

    if (isRollEnqueuedOrProcessed(rollItem, group, groupIndex, rollIndex)) {
        showToast('ℹ️ この巻きは既にキューに追加または処理されています', 'info', 2500);
        return;
    }

    const itemId = getItemKey(rollItem, groupIndex, rollIndex);
    openMaterialFeedModalForRollItem(itemId, groupIndex, rollIndex, event);
}

function openMaterialFeedModalForCurrentItem() {
    if (!state.selectedItem) {
        showToast('対象ロットを選択してください', 'error');
        return;
    }
    const targetGroup = state.currentGroups ? state.currentGroups.find(g => g.items && g.items.some(it => it.id === state.selectedItem.id)) : null;
    const gIdx = targetGroup ? state.currentGroups.indexOf(targetGroup) : 0;
    const rIdx = targetGroup ? targetGroup.items.findIndex(it => it.id === state.selectedItem.id) : 0;
    const itemId = getItemKey(state.selectedItem, gIdx, rIdx);
    openMaterialFeedModalForRollItem(itemId, gIdx, rIdx);
}

function openMaterialFeedModal(item, group) {
    if (!item) return;
    const gIdx = state.currentGroups ? state.currentGroups.findIndex(g => g.items && g.items.some(it => it.id === item.id)) : 0;
    const safeGIdx = gIdx >= 0 ? gIdx : 0;
    const rIdx = group && group.items ? group.items.findIndex(it => it.id === item.id) : 0;
    const safeRIdx = rIdx >= 0 ? rIdx : 0;
    const itemId = getItemKey(item, safeGIdx, safeRIdx);
    openMaterialFeedModalForRollItem(itemId, safeGIdx, safeRIdx);
}

function closeMaterialFeedModal() {
    const modal = document.getElementById('materialFeedModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
    closeMaterialKeypad();
    state.currentModalRollContext = null;
    state.currentFeedItem = null;
    state.currentFeedGroup = null;
}

function hideMaterialFeedModal() {
    const modal = document.getElementById('materialFeedModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
    closeMaterialKeypad();
}

function showQueueAddingModal(item, ctx, photoSrc) {
    const modal = document.getElementById('queueAddingModal');
    if (!modal) return;

    const rollIdx = item?.rollIndex || (ctx?.rIdx !== undefined ? ctx.rIdx + 1 : 1);
    const orderIdx = item?.orderIndex || ctx?.item?.orderIndex || rollIdx;
    const hinban = item?.kizai || item?.hinban || ctx?.item?.kizai || ctx?.item?.hinban || '材料';

    const rollIdEl = document.getElementById('queueAddingRollId');
    if (rollIdEl) {
        rollIdEl.textContent = `#${orderIdx} ${hinban}`;
    }

    const thumbImg = document.getElementById('queueAddingThumbImg');
    const placeholder = document.getElementById('queueAddingThumbPlaceholder');
    const src = photoSrc || state.capturedPhotoBase64 || ctx?.photoUrl;
    if (src && thumbImg && placeholder) {
        thumbImg.src = src;
        thumbImg.style.display = 'block';
        placeholder.style.display = 'none';
    } else if (thumbImg && placeholder) {
        thumbImg.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    const spinnerRow = document.getElementById('queueAddingSpinnerRow');
    const successRow = document.getElementById('queueAddingSuccessRow');
    const statusText = document.getElementById('queueAddingStatusText');
    const subText = document.getElementById('queueAddingSubText');

    if (spinnerRow) spinnerRow.style.display = 'flex';
    if (successRow) successRow.style.display = 'none';
    if (statusText) statusText.textContent = '投入キューに追加中...';
    if (subText) subText.textContent = 'サーバーへ登録しています...';

    modal.classList.add('open', 'active');
    modal.style.display = 'flex';
}

function setQueueAddingModalSuccess(msg) {
    const spinnerRow = document.getElementById('queueAddingSpinnerRow');
    const successRow = document.getElementById('queueAddingSuccessRow');
    const successText = document.querySelector('.queue-adding-success-text');

    if (spinnerRow) spinnerRow.style.display = 'none';
    if (successRow) successRow.style.display = 'flex';
    if (successText) successText.textContent = msg || '投入完了！キュー一覧へ移動します';
}

function closeQueueAddingModal() {
    const modal = document.getElementById('queueAddingModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
}

// -----------------------------------------------------
// IndexedDB Local Photo Storage (Zero localStorage Quota Bloat)
// -----------------------------------------------------
const firstKojoPhotoDB = (() => {
    let _db = null;
    const DB_NAME = 'firstKojoPhotoDB';
    const DB_VERSION = 1;
    const STORE = 'photos';

    function openDB() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'itemId' });
                }
            };
            req.onsuccess = (e) => {
                _db = e.target.result;
                resolve(_db);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    return {
        async savePhoto(itemId, data) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                const store = tx.objectStore(STORE);
                const record = {
                    itemId,
                    base64: data.base64,
                    date: data.date || state.selectedDate,
                    machine: data.machine || state.machineName || 'PSA2',
                    worker: data.worker || state.workerName || 'worker',
                    lotNo: data.lotNo || 'nolot',
                    hinban: data.hinban || '',
                    kizai: data.kizai || '',
                    timestamp: data.timestamp || Date.now(),
                    status: data.status || 'pending', // 'pending' | 'uploading' | 'uploaded' | 'failed'
                    uploadAttempts: data.uploadAttempts || 0,
                    photoUrl: data.photoUrl || null
                };
                store.put(record);
                tx.oncomplete = () => resolve(record);
                tx.onerror = (e) => reject(e.target.error);
            });
        },

        async getPhoto(itemId) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readonly');
                const req = tx.objectStore(STORE).get(itemId);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = (e) => reject(e.target.error);
            });
        },

        async updatePhoto(itemId, patch) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                const store = tx.objectStore(STORE);
                const req = store.get(itemId);
                req.onsuccess = () => {
                    const record = req.result;
                    if (record) {
                        Object.assign(record, patch);
                        store.put(record);
                    }
                    resolve(record);
                };
                req.onerror = (e) => reject(e.target.error);
            });
        },

        async getAllPending() {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readonly');
                const req = tx.objectStore(STORE).getAll();
                req.onsuccess = () => {
                    const items = (req.result || []).filter(r => r.status === 'pending' || r.status === 'failed');
                    resolve(items);
                };
                req.onerror = (e) => reject(e.target.error);
            });
        },

        async deletePhoto(itemId) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(itemId);
                tx.oncomplete = () => resolve(true);
                tx.onerror = (e) => reject(e.target.error);
            });
        }
    };
})();

// --- Fast Edge/Blur Detection (Variance of Laplacian on downscaled canvas) ---
async function detectBlur(base64Image, threshold = 60) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                // Downsample image to 160x120 for instant computation
                const w = 160;
                const h = 120;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const data = imgData.data;

                // Grayscale
                const gray = new Float32Array(w * h);
                for (let i = 0; i < data.length; i += 4) {
                    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                }

                // Laplacian kernel convolution [-1, -1, -1, -1, 8, -1, -1, -1, -1]
                let sum = 0;
                let sumSq = 0;
                let count = 0;

                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        const idx = y * w + x;
                        const val =
                            -gray[idx - w - 1] - gray[idx - w] - gray[idx - w + 1]
                            - gray[idx - 1] + 8 * gray[idx] - gray[idx + 1]
                            - gray[idx + w - 1] - gray[idx + w] - gray[idx + w + 1];

                        sum += val;
                        sumSq += val * val;
                        count++;
                    }
                }

                const mean = sum / count;
                const variance = (sumSq / count) - (mean * mean);
                const isBlurry = variance < threshold;
                resolve({ isBlurry, score: Math.round(variance) });
            } catch (err) {
                console.warn('Blur detection error:', err);
                resolve({ isBlurry: false, score: 999 });
            }
        };
        img.onerror = () => resolve({ isBlurry: false, score: 999 });
        img.src = base64Image;
    });
}

function showBlurWarning(score, onRetake, onProceed) {
    const existing = document.getElementById('blurWarningModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'blurWarningModal';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.75);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999; backdrop-filter: blur(4px);
    `;

    overlay.innerHTML = `
        <div style="background: #ffffff; border-radius: 16px; padding: 24px; max-width: 380px; width: 90%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border: 2px solid #f59e0b;">
            <div style="font-size: 40px; margin-bottom: 8px;">⚠️</div>
            <h3 style="font-size: 18px; font-weight: 800; color: #1e293b; margin: 0 0 8px;">写真が少しブレています</h3>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 20px;">
                文字やQRコードがぼやけている可能性があります。<br>
                このまま登録しますか？
            </p>
            <div style="display: flex; gap: 10px;">
                <button id="blurRetakeBtn" style="flex: 1; padding: 12px; border: 1.5px solid #cbd5e1; border-radius: 10px; background: #f8fafc; font-weight: 700; color: #334155; font-size: 14px; cursor: pointer;">
                    📷 撮り直す
                </button>
                <button id="blurProceedBtn" style="flex: 1; padding: 12px; border: none; border-radius: 10px; background: #2563eb; font-weight: 700; color: #ffffff; font-size: 14px; cursor: pointer;">
                    このまま使用
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#blurRetakeBtn').onclick = () => {
        overlay.remove();
        if (typeof onRetake === 'function') onRetake();
    };

    overlay.querySelector('#blurProceedBtn').onclick = () => {
        overlay.remove();
        if (typeof onProceed === 'function') onProceed();
    };
}

// --- Background Photo Upload Queue ---
const photoUploadQueue = [];
let isUploadingPhotos = false;

function enqueueBackgroundPhotoUpload(itemId) {
    if (!itemId) return;
    if (!photoUploadQueue.includes(itemId)) {
        photoUploadQueue.push(itemId);
    }
    processBackgroundPhotoQueue();
}

async function processBackgroundPhotoQueue() {
    if (isUploadingPhotos || photoUploadQueue.length === 0) return;
    isUploadingPhotos = true;

    while (photoUploadQueue.length > 0) {
        const itemId = photoUploadQueue.shift();
        try {
            await uploadSinglePhotoWithRetry(itemId, 3);
        } catch (err) {
            console.warn(`Background photo upload failed for ${itemId}:`, err);
        }
    }

    isUploadingPhotos = false;
}

async function uploadLabelPhotoToServer(base64, lotNo, hinban, itemId) {
    if (!base64) return '';
    const targetDate = state.selectedDate || new Date().toISOString().slice(0, 10);
    const targetMachine = state.machineName || 'PSA2';
    const targetWorker = state.workerName || 'worker';
    const targetLotNo = lotNo || 'nolot';
    const timestamp = Date.now();

    const filePath = `firstKojo/${targetDate}/${targetMachine}/${targetWorker}_${targetLotNo}_${timestamp}_materialLabel.jpg`;

    const payload = {
        base64: base64,
        filePath: filePath,
        date: targetDate,
        machine: targetMachine,
        worker: targetWorker,
        lotNo: targetLotNo,
        hinban: hinban || '',
        itemId: itemId || ''
    };

    const res = await fetch(`${serverURL}/api/firstkojo/upload-label-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Upload failed HTTP ${res.status}`);
    const data = await res.json();
    const publicUrl = data.url || data.photoUrl || data.imageUrl || '';
    if (publicUrl && itemId) {
        setItemEdit(itemId, { photoUrl: publicUrl, hasPhoto: true });
        try {
            await firstKojoPhotoDB.updatePhoto(itemId, { photoUrl: publicUrl, status: 'uploaded' });
        } catch (e) { }
    }
    return publicUrl;
}

async function uploadSinglePhotoWithRetry(itemId, maxRetries = 3) {
    const record = await firstKojoPhotoDB.getPhoto(itemId);
    if (!record || !record.base64) return;
    if (record.status === 'uploaded' && record.photoUrl) return;

    await firstKojoPhotoDB.updatePhoto(itemId, { status: 'uploading' });

    let attempts = record.uploadAttempts || 0;
    let uploadedUrl = null;

    for (let i = attempts; i < maxRetries; i++) {
        try {
            const timestamp = record.timestamp || Date.now();
            const targetDate = record.date || state.selectedDate || new Date().toISOString().slice(0, 10);
            const targetMachine = record.machine || state.machineName || 'PSA2';
            const targetWorker = record.worker || state.workerName || 'worker';
            const targetLotNo = record.lotNo || 'nolot';

            const filePath = `firstKojo/${targetDate}/${targetMachine}/${targetWorker}_${targetLotNo}_${timestamp}_materialLabel.jpg`;

            const payload = {
                base64: record.base64,
                filePath: filePath,
                date: targetDate,
                machine: targetMachine,
                worker: targetWorker,
                lotNo: targetLotNo,
                hinban: record.hinban || '',
                itemId: itemId
            };

            const res = await fetch(`${serverURL}/api/firstkojo/upload-label-photo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            if (data.success && (data.url || data.imageUrl || data.photoUrl)) {
                uploadedUrl = data.url || data.imageUrl || data.photoUrl;
                break;
            } else {
                throw new Error(data.error || 'No URL returned');
            }
        } catch (err) {
            attempts++;
            await firstKojoPhotoDB.updatePhoto(itemId, { uploadAttempts: attempts });
            console.warn(`⚠️ Upload attempt ${attempts}/${maxRetries} failed for ${itemId}:`, err.message);
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    if (uploadedUrl) {
        await firstKojoPhotoDB.updatePhoto(itemId, {
            status: 'uploaded',
            photoUrl: uploadedUrl
        });
        setItemEdit(itemId, { photoUrl: uploadedUrl, hasPhoto: true });
        console.log(`✅ Background upload finished for ${itemId}: ${uploadedUrl}`);
    } else {
        await firstKojoPhotoDB.updatePhoto(itemId, { status: 'failed' });
    }
}

// --- Native Device Camera Capture ---
function triggerNativeCameraForModal() {
    const validation = validateModalRequiredFields();
    if (!validation.isValid) {
        const missingNames = validation.missing.map(m => `・${m.name}`).join('\n');
        alert(`以下の必須項目が未入力です。全項目の入力が完了するまで写真撮影に進めません：\n\n${missingNames}`);
        return;
    }
    const fileInput = document.getElementById('modalRollCameraInput');
    if (fileInput) {
        fileInput.click();
    }
}

function handleModalRollCameraCapture(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target?.result;
        if (!base64) return;

        const ctx = state.currentModalRollContext;
        if (!ctx) return;

        // 1. Run blur detection
        const blurResult = await detectBlur(base64, 60);
        if (blurResult.isBlurry) {
            showBlurWarning(blurResult.score,
                () => {
                    // User chose Retake -> re-trigger camera
                    triggerNativeCameraForModal();
                },
                () => {
                    // User chose Ignore -> proceed
                    savePhotoAndEnqueue(ctx, base64);
                }
            );
        } else {
            savePhotoAndEnqueue(ctx, base64);
        }
    };
    reader.readAsDataURL(file);

    // Clear input value so taking photo again triggers onchange
    event.target.value = '';
}

async function savePhotoAndEnqueue(ctx, base64) {
    const { itemId, rIdx, item, group } = ctx;
    const lotNoVal = getItemEdit(itemId, item).lotNo || `${(state.selectedDate || '').replace(/-/g, '').slice(2)}-${item.rollIndex || rIdx + 1}`;

    // 0. Instantly close the material input modal and show the dedicated "Adding to Queue" modal
    hideMaterialFeedModal();
    showQueueAddingModal(item, ctx, base64);

    // 1. Save directly into IndexedDB (zero localStorage bloat)
    await firstKojoPhotoDB.savePhoto(itemId, {
        base64: base64,
        date: state.selectedDate,
        machine: state.machineName || 'PSA2',
        worker: state.workerName || 'worker',
        lotNo: lotNoVal,
        hinban: item.hinban || group?.hinban || '',
        kizai: item.kizai || group?.kizai || '',
        timestamp: Date.now(),
        status: 'pending'
    });

    state.capturedPhotoBase64 = base64;

    // 2. Mark lightweight photo indicator in item edit (NO base64 in localStorage!)
    setItemEdit(itemId, { hasPhoto: true });

    // 3. Immediately turn the camera button/pill on the list item from red to green
    const row = document.querySelector(`.batch-roll-row[data-item-id="${itemId}"]`);
    if (row) {
        const pill = row.querySelector('.flat-camera-pill');
        if (pill) {
            pill.className = 'flat-camera-pill is-shot';
            pill.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2 3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> 撮影済`;
        }
    }
    const tableRow = document.querySelector(`.history-schedule-table tr.item-row[data-item-id="${itemId}"]`);
    if (tableRow) {
        tableRow.classList.add('is-processed');
        tableRow.title = '処理済み (キューに追加済)';
    }

    // 4. Submit and enqueue roll
    await submitModalRollToQueue();

    // 5. Enqueue background upload to Firebase Storage with auto-retry
    enqueueBackgroundPhotoUpload(itemId);
}

// Fallbacks for camera modal if referenced
function closeWebcamModal() {
    const modal = document.getElementById('nativeCameraModal');
    if (modal) modal.classList.remove('open');
    if (state.cameraStream) {
        try { state.cameraStream.getTracks().forEach(t => t.stop()); } catch (e) { }
        state.cameraStream = null;
    }
}

function openRollPhotoCapture(itemId, gIdx, rIdx, event) {
    if (event) event.stopPropagation();
    openMaterialFeedModalForRollItem(itemId, gIdx, rIdx, event);
    setTimeout(() => triggerNativeCameraForModal(), 200);
}

async function openPhotoEnlarged(url) {
    const ctx = state.currentModalRollContext;
    let targetUrl = url;

    if (!targetUrl && ctx?.itemId) {
        const dbRecord = await firstKojoPhotoDB.getPhoto(ctx.itemId);
        targetUrl = dbRecord?.base64 || dbRecord?.photoUrl;
    }

    if (!targetUrl) {
        const edit = ctx ? getItemEdit(ctx.itemId, ctx.item) : null;
        targetUrl = edit?.photoUrl || state.uploadedPhotoUrl;
    }
    if (!targetUrl) return;

    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('enlargedPreviewImg');
    if (modal && img) {
        img.src = targetUrl;
        modal.classList.add('open', 'active');
        modal.style.display = 'flex';
    }
}

function closePhotoEnlarged() {
    const modal = document.getElementById('imagePreviewModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
}

// Background image loader with exponential retry and IndexedDB fallback
function handleThumbImgError(imgEl, originalUrl, itemId) {
    if (!imgEl) return;
    const maxRetries = 6;
    const currentRetry = Number(imgEl.dataset.retryCount || 0);

    // Fade out broken state and show loading pulse skeleton
    imgEl.style.opacity = '0.3';
    imgEl.classList.add('img-loading-pulse');

    // 1. If local IndexedDB has the photo base64, display it immediately
    if (itemId && typeof firstKojoPhotoDB !== 'undefined' && currentRetry === 0) {
        firstKojoPhotoDB.getPhoto(itemId).then(rec => {
            if (rec && rec.base64) {
                imgEl.src = rec.base64;
                imgEl.style.opacity = '1';
                imgEl.classList.remove('img-loading-pulse');
                imgEl.dataset.fallbackLoaded = 'true';
            }
        }).catch(() => {});
    }

    if (currentRetry >= maxRetries) {
        console.warn('⚠️ Thumbnail image load failed after max retries:', originalUrl);
        if (imgEl.dataset.fallbackLoaded !== 'true') {
            imgEl.style.opacity = '0.4';
            imgEl.classList.remove('img-loading-pulse');
        }
        return;
    }

    imgEl.dataset.retryCount = currentRetry + 1;
    const delay = Math.min(1000 * Math.pow(1.5, currentRetry), 8000);

    setTimeout(() => {
        const cleanUrl = originalUrl || imgEl.dataset.src || '';
        if (!cleanUrl) return;
        const testImg = new Image();
        const sep = cleanUrl.includes('?') ? '&' : '?';
        const retryUrl = `${cleanUrl}${sep}_t=${Date.now()}`;

        testImg.onload = () => {
            imgEl.src = retryUrl;
            imgEl.style.opacity = '1';
            imgEl.classList.remove('img-loading-pulse');
            imgEl.dataset.retryCount = '0';
        };
        testImg.onerror = () => {
            handleThumbImgError(imgEl, cleanUrl, itemId);
        };
        testImg.src = retryUrl;
    }, delay);
}

// --- Enqueue Roll from Modal ---
async function submitModalRollToQueue() {
    const ctx = state.currentModalRollContext;
    if (!ctx || !ctx.item) {
        alert('対象の巻きが選択されていません。');
        return;
    }

    if (!state.workerName) {
        alert('作業者が選択されていません。ユーザー設定タブで作業者を選択してください。');
        switchMainTab(0);
        return;
    }

    const { itemId, gIdx, rIdx, item, group } = ctx;

    // Duplicate check: verify if already enqueued or in progress across any tablet
    if (isRollEnqueuedOrProcessed(item, group, gIdx, rIdx)) {
        alert('この巻きは既にキューに追加または処理されています。');
        closeMaterialFeedModal();
        await fetchProductionQueue();
        return;
    }

    const edit = getItemEdit(itemId, item);

    // 1. Validate all 5 required fields (3 lengths, lot, hinban)
    const validation = validateModalRequiredFields(ctx);
    if (!validation.isValid) {
        const missingNames = validation.missing.map(m => `・${m.name}`).join('\n');
        alert(`投入キューへの登録には全5項目の入力が必須です：\n\n${missingNames}`);
        return;
    }

    // 2. Validate photo presence (IndexedDB or edit state)
    const dbPhoto = await firstKojoPhotoDB.getPhoto(itemId);
    if (!edit.hasPhoto && !dbPhoto && !edit.photoUrl) {
        alert('原材料ラベルの写真撮影が必須です。');
        return;
    }

    try {
        // Ensure input modal is hidden and dedicated progress modal is showing
        hideMaterialFeedModal();
        showQueueAddingModal(item, ctx, state.capturedPhotoBase64 || edit?.photoBase64 || dbPhoto?.base64 || edit.photoUrl);

        let photoUrl = edit.photoUrl || dbPhoto?.photoUrl || '';
        const lotNoVal = (state.currentModalLotNo || edit.lotNo || '').trim();
        const kizaiCode = group?.kizai || item.kizai || group?.hinban || item.hinban || state.currentModalHinban || '';
        const rollIdx = item.rollIndex || (rIdx + 1);

        // Upload photo to Firebase immediately if not yet uploaded, ensuring MongoDB gets the URL
        if ((!photoUrl || !photoUrl.startsWith('http')) && (dbPhoto?.base64 || edit?.photoBase64 || state.capturedPhotoBase64)) {
            const rawBase64 = dbPhoto?.base64 || edit?.photoBase64 || state.capturedPhotoBase64;
            try {
                photoUrl = await uploadLabelPhotoToServer(rawBase64, lotNoVal, kizaiCode, itemId);
            } catch (upErr) {
                console.warn('⚠️ Direct photo upload before enqueue failed, will retry in background:', upErr);
            }
        }

        const rawQRVal = state.currentModalRawQR || document.getElementById('feedRawQRInput')?.value?.trim() || edit.qrScanned || '';

        const enqueuePayload = {
            date: state.selectedDate,
            machine: state.machineName || 'PSA2',
            worker: state.workerName || '作業者',
            groupId: group?.groupId || item.groupId || item.id,
            itemId: itemId,
            orderIndex: item.orderIndex || (rIdx + 1),
            hinban: group?.hinban || item.hinban || state.currentModalHinban || '',
            hinmei: item.hinmei || '',
            kizai: kizaiCode,
            color: item.color || group?.color || '',
            zuban: item.zuban || group?.zuban || '',
            okyakuHinban: item.okyakuHinban || '',
            labelHinban: item.labelHinban || '',
            shippingDest: item.shippingDest || group?.shippingDest || '',
            totalRolls: Number(item.totalRolls) || Number(group?.items?.length) || 1,
            totalMeters: Number(group?.totalMeters) || bichoVal,
            rollMeters: bichoVal,
            meters: bichoVal,
            socho: state.currentModalSocho || '',
            shiki: state.currentModalShiki || '0',
            bicho: bichoVal,
            rollIndex: rollIdx,
            lotNo: lotNoVal,
            rawMaterialQR: rawQRVal,
            rawMaterialLength: String(bichoVal),
            manufacturerUid: '',
            imageUrl: photoUrl || ''
        };

        console.log('Enqueueing single roll to queue:', enqueuePayload);

        const res = await fetch(`${serverURL}/api/production/queue/enqueue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enqueuePayload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'キュー追加に失敗しました');
        }

        const mongoId = data._id || data.item?._id || '';
        const assignedStatus = data.item?.status || 'in-progress';
        const timeNow = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        if (data.alreadyEnqueued) {
            setItemEdit(itemId, {
                enqueued: true,
                enqueuedAt: timeNow,
                mongoProductionId: mongoId,
                status: assignedStatus,
                photoUrl: data.item?.photoUrl || photoUrl || ''
            });
            setQueueAddingModalSuccess(`ℹ️ #${item.orderIndex || rollIdx} は既にキューに追加されています`);
            await new Promise(r => setTimeout(r, 450));
            closeQueueAddingModal();
            closeMaterialFeedModal();
            await fetchProductionQueue();
            switchMainTab(2);
            return;
        }

        setItemEdit(itemId, {
            enqueued: true,
            enqueuedAt: timeNow,
            mongoProductionId: mongoId,
            status: assignedStatus,
            lotNo: lotNoVal,
            hinban: state.currentModalHinban || item.hinban || '',
            kizai: kizaiCode,
            orderIndex: item.orderIndex || (rIdx + 1),
            rollIndex: rollIdx,
            socho: state.currentModalSocho || '',
            shiki: state.currentModalShiki || '0',
            bicho: bichoVal,
            meters: bichoVal,
            rawMaterialQR: rawQRVal,
            rawQR: rawQRVal,
            photoUrl: photoUrl || ''
        });

        notifyPdfDisplayer(item, item.zuban);

        setQueueAddingModalSuccess(`✓ #${item.orderIndex || rollIdx} をキューに追加しました`);

        await fetchProductionQueue();
        renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
        updateHistoryBadges();

        await new Promise(r => setTimeout(r, 450));
        closeQueueAddingModal();
        closeMaterialFeedModal();

        // Switch to Queue tab (index 2) to show the new roll in queue
        switchMainTab(2);

    } catch (err) {
        closeQueueAddingModal();
        console.error('Error submitting modal roll to queue:', err);
        alert(`投入エラー: ${err.message}`);
    }
}

// Alias for legacy calls
const submitFeedAndEnqueue = submitModalRollToQueue;

// --- Exclude Roll from Modal ---
function excludeCurrentModalRoll() {
    const ctx = state.currentModalRollContext;
    if (!ctx || !ctx.itemId) return;

    const { itemId, rIdx, item } = ctx;
    const edit = getItemEdit(itemId, item);
    const newExcluded = !edit.isExcluded;

    setItemEdit(itemId, { isExcluded: newExcluded });
    closeMaterialFeedModal();

    showToast(newExcluded ? `Roll #${item.rollIndex || (rIdx + 1)} を除外しました（履歴タブで復帰可能）` : `Roll #${item.rollIndex || (rIdx + 1)} を復帰しました`, 'info', 2500);

    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
    updateHistoryBadges();
}

// --- Visual Staging Queue Dock ---
function toggleStagingQueueCollapse() {
    const dock = document.getElementById('stagingQueueDock');
    const btn = document.getElementById('btnStagingQueueToggle');
    if (!dock) return;

    dock.classList.toggle('collapsed');
    const isCollapsed = dock.classList.contains('collapsed');
    state.isQueueCollapsed = isCollapsed;
    localStorage.setItem('firstkojo_queue_collapsed', String(isCollapsed));

    if (btn) btn.textContent = isCollapsed ? '▼' : '▲';
}

function checkAndSyncActiveInProgress(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return;
    const activeItem = queue.find(it => it && (it.status === 'active' || it.status === 'in-progress'));
    if (!activeItem) return;

    const activeUniqueKey = String(activeItem._id || activeItem.itemId || `${activeItem.hinban}_${activeItem.rollIndex}`);
    if (state.lastActiveRollKey !== activeUniqueKey) {
        state.lastActiveRollKey = activeUniqueKey;
        console.log(`📡 In-progress roll active/changed: [${activeItem.hinban || activeItem.kizai}] (Roll #${activeItem.rollIndex}, Order #${activeItem.orderIndex}) -> Triggering pdfDisplayer`);

        // Resolve zuban if not on the item directly
        let zuban = activeItem.zuban;
        if (!zuban && state.scheduledItems) {
            const matched = state.scheduledItems.find(s =>
                (activeItem.itemId && s.id === activeItem.itemId) ||
                (s.hinban === activeItem.hinban && (Number(s.rollIndex) === Number(activeItem.rollIndex) || Number(s.orderIndex) === Number(activeItem.orderIndex))) ||
                (s.kizai === activeItem.kizai && Number(s.orderIndex) === Number(activeItem.orderIndex))
            );
            if (matched && matched.zuban) zuban = matched.zuban;
        }

        const itemForDisplayer = {
            ...activeItem,
            type: activeItem.type || 'hinban',
            hinban: activeItem.hinban || activeItem.kizai,
            zuban: zuban || activeItem.zuban || ''
        };

        // Notify pdfDisplayer to display blueprint / drawings
        notifyPdfDisplayer(itemForDisplayer, zuban);

        // Pre-load Info tab so clicking Info immediately displays current active in-progress item
        state.selectedItem = itemForDisplayer;
        sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(itemForDisplayer));
        if (state.currentMainTab === 3) {
            loadItemDetail(itemForDisplayer);
        }
    }
}

async function fetchProductionQueue() {
    try {
        const machine = state.machineName || 'PSA2';
        const res = await fetch(`${serverURL}/api/production/queue?date=${encodeURIComponent(state.selectedDate)}&machine=${encodeURIComponent(machine)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.queue)) {
            state.stagingQueue = data.queue;
            renderStagingQueue();
            if (state.scheduledItems && state.scheduledItems.length > 0) {
                renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
            }
            renderHistoryList();
            updateHistoryBadges();

            // Auto-trigger pdfDisplayer when an item transitions to in-progress or a new in-progress is detected
            checkAndSyncActiveInProgress(data.queue);
        }
    } catch (err) {
        console.warn('⚠️ Could not fetch production queue:', err);
    }
}

function getScheduleDisplayName(queueItem) {
    if (!queueItem) return '基材未設定';

    // 1. Match against state.scheduledItems (Schedule List items)
    if (state.scheduledItems && Array.isArray(state.scheduledItems)) {
        const matched = state.scheduledItems.find(s =>
            (queueItem.itemId && s.id === queueItem.itemId) ||
            (queueItem.orderIndex !== undefined && queueItem.orderIndex !== null && Number(s.orderIndex) === Number(queueItem.orderIndex)) ||
            (queueItem.groupId && s.groupId === queueItem.groupId && Number(s.rollIndex) === Number(queueItem.rollIndex)) ||
            (s.hinban === queueItem.hinban && (Number(s.rollIndex) === Number(queueItem.rollIndex) || Number(s.orderIndex) === Number(queueItem.orderIndex))) ||
            (queueItem.groupId && typeof queueItem.groupId === 'string' && queueItem.groupId.includes(s.hinban))
        );
        if (matched && (matched.kizai || matched.hinban)) {
            return matched.kizai || matched.hinban;
        }
    }

    // 2. Match against state.currentGroups
    if (state.currentGroups && Array.isArray(state.currentGroups)) {
        const group = state.currentGroups.find(g =>
            (queueItem.groupId && g.groupId === queueItem.groupId) ||
            (g.items && g.items.some(it => (queueItem.itemId && it.id === queueItem.itemId) || (queueItem.orderIndex !== undefined && Number(it.orderIndex) === Number(queueItem.orderIndex))))
        );
        if (group && (group.kizai || group.hinban)) {
            return group.kizai || group.hinban;
        }
    }

    // 3. Fallback to queueItem.kizai or queueItem.hinban
    return queueItem.kizai || queueItem.hinban || '基材未設定';
}

function renderStagingQueue() {
    const queueContainer = document.getElementById('queueItemListContainer');
    const tabBadge = document.getElementById('tabQueueBadge');
    const totalCountBadge = document.getElementById('queueTotalCountBadge');

    const activeAndQueued = state.stagingQueue.filter(item => 
        item && (item.status === 'active' || item.status === 'in-progress' || item.status === 'queued' || item.status === 'queue')
    );

    if (tabBadge) {
        if (activeAndQueued.length > 0) {
            tabBadge.textContent = activeAndQueued.length;
            tabBadge.style.display = 'inline-block';
        } else {
            tabBadge.style.display = 'none';
        }
    }

    if (totalCountBadge) {
        totalCountBadge.textContent = `${activeAndQueued.length} ${_t('fk_unit_items')}`;
    }

    if (!queueContainer) return;

    if (activeAndQueued.length === 0) {
        queueContainer.innerHTML = `
            <div class="staging-queue-empty">
                ${_t('fk_empty_queue')}
            </div>
        `;
        return;
    }

    const activeItem = activeAndQueued.find(it => it.status === 'active' || it.status === 'in-progress');
    const queuedItems = activeAndQueued.filter(it => it.status === 'queued' || it.status === 'queue');

    let rowsHTML = '';

    // 1. Active item (#1 貼合中)
    if (activeItem) {
        const kizaiCode = getScheduleDisplayName(activeItem);
        const activeImg = activeItem.imageUrl || activeItem.photoUrl;
        const photoThumb = activeImg
            ? `<img class="queue-flat-thumb" src="${activeImg}" alt="" loading="lazy" decoding="async" data-item-id="${activeItem.itemId || activeItem._id}" data-src="${activeImg}" onload="this.style.opacity='1'; this.classList.remove('img-loading-pulse');" onerror="handleThumbImgError(this, '${activeImg}', '${activeItem.itemId || activeItem._id}')" onclick="openPhotoEnlarged('${activeImg}')" title="クリックで拡大">`
            : `<div class="queue-flat-thumb-placeholder">写真なし</div>`;
        const currentRoll = activeItem.currentRollIndex || activeItem.rollIndex || 1;
        const totalRolls = activeItem.totalRolls || 1;

        let orderIdx = activeItem.orderIndex;
        if (!orderIdx || isNaN(Number(orderIdx))) {
            if (state.scheduledItems) {
                const matched = state.scheduledItems.find(s =>
                    (activeItem.itemId && s.id === activeItem.itemId) ||
                    (activeItem.orderIndex && Number(s.orderIndex) === Number(activeItem.orderIndex)) ||
                    (activeItem.groupId && s.groupId === activeItem.groupId && Number(s.rollIndex) === Number(activeItem.rollIndex)) ||
                    (s.hinban === activeItem.hinban && (Number(s.rollIndex) === Number(activeItem.rollIndex) || Number(s.orderIndex) === Number(activeItem.orderIndex)))
                );
                if (matched && matched.orderIndex) orderIdx = matched.orderIndex;
            }
        }
        const orderDisplay = orderIdx ? `#${orderIdx}` : `#${activeItem.rollIndex || 1}`;

        rowsHTML += `
            <div class="queue-flat-row is-active" data-queue-id="${activeItem._id}">
                <div class="queue-flat-left">
                    <span class="queue-pos-tag pos-active">${_t('fk_active_tag')}</span>
                    ${photoThumb}
                    <div>
                        <div class="queue-flat-title">${kizaiCode}</div>
                        <div style="font-size: 0.825rem; color: var(--text-muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 2px;">
                            <span class="roll-sub-badge" style="font-size: 0.775rem; font-weight: 800; color: #1E293B; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 1px 7px; border-radius: 6px;">${orderDisplay}</span>
                            <span>•</span>
                            <span><strong>${activeItem.rollMeters || activeItem.totalMeters || 0} m</strong></span>
                            <span>•</span>
                            <span>${_t('fk_lot_label')}<strong>${activeItem.lotNo || '-'}</strong></span>
                            ${activeItem.shippingDest ? `<span>• ${_t('fk_shipping_dest')}<strong>${activeItem.shippingDest}</strong></span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="queue-flat-right" onclick="event.stopPropagation()">
                    <button type="button" class="btn-staging-action btn-staging-advance" onclick="advanceQueueItemPrompt('${activeItem._id}')" title="${_t('fk_btn_advance')}">
                        ${_t('fk_btn_advance')}
                    </button>
                </div>
            </div>
        `;
    }

    // 2. Queued items (#2 待機中, #3 待機中...)
    queuedItems.forEach((item, qIdx) => {
        const kizaiCode = getScheduleDisplayName(item);
        const queuedImg = item.imageUrl || item.photoUrl;
        const photoThumb = queuedImg
            ? `<img class="queue-flat-thumb" src="${queuedImg}" alt="" loading="lazy" decoding="async" data-item-id="${item.itemId || item._id}" data-src="${queuedImg}" onload="this.style.opacity='1'; this.classList.remove('img-loading-pulse');" onerror="handleThumbImgError(this, '${queuedImg}', '${item.itemId || item._id}')" onclick="openPhotoEnlarged('${queuedImg}')" title="クリックで拡大">`
            : `<div class="queue-flat-thumb-placeholder">${_t('no_photos_yet')}</div>`;
        const posNum = activeItem ? (qIdx + 2) : (qIdx + 1);

        let orderIdx = item.orderIndex;
        if (!orderIdx || isNaN(Number(orderIdx))) {
            if (state.scheduledItems) {
                const matched = state.scheduledItems.find(s =>
                    (item.itemId && s.id === item.itemId) ||
                    (item.orderIndex && Number(s.orderIndex) === Number(item.orderIndex)) ||
                    (item.groupId && s.groupId === item.groupId && Number(s.rollIndex) === Number(item.rollIndex)) ||
                    (s.hinban === item.hinban && (Number(s.rollIndex) === Number(item.rollIndex) || Number(s.orderIndex) === Number(item.orderIndex)))
                );
                if (matched && matched.orderIndex) orderIdx = matched.orderIndex;
            }
        }
        const orderDisplay = orderIdx ? `#${orderIdx}` : `#${item.rollIndex || posNum}`;

        rowsHTML += `
            <div class="queue-flat-row is-staged" data-queue-id="${item._id}">
                <div class="queue-flat-left">
                    <span class="queue-pos-tag pos-queued">#${posNum} ${_t('fk_waiting_tag')}</span>
                    ${photoThumb}
                    <div>
                        <div class="queue-flat-title">${kizaiCode}</div>
                        <div style="font-size: 0.825rem; color: var(--text-muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 2px;">
                            <span class="roll-sub-badge" style="font-size: 0.775rem; font-weight: 800; color: #1E293B; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 1px 7px; border-radius: 6px;">${orderDisplay}</span>
                            <span>•</span>
                            <span><strong>${item.rollMeters || item.totalMeters || 0} m</strong></span>
                            <span>•</span>
                            <span>${_t('fk_lot_label')}<strong>${item.lotNo || '-'}</strong></span>
                            ${item.shippingDest ? `<span>• ${_t('fk_shipping_dest')}<strong>${item.shippingDest}</strong></span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="queue-flat-right" onclick="event.stopPropagation()">
                    <button type="button" class="btn-queue-drag-handle" title="長押しまたはドラッグして順序変更" aria-label="ドラッグして順序変更">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <circle cx="12" cy="5" r="2.2"/>
                            <circle cx="12" cy="12" r="2.2"/>
                            <circle cx="12" cy="19" r="2.2"/>
                        </svg>
                    </button>
                    <button type="button" class="btn-staging-action btn-staging-cancel" onclick="cancelQueueItem('${item._id}', '${kizaiCode}')" title="${_t('fk_btn_cancel')}">${_t('fk_btn_cancel')}</button>
                </div>
            </div>
        `;
    });

    queueContainer.innerHTML = rowsHTML;
    initQueueDragAndDrop();
}

// -----------------------------------------------------
// Drag-and-Drop Queue Reordering (Handle-only Dragging)
// -----------------------------------------------------
function initQueueDragAndDrop() {
    const container = document.getElementById('queueItemListContainer');
    if (!container) return;

    const stagedRows = Array.from(container.querySelectorAll('.queue-flat-row.is-staged'));
    if (stagedRows.length < 2) return;

    let draggedRow = null;
    let dragHandleActive = false;

    stagedRows.forEach(row => {
        row.setAttribute('draggable', 'false');
        const handle = row.querySelector('.btn-queue-drag-handle');
        if (!handle) return;

        // Desktop mouse: only enable dragging when mouse is down on handle
        handle.addEventListener('mousedown', () => {
            dragHandleActive = true;
            row.setAttribute('draggable', 'true');
        });

        window.addEventListener('mouseup', () => {
            if (!draggedRow) {
                dragHandleActive = false;
                row.setAttribute('draggable', 'false');
            }
        });

        // Desktop HTML5 drag events
        row.addEventListener('dragstart', (e) => {
            if (!dragHandleActive) {
                e.preventDefault();
                return;
            }
            draggedRow = row;
            row.classList.add('is-dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', row.dataset.queueId || '');
            }
        });

        row.addEventListener('dragend', () => {
            dragHandleActive = false;
            if (draggedRow) {
                draggedRow.classList.remove('is-dragging');
                draggedRow.setAttribute('draggable', 'false');
                draggedRow = null;
            }
            container.querySelectorAll('.queue-flat-row').forEach(r => {
                r.classList.remove('drag-over-top', 'drag-over-bottom');
            });
        });

        row.addEventListener('dragover', (e) => {
            if (!draggedRow || draggedRow === row) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

            const rect = row.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            if (relY < rect.height / 2) {
                row.classList.add('drag-over-top');
                row.classList.remove('drag-over-bottom');
            } else {
                row.classList.add('drag-over-bottom');
                row.classList.remove('drag-over-top');
            }
        });

        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        row.addEventListener('drop', (e) => {
            if (!draggedRow || draggedRow === row) return;
            e.preventDefault();

            const rect = row.getBoundingClientRect();
            const relY = e.clientY - rect.top;

            if (relY < rect.height / 2) {
                row.parentNode.insertBefore(draggedRow, row);
            } else {
                row.parentNode.insertBefore(draggedRow, row.nextSibling);
            }

            row.classList.remove('drag-over-top', 'drag-over-bottom');
            onQueueOrderChanged(container);
        });

        // Touch events for tablets
        let isTouching = false;
        let currentOverRow = null;
        let dropPosition = 'top';

        handle.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            isTouching = true;
            draggedRow = row;
            row.classList.add('is-dragging');
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
            if (!isTouching || !draggedRow) return;
            const touch = e.touches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetRow = targetEl ? targetEl.closest('.queue-flat-row.is-staged') : null;

            container.querySelectorAll('.queue-flat-row').forEach(r => {
                r.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            if (targetRow && targetRow !== draggedRow) {
                currentOverRow = targetRow;
                const rect = targetRow.getBoundingClientRect();
                if (touch.clientY < rect.top + rect.height / 2) {
                    targetRow.classList.add('drag-over-top');
                    dropPosition = 'top';
                } else {
                    targetRow.classList.add('drag-over-bottom');
                    dropPosition = 'bottom';
                }
            } else {
                currentOverRow = null;
            }
            e.preventDefault();
        }, { passive: false });

        handle.addEventListener('touchend', () => {
            if (!isTouching) return;
            isTouching = false;

            if (draggedRow && currentOverRow && draggedRow !== currentOverRow) {
                if (dropPosition === 'top') {
                    currentOverRow.parentNode.insertBefore(draggedRow, currentOverRow);
                } else {
                    currentOverRow.parentNode.insertBefore(draggedRow, currentOverRow.nextSibling);
                }
                onQueueOrderChanged(container);
            }

            if (draggedRow) {
                draggedRow.classList.remove('is-dragging');
                draggedRow = null;
            }
            container.querySelectorAll('.queue-flat-row').forEach(r => {
                r.classList.remove('drag-over-top', 'drag-over-bottom');
            });
        });

        handle.addEventListener('touchcancel', () => {
            isTouching = false;
            if (draggedRow) {
                draggedRow.classList.remove('is-dragging');
                draggedRow = null;
            }
            container.querySelectorAll('.queue-flat-row').forEach(r => {
                r.classList.remove('drag-over-top', 'drag-over-bottom');
            });
        });
    });
}

async function onQueueOrderChanged(container) {
    const updatedStagedRows = Array.from(container.querySelectorAll('.queue-flat-row.is-staged'));
    const orderedQueueIds = updatedStagedRows.map(r => r.dataset.queueId).filter(Boolean);
    if (orderedQueueIds.length === 0) return;

    // Immediately update order badge text in DOM (#2, #3, etc.) for instant feedback
    const activeExists = Boolean(container.querySelector('.queue-flat-row.is-active'));
    updatedStagedRows.forEach((r, idx) => {
        const tag = r.querySelector('.queue-pos-tag');
        if (tag) {
            const pos = activeExists ? idx + 2 : idx + 1;
            tag.textContent = `#${pos} 待機中`;
        }
    });

    try {
        const res = await fetch(`${serverURL}/api/production/queue/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName || 'PSA2',
                orderedQueueIds
            })
        });
        if (res.ok) {
            showToast('✓ キュー順序を更新しました', 'success', 1500);
            await fetchProductionQueue();
        }
    } catch (err) {
        console.warn('Reorder failed:', err);
    }
}

function openQueueCancelModal(queueId, hinban) {
    const modal = document.getElementById('queueCancelWarningModal');
    if (!modal) return;

    const targetQueueItem = (state.stagingQueue || []).find(q => String(q._id) === String(queueId) || String(q.itemId) === String(queueId));
    const itemId = targetQueueItem?.itemId || queueId;

    const nameEl = document.getElementById('queueCancelItemName');
    const metaEl = document.getElementById('queueCancelItemMeta');
    const thumbImg = document.getElementById('queueCancelThumbImg');
    const placeholder = document.getElementById('queueCancelThumbPlaceholder');

    const kizai = targetQueueItem?.kizai || targetQueueItem?.hinban || hinban || '材料';
    const orderIdx = targetQueueItem?.orderIndex || targetQueueItem?.rollIndex || '1';
    const rollIdx = targetQueueItem?.rollIndex || 1;
    const meters = targetQueueItem?.rollMeters || targetQueueItem?.meters || 0;
    const lotNo = targetQueueItem?.lotNo || '-';
    const photoUrl = targetQueueItem?.imageUrl || targetQueueItem?.photoUrl || '';

    if (nameEl) nameEl.textContent = kizai;
    if (metaEl) metaEl.textContent = `#${orderIdx} (Roll #${rollIdx}) · ${meters} m · ${_t('fk_lot_label')}${lotNo}`;

    if (photoUrl && thumbImg && placeholder) {
        thumbImg.src = photoUrl;
        thumbImg.style.display = 'block';
        placeholder.style.display = 'none';
    } else if (thumbImg && placeholder) {
        thumbImg.style.display = 'none';
        placeholder.textContent = _t('fk_no_photo');
        placeholder.style.display = 'block';
    }

    const confirmBtn = document.getElementById('btnConfirmQueueCancel');
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            closeQueueCancelModal();
            executeCancelQueueItem(queueId, itemId, kizai, targetQueueItem);
        };
    }

    modal.classList.add('open', 'active');
    modal.style.display = 'flex';
}

function closeQueueCancelModal() {
    const modal = document.getElementById('queueCancelWarningModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
}

// Keep cancelQueueItem calling the modal
const cancelQueueItem = openQueueCancelModal;

async function executeCancelQueueItem(queueId, itemId, hinban, targetQueueItem) {
    try {
        const res = await fetch(`${serverURL}/api/production/queue/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName || 'PSA2',
                queueId,
                itemId,
                reason: '作業者による取消'
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.success) {
            const orderIdx = targetQueueItem?.orderIndex;
            const rollIdx = targetQueueItem?.rollIndex;
            const hinbanCode = targetQueueItem?.hinban || targetQueueItem?.kizai || hinban || '';
            const edits = getItemEdits();
            const keysToReset = new Set();

            if (itemId) keysToReset.add(String(itemId));
            if (queueId) keysToReset.add(String(queueId));

            // Find all possible keys for this item in state.scheduledItems
            if (state.scheduledItems) {
                state.scheduledItems.forEach((s, idx) => {
                    const match = (itemId && (s.id === itemId || s._id === itemId)) ||
                                  (orderIdx !== undefined && Number(s.orderIndex) === Number(orderIdx)) ||
                                  (hinbanCode && s.hinban === hinbanCode && Number(s.rollIndex) === Number(rollIdx));
                    if (match) {
                        if (s.id) keysToReset.add(String(s.id));
                        if (s._id) keysToReset.add(String(s._id));
                        keysToReset.add(`${state.selectedDate || 'day'}_${s.hinban || hinbanCode}_${s.orderIndex || idx + 1}`);
                        keysToReset.add(`${state.selectedDate || 'day'}_${s.kizai || hinbanCode}_${s.orderIndex || idx + 1}`);
                    }
                });
            }

            // Also inspect all existing keys in localStorage edits
            Object.keys(edits).forEach(k => {
                const e = edits[k];
                const keyMatches = (orderIdx !== undefined && k.endsWith(`_${orderIdx}`)) ||
                                   (itemId && k.includes(String(itemId))) ||
                                   (queueId && k.includes(String(queueId))) ||
                                   (e && e.mongoProductionId && String(e.mongoProductionId) === String(queueId)) ||
                                   (e && orderIdx !== undefined && Number(e.orderIndex) === Number(orderIdx)) ||
                                   (e && rollIdx !== undefined && Number(e.rollIndex) === Number(rollIdx) && (e.hinban === hinbanCode || e.kizai === hinbanCode));
                if (keyMatches) {
                    keysToReset.add(k);
                }
            });

            // Perform comprehensive cleanup on all matching keys
            for (const k of keysToReset) {
                if (edits[k]) {
                    edits[k].hasPhoto = false;
                    edits[k].photoUrl = '';
                    edits[k].photoBase64 = '';
                    edits[k].enqueued = false;
                    edits[k].mongoProductionId = null;
                    edits[k].status = 'pending';
                } else {
                    edits[k] = {
                        hasPhoto: false,
                        photoUrl: '',
                        photoBase64: '',
                        enqueued: false,
                        mongoProductionId: null,
                        status: 'pending'
                    };
                }
                try {
                    await firstKojoPhotoDB.deletePhoto(k);
                } catch (e) {}
            }

            // Save updated edits to localStorage
            try {
                localStorage.setItem(getItemStateStorageKey(), JSON.stringify(edits));
            } catch (e) {
                console.error('Error saving cleaned edits:', e);
            }

            state.capturedPhotoBase64 = null;
            state.uploadedPhotoUrl = null;

            showToast(`✓ 「${hinban || '材料'}」の投入を取り消し、一覧に復帰させました`, 'success', 2500);
            await fetchProductionQueue();
            if (state.scheduledItems && state.scheduledItems.length > 0) {
                renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
            }
            renderHistoryList();
            updateHistoryBadges();
        }
    } catch (err) {
        console.error('Error cancelling queue item:', err);
        alert(`取消エラー: ${err.message}`);
    }
}

async function reorderQueueItem(queueId, direction) {
    const queuedItems = state.stagingQueue.filter(it => it.status === 'queued' || it.status === 'queue');
    const idx = queuedItems.findIndex(it => String(it._id) === String(queueId));
    if (idx < 0) return;

    if (direction === 'up' && idx > 0) {
        const temp = queuedItems[idx];
        queuedItems[idx] = queuedItems[idx - 1];
        queuedItems[idx - 1] = temp;
    } else if (direction === 'down' && idx < queuedItems.length - 1) {
        const temp = queuedItems[idx];
        queuedItems[idx] = queuedItems[idx + 1];
        queuedItems[idx + 1] = temp;
    } else {
        return;
    }

    const orderedQueueIds = queuedItems.map(it => it._id);

    try {
        const res = await fetch(`${serverURL}/api/production/queue/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName || 'PSA2',
                orderedQueueIds
            })
        });
        if (res.ok) {
            await fetchProductionQueue();
        }
    } catch (err) {
        console.warn('Reorder error:', err);
    }
}

async function advanceQueueItemPrompt(queueId) {
    const item = state.stagingQueue.find(it => String(it._id) === String(queueId) && (it.status === 'active' || it.status === 'in-progress'));
    if (!item) return;

    const currentRoll = item.currentRollIndex || item.rollIndex || 1;
    const totalRolls = item.totalRolls || 1;

    let confirmMsg = `ロット「${item.hinban}」の Roll ${currentRoll} / ${totalRolls} 巻き目を完了しますか？`;
    if (currentRoll >= totalRolls) {
        confirmMsg = `ロット「${item.hinban}」の全巻き (${totalRolls}/${totalRolls}) を完了し、次のキューへ移行しますか？`;
    }

    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`${serverURL}/api/production/queue/advance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName || 'PSA2',
                queueId: item._id,
                groupId: item.groupId,
                rollIndex: currentRoll + 1,
                totalRolls: totalRolls
            })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) {
            showToast(`ロールを進めました (Roll ${currentRoll}/${totalRolls})`, 'success');
            await fetchProductionQueue();
        }
    } catch (err) {
        console.error('Advance queue error:', err);
        alert(`進行エラー: ${err.message}`);
    }
}

// -----------------------------------------------------
// History Tab Logic (Panel 4)
// -----------------------------------------------------
function setHistoryView(view) {
    state.historyView = view || 'card';
    const buttons = document.querySelectorAll('.history-view-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === state.historyView);
    });
    if (state.historyView === 'list') {
        if (!state.masterData || state.masterData.length === 0) {
            ensureMasterData().then(() => {
                if (state.historyView === 'list') renderHistoryList();
            });
        }
    }
    renderHistoryList();
}

function setHistoryFilter(filter) {
    state.historyFilter = filter || 'all';
    const buttons = document.querySelectorAll('.history-filter-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === state.historyFilter);
    });
    renderHistoryList();
}

function renderHistoryTableView() {
    const queueDocs = state.stagingQueue || [];
    // Only completed items after queue belong in the History List table!
    const completedDocs = queueDocs.filter(doc => doc && doc.status === 'completed');

    if (completedDocs.length === 0) {
        return `
            <div class="staging-queue-empty">
                ${_t('fk_history_empty') || '完了した履歴項目がありません (No completed history)'}
            </div>
        `;
    }

    const historyItems = [];
    completedDocs.forEach((doc, qIdx) => {
        let matchedSched = null;
        if (state.scheduledItems) {
            matchedSched = state.scheduledItems.find(s => 
                (doc.itemId && s.id === doc.itemId) || 
                (doc._id && s.id === doc._id) ||
                (s.hinban === doc.hinban && (Number(s.rollIndex) === Number(doc.rollIndex) || Number(s.orderIndex) === Number(doc.orderIndex))) ||
                (s.kizai === doc.kizai && Number(s.orderIndex) === Number(doc.orderIndex))
            );
        }

        let orderIndex = doc.orderIndex;
        if (!orderIndex || isNaN(Number(orderIndex))) {
            if (matchedSched && matchedSched.orderIndex) {
                orderIndex = matchedSched.orderIndex;
            } else if (state.scheduledItems) {
                const foundIdx = state.scheduledItems.findIndex(s => s.hinban === doc.hinban || s.kizai === doc.kizai);
                if (foundIdx !== -1) orderIndex = foundIdx + 1;
            }
        }
        if (!orderIndex) orderIndex = doc.queuePosition || (qIdx + 1);

        const info = getScheduleMasterInfo(doc.hinban || matchedSched?.hinban);

        historyItems.push({
            itemId: doc.itemId || doc._id || doc.id,
            mongoId: doc._id,
            orderIndex: Number(orderIndex) || (qIdx + 1),
            startTime: doc.actualStartTime || matchedSched?.startTime || '',
            endTime: doc.actualEndTime || matchedSched?.endTime || '',
            completedAt: doc.completedAt || doc.createdAt || '',
            shippingDest: (matchedSched && matchedSched.shippingDest) || info.shippingDest || doc.shippingDest || '—',
            kizai: (matchedSched && matchedSched.kizai) || info.kizai || doc.kizai || doc.hinban || '材料',
            shori: (matchedSched && matchedSched.shori) || info.shori || doc.shori || '—',
            color: (matchedSched && matchedSched.color) || info.color || doc.color || '—',
            habanaga: (matchedSched && matchedSched.habanaga) || info.habanaga || doc.habanaga || '—',
            kataban: (matchedSched && matchedSched.kataban) || info.kataban || doc.kataban || '—',
            timeOption: matchedSched?.timeOption || info.timeOption || doc.timeOption || '',
            rollIndex: doc.rollIndex || matchedSched?.rollIndex || 1,
            totalRolls: doc.totalRolls || matchedSched?.totalRolls || 1,
            meters: doc.bicho || doc.rollMeters || doc.meters || matchedSched?.meters || 0,
            unit: doc.unit || matchedSched?.unit || info.unit || 'm',
            rawDoc: doc
        });
    });

    // Sort by orderIndex ascending
    historyItems.sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));

    let totalMeters = 0;
    let totalPieces = 0;
    let lastKizai = null;
    const rows = [];

    historyItems.forEach((item, idx) => {
        const qtyVal = Number(item.meters) || 0;
        if (item.unit === '枚') {
            totalPieces += qtyVal;
        } else {
            totalMeters += qtyVal;
        }

        const cmVal = qtyVal * 100;
        const currentKizai = item.kizai;

        // If 基材コード changes, insert black separator row
        if (lastKizai !== null && lastKizai !== currentKizai) {
            rows.push(`
                <tr class="separator-black-row">
                    <td colspan="10"></td>
                </tr>
            `);
        }
        lastKizai = currentKizai;

        const formattedDest = escapeHtml(item.shippingDest).replace(/\n/g, '<br>');

        const katabanDisplay = (item.kataban && item.kataban !== '—')
            ? `${escapeHtml(item.kataban)}${item.timeOption ? `<br><span class="text-sub">(${escapeHtml(item.timeOption)})</span>` : ''}`
            : '—';

        const qtyDisplay = item.unit === '枚'
            ? `${qtyVal.toLocaleString()} 枚`
            : `${cmVal.toLocaleString()} cm (${qtyVal}m)`;

        let timeDisplay = '—';
        if (item.startTime && item.endTime) {
            timeDisplay = `<strong>${escapeHtml(item.startTime)}</strong><br><span class="text-sub">～ ${escapeHtml(item.endTime)}</span>`;
        } else if (item.completedAt) {
            const d = new Date(item.completedAt);
            if (!isNaN(d.getTime())) {
                timeDisplay = `<strong>${d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</strong>`;
            }
        }

        rows.push(`
            <tr class="item-row" data-item-id="${escapeHtml(item.itemId || '')}" onclick="previewHistoryItem('${escapeHtml(item.itemId || '')}', event)" style="cursor: pointer;" title="${_t('fk_btn_detail')}">
                <td class="center font-bold">${item.orderIndex}</td>
                <td class="center time-cell">${timeDisplay}</td>
                <td class="center dest-cell">${formattedDest}</td>
                <td class="left kizai-cell">${escapeHtml(item.kizai)}</td>
                <td class="center shori-cell">${escapeHtml(item.shori)}</td>
                <td class="center color-cell">${escapeHtml(item.color)}</td>
                <td class="center habanaga-cell">${escapeHtml(item.habanaga)}</td>
                <td class="center kataban-cell">${katabanDisplay}</td>
                <td class="center roll-cell font-bold">${item.rollIndex}/${item.totalRolls}</td>
                <td class="right qty-cell font-bold">${qtyDisplay}</td>
            </tr>
        `);
    });

    const firstTime = historyItems.find(it => it.startTime)?.startTime || '';
    const lastTime = [...historyItems].reverse().find(it => it.endTime)?.endTime || '';
    const timeSpan = (firstTime && lastTime) ? `${firstTime} ～ ${lastTime}` : (historyItems[0]?.completedAt ? new Date(historyItems[0].completedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '本日');

    const totalProdFormatted = `${totalMeters > 0 ? `${totalMeters.toLocaleString()} m` : ''}${totalMeters > 0 && totalPieces > 0 ? ' / ' : ''}${totalPieces > 0 ? `${totalPieces.toLocaleString()} 枚` : ''}${totalMeters > 0 ? ` (${(totalMeters * 100).toLocaleString()} cm)` : ''}`;

    return `
        <div class="history-sheet">
            <div class="history-summary-strip">
                <span>実績時: <strong>${escapeHtml(timeSpan)}</strong></span>
                <span>完了総数: <strong>${historyItems.length} 巻/束</strong></span>
                <span>完了総生産量: <strong>${totalProdFormatted}</strong></span>
            </div>

            <table class="history-schedule-table">
                <thead>
                    <tr>
                        <th style="width: 4%;">No.</th>
                        <th style="width: 8%;">時間</th>
                        <th style="width: 14%;">出荷先名</th>
                        <th style="width: 22%;">基材コード</th>
                        <th style="width: 8%;">処理コード</th>
                        <th style="width: 9%;">色コード</th>
                        <th style="width: 9%;">幅長コード</th>
                        <th style="width: 9%;">型番</th>
                        <th style="width: 6%;">巻数</th>
                        <th style="width: 11%;">生産数量</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    `;
}

function updateHistoryBadges() {
    const enqueuedBadge = document.getElementById('historyEnqueuedCountBadge');
    const excludedBadge = document.getElementById('historyExcludedCountBadge');

    const queueItems = state.stagingQueue || [];
    let completedCount = queueItems.filter(it => it && it.status === 'completed').length;
    let excludedCount = queueItems.filter(it => it && (it.status === 'excluded' || it.status === 'scrapped')).length;

    // Also include any local excluded edits if not yet in MongoDB
    const edits = getItemEdits();
    Object.keys(edits).forEach(k => {
        const e = edits[k];
        if (e.isExcluded && !queueItems.some(q => q.itemId === k || q._id === k)) {
            excludedCount++;
        }
    });

    if (enqueuedBadge) enqueuedBadge.textContent = `${_t('fk_status_completed')}: ${completedCount} ${_t('fk_unit_items')}`;
    if (excludedBadge) excludedBadge.textContent = `${_t('fk_status_excluded')}: ${excludedCount} ${_t('fk_unit_items')}`;
}

function previewHistoryItem(itemId, event) {
    if (event) event.stopPropagation();
    const edits = getItemEdits();
    const edit = edits[itemId] || {};

    let targetItem = null;
    if (state.scheduledItems) {
        targetItem = state.scheduledItems.find((it, idx) => it.id === itemId || it._id === itemId || getItemKey(it, undefined, idx) === itemId);
    }
    if (!targetItem && state.stagingQueue) {
        const qItem = state.stagingQueue.find(q => q.itemId === itemId || q._id === itemId || q.id === itemId);
        if (qItem) targetItem = qItem;
    }
    if (!targetItem && state.currentGroups) {
        for (const grp of state.currentGroups) {
            if (grp.items) {
                const found = grp.items.find((it, ri) => getItemKey(it, undefined, ri) === itemId || it.id === itemId);
                if (found) {
                    targetItem = found;
                    break;
                }
            }
        }
    }

    if (!targetItem) {
        targetItem = {
            id: itemId,
            type: 'hinban',
            hinban: edit.hinban || edit.kizai || '材料',
            kizai: edit.kizai || edit.hinban || '',
            orderIndex: edit.orderIndex || 1,
            rollIndex: edit.rollIndex || 1,
            meters: edit.meters || 100,
            lotNo: edit.lotNo || '',
            shippingDest: edit.shippingDest || '',
            color: edit.color || '',
            zuban: edit.zuban || ''
        };
    }

    state.selectedItem = targetItem;
    sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(targetItem));
    switchMainTab(3);
    loadItemDetail(targetItem);
}

function renderHistoryList() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    updateHistoryBadges();

    if (state.historyView === 'list') {
        container.classList.remove('history-flat-list');
        container.innerHTML = renderHistoryTableView();
        return;
    }

    container.classList.add('history-flat-list');

    const items = [];
    const queueDocs = state.stagingQueue || [];

    // 1. Load history items directly from MongoDB queue collection (synced across all tablets)
    // ONLY completed or excluded items belong in the History tab!
    const historyDocs = queueDocs.filter(doc => 
        doc && (doc.status === 'completed' || doc.status === 'excluded' || doc.status === 'scrapped')
    );

    historyDocs.forEach((doc, qIdx) => {
        // Find matching item in scheduledItems to resolve exact orderIndex (#1, #2, #3...)
        let matchedSched = null;
        if (state.scheduledItems) {
            matchedSched = state.scheduledItems.find(s => 
                (doc.itemId && s.id === doc.itemId) || 
                (s.hinban === doc.hinban && (s.rollIndex == doc.rollIndex || s.orderIndex == doc.orderIndex)) ||
                (s.kizai === doc.kizai && s.orderIndex == doc.orderIndex)
            );
        }

        let orderIndex = doc.orderIndex;
        if (!orderIndex || isNaN(Number(orderIndex))) {
            if (matchedSched && matchedSched.orderIndex) {
                orderIndex = matchedSched.orderIndex;
            } else if (state.scheduledItems) {
                const foundIdx = state.scheduledItems.findIndex(s => s.hinban === doc.hinban || s.kizai === doc.kizai);
                if (foundIdx !== -1) orderIndex = foundIdx + 1;
            }
        }
        if (!orderIndex) orderIndex = doc.queuePosition || (qIdx + 1);

        items.push({
            itemId: doc.itemId || doc._id || doc.id,
            mongoId: doc._id,
            type: (doc.status === 'excluded' || doc.status === 'scrapped') ? 'excluded' : 'enqueued',
            status: doc.status || 'completed',
            orderIndex: Number(orderIndex) || (qIdx + 1),
            kizai: (matchedSched && (matchedSched.kizai || matchedSched.hinban)) || getScheduleDisplayName(doc) || '材料',
            meters: doc.bicho || doc.rollMeters || doc.meters || 0,
            lotNo: doc.lotNo || '',
            photoUrl: doc.imageUrl || doc.photoUrl || '',
            rawDoc: doc
        });
    });

    // 2. Also merge local excluded edits if they were excluded before enqueuing to MongoDB
    const edits = getItemEdits();
    Object.keys(edits).forEach(itemId => {
        const e = edits[itemId];
        if (e.isExcluded && !items.some(it => it.itemId === itemId)) {
            let matchedSched = null;
            if (state.scheduledItems) {
                matchedSched = state.scheduledItems.find((s, idx) => s.id === itemId || getItemKey(s, undefined, idx) === itemId);
            }
            const orderIndex = e.orderIndex || matchedSched?.orderIndex || 1;
            items.push({
                itemId,
                type: 'excluded',
                status: 'excluded',
                orderIndex: Number(orderIndex) || 1,
                kizai: e.kizai || matchedSched?.kizai || e.hinban || matchedSched?.hinban || '材料',
                meters: e.bicho || e.meters || matchedSched?.meters || 0,
                lotNo: e.lotNo || '',
                photoUrl: e.photoUrl || e.photoBase64 || '',
                rawDoc: e
            });
        }
    });

    // Sort by order index ascending so the order sequence (#1, #2, #3...) is preserved
    items.sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));

    const filter = state.historyFilter || 'all';
    const filtered = items.filter(it => {
        if (filter === 'enqueued') return it.type === 'enqueued';
        if (filter === 'excluded') return it.type === 'excluded';
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="staging-queue-empty">
                ${_t('fk_history_empty')}
            </div>
        `;
        return;
    }

    let html = '';
    filtered.forEach(it => {
        const isExcluded = (it.status === 'excluded' || it.type === 'excluded');
        
        let statusTagHTML = '';
        let actionHTML = '';

        if (it.status === 'completed') {
            statusTagHTML = `<span class="tag-pill" style="font-size: 0.775rem; padding: 2px 8px; background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; font-weight: 700;">${_t('fk_status_completed')}</span>`;
            actionHTML = `<span style="font-size: 0.8rem; color: #4338CA; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; padding-right: 4px;">${_t('fk_status_completed')}</span>`;
        } else if (it.status === 'active' || it.status === 'in-progress') {
            statusTagHTML = `<span class="tag-pill" style="font-size: 0.775rem; padding: 2px 8px; background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; font-weight: 700;">${_t('fk_status_in_progress')}</span>`;
            actionHTML = `<span style="font-size: 0.8rem; color: #059669; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; padding-right: 4px;">● ${_t('fk_status_in_progress')}</span>`;
        } else if (it.status === 'skipped') {
            statusTagHTML = `<span class="tag-pill tag-excluded" style="font-size: 0.775rem; padding: 2px 8px;">スキップ</span>`;
            actionHTML = `<span style="font-size: 0.8rem; color: #6B7280; font-weight: 600; padding-right: 4px;">スキップ</span>`;
        } else if (isExcluded) {
            statusTagHTML = `<span class="tag-pill tag-excluded" style="font-size: 0.775rem; padding: 2px 8px;">${_t('fk_status_excluded')}</span>`;
            actionHTML = `<button type="button" class="btn-roll-exclude is-excluded" onclick="restoreExcludedItem('${it.itemId}', event)" title="${_t('fk_btn_restore')}">${_t('fk_btn_restore')}</button>`;
        } else {
            statusTagHTML = `<span class="tag-pill" style="font-size: 0.775rem; padding: 2px 8px; background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; font-weight: 700;">${_t('fk_status_queued')}</span>`;
            actionHTML = `<span style="font-size: 0.8rem; color: #059669; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; padding-right: 4px;"><svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>${_t('fk_history_tag_linked')}</span>`;
        }

        html += `
            <div class="batch-roll-row ${isExcluded ? 'is-excluded-row' : ''}" data-item-id="${it.itemId}" onclick="previewHistoryItem('${it.itemId}', event)" title="${_t('fk_btn_detail')}">
                <div class="roll-row-left" style="display: flex; align-items: center; gap: 10px;">
                    <span class="roll-sub-badge">#${it.orderIndex}</span>
                    ${it.photoUrl ? `
                        <img class="history-thumb-mini" src="${it.photoUrl}" alt="" loading="lazy" decoding="async" data-item-id="${it.itemId || it.mongoId || ''}" data-src="${it.photoUrl}" onload="this.style.opacity='1'; this.classList.remove('img-loading-pulse');" onerror="handleThumbImgError(this, '${it.photoUrl}', '${it.itemId || it.mongoId || ''}')" onclick="event.stopPropagation(); openPhotoEnlarged('${it.photoUrl}')" title="タップして拡大" style="width: 34px; height: 34px; border-radius: 6px; object-fit: cover; border: 1px solid #E5E7EB; cursor: pointer; flex-shrink: 0; background: #F3F4F6; transition: opacity 0.25s ease;">
                    ` : `
                        <div style="width: 34px; height: 34px; border-radius: 6px; background: #F3F4F6; border: 1px dashed #D1D5DB; display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-size: 0.65rem; flex-shrink: 0;">-</div>
                    `}
                    <span class="history-item-hinban" style="font-weight: 700; color: #0F172A; font-size: 0.95rem;">${it.kizai}</span>
                    <span class="tag-pill meter-tag" style="font-size: 0.8rem; padding: 2px 8px;">${it.meters ? it.meters + ' m' : '0 m'}</span>
                    ${statusTagHTML}
                </div>

                <div class="roll-row-right" onclick="event.stopPropagation()" style="display: flex; gap: 6px; align-items: center;">
                    ${actionHTML}
                    <button type="button" class="btn-detail-secondary" onclick="previewHistoryItem('${it.itemId}', event)" title="${_t('fk_btn_detail')}">
                        ${_t('fk_btn_detail')}
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function restoreExcludedItem(itemId, event) {
    if (event) event.stopPropagation();
    setItemEdit(itemId, { isExcluded: false });
    renderHistoryList();
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
    showToast('項目を生産一覧に復帰させました', 'success', 2500);
}

// --- SSE Realtime Synchronization ---
let productionEventSource = null;

function setupProductionSSE() {
    if (productionEventSource) {
        try { productionEventSource.close(); } catch (e) { }
        productionEventSource = null;
    }

    const sseUrl = `${serverURL}/api/production/events?date=${encodeURIComponent(state.selectedDate)}`;
    console.log(`🔌 Connecting Production SSE -> ${sseUrl}`);
    try {
        productionEventSource = new EventSource(sseUrl);
        productionEventSource.onopen = () => {
            console.log('⚡ Production SSE Connected');
        };
        productionEventSource.onmessage = (event) => {
            if (!event.data) return;
            try {
                const data = JSON.parse(event.data);
                handleProductionSSEEvent(data);
            } catch (e) {
                // Heartbeat / ignore
            }
        };
        productionEventSource.onerror = (err) => {
            console.warn('⚠️ Production SSE reconnecting:', err);
        };
    } catch (e) {
        console.warn('⚠️ Failed to initialize EventSource:', e);
    }
}

function handleProductionSSEEvent(data) {
    console.log('⚡ Received SSE event:', data.type, data);
    if (data.type === 'queue_updated' || data.type === 'queue_scrapped' || data.type === 'roll_advanced' || data.type === 'queue_roll_printed') {
        fetchProductionQueue();
    } else if (data.type === 'print_log') {
        if (data.groupId && data.printEntry) {
            const lc = getGroupLifecycle(data.groupId);
            const history = Array.isArray(lc.printHistory) ? lc.printHistory : [];
            const exists = history.some(p => p.timestamp === data.printEntry.timestamp || (p.rollIndex === data.printEntry.rollIndex && p.lotNo === data.printEntry.lotNo));
            if (!exists) {
                setGroupLifecycle(data.groupId, { printHistory: [...history, data.printEntry] });
                renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
            }
        }
        fetchProductionQueue();
    } else if (data.type === 'status_update') {
        if (data.groupId && data.status) {
            setGroupLifecycle(data.groupId, { status: data.status, ...(data.record || {}) });
            renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
        }
        fetchProductionQueue();
    } else if (data.type === 'qr_patterns_updated') {
        console.log('⚡ SSE qr_patterns_updated received, refreshing learned patterns...');
        fetchLearnedQRPatterns();
    }
}

// -----------------------------------------------------
// Date Navigation Controls
// -----------------------------------------------------
function shiftDate(days) {
    const current = new Date(state.selectedDate + 'T00:00:00');
    if (isNaN(current.getTime())) return;
    current.setDate(current.getDate() + days);

    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const newDateStr = `${y}-${m}-${d}`;

    fetchDailySchedule(newDateStr);
}

function setupDateControls() {
    const dateInput = document.getElementById('scheduleDateInput');
    const prevBtn = document.getElementById('btnPrevDay');
    const nextBtn = document.getElementById('btnNextDay');
    const todayBtn = document.getElementById('btnToday');
    const refreshBtn = document.getElementById('btnRefreshSchedule');

    if (dateInput) {
        dateInput.value = state.selectedDate;
        dateInput.addEventListener('change', (e) => {
            if (e.target.value) {
                fetchDailySchedule(e.target.value);
            }
        });
    }

    if (prevBtn) prevBtn.addEventListener('click', () => shiftDate(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => shiftDate(1));
    if (todayBtn) todayBtn.addEventListener('click', () => fetchDailySchedule(getTodayDateString()));
    if (refreshBtn) refreshBtn.addEventListener('click', () => fetchDailySchedule(state.selectedDate));
}

// -----------------------------------------------------
// Sidebar Drawer
// -----------------------------------------------------
function setupSidebar() {
    const toggleBtn = document.getElementById('btnSidebarToggle');
    const closeBtn = document.getElementById('btnSidebarClose');
    const sidebar = document.getElementById('infoSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    const openSidebar = () => {
        if (sidebar) sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
    };

    const closeSidebar = () => {
        if (sidebar) sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
    };

    if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
}

// -----------------------------------------------------
// Initialization
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    parseParams();
    initWorker();
    setupMainTabs();
    setupSidebar();
    setupDateControls();
    fetchWorkersFromMongoDB();

    // Initial schedule fetch for the selected date
    fetchDailySchedule(state.selectedDate);

    // Initialize USB Barcode Scanner Listener
    setupUSBScannerListener();
    setupFeedRawQRInput();

    // Sync learned QR patterns from MongoDB on reload (regardless of active tab)
    fetchLearnedQRPatterns();

    // Restore queue collapsed state if previously saved
    if (state.isQueueCollapsed) {
        const dock = document.getElementById('stagingQueueDock');
        const btn = document.getElementById('btnStagingQueueToggle');
        if (dock) dock.classList.add('collapsed');
        if (btn) btn.textContent = '▼';
    }

    // Worker input modal events
    const workerInputEl = document.getElementById('workerInput');
    const workerModal = document.getElementById('workerNameModal');

    const openWorkerModal = (e) => {
        if (workerInputEl && workerInputEl.readOnly) {
            e.preventDefault();
            renderWorkerNames();
            if (workerModal) workerModal.style.display = 'flex';
        }
    };

    if (workerInputEl) {
        workerInputEl.addEventListener('click', openWorkerModal);
        workerInputEl.addEventListener('focus', openWorkerModal);
        workerInputEl.addEventListener('touchstart', openWorkerModal);
        workerInputEl.addEventListener('blur', (e) => {
            e.target.readOnly = true;
        });
    }

    const closeWorkerModalBtn = document.getElementById('closeWorkerModal');
    if (closeWorkerModalBtn) {
        closeWorkerModalBtn.addEventListener('click', () => {
            if (workerModal) workerModal.style.display = 'none';
        });
    }

    const manualEntryBtn = document.getElementById('manualEntryBtn');
    if (manualEntryBtn) {
        manualEntryBtn.addEventListener('click', () => {
            if (workerInputEl) {
                workerInputEl.readOnly = false;
                workerInputEl.focus();
            }
            if (workerModal) workerModal.style.display = 'none';
        });
    }

    // Resume pending background photo uploads from IndexedDB
    firstKojoPhotoDB.getAllPending().then(pending => {
        if (pending && pending.length > 0) {
            console.log(`📡 Resuming ${pending.length} pending photo upload(s)...`);
            pending.forEach(rec => enqueueBackgroundPhotoUpload(rec.itemId));
        }
    }).catch(err => console.warn('Could not check pending photo uploads:', err));
});

window.addEventListener('online', () => {
    firstKojoPhotoDB.getAllPending().then(pending => {
        if (pending && pending.length > 0) {
            console.log(`🌐 Online: Resuming ${pending.length} pending photo upload(s)...`);
            pending.forEach(rec => enqueueBackgroundPhotoUpload(rec.itemId));
        }
    }).catch(err => console.warn('Could not check pending uploads on online event:', err));
});
