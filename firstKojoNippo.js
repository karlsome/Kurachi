/**
 * firstKojoNippo.js
 * Logic for First Factory Nippo (第一工場 日報) Tablet UI
 */

const serverURL = "https://kurachi.onrender.com";

const state = {
    workerName: localStorage.getItem('firstkojo_nippo_worker_name') || null,
    machineName: null,
    filterName: "第一工場",

    currentMainTab: 0, // 0: User, 1: List, 2: Info, 3: Production, 4: Submit
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
    initWorker();
    fetchWorkersFromMongoDB();

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
