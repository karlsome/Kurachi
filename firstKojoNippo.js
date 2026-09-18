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

const state = {
    workerName: localStorage.getItem('firstkojo_nippo_worker_name') || null,
    machineName: null,
    filterName: "第一工場",

    currentMainTab: 0, // 0: User, 1: List, 2: Queue, 3: Info, 4: History, 5: Production, 6: Submit

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
    currentFeedItem: null,
    currentFeedGroup: null,
    capturedPhotoBase64: null,
    uploadedPhotoUrl: null,
    cameraStream: null
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
        if (tag) tag.textContent = `設備: ${state.machineName}`;
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
    const input = document.getElementById("workerInput");
    if (input) input.value = '';
    initWorker();
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
}

function switchMainTab(index) {
    const tabs = document.querySelectorAll('#mainTabBar .tab-btn');
    const container = document.getElementById('tabPanelsContainer');

    tabs.forEach(t => t.classList.remove('active'));
    if (tabs[index]) tabs[index].classList.add('active');

    // 7 tabs => 100 / 7 = 14.285714% shift per tab
    if (container) {
        container.style.transform = `translateX(-${index * (100 / 7)}%)`;
    }
    state.currentMainTab = index;
    sessionStorage.setItem('firstkojo_nippo_main_tab', index);

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
                if (json.success && Array.isArray(json.schedules)) {
                    scheduleDoc = json.schedules.find(s => s.month === month && Number(s.date) === date) || null;
                }
            }
        }

        state.dailySchedule = scheduleDoc;

        if (scheduleDoc && Array.isArray(scheduleDoc.scheduleOrder) && scheduleDoc.scheduleOrder.length > 0) {
            const startTime = scheduleDoc.startTime || '08:00';
            state.scheduledItems = computeTimeSchedule(scheduleDoc.scheduleOrder, startTime);

            // Sync live status from server (submittedDB.firstFactoryProduction)
            await fetchProductionStatus(dateStr);

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
    if (!itemId) return { meters: 100, isExcluded: false, photoUrl: '', photoBase64: '', enqueued: false };
    const edits = getItemEdits();
    const existing = edits[itemId] || {};
    return {
        meters: existing.meters !== undefined ? existing.meters : (Number(defaultItem.meters) || 100),
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
        edits[itemId] = { ...(edits[itemId] || {}), ...patch };
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

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'キュー追加に失敗しました');
        }

        const timeNow = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        setItemEdit(itemId, {
            enqueued: true,
            enqueuedAt: timeNow,
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

function renderScheduleTableView(groups, items) {
    if (!groups || groups.length === 0) {
        return `
            <div class="schedule-empty-state">
                <h3>この日の生産予定はありません</h3>
                <p>上部の日付選択から他の日付を選択するか、再読込ボタンを押してください。</p>
            </div>
        `;
    }

    let rowsHTML = '';

    groups.forEach((group, gIdx) => {
        const lifecycle = getGroupLifecycle(group.groupId);

        if (group.type === 'setup') {
            const setupItem = group.items[0];
            rowsHTML += `
                <tr class="table-setup-row" data-id="${setupItem.id}">
                    <td style="text-align: center; font-weight: 800;">#${setupItem.orderIndex}</td>
                    <td style="font-weight: 700;">${setupItem.startTime} - ${setupItem.endTime}</td>
                    <td colspan="4" style="font-weight: 800;">段取り / 段替 (${setupItem.duration}分)</td>
                    <td style="text-align: center;"><span class="batch-status-tag status-pending">段替</span></td>
                    <td style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">—</td>
                </tr>
            `;
            return;
        }

        const remainingItems = group.items.filter((rollItem, rIdx) => {
            const itemId = getItemKey(rollItem, gIdx, rIdx);
            return !getItemEdit(itemId, rollItem).enqueued;
        });
        if (remainingItems.length === 0) return;

        const firstItem = remainingItems[0];
        const lastItem = remainingItems[remainingItems.length - 1];
        const orderRangeText = remainingItems.length > 1 ? `#${firstItem.orderIndex}〜#${lastItem.orderIndex}` : `#${firstItem.orderIndex}`;
        const kizaiCode = group.kizai || group.hinban || '基材未設定';

        const activeItems = remainingItems.filter((rollItem, rIdx) => {
            const itemId = getItemKey(rollItem, gIdx, rIdx);
            return !getItemEdit(itemId, rollItem).isExcluded;
        });
        const activeMeters = activeItems.reduce((acc, rollItem, rIdx) => {
            const itemId = getItemKey(rollItem, gIdx, rIdx);
            return acc + (Number(getItemEdit(itemId, rollItem).meters) || Number(rollItem.meters) || 0);
        }, 0);

        const queuedItem = state.stagingQueue.find(q =>
            (q.groupId === group.groupId || q.hinban === group.hinban || q.kizai === group.kizai) &&
            (q.status === 'active' || q.status === 'queued')
        );
        const isQueueActive = queuedItem && queuedItem.status === 'active';
        const isQueued = queuedItem && queuedItem.status === 'queued';

        let statusBadge = '<span class="batch-status-tag status-pending">待機中</span>';
        if (lifecycle.status === 'completed') {
            statusBadge = `<span class="batch-status-tag status-completed">完了 (${lifecycle.actualDurationMins || ''}分)</span>`;
        } else if (isQueueActive) {
            statusBadge = '<span class="batch-status-tag status-active">貼合中</span>';
        } else if (isQueued) {
            statusBadge = '<span class="batch-status-tag status-queued">キュー投入済</span>';
        } else if (lifecycle.status === 'in-progress' || lifecycle.status === 'running') {
            statusBadge = '<span class="batch-status-tag status-active">生産中</span>';
        }

        rowsHTML += `
            <tr class="table-group-header" onclick="previewBatchGroup(${gIdx}, event)">
                <td style="text-align: center; font-weight: 800; color: var(--brand); font-size: 0.95rem;">${orderRangeText}</td>
                <td style="font-weight: 700; font-variant-numeric: tabular-nums;">${group.startTime} - ${group.endTime}</td>
                <td style="font-weight: 800; font-size: 0.95rem; color: #0F172A; cursor: pointer;">
                    <div>${kizaiCode}</div>
                </td>
                <td style="font-weight: 600;">${group.shippingDest || '—'}</td>
                <td style="font-weight: 600;">${group.color || '—'}</td>
                <td style="font-weight: 600;">残り ${activeItems.length} 巻き (${activeMeters}m)</td>
                <td>${statusBadge}</td>
                <td onclick="event.stopPropagation()" style="text-align: center;">
                    <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                        <button type="button" class="btn-feed-primary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="enqueueBatchGroup(${gIdx}, event)">投入</button>
                        <button type="button" class="btn-detail-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="previewBatchGroup(${gIdx}, event)">詳細</button>
                    </div>
                </td>
            </tr>
        `;
    });

    return `
        <div class="schedule-table-wrap">
            <table class="schedule-table">
                <thead>
                    <tr>
                        <th style="width: 80px; text-align: center;">順 (No)</th>
                        <th style="width: 120px;">時間 (Time)</th>
                        <th>基材コード (Material Code)</th>
                        <th style="width: 110px;">出荷先</th>
                        <th style="width: 70px;">色</th>
                        <th style="width: 130px;">巻数・数量</th>
                        <th style="width: 120px;">状態</th>
                        <th style="width: 130px; text-align: center;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
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
            // Check remaining items that have not been enqueued yet
            const remainingItems = group.items.filter((rollItem, rIdx) => {
                const itemId = getItemKey(rollItem, gIdx, rIdx);
                const edit = getItemEdit(itemId, rollItem);
                return !edit.enqueued;
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
                const itemId = getItemKey(rollItem, gIdx, rIdx);
                return !getItemEdit(itemId, rollItem).isExcluded;
            });

            const activeMeters = activeItems.reduce((acc, rollItem, rIdx) => {
                const itemId = getItemKey(rollItem, gIdx, rIdx);
                return acc + (Number(getItemEdit(itemId, rollItem).meters) || Number(rollItem.meters) || 0);
            }, 0);

            const excludedCount = remainingItems.length - activeItems.length;

            const queuedItem = state.stagingQueue.find(q =>
                (q.groupId === group.groupId || q.hinban === group.hinban || q.kizai === group.kizai) &&
                (q.status === 'active' || q.status === 'queued')
            );
            const isQueueActive = queuedItem && queuedItem.status === 'active';
            const isQueued = queuedItem && queuedItem.status === 'queued';

            let statusTagHTML = '';
            if (lifecycle.status === 'completed') {
                statusTagHTML = `<span class="batch-status-tag status-completed">完了 (${lifecycle.actualDurationMins || ''}分)</span>`;
            } else if (isQueueActive) {
                statusTagHTML = `<span class="batch-status-tag status-active">貼合中</span>`;
            } else if (isQueued) {
                statusTagHTML = `<span class="batch-status-tag status-queued">キュー投入済</span>`;
            } else if (lifecycle.status === 'in-progress' || lifecycle.status === 'running') {
                statusTagHTML = `<span class="batch-status-tag status-active">生産中</span>`;
            } else {
                statusTagHTML = `<span class="batch-status-tag status-pending">待機中</span>`;
            }

            const destText = group.shippingDest ? `<span class="tag-pill dest-tag">出荷先: ${group.shippingDest}</span>` : '';
            const colorText = group.color ? `<span class="tag-pill color-tag">色: ${group.color}</span>` : '';
            let rollSummaryText = `<span class="tag-pill roll-tag">残り ${activeItems.length} 巻き (${activeMeters} m)</span>`;
            if (excludedCount > 0) {
                rollSummaryText += `<span class="tag-pill tag-excluded" style="font-size: 0.8rem; padding: 2px 8px;">除外: ${excludedCount} 巻</span>`;
            }

            const isExpanded = state.expandedGroups && state.expandedGroups.has(group.groupId);

            html += `
                <div class="batch-group-card ${isGroupTinted ? 'group-tinted' : ''} ${isExpanded ? 'is-expanded' : ''}" 
                     data-group-id="${group.groupId}" 
                     data-group-idx="${gIdx}"
                     data-total-rolls="${remainingItems.length}">
                    
                    <div class="batch-header" onclick="toggleBatchGroupExpand(${gIdx}, event)" title="タップして内訳を展開/折りたたみ">
                        <div class="batch-header-top-row">
                            <div class="batch-order-and-title">
                                <span class="batch-order-range">${orderRangeText}</span>
                                <span class="roll-time" style="color: var(--text-soft);">${group.startTime} - ${group.endTime}</span>
                                <span class="batch-hinban-title" style="font-size: 1.15rem; font-weight: 800;">${kizaiCode}</span>
                            </div>
                            <div class="batch-top-status">
                                ${statusTagHTML}
                            </div>
                        </div>

                        <div class="batch-chips-row">
                            ${destText}
                            ${colorText}
                            ${rollSummaryText}
                        </div>

                        <div class="batch-actions-row" onclick="event.stopPropagation()">
                            <div class="batch-btn-group">
                                <button type="button" class="btn-card-expand-toggle" onclick="toggleBatchGroupExpand(${gIdx}, event)" title="${isExpanded ? '内訳を閉じる' : '内訳を展開'}">
                                    <span class="toggle-label">${isExpanded ? '閉じる' : `内訳 (${remainingItems.length}巻)`}</span>
                                    <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                                </button>
                                <button type="button" class="btn-feed-primary" onclick="enqueueBatchGroup(${gIdx}, event)" title="このロットの未投入巻きを一括投入（写真必須）">
                                    投入
                                </button>
                                <button type="button" class="btn-detail-secondary" onclick="previewBatchGroup(${gIdx}, event)">
                                    詳細
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="batch-rolls-list">
                        ${remainingItems.map((rollItem, rIdx) => {
                const itemId = getItemKey(rollItem, gIdx, rIdx);
                const edit = getItemEdit(itemId, rollItem);
                const isExcluded = edit.isExcluded === true;
                const currentMeters = edit.meters !== undefined ? edit.meters : (Number(rollItem.meters) || 100);
                const hasPhoto = !!(edit.photoUrl || edit.photoBase64);
                const photoSrc = edit.photoUrl || edit.photoBase64;
                const actualRollIndex = rollItem.rollIndex || (rIdx + 1);

                if (isExcluded) {
                    return `
                                    <div class="batch-roll-row is-excluded-row" data-item-id="${itemId}">
                                        <div class="roll-row-left">
                                            <span class="roll-sub-badge">#${rollItem.orderIndex}</span>
                                            <span class="roll-time">${rollItem.startTime} - ${rollItem.endTime}</span>
                                            <span class="tag-pill roll-tag" style="font-size: 0.8rem; padding: 2px 8px;">${actualRollIndex} / ${rollItem.totalRolls || group.items.length} 巻き</span>
                                            <span class="tag-pill meter-tag" style="font-size: 0.8rem; padding: 2px 8px;">${currentMeters} m</span>
                                            <span class="tag-pill tag-excluded" style="font-size: 0.775rem; padding: 2px 8px;">除外中</span>
                                        </div>
                                        <div class="roll-row-right" onclick="event.stopPropagation()" style="display: flex; gap: 6px; align-items: center;">
                                            <button type="button" class="btn-roll-exclude is-excluded" onclick="toggleRollItemExclude('${itemId}', ${gIdx}, ${rIdx}, event)" title="この巻きを復帰（キュー投入対象に戻す）">
                                                復帰
                                            </button>
                                            <button type="button" class="btn-feed-primary" disabled style="opacity: 0.4; cursor: not-allowed; padding: 5px 12px; font-size: 0.8rem;" title="除外中のため投入不可">
                                                投入
                                            </button>
                                            <button type="button" class="btn-detail-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="previewBatchGroup(${gIdx}, event, ${rIdx})" title="この巻きの詳細を確認">
                                                詳細
                                            </button>
                                        </div>
                                    </div>
                                `;
                }

                return `
                                <div class="batch-roll-row" data-item-id="${itemId}">
                                    <div class="roll-row-left">
                                        <span class="roll-sub-badge">#${rollItem.orderIndex}</span>
                                        <span class="roll-time">${rollItem.startTime} - ${rollItem.endTime}</span>
                                        <span class="tag-pill roll-tag" style="font-size: 0.8rem; padding: 2px 8px;">${actualRollIndex} / ${rollItem.totalRolls || group.items.length} 巻き</span>

                                        <!-- Editable Roll Meters -->
                                        <div class="roll-meter-edit-wrap" onclick="event.stopPropagation()" title="タップして長さを変更">
                                            <input type="number" class="roll-meter-input" value="${currentMeters}" min="1" step="1" onchange="updateRollMeters('${itemId}', this.value, ${gIdx}, ${rIdx})" aria-label="巻き長さ(m)">
                                            <span class="roll-meter-unit">m</span>
                                        </div>

                                        <!-- Per-Item Photo Button -->
                                        <div class="roll-photo-container" onclick="event.stopPropagation()">
                                            ${hasPhoto ? `
                                                <div class="roll-photo-wrap">
                                                    <img src="${photoSrc}" class="roll-photo-thumb" onclick="openPhotoEnlarged('${photoSrc}')" title="クリックで拡大">
                                                    <button type="button" class="btn-roll-photo has-photo" onclick="openRollPhotoCapture('${itemId}', ${gIdx}, ${rIdx}, event)" title="ラベル写真を再撮影">
                                                        再撮影
                                                    </button>
                                                </div>
                                            ` : `
                                                <div class="roll-photo-wrap">
                                                    <button type="button" class="btn-roll-photo" onclick="openRollPhotoCapture('${itemId}', ${gIdx}, ${rIdx}, event)" title="材料ラベルの写真を撮影">
                                                        <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                                                        写真撮影
                                                    </button>
                                                    <span class="badge-unshot">必須</span>
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <div class="roll-row-right" onclick="event.stopPropagation()" style="display: flex; gap: 6px; align-items: center;">
                                        <button type="button" class="btn-roll-exclude" onclick="toggleRollItemExclude('${itemId}', ${gIdx}, ${rIdx}, event)" title="この巻きを一時的に除外（キュー投入対象から外す）">
                                            除外
                                        </button>
                                        <button type="button" class="btn-feed-primary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="enqueueSingleRollItem('${itemId}', ${gIdx}, ${rIdx}, event)" title="この巻きを投入キューに追加">
                                            投入
                                        </button>
                                        <button type="button" class="btn-detail-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="previewBatchGroup(${gIdx}, event, ${rIdx})" title="この巻きの詳細を確認">
                                            詳細
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

    if (isFeedOpen) {
        const qrInput = document.getElementById('feedRawQRInput');
        if (qrInput) qrInput.value = barcode;

        // Auto-extract parts if Kurachi standard comma-separated format
        if (barcode.includes(',')) {
            const parts = barcode.split(',').map(s => s.trim());
            if (parts.length >= 2 && parts[1]) {
                const mfgInput = document.getElementById('feedMfgUidInput');
                if (mfgInput && !mfgInput.value) mfgInput.value = parts[1];
            }
            if (parts.length >= 3 && !isNaN(Number(parts[2]))) {
                const lenInput = document.getElementById('feedRawLengthInput');
                if (lenInput) lenInput.value = parts[2];
            }
        }

        updateScannerModalBadge(`✓ スキャン成功: ${barcode}`, true);
        showToast(`⚡ バーコード読取完了: ${barcode}`, 'success', 2200);
    } else {
        showToast(`⚡ バーコード読取: ${barcode}`, 'info', 2500);
    }
}

function updateScannerModalBadge(text, isScanned = false) {
    const indicator = document.getElementById('feedModalScannerIndicator');
    const textEl = document.getElementById('feedModalScannerText');
    if (textEl) textEl.textContent = text;
    if (indicator) {
        if (isScanned) {
            indicator.classList.add('scanned-active');
            setTimeout(() => {
                indicator.classList.remove('scanned-active');
                if (textEl) textEl.textContent = 'USBスキャナー待機中 (バーコードまたはQRコードをスキャン)';
            }, 3500);
        } else {
            indicator.classList.remove('scanned-active');
        }
    }
}

// --- Feed & Staging Modal Control ---
function openMaterialFeedModalForGroup(groupIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    if (group.type === 'setup') return;

    const firstItem = group.items[0];
    openMaterialFeedModal(firstItem, group);
}

function openMaterialFeedModalForRoll(groupIndex, rollIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    const rollItem = group.items[rollIndex];
    if (!rollItem) return;

    openMaterialFeedModal(rollItem, group);
}

function openMaterialFeedModalForCurrentItem() {
    if (!state.selectedItem) {
        showToast('対象ロットを選択してください', 'error');
        return;
    }
    const targetGroup = state.currentGroups ? state.currentGroups.find(g => g.items.some(it => it.id === state.selectedItem.id)) : null;
    openMaterialFeedModal(state.selectedItem, targetGroup);
}

function openMaterialFeedModal(item, group) {
    state.currentFeedItem = item;
    state.currentFeedGroup = group;
    state.capturedPhotoBase64 = null;
    state.uploadedPhotoUrl = null;

    const modal = document.getElementById('materialFeedModal');
    if (!modal) return;

    const hinban = item.hinban || group?.hinban || '-';
    const kizai = item.kizai || group?.kizai || '-';
    const color = item.color || group?.color || '-';
    const zuban = item.zuban || group?.zuban || '-';
    const dest = item.shippingDest || group?.shippingDest || '-';
    const rollIdx = item.rollIndex || 1;
    const totalRolls = item.totalRolls || group?.items?.length || 1;
    const meters = item.meters || group?.totalMeters || 100;
    const orderIndex = item.orderIndex || 1;

    const kizaiTitleEl = document.getElementById('feedModalKizaiTitle');
    if (kizaiTitleEl) kizaiTitleEl.textContent = kizai !== '-' ? kizai : hinban;
    const hinbanEl = document.getElementById('feedModalHinban');
    if (hinbanEl) hinbanEl.textContent = kizai !== '-' ? kizai : hinban;
    const orderRangeEl = document.getElementById('feedModalOrderRange');
    if (orderRangeEl) orderRangeEl.textContent = `#${orderIndex}`;
    const kizaiEl = document.getElementById('feedModalKizai');
    if (kizaiEl) kizaiEl.textContent = `基材: ${kizai}`;
    const colorEl = document.getElementById('feedModalColor');
    if (colorEl) colorEl.textContent = `色: ${color}`;
    const zubanEl = document.getElementById('feedModalZuban');
    if (zubanEl) zubanEl.textContent = `図番: ${zuban}`;
    const destEl = document.getElementById('feedModalDest');
    if (destEl) destEl.textContent = `出荷先: ${dest}`;
    const rollsEl = document.getElementById('feedModalRolls');
    if (rollsEl) rollsEl.textContent = `Roll ${rollIdx} / ${totalRolls} 巻き`;
    const metersEl = document.getElementById('feedModalMeters');
    if (metersEl) metersEl.textContent = `${meters} m`;

    // Compute default lot number: YYMMDD-rollIndex
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
    const defaultLotNo = `${yymmdd}-${rollIdx}`;

    const lotNoInput = document.getElementById('feedLotNoInput');
    if (lotNoInput) lotNoInput.value = defaultLotNo;

    const lengthInput = document.getElementById('feedRawLengthInput');
    if (lengthInput) lengthInput.value = meters;

    const qrInput = document.getElementById('feedRawQRInput');
    if (qrInput) {
        qrInput.value = '';
        setTimeout(() => qrInput.focus(), 160);
    }

    const mfgUidInput = document.getElementById('feedMfgUidInput');
    if (mfgUidInput) mfgUidInput.value = '';

    const workerDisplay = document.getElementById('feedWorkerDisplay');
    if (workerDisplay) workerDisplay.value = state.workerName || '未選択';

    removeCapturedPhoto();
    updateScannerModalBadge('USBスキャナー待機中 (バーコードまたはQRコードをスキャン)', false);

    modal.classList.add('open', 'active');
    modal.style.display = 'flex';
}

function closeMaterialFeedModal() {
    const modal = document.getElementById('materialFeedModal');
    if (modal) {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
    }
    state.currentFeedItem = null;
    state.currentFeedGroup = null;
}

// --- Native Camera Capture & Fallback ---
async function startCameraCapture() {
    const modal = document.getElementById('nativeCameraModal');
    const video = document.getElementById('webcamVideo');
    if (!modal || !video) return;

    modal.classList.add('open');

    if (state.cameraStream) {
        try { state.cameraStream.getTracks().forEach(t => t.stop()); } catch (e) { }
        state.cameraStream = null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia is not supported, switching to file input fallback');
        closeWebcamModal();
        triggerFileInputFallback();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        state.cameraStream = stream;
        video.srcObject = stream;
        await video.play();
    } catch (err) {
        console.warn('Webcam stream error:', err);
        closeWebcamModal();
        showToast('カメラを起動できませんでした。ファイル選択へ切り替えます。', 'info', 2500);
        triggerFileInputFallback();
    }
}

function captureWebcamSnapshot() {
    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedPhoto(base64);
    closeWebcamModal();
    showToast('📸 写真を撮影しました', 'success', 2000);
}

function closeWebcamModal() {
    const modal = document.getElementById('nativeCameraModal');
    if (modal) modal.classList.remove('open');

    if (state.cameraStream) {
        try {
            state.cameraStream.getTracks().forEach(t => t.stop());
        } catch (e) { }
        state.cameraStream = null;
    }
}

function fallbackFromCameraToFile() {
    closeWebcamModal();
    if (state.activeRollPhotoTarget) {
        const fileInput = document.getElementById('rollPhotoFileInput');
        if (fileInput) fileInput.click();
    } else {
        triggerFileInputFallback();
    }
}

function triggerFileInputFallback() {
    const fileInput = document.getElementById('materialPhotoFileInput');
    if (fileInput) fileInput.click();
}

function openRollPhotoCapture(itemId, gIdx, rIdx, event) {
    if (event) event.stopPropagation();
    state.activeRollPhotoTarget = { itemId, gIdx, rIdx };
    startCameraCapture();
}

function handleRollFileChosen(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target?.result;
        if (base64) {
            setCapturedPhoto(base64);
            showToast('ラベル写真を読み込みました', 'success', 2000);
        }
    };
    reader.readAsDataURL(file);
}

function handleFileChosen(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target?.result;
        if (base64) {
            setCapturedPhoto(base64);
            showToast('写真を読み込みました', 'success', 2000);
        }
    };
    reader.readAsDataURL(file);
}

function setCapturedPhoto(base64) {
    state.capturedPhotoBase64 = base64;
    state.uploadedPhotoUrl = null;

    // 1. If photo was taken for a specific roll item in list
    if (state.activeRollPhotoTarget) {
        const { itemId, gIdx, rIdx } = state.activeRollPhotoTarget;
        setItemEdit(itemId, { photoBase64: base64, photoUrl: base64 });

        // Background upload
        const group = state.currentGroups?.[gIdx];
        const item = group?.items?.[rIdx];
        const lotNoVal = `${state.selectedDate.replace(/-/g, '').slice(2)}-${item?.rollIndex || rIdx + 1}`;
        uploadLabelPhotoToServer(base64, lotNoVal, item?.hinban || 'material').then(url => {
            if (url) setItemEdit(itemId, { photoUrl: url });
        }).catch(err => console.warn('Background label photo upload error:', err));

        // Update thumbnail on the roll row
        const row = document.querySelector(`.batch-roll-row[data-item-id="${itemId}"]`);
        if (row) {
            const photoWrap = row.querySelector('.roll-photo-container');
            if (photoWrap) {
                photoWrap.innerHTML = `
                    <div class="roll-photo-wrap">
                        <img src="${base64}" class="roll-photo-thumb" onclick="openPhotoEnlarged('${base64}')" title="クリックで拡大">
                        <button type="button" class="btn-roll-photo has-photo" onclick="openRollPhotoCapture('${itemId}', ${gIdx}, ${rIdx}, event)">再撮影</button>
                    </div>
                `;
            }
        }

        state.activeRollPhotoTarget = null;
        return;
    }

    // 2. Feed modal fallback
    const thumb = document.getElementById('feedPhotoThumb');
    const wrap = document.getElementById('feedPhotoPreviewWrap');
    const badge = document.getElementById('feedPhotoStatusBadge');

    if (thumb) thumb.src = base64;
    if (wrap) wrap.style.display = 'flex';
    if (badge) {
        badge.textContent = '撮影済み';
        badge.style.color = 'var(--brand)';
    }
}

function removeCapturedPhoto() {
    state.capturedPhotoBase64 = null;
    state.uploadedPhotoUrl = null;

    const thumb = document.getElementById('feedPhotoThumb');
    const wrap = document.getElementById('feedPhotoPreviewWrap');
    const badge = document.getElementById('feedPhotoStatusBadge');
    const fileInput = document.getElementById('materialPhotoFileInput');

    if (thumb) thumb.src = '';
    if (wrap) wrap.style.display = 'none';
    if (badge) {
        badge.textContent = '未撮影';
        badge.style.color = 'var(--text-soft)';
    }
    if (fileInput) fileInput.value = '';
}

function openPhotoEnlarged(url) {
    const targetUrl = url || state.capturedPhotoBase64 || state.uploadedPhotoUrl;
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

// --- Upload Photo to Firebase Storage ---
async function uploadLabelPhotoToServer(base64, lotNo, hinban) {
    const payload = {
        base64: base64,
        date: state.selectedDate,
        machine: state.machineName || 'PSA2',
        worker: state.workerName || 'worker',
        lotNo: lotNo || 'nolot',
        hinban: hinban || ''
    };

    const res = await fetch(`${serverURL}/api/firstkojo/upload-label-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `写真アップロードエラー (${res.status})`);
    }

    const data = await res.json();
    if (!data.success || !data.url) {
        throw new Error(data.error || '写真URLが取得できませんでした');
    }
    return data.url;
}

// --- Submit Feed & Enqueue ---
async function submitFeedAndEnqueue() {
    if (!state.workerName) {
        alert('作業者が選択されていません。ユーザー設定タブで作業者を選択してください。');
        switchMainTab(0);
        return;
    }

    const item = state.currentFeedItem;
    if (!item) {
        alert('対象ロットが選択されていません。');
        return;
    }

    let photoUrl = state.uploadedPhotoUrl;
    if (!state.capturedPhotoBase64 && !photoUrl) {
        const proceed = confirm('材料ラベルの写真が撮影されていません。\n写真なしのまま投入キューに追加しますか？');
        if (!proceed) return;
    }

    const btnSubmit = document.getElementById('btnFeedEnqueue');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'キュー追加中...';
    }

    try {
        const lotNoVal = document.getElementById('feedLotNoInput')?.value?.trim() || '';
        const rawQRVal = document.getElementById('feedRawQRInput')?.value?.trim() || '';
        const rawLengthVal = document.getElementById('feedRawLengthInput')?.value || '';
        const mfgUidVal = document.getElementById('feedMfgUidInput')?.value?.trim() || '';

        // Upload label photo to Firebase Storage if not uploaded yet
        if (state.capturedPhotoBase64 && !photoUrl) {
            photoUrl = await uploadLabelPhotoToServer(state.capturedPhotoBase64, lotNoVal, item.hinban);
            state.uploadedPhotoUrl = photoUrl;
        }

        const enqueuePayload = {
            date: state.selectedDate,
            machine: state.machineName || 'PSA2',
            worker: state.workerName,
            groupId: item.groupId || item.id,
            hinban: item.hinban || '',
            hinmei: item.hinmei || '',
            kizai: item.kizai || '',
            color: item.color || '',
            zuban: item.zuban || '',
            okyakuHinban: item.okyakuHinban || '',
            labelHinban: item.labelHinban || '',
            shippingDest: item.shippingDest || '',
            totalRolls: Number(item.totalRolls) || 1,
            totalMeters: Number(item.totalMeters) || Number(item.meters) || 0,
            rollMeters: Number(rawLengthVal) || Number(item.meters) || 0,
            rollIndex: Number(item.rollIndex) || 1,
            lotNo: lotNoVal,
            rawMaterialQR: rawQRVal,
            rawMaterialLength: rawLengthVal,
            manufacturerUid: mfgUidVal,
            photoUrl: photoUrl || ''
        };

        console.log('Enqueueing material to production queue:', enqueuePayload);

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

        // Broadcast TV displayer update
        notifyPdfDisplayer(item, item.zuban);

        // Close feed modal immediately so worker can continue fast-paced flow
        closeMaterialFeedModal();

        showToast(`材料 [${item.kizai || item.hinban}] を投入キューに追加しました`, 'success', 3500);

        // Refresh staging queue immediately
        await fetchProductionQueue();

    } catch (err) {
        console.error('Error enqueuing item:', err);
        alert(`投入エラー: ${err.message}`);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = '投入・キューに追加 (Feed & Add to Queue)';
        }
    }
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

async function fetchProductionQueue() {
    try {
        const machine = state.machineName || 'PSA2';
        const res = await fetch(`${serverURL}/api/production/queue?date=${encodeURIComponent(state.selectedDate)}&machine=${encodeURIComponent(machine)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.queue)) {
            state.stagingQueue = data.queue;
            renderStagingQueue();
        }
    } catch (err) {
        console.warn('⚠️ Could not fetch production queue:', err);
    }
}

function renderStagingQueue() {
    const queueContainer = document.getElementById('queueItemListContainer');
    const tabBadge = document.getElementById('tabQueueBadge');
    const totalCountBadge = document.getElementById('queueTotalCountBadge');

    const activeAndQueued = state.stagingQueue.filter(item => item.status === 'active' || item.status === 'queued');

    if (tabBadge) {
        if (activeAndQueued.length > 0) {
            tabBadge.textContent = activeAndQueued.length;
            tabBadge.style.display = 'inline-block';
        } else {
            tabBadge.style.display = 'none';
        }
    }

    if (totalCountBadge) {
        totalCountBadge.textContent = `${activeAndQueued.length} 件`;
    }

    if (!queueContainer) return;

    if (activeAndQueued.length === 0) {
        queueContainer.innerHTML = `
            <div class="staging-queue-empty">
                現在投入されている材料はありません。生産一覧 (List) タブから材料を投入してください。
            </div>
        `;
        return;
    }

    const activeItem = activeAndQueued.find(it => it.status === 'active');
    const queuedItems = activeAndQueued.filter(it => it.status === 'queued');

    let rowsHTML = '';

    // 1. Active item (#1 貼合中)
    if (activeItem) {
        const kizaiCode = activeItem.kizai || activeItem.hinban || '基材未設定';
        const photoThumb = activeItem.photoUrl
            ? `<img class="queue-flat-thumb" src="${activeItem.photoUrl}" alt="写真" onclick="openPhotoEnlarged('${activeItem.photoUrl}')" title="クリックで拡大">`
            : `<div class="queue-flat-thumb-placeholder">写真なし</div>`;
        const currentRoll = activeItem.currentRollIndex || activeItem.rollIndex || 1;
        const totalRolls = activeItem.totalRolls || 1;

        rowsHTML += `
            <div class="queue-flat-row is-active" data-queue-id="${activeItem._id}">
                <div class="queue-flat-left">
                    <span class="queue-pos-tag pos-active">#1 貼合中</span>
                    ${photoThumb}
                    <div>
                        <div class="queue-flat-title">${kizaiCode}</div>
                        <div style="font-size: 0.825rem; color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px;">
                            <span>Roll: <strong>#${currentRoll} / ${totalRolls}</strong></span>
                            <span>•</span>
                            <span><strong>${activeItem.rollMeters || activeItem.totalMeters || 0} m</strong></span>
                            <span>•</span>
                            <span>ロット: <strong>${activeItem.lotNo || '-'}</strong></span>
                            <span>•</span>
                            <span>担当: <strong>${activeItem.worker || '作業者'}</strong></span>
                            ${activeItem.shippingDest ? `<span>• 行先: <strong>${activeItem.shippingDest}</strong></span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="queue-flat-right" onclick="event.stopPropagation()">
                    <button type="button" class="btn-staging-action btn-staging-advance" onclick="advanceQueueItemPrompt('${activeItem._id}')" title="現在の巻きを完了し次へ進める">
                        完了 / 次へ
                    </button>
                </div>
            </div>
        `;
    }

    // 2. Queued items (#2 待機中, #3 待機中...)
    queuedItems.forEach((item, qIdx) => {
        const kizaiCode = item.kizai || item.hinban || '基材未設定';
        const photoThumb = item.photoUrl
            ? `<img class="queue-flat-thumb" src="${item.photoUrl}" alt="写真" onclick="openPhotoEnlarged('${item.photoUrl}')" title="クリックで拡大">`
            : `<div class="queue-flat-thumb-placeholder">写真なし</div>`;
        const posNum = activeItem ? (qIdx + 2) : (qIdx + 1);

        rowsHTML += `
            <div class="queue-flat-row is-staged" data-queue-id="${item._id}">
                <div class="queue-flat-left">
                    <span class="queue-pos-tag pos-queued">#${posNum} 待機中</span>
                    ${photoThumb}
                    <div>
                        <div class="queue-flat-title">${kizaiCode}</div>
                        <div style="font-size: 0.825rem; color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px;">
                            <span>Roll: <strong>#${item.rollIndex || 1} / ${item.totalRolls || 1}</strong></span>
                            <span>•</span>
                            <span><strong>${item.rollMeters || item.totalMeters || 0} m</strong></span>
                            <span>•</span>
                            <span>ロット: <strong>${item.lotNo || '-'}</strong></span>
                            ${item.shippingDest ? `<span>• 行先: <strong>${item.shippingDest}</strong></span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="queue-flat-right" onclick="event.stopPropagation()">
                    <button type="button" class="btn-staging-action btn-staging-reorder" onclick="reorderQueueItem('${item._id}', 'up')" ${qIdx === 0 ? 'disabled' : ''} title="順序を繰り上げ">上へ</button>
                    <button type="button" class="btn-staging-action btn-staging-reorder" onclick="reorderQueueItem('${item._id}', 'down')" ${qIdx === queuedItems.length - 1 ? 'disabled' : ''} title="順序を繰り下げ">下へ</button>
                    <button type="button" class="btn-staging-action btn-staging-cancel" onclick="cancelQueueItem('${item._id}', '${kizaiCode}')" title="この材料投入を取り消す">取消</button>
                </div>
            </div>
        `;
    });

    queueContainer.innerHTML = rowsHTML;
}

async function cancelQueueItem(queueId, hinban) {
    if (!confirm(`投入キューからロット「${hinban || ''}」を取り消しますか？`)) return;

    try {
        const res = await fetch(`${serverURL}/api/production/queue/skip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName || 'PSA2',
                queueId,
                reason: '作業者による取消'
            })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) {
            // Restore item state in localStorage so it returns to schedule list
            const targetQueueItem = state.stagingQueue.find(q => String(q._id) === String(queueId));
            if (targetQueueItem) {
                const edits = getItemEdits();
                Object.keys(edits).forEach(k => {
                    const e = edits[k];
                    if (e.lotNo && targetQueueItem.lotNo && e.lotNo === targetQueueItem.lotNo) {
                        setItemEdit(k, { enqueued: false });
                    } else if (e.hinban === targetQueueItem.hinban && Number(e.rollIndex) === Number(targetQueueItem.rollIndex)) {
                        setItemEdit(k, { enqueued: false });
                    }
                });
            }

            showToast(`ロット「${hinban}」のキューを取り消しました`, 'info');
            await fetchProductionQueue();
            renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');
            updateHistoryBadges();
        }
    } catch (err) {
        console.error('Error cancelling queue item:', err);
        alert(`取消エラー: ${err.message}`);
    }
}

async function reorderQueueItem(queueId, direction) {
    const queuedItems = state.stagingQueue.filter(it => it.status === 'queued');
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
    const item = state.stagingQueue.find(it => String(it._id) === String(queueId) && it.status === 'active');
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
function setHistoryFilter(filter) {
    state.historyFilter = filter || 'all';
    const buttons = document.querySelectorAll('.history-filter-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === state.historyFilter);
    });
    renderHistoryList();
}

function updateHistoryBadges() {
    const enqueuedBadge = document.getElementById('historyEnqueuedCountBadge');
    const excludedBadge = document.getElementById('historyExcludedCountBadge');
    const edits = getItemEdits();

    let enqueuedCount = 0;
    let excludedCount = 0;

    Object.values(edits).forEach(e => {
        if (e.enqueued) enqueuedCount++;
        else if (e.isExcluded) excludedCount++;
    });

    if (enqueuedBadge) enqueuedBadge.textContent = `投入済: ${enqueuedCount} 件`;
    if (excludedBadge) excludedBadge.textContent = `除外: ${excludedCount} 件`;
}

function renderHistoryList() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    updateHistoryBadges();

    const edits = getItemEdits();
    const items = [];

    Object.keys(edits).forEach(itemId => {
        const e = edits[itemId];
        if (e.enqueued) {
            items.push({
                itemId,
                type: 'enqueued',
                kizai: e.kizai || e.hinban || '材料',
                rollIndex: e.rollIndex || 1,
                totalRolls: e.totalRolls || 1,
                meters: e.meters || 0,
                lotNo: e.lotNo || '-',
                timestamp: e.enqueuedAt || '投入済',
                photoUrl: e.photoUrl || e.photoBase64 || ''
            });
        } else if (e.isExcluded) {
            items.push({
                itemId,
                type: 'excluded',
                kizai: e.kizai || e.hinban || '材料',
                rollIndex: e.rollIndex || 1,
                totalRolls: e.totalRolls || 1,
                meters: e.meters || 0,
                lotNo: e.lotNo || '-',
                timestamp: '除外中',
                photoUrl: e.photoUrl || e.photoBase64 || ''
            });
        }
    });

    const filter = state.historyFilter || 'all';
    const filtered = items.filter(it => {
        if (filter === 'enqueued') return it.type === 'enqueued';
        if (filter === 'excluded') return it.type === 'excluded';
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="staging-queue-empty">
                ${filter === 'enqueued' ? '投入済の履歴はありません' : filter === 'excluded' ? '除外中の項目はありません' : '履歴はありません'}
            </div>
        `;
        return;
    }

    let html = '';
    filtered.forEach(it => {
        const isEnqueued = (it.type === 'enqueued');
        const badgeClass = isEnqueued ? 'history-type-enqueued' : 'history-type-excluded';
        const badgeLabel = isEnqueued ? '投入済' : '除外中';
        const photoThumb = it.photoUrl
            ? `<img class="history-thumb" src="${it.photoUrl}" alt="写真" onclick="openPhotoEnlarged('${it.photoUrl}')" title="クリックで拡大">`
            : `<div class="history-thumb-placeholder">写真なし</div>`;

        html += `
            <div class="history-row ${isEnqueued ? 'is-enqueued' : 'is-excluded'}" data-item-id="${it.itemId}">
                <div class="history-left">
                    <span class="history-type-badge ${badgeClass}">${badgeLabel}</span>
                    ${photoThumb}
                    <div>
                        <div class="history-title">${it.kizai}</div>
                        <div class="history-meta">
                            <span>Roll #${it.rollIndex} / ${it.totalRolls}</span>
                            <span>•</span>
                            <span><strong>${it.meters} m</strong></span>
                            <span>•</span>
                            <span>ロット: <strong>${it.lotNo}</strong></span>
                            <span>•</span>
                            <span>${it.timestamp}</span>
                        </div>
                    </div>
                </div>
                <div class="history-right" onclick="event.stopPropagation()">
                    ${!isEnqueued ? `
                        <button type="button" class="history-restore-btn" onclick="restoreExcludedItem('${it.itemId}')" title="生産一覧タブに復帰させる">
                            一覧に戻す
                        </button>
                    ` : `
                        <span style="font-size: 0.8rem; color: var(--brand); font-weight: 700;">キュー連携中</span>
                    `}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function restoreExcludedItem(itemId) {
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
    if (data.type === 'queue_updated' || data.type === 'queue_scrapped' || data.type === 'roll_advanced') {
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
    setupMainTabs();
    setupSidebar();
    setupDateControls();
    initWorker();
    fetchWorkersFromMongoDB();

    // Initial schedule fetch for the selected date
    fetchDailySchedule(state.selectedDate);

    // Initialize USB Barcode Scanner Listener
    setupUSBScannerListener();

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
});
