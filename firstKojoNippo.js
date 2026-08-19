/**
 * firstKojoNippo.js
 * Logic for First Factory Nippo (第一工場 日報) Tablet UI
 */

// const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";
const serverURL = "http://192.168.0.48:3000";

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

    currentMainTab: 0, // 0: User, 1: List, 2: Info, 3: Production, 4: Submit

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

    // 5 tabs => 100 / 5 = 20% shift per tab
    if (container) {
        container.style.transform = `translateX(-${index * 20}%)`;
    }
    state.currentMainTab = index;
    sessionStorage.setItem('firstkojo_nippo_main_tab', index);

    if (index === 1) {
        fetchDailySchedule(state.selectedDate);
    }
    if (index === 2) {
        loadItemDetail(state.selectedItem);
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

        return {
            ...item,
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
    const labelHinban = group.labelHinban || rollItem.labelHinban || hinban;
    const color = group.color || rollItem.color || '';
    const hinmei = group.hinmei || rollItem.hinmei || '';
    const shippingDest = group.shippingDest || rollItem.shippingDest || '';
    const meters = rollItem.meters || 100;
    const barcode = `${labelHinban || hinban},${lotNo},${meters}`;

    return {
        filename: 'firstkojo4.lbx',
        size: 'RollW62',
        copies: 1,
        text_品番: hinban,
        text_収容数: String(rollItem.orderIndex !== undefined ? rollItem.orderIndex : (rollIndex || 1)),
        text_背番号: labelHinban,
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
                <div class="empty-icon">📅</div>
                <h3>この日の生産予定はありません</h3>
                <p>上部の日付選択から他の日付を選択するか、更新ボタンを押してください。</p>
            </div>
        `;
    }

    let rowsHTML = '';

    groups.forEach((group, gIdx) => {
        const lifecycle = getGroupLifecycle(group.groupId);
        const isGroupSelected = (lifecycle.status !== 'completed') && state.selectedItem && group.items.some(it => it.id === state.selectedItem.id);

        if (group.type === 'setup') {
            const setupItem = group.items[0];
            rowsHTML += `
                <tr class="table-setup-row" data-id="${setupItem.id}">
                    <td style="text-align: center; font-weight: 800;">#${setupItem.orderIndex}</td>
                    <td style="font-weight: 700;">${setupItem.startTime} - ${setupItem.endTime}</td>
                    <td colspan="6" style="font-weight: 800;">⚙️ ${setupItem.name || '段取り / 段替'} (${setupItem.duration} 分)</td>
                    <td style="text-align: center;"><span style="color: #B45309; font-weight: 700; font-size: 0.8rem;">段替</span></td>
                    <td colspan="2" style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">—</td>
                </tr>
            `;
            return;
        }

        const firstItem = group.items[0];
        const lastItem = group.items[group.items.length - 1];
        const orderRangeText = group.items.length > 1 ? `#${firstItem.orderIndex}〜#${lastItem.orderIndex}` : `#${firstItem.orderIndex}`;
        const mainTitle = group.kizai || group.hinban;

        let statusBadge = '<span style="color: #64748B; font-weight: 700;">待機中</span>';
        let statusClass = '';
        if (lifecycle.status === 'in-progress' || lifecycle.status === 'running') {
            statusBadge = `<span style="color: #7E22CE; font-weight: 800;">🟣 生産中 (${lifecycle.actualStartTime || ''}〜)</span>`;
            statusClass = 'table-row-in-progress';
        } else if (lifecycle.status === 'completed') {
            statusBadge = `<span style="color: #15803D; font-weight: 800;">✅ 完了 (${lifecycle.actualDurationMins || ''}分)</span>`;
            statusClass = 'table-row-completed';
        }

        const printedCount = Array.isArray(lifecycle.printHistory)
            ? new Set(lifecycle.printHistory.map(p => Number(p.rollIndex))).size
            : 0;
        const isAllPrinted = printedCount >= group.items.length && group.items.length > 0;

        rowsHTML += `
            <tr class="table-group-header ${statusClass} ${isGroupSelected ? 'table-row-selected' : ''}" onclick="previewBatchGroup(${gIdx}, event)">
                <td style="text-align: center; font-weight: 900; color: var(--brand); font-size: 0.95rem;">${orderRangeText}</td>
                <td style="font-weight: 800; font-variant-numeric: tabular-nums;">${group.startTime} - ${group.endTime}</td>
                <td style="font-weight: 900; font-size: 0.95rem; color: #0F172A; cursor: pointer;">
                    <div>${mainTitle}</div>
                    ${group.hinban && group.kizai ? `<div style="font-size: 0.75rem; color: #64748B; font-weight: 600;">${group.hinban}</div>` : ''}
                </td>
                <td style="font-weight: 700;">${group.shippingDest || '—'}</td>
                <td style="font-weight: 700;">${group.color || '—'}</td>
                <td style="font-weight: 700;">${group.shori || '—'}</td>
                <td style="font-weight: 700;">${group.habanaga || '—'}</td>
                <td style="font-weight: 800;">全 ${group.items.length} 巻き (${group.totalMeters}m)</td>
                <td>${statusBadge}</td>
                <td onclick="event.stopPropagation()" style="text-align: center;">
                    <button type="button" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; font-weight: 800; white-space: nowrap; ${isAllPrinted ? 'background: #DCFCE7; color: #15803D; border-color: #86EFAC;' : ''}" onclick="printBatchGroup(${gIdx}, event)">
                        ${isAllPrinted ? `✓ 印刷済 (${printedCount}/${group.items.length})` : '🖨️ 一括印刷'}
                    </button>
                </td>
                <td onclick="event.stopPropagation()" style="text-align: center;">
                    <div style="display: flex; gap: 4px; justify-content: center; align-items: center;">
                        <button type="button" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; font-weight: 800;" onclick="previewBatchGroup(${gIdx}, event)" title="詳細">ℹ️ 詳細</button>
                        ${(lifecycle.status === 'in-progress' || lifecycle.status === 'running') ? `
                            <button type="button" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.75rem; font-weight: 800; background: #059669;" onclick="showDoneConfirmation(${gIdx}, event)">⏹ 完了</button>
                        ` : lifecycle.status === 'completed' ? `
                            <button type="button" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; font-weight: 800; color: #D97706;" onclick="showReopenModal(${gIdx}, event)">🔄 再開</button>
                        ` : `
                            <button type="button" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.75rem; font-weight: 800;" onclick="startBatchGroup(${gIdx}, event)">▶ 開始</button>
                        `}
                    </div>
                </td>
            </tr>
        `;

        group.items.forEach((rollItem, rIdx) => {
            const actualRollIndex = rollItem.rollIndex || (rIdx + 1);
            const isRollPrinted = Array.isArray(lifecycle.printHistory) && lifecycle.printHistory.some(p => Number(p.rollIndex) === Number(actualRollIndex));
            const lastPrint = isRollPrinted ? lifecycle.printHistory.filter(p => Number(p.rollIndex) === Number(actualRollIndex)).slice(-1)[0] : null;

            rowsHTML += `
                <tr class="table-roll-row ${statusClass}" onclick="previewBatchGroup(${gIdx}, event)">
                    <td style="text-align: center; color: #64748B; font-weight: 700; padding-left: 20px;">#${rollItem.orderIndex}</td>
                    <td style="color: #64748B; font-variant-numeric: tabular-nums;">${rollItem.startTime || '—'} - ${rollItem.endTime || '—'}</td>
                    <td style="color: #475569; padding-left: 18px; font-weight: 700;">↳ ${actualRollIndex} / ${group.items.length} 巻き目</td>
                    <td style="color: #64748B;">—</td>
                    <td style="color: #64748B;">—</td>
                    <td style="color: #64748B;">—</td>
                    <td style="color: #64748B;">—</td>
                    <td style="color: #334155; font-weight: 700;">${rollItem.meters || '—'} m (${rollItem.duration || '—'}分)</td>
                    <td>
                        ${isRollPrinted ? `<span style="color: #16A34A; font-weight: 800; font-size: 0.75rem;">✓ 印刷済 (${lastPrint?.timeStr || ''})</span>` : `<span style="color: #94A3B8; font-size: 0.75rem;">未印刷</span>`}
                    </td>
                    <td onclick="event.stopPropagation()" style="text-align: center;">
                        <button type="button" class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.75rem; font-weight: 700; ${isRollPrinted ? 'background: #DCFCE7; color: #15803D; border-color: #86EFAC;' : ''}" onclick="printSingleRoll(${gIdx}, ${rIdx}, event)">
                            ${isRollPrinted ? '✓ 再印刷' : '🖨️ 印刷'}
                        </button>
                    </td>
                    <td style="text-align: center; color: #CBD5E1;">—</td>
                </tr>
            `;
        });
    });

    return `
        <div class="schedule-table-wrap">
            <table class="schedule-table">
                <thead>
                    <tr>
                        <th style="width: 75px; text-align: center;">順 (No)</th>
                        <th style="width: 120px;">時間 (Time)</th>
                        <th>基材・品番 (Material / Hinban)</th>
                        <th style="width: 100px;">出荷先</th>
                        <th style="width: 60px;">色</th>
                        <th style="width: 70px;">処理</th>
                        <th style="width: 70px;">幅長</th>
                        <th style="width: 130px;">巻数・数量</th>
                        <th style="width: 130px;">状態</th>
                        <th style="width: 110px; text-align: center;">ラベル印刷</th>
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
        const isGroupSelected = (lifecycle.status !== 'completed') && state.selectedItem && group.items.some(it => it.id === state.selectedItem.id);

        if (group.type === 'setup') {
            const setupItem = group.items[0];
            html += `
                <div class="schedule-setup-row" data-id="${setupItem.id}">
                    <div class="schedule-setup-left">
                        <span class="setup-tag-pill">#${setupItem.orderIndex} 段替・段取</span>
                        <span class="setup-title-text">${setupItem.name || '段替え (Setup)'}</span>
                    </div>
                    <div class="setup-time-text">🕒 ${setupItem.startTime} - ${setupItem.endTime} (${setupItem.duration} 分)</div>
                </div>
            `;
        } else {
            const firstItem = group.items[0];
            const lastItem = group.items[group.items.length - 1];
            const orderRangeText = group.items.length > 1 ? `#${firstItem.orderIndex} — #${lastItem.orderIndex}` : `#${firstItem.orderIndex}`;

            const destBadge = group.shippingDest ? `<span class="tag-pill dest-tag" title="出荷先名: ${group.shippingDest}">出荷先: ${group.shippingDest}</span>` : '';
            const colorBadge = group.color ? `<span class="tag-pill color-tag" title="色コード: ${group.color}">色: ${group.color}</span>` : '';
            const shoriBadge = group.shori ? `<span class="tag-pill shori-tag" title="処理コード: ${group.shori}">処理: ${group.shori}</span>` : '';
            const habanagaBadge = group.habanaga ? `<span class="tag-pill habanaga-tag" title="幅長コード: ${group.habanaga}">幅長: ${group.habanaga}</span>` : '';

            let statusBadgeHTML = '';
            let actionButtonsHTML = '';

            const printedCount = Array.isArray(lifecycle.printHistory)
                ? new Set(lifecycle.printHistory.map(p => Number(p.rollIndex))).size
                : 0;
            const isAllPrinted = printedCount >= group.items.length && group.items.length > 0;
            const printAllBtnHTML = `<button type="button" class="btn-batch-action btn-batch-print ${isAllPrinted ? 'is-all-printed' : ''}" onclick="printBatchGroup(${gIdx}, event)" title="${isAllPrinted ? '全巻き印刷済み - 再印刷' : 'このロットの全巻きラベルを一括印刷'}">${isAllPrinted ? `✓ 印刷済 (${printedCount}/${group.items.length})` : '🖨️ 一括印刷'}</button>`;

            if (lifecycle.status === 'in-progress' || lifecycle.status === 'running') {
                statusBadgeHTML = `<span class="batch-status-badge status-in-progress">🟣 生産中 (${lifecycle.actualStartTime || ''}〜)</span>`;
                actionButtonsHTML = `
                    ${printAllBtnHTML}
                    <button type="button" class="btn-batch-action btn-batch-preview" onclick="previewBatchGroup(${gIdx}, event)" title="詳細確認">ℹ️ 詳細</button>
                    <button type="button" class="btn-batch-action btn-batch-done" onclick="showDoneConfirmation(${gIdx}, event)" title="生産完了">⏹ 完了</button>
                    <button type="button" class="btn-batch-action btn-batch-cancel" onclick="cancelBatchGroup(${gIdx}, event)" title="中断・取消">✕ 取消</button>
                `;
            } else if (lifecycle.status === 'completed') {
                statusBadgeHTML = `<span class="batch-status-badge status-completed">✅ 完了 (${lifecycle.actualStartTime} - ${lifecycle.actualEndTime} • ${lifecycle.actualDurationMins}分)</span>`;
                actionButtonsHTML = `
                    ${printAllBtnHTML}
                    <button type="button" class="btn-batch-action btn-batch-preview" onclick="previewBatchGroup(${gIdx}, event)" title="詳細確認">ℹ️ 詳細</button>
                    <button type="button" class="btn-batch-action btn-batch-reopen" onclick="showReopenModal(${gIdx}, event)" title="再開・リセット">🔄 再開</button>
                `;
            } else {
                statusBadgeHTML = `<span class="batch-status-badge status-pending">待機中</span>`;
                actionButtonsHTML = `
                    ${printAllBtnHTML}
                    <button type="button" class="btn-batch-action btn-batch-preview" onclick="previewBatchGroup(${gIdx}, event)" title="詳細確認 (モニター非表示)">ℹ️ 詳細</button>
                    <button type="button" class="btn-batch-action btn-batch-start" onclick="startBatchGroup(${gIdx}, event)" title="生産開始 (モニター表示)">▶ 開始</button>
                `;
            }

            const mainTitle = group.kizai || group.hinban;

            html += `
                <div class="batch-group-card state-${lifecycle.status} ${isGroupTinted ? 'group-tinted' : ''}" 
                     data-group-id="${group.groupId}">
                    
                    <div class="batch-header" onclick="previewBatchGroup(${gIdx}, event)">
                        <div class="batch-header-top-row">
                            <div class="batch-order-and-title">
                                <div class="batch-order-range">${orderRangeText}</div>
                                <span class="batch-hinban-title">${mainTitle}</span>
                            </div>
                            <div class="batch-top-status">
                                ${statusBadgeHTML}
                            </div>
                        </div>

                        <div class="batch-chips-row">
                            ${destBadge}
                            ${colorBadge}
                            ${shoriBadge}
                            ${habanagaBadge}
                            <span class="batch-summary-pill">全 ${group.items.length} 巻き (${group.totalMeters} m)</span>
                            <span class="batch-summary-pill">🕒 予定: ${group.startTime} - ${group.endTime} (計 ${group.totalDuration} 分)</span>
                        </div>

                        <div class="batch-actions-row" onclick="event.stopPropagation()">
                            <div class="batch-btn-group">
                                ${actionButtonsHTML}
                            </div>
                        </div>
                    </div>

                    <div class="batch-rolls-list">
                        ${group.items.map((rollItem, rIdx) => {
                const isRunning = (lifecycle.status === 'in-progress' || lifecycle.status === 'running');
                const isCompleted = (lifecycle.status === 'completed');
                const actualRollIndex = rollItem.rollIndex || (rIdx + 1);
                const isRollPrinted = Array.isArray(lifecycle.printHistory) && lifecycle.printHistory.some(p => Number(p.rollIndex) === Number(actualRollIndex));
                const lastPrintEntry = isRollPrinted ? lifecycle.printHistory.filter(p => Number(p.rollIndex) === Number(actualRollIndex)).slice(-1)[0] : null;

                return `
                    <div class="batch-roll-row ${isRunning ? 'active-roll' : ''}" 
                         onclick="previewBatchGroup(${gIdx}, event)">
                        <div class="roll-row-left">
                            <span class="roll-sub-badge">#${rollItem.orderIndex}</span>
                            <span class="roll-time">${rollItem.startTime} - ${rollItem.endTime}</span>
                            <span class="roll-count-pill">${actualRollIndex} / ${rollItem.totalRolls || group.items.length} 巻き</span>
                            <span class="roll-meter-pill">${rollItem.meters || 100} m</span>
                        </div>
                        <div class="roll-row-right" style="display: flex; align-items: center; gap: 8px;" onclick="event.stopPropagation()">
                            <button type="button" class="btn-roll-print ${isRollPrinted ? 'is-printed' : ''}" 
                                    onclick="printSingleRoll(${gIdx}, ${rIdx}, event)" 
                                    title="${isRollPrinted ? `印刷済み (${lastPrintEntry?.timeStr || ''}) - 再印刷` : `この巻き（#${rollItem.orderIndex}）のラベルを印刷`}">
                                ${isRollPrinted ? `✓ 済 (${lastPrintEntry?.timeStr || ''})` : '🖨️ 印刷'}
                            </button>
                            <span class="roll-status-pill ${isRunning ? 'current-active' : ''}">
                                ${isCompleted ? '完了' : (isRunning ? '生産中' : '待機')}
                            </span>
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

// -----------------------------------------------------
// Batch Lifecycle Action Handlers
// -----------------------------------------------------

// 1. Preview Specs (Tablet Only - DOES NOT touch overhead monitor)
function previewBatchGroup(groupIndex, event) {
    if (event) event.stopPropagation();
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    if (group.type === 'setup') {
        selectScheduleItem(group.itemIndexStart);
        return;
    }

    const targetItem = group.items[0];
    state.selectedItem = targetItem;
    state.selectedGroup = group;
    sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(targetItem));

    // Jump to Info tab without broadcasting to pdfDisplayer
    switchMainTab(2);
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
    switchMainTab(2);
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

    // Jump to Info tab (tab index 2) and load full details
    switchMainTab(2);

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
                    action: 'scan'
                }
            })
        });
    } catch (err) {
        console.warn('⚠️ Error notifying pdfDisplayer:', err);
    }
}

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
                <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn-batch-action btn-batch-done" onclick="showDoneConfirmation(${groupIdx}, event)">⏹ 生産完了</button>
                </div>
            </div>
        `;
    } else if (lifecycle.status === 'completed') {
        bannerHTML = `
            <div class="info-preview-banner" style="background: #DEF7EC; border-color: #A7F3D0;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.3rem;">✅</span>
                    <div>
                        <strong style="color: #03543F; font-size: 0.95rem;">生産完了済み (Completed)</strong>
                        <div style="font-size: 0.8rem; color: #047857;">実績: ${lifecycle.actualStartTime} - ${lifecycle.actualEndTime} (${lifecycle.actualDurationMins}分)</div>
                    </div>
                </div>
                <button type="button" class="btn-batch-action btn-batch-reopen" onclick="showReopenModal(${groupIdx}, event)">🔄 再開・リセット</button>
            </div>
        `;
    } else {
        // Pending (Preview Mode)
        bannerHTML = `
            <div class="info-preview-banner">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.3rem;">👀</span>
                    <div>
                        <strong style="color: #1E40AF; font-size: 0.95rem;">事前確認中 (Preview Mode)</strong>
                        <div style="font-size: 0.8rem; color: #3B82F6;">※タブレット上での事前確認です。モニター表示には影響しません。</div>
                    </div>
                </div>
                ${groupIdx >= 0 ? `<button type="button" class="btn-batch-action btn-batch-start" onclick="startBatchGroup(${groupIdx}, event)">▶ このロットを開始</button>` : ''}
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
                    <span class="tag-pill roll-tag" style="font-size: 0.9rem; padding: 6px 12px;">Roll ${item.rollIndex || 1} / ${item.totalRolls || 1}</span>
                    <span class="tag-pill meter-tag" style="font-size: 0.9rem; padding: 6px 12px;">${item.meters || 0} m</span>
                    <span class="tag-pill" style="font-size: 0.9rem; padding: 6px 12px; font-weight: 800;">${item.startTime || '--:--'} - ${item.endTime || '--:--'}</span>
                    <span class="tag-pill" style="font-size: 0.9rem; padding: 6px 12px; font-weight: 800; background: #ECFDF5; color: #059669; border-color: rgba(5, 150, 105, 0.3);">⏱️ ${durationMins} 分</span>
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
