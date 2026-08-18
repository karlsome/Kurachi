/**
 * firstKojoNippo.js
 * Logic for First Factory Nippo (第一工場 日報) Tablet UI
 */

// const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://localhost:3000";

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

function renderScheduleList(items, startTimeStr) {
    const container = document.getElementById('scheduleListContainer');
    if (!container) return;

    updateScheduleStats(items, startTimeStr);

    const groups = groupScheduledItems(items);
    state.currentGroups = groups;

    let html = '';

    groups.forEach((group, gIdx) => {
        const isGroupTinted = (gIdx % 2 === 0);
        const isGroupSelected = state.selectedItem && group.items.some(it => it.id === state.selectedItem.id);

        if (group.type === 'setup') {
            const setupItem = group.items[0];
            const isSelected = state.selectedItem && state.selectedItem.id === setupItem.id;
            html += `
                <div class="schedule-item-card setup-item ${isGroupTinted ? 'group-tinted' : ''} ${isSelected ? 'selected' : ''}" 
                     data-id="${setupItem.id}" 
                     onclick="selectScheduleItem(${group.itemIndexStart})">
                    <div class="item-left-col">
                        <div class="order-badge">#${setupItem.orderIndex}</div>
                        <div class="time-box">
                            <span class="time-range">${setupItem.startTime} - ${setupItem.endTime}</span>
                            <span class="duration-pill">⚙️ ${setupItem.duration} 分</span>
                        </div>
                    </div>
                    <div class="item-center-col">
                        <div class="hinban-title">⚙️ ${setupItem.name || '段取り (Setup)'}</div>
                        <div class="meta-tags-row">
                            <span class="tag-pill">準備 / 段替</span>
                        </div>
                    </div>
                    <div class="item-right-col">
                        <button type="button" class="btn-select-item">${isSelected ? '選択中' : '選択'}</button>
                    </div>
                </div>
            `;
        } else {
            // Unified Hinban Batch Group Card
            const firstItem = group.items[0];
            const lastItem = group.items[group.items.length - 1];
            const orderRangeText = group.items.length > 1 ? `#${firstItem.orderIndex} — #${lastItem.orderIndex}` : `#${firstItem.orderIndex}`;

            const kizaiBadge = group.kizai ? `<span class="tag-pill kizai-tag" title="基材コード: ${group.kizai}">基材: ${group.kizai}</span>` : '';
            const colorBadge = group.color ? `<span class="tag-pill color-tag" title="色コード: ${group.color}">色: ${group.color}</span>` : '';

            html += `
                <div class="batch-group-card ${isGroupTinted ? 'group-tinted' : ''} ${isGroupSelected ? 'selected' : ''}" 
                     data-group-id="${group.groupId}">
                    
                    <!-- Batch Header -->
                    <div class="batch-header" onclick="selectBatchGroup(${gIdx})">
                        <div class="batch-header-left">
                            <div class="batch-order-range">${orderRangeText}</div>
                            <div class="batch-title-col">
                                <div class="batch-hinban-row">
                                    <span class="batch-hinban-title">${group.hinban}</span>
                                    ${kizaiBadge}
                                    ${colorBadge}
                                </div>
                                <div class="batch-meta-sub">
                                    ${group.hinmei ? `<span class="batch-hinmei">${group.hinmei}</span><span class="batch-stat-divider">•</span>` : ''}
                                    <span class="batch-summary-pill">全 ${group.items.length} 巻き (${group.totalMeters} m)</span>
                                    <span class="batch-stat-divider">•</span>
                                    <span class="batch-summary-pill">🕒 ${group.startTime} - ${group.endTime} (計 ${group.totalDuration} 分)</span>
                                </div>
                            </div>
                        </div>
                        <div class="batch-header-right">
                            <button type="button" class="btn-select-batch">${isGroupSelected ? '一括選択中' : 'ロット選択'}</button>
                        </div>
                    </div>

                    <!-- Batch Roll Sub-Rows -->
                    <div class="batch-rolls-list">
                        ${group.items.map((rollItem, rIdx) => {
                            const isRollActive = state.selectedItem && state.selectedItem.id === rollItem.id;
                            const globalIdx = group.itemIndexStart + rIdx;
                            return `
                                <div class="batch-roll-row ${isRollActive ? 'active-roll' : ''}" 
                                     onclick="selectSpecificRoll(${globalIdx}, event)">
                                    <div class="roll-row-left">
                                        <span class="roll-sub-badge">#${rollItem.orderIndex}</span>
                                        <span class="roll-time">${rollItem.startTime} - ${rollItem.endTime}</span>
                                        <span class="roll-count-pill">${rollItem.rollIndex || (rIdx + 1)} / ${rollItem.totalRolls || group.items.length} 巻き</span>
                                        <span class="roll-meter-pill">${rollItem.meters || 100} m</span>
                                    </div>
                                    <div class="roll-row-right">
                                        <span class="roll-status-pill ${isRollActive ? 'current-active' : ''}">
                                            ${isRollActive ? '▶ 進行中' : (isGroupSelected ? 'ロット対象' : '待機')}
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

function selectBatchGroup(groupIndex) {
    if (!state.currentGroups || !state.currentGroups[groupIndex]) return;
    const group = state.currentGroups[groupIndex];
    if (group.type === 'setup') {
        selectScheduleItem(group.itemIndexStart);
        return;
    }

    // Select the first roll in the batch (or keep current if already in this batch)
    let targetItem = group.items[0];
    if (state.selectedItem && group.items.some(it => it.id === state.selectedItem.id)) {
        targetItem = state.selectedItem;
    }

    state.selectedItem = targetItem;
    state.selectedGroup = group;
    sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(targetItem));

    // Re-render schedule list to update active highlights across the entire batch
    renderScheduleList(state.scheduledItems, state.dailySchedule?.startTime || '08:00');

    // Jump to Info tab (tab index 2) and load details
    switchMainTab(2);

    if (group.zuban) {
        notifyPdfDisplayer(targetItem, group.zuban);
    }

    loadItemDetail(targetItem);
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

    const zuban = productMaster['図番'] || item.zuban || '';

    // Broadcast to external pdfDisplayer with resolved zuban
    if (zuban) {
        notifyPdfDisplayer(item, zuban);
    }

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

    container.innerHTML = `
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
