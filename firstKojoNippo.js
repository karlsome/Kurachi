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
    selectedItem: null,
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

function renderScheduleList(items, startTimeStr) {
    const container = document.getElementById('scheduleListContainer');
    if (!container) return;

    updateScheduleStats(items, startTimeStr);

    let html = '';

    items.forEach((item, index) => {
        const isSelected = state.selectedItem && state.selectedItem.id === item.id;
        const isSetup = item.type === 'setup';

        if (isSetup) {
            html += `
                <div class="schedule-item-card setup-item ${isSelected ? 'selected' : ''}" 
                     data-id="${item.id}" 
                     onclick="selectScheduleItem(${index})">
                    <div class="item-left-col">
                        <div class="order-badge">#${item.orderIndex}</div>
                        <div class="time-box">
                            <span class="time-range">${item.startTime} - ${item.endTime}</span>
                            <span class="duration-pill">⚙️ ${item.duration} 分</span>
                        </div>
                    </div>
                    <div class="item-center-col">
                        <div class="hinban-title">⚙️ ${item.name || '段取り (Setup)'}</div>
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
            // Hinban Item
            const rollText = item.totalRolls ? `${item.rollIndex} / ${item.totalRolls} 巻き` : `Roll ${item.rollIndex || 1}`;
            const metersText = item.meters ? `${item.meters} m` : '';

            html += `
                <div class="schedule-item-card ${isSelected ? 'selected' : ''}" 
                     data-id="${item.id}" 
                     onclick="selectScheduleItem(${index})">
                    <div class="item-left-col">
                        <div class="order-badge">#${item.orderIndex}</div>
                        <div class="time-box">
                            <span class="time-range">${item.startTime} - ${item.endTime}</span>
                            <span class="duration-pill">${item.duration} 分</span>
                        </div>
                    </div>
                    <div class="item-center-col">
                        <div class="hinban-title">${item.hinban || '---'}</div>
                        <div class="meta-tags-row">
                            <span class="tag-pill roll-tag">${rollText}</span>
                            ${metersText ? `<span class="tag-pill meter-tag">${metersText}</span>` : ''}
                        </div>
                    </div>
                    <div class="item-right-col">
                        <button type="button" class="btn-select-item">${isSelected ? '選択中' : '選択'}</button>
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

function selectScheduleItem(index) {
    const item = state.scheduledItems[index];
    if (!item) return;

    state.selectedItem = item;
    sessionStorage.setItem('firstkojo_nippo_selected_item', JSON.stringify(item));

    // Update UI highlights
    const cards = document.querySelectorAll('.schedule-item-card');
    cards.forEach((card, idx) => {
        if (idx === index) {
            card.classList.add('selected');
            const btn = card.querySelector('.btn-select-item');
            if (btn) btn.textContent = '選択中';
        } else {
            card.classList.remove('selected');
            const btn = card.querySelector('.btn-select-item');
            if (btn) btn.textContent = '選択';
        }
    });
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
