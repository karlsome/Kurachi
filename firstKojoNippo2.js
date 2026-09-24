/**
 * firstKojoNippo2.js
 * Logic for First Factory Wrapping & Label Printing (第一工場 包装・ラベル発行) Tablet 2 UI
 */

// Determine backend server URL
//const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";
const serverURL = "http://192.168.0.20:3000";

// -----------------------------------------------------
// Date & Time Helpers
// -----------------------------------------------------
function getTodayDateString() {
    const now = new Date();
    try {
        const parts = new Intl.DateTimeFormat('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Asia/Tokyo'
        }).formatToParts(now);
        const y = parts.find(p => p.type === 'year')?.value;
        const m = parts.find(p => p.type === 'month')?.value;
        const d = parts.find(p => p.type === 'day')?.value;
        if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
        // fallback
    }
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function shiftDateString(dateStr, offsetDays) {
    if (!dateStr || !dateStr.includes('-')) return getTodayDateString();
    const parts = dateStr.split('-');
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    dt.setDate(dt.getDate() + offsetDays);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// -----------------------------------------------------
// Application State
// -----------------------------------------------------
const state = {
    selectedDate: sessionStorage.getItem('firstkojo2_date') || getTodayDateString(),
    machineName: null,
    filterName: null,
    workerName: localStorage.getItem('firstkojo_nippo_worker_name') || '包装担当',
    soundEnabled: localStorage.getItem('firstkojo2_sound_enabled') !== 'false',

    // Tab & View state
    currentTab: 'work',   // 'work' | 'history'
    historyView: 'card',  // 'card' | 'list'

    // Queue Data
    queue: [],
    activeItem: null,
    waitingItems: [],
    completedItems: [],
    isLoadingQueue: false,

    // Last Printed Roll for reprint
    lastPrinted: (() => {
        try {
            return JSON.parse(localStorage.getItem('firstkojo2_last_printed') || 'null');
        } catch {
            return null;
        }
    })(),

    // UI state
    isPrinting: false,
    selectedScrapReason: 'キズ・汚れ',

    // SSE connection state
    eventSource: null,
    sseConnected: false,
    reconnectTimeoutId: null,
    reconnectAttempts: 0,
    pollingIntervalId: null,
};

// -----------------------------------------------------
// URL Parameter Parsing
// -----------------------------------------------------
function parseUrlParams() {
    let searchStr = window.location.search;
    while (searchStr.startsWith('?')) {
        searchStr = searchStr.substring(1);
    }
    const params = new URLSearchParams(searchStr);

    if (params.has('machine') || params.has('?machine')) {
        state.machineName = params.get('machine') || params.get('?machine');
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
    if (params.has('worker') || params.has('?worker')) {
        state.workerName = params.get('worker') || params.get('?worker');
    }

    // Update UI elements
    renderMachineTag();

    const datePicker = document.getElementById('datePickerInput');
    if (datePicker) {
        datePicker.value = state.selectedDate;
    }
}

function renderMachineTag() {
    const machineTag = document.getElementById('machineTag');
    if (!machineTag) return;
    const prefix = (typeof _t === 'function' && _t('fk_machine_prefix')) || '設備: ';
    if (state.machineName) {
        machineTag.textContent = `${prefix}${state.machineName}${state.filterName ? ` (${state.filterName})` : ''}`;
        machineTag.style.color = '';
        machineTag.style.borderColor = '';
    } else {
        const noMachine = (typeof _t === 'function' && _t('fk2_no_machine_specified')) || '未指定 (No Machine in URL)';
        machineTag.textContent = `${prefix}${noMachine}`;
        machineTag.style.color = '#E5484D';
        machineTag.style.borderColor = '#FCA5A5';
    }
}

// -----------------------------------------------------
// Sound Synthesizer (Web Audio API)
// -----------------------------------------------------
let audioCtx = null;

function playChime(type) {
    if (!state.soundEnabled) return;
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'success') {
            // Ascending major chord (E5 -> A5)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(659.25, now); // E5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'warning') {
            // Minor drop (F#4 -> C4)
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(369.99, now);
            osc.frequency.setValueAtTime(261.63, now + 0.14);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.36);
        } else {
            // Soft click beep
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.09);
        }
    } catch (e) {
        console.warn('Audio play error:', e);
    }
}

// -----------------------------------------------------
// Toast Notification
// -----------------------------------------------------
function showToast(message, type = 'info', durationMs = 3200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="font-size: 1.25rem;">${icon}</span><span style="flex:1;">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        setTimeout(() => toast.remove(), 320);
    }, durationMs);
}

// -----------------------------------------------------
// Special Kinuura Hinban Pattern Matching
// -----------------------------------------------------
const SPECIAL_KINUURA_PATTERNS = [
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
// Brother Label Printing Helpers (iOS / Android / Desktop)
// -----------------------------------------------------
function buildBrotherPrintFields(item, rollIndex, totalRolls) {
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

    const currentRoll = Number(rollIndex) || 1;
    const lotNo = `${yymmdd}-${currentRoll}`;
    const hinban = item.hinban || '';
    const okyakuHinban = item.okyakuHinban || '';
    const color = item.color || '';
    const hinmei = item.hinmei || '';
    const shippingDest = item.shippingDest || '';
    const meters = item.rollMeters || item.metersPerRoll || item.meters || 100;

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
        const rawLabel = item.labelHinban || '';
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
        text_背番号: textSebangou,
        text_収容数: String(currentRoll),
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
        // Allow time for Brother Web Print URL scheme
        await new Promise(resolve => setTimeout(resolve, 3000));
        return { success: true, mode: 'ios' };
    } else {
        const url = `http://localhost:8088/print?${params}`;
        console.log('🖨️ [Android/Desktop] Brother Print URL:', url, fields);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            const textResponse = await response.text();

            if (textResponse && textResponse.includes('<result>SUCCESS</result>')) {
                return { success: true, response: textResponse, mode: 'network' };
            } else {
                const errorMsg = textResponse.includes('PrinterStatusErrorCoverOpen')
                    ? 'プリンターのカバーが開いています (Cover Open)'
                    : (textResponse.includes('<error>') ? textResponse : 'プリンターエラー (Printer Error)');
                return { success: false, error: errorMsg, response: textResponse };
            }
        } catch (err) {
            console.warn('Print request network error:', err);
            // In dev environment or if localhost:8088 isn't running, show notice but allow flow
            const isConnectionRefused = err.name === 'AbortError' || (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')));
            return {
                success: false,
                isConnectionRefused,
                error: isConnectionRefused
                    ? 'プリンター未接続 (localhost:8088 未起動)'
                    : err.message
            };
        }
    }
}

// -----------------------------------------------------
// Modal Controls
// -----------------------------------------------------
function showPrintProgressModal(title, detailText) {
    const modal = document.getElementById('printProgressModal');
    const titleEl = document.getElementById('printModalTitle');
    const detailEl = document.getElementById('printModalDetail');
    const iconEl = document.getElementById('printModalIcon');
    const subEl = document.getElementById('printModalSub');

    const defaultTitle = (typeof _t === 'function' && _t('fk2_print_progress_title')) || 'ラベル印刷中...';
    const defaultSub = (typeof _t === 'function' && _t('fk2_print_progress_sub')) || 'プリンターにラベル印刷データを送信しています。<br>しばらくお待ちください。';

    if (titleEl) titleEl.textContent = title || defaultTitle;
    if (detailEl) detailEl.textContent = detailText || '';
    if (iconEl) iconEl.textContent = '🖨️';
    if (subEl) subEl.innerHTML = defaultSub;

    if (modal) modal.classList.add('open');
}

function updatePrintProgressSuccess(title, detailText) {
    const titleEl = document.getElementById('printModalTitle');
    const detailEl = document.getElementById('printModalDetail');
    const iconEl = document.getElementById('printModalIcon');
    const subEl = document.getElementById('printModalSub');

    const defaultTitle = (typeof _t === 'function' && _t('fk2_print_success_title')) || '印刷完了！';
    const defaultSub = (typeof _t === 'function' && _t('fk2_print_success_detail')) || '正常にラベルが発行されました。';

    if (titleEl) titleEl.textContent = title || defaultTitle;
    if (detailEl) detailEl.textContent = detailText || '';
    if (iconEl) iconEl.textContent = '✅';
    if (subEl) subEl.innerHTML = defaultSub;

    setTimeout(() => {
        closePrintProgressModal();
    }, 1800);
}

function updatePrintProgressError(errorMessage) {
    const titleEl = document.getElementById('printModalTitle');
    const iconEl = document.getElementById('printModalIcon');
    const subEl = document.getElementById('printModalSub');

    const defaultTitle = (typeof _t === 'function' && _t('fk2_print_error_title')) || '印刷エラー';

    if (titleEl) titleEl.textContent = defaultTitle;
    if (iconEl) iconEl.textContent = '⚠️';
    if (subEl) subEl.innerHTML = `<span style="color:var(--red);font-weight:800;">${errorMessage}</span><br><br>プリンターの電源・用紙・接続を確認してください。`;
}

function closePrintProgressModal() {
    const modal = document.getElementById('printProgressModal');
    if (modal) modal.classList.remove('open');
}

// Photo Lightbox Modal
function openPhotoModal(photoUrl, captionText) {
    if (!photoUrl) return;
    const modal = document.getElementById('photoModal');
    const img = document.getElementById('fullWarehousePhoto');
    const caption = document.getElementById('photoModalCaption');

    const defaultCaption = (typeof _t === 'function' && _t('fk2_photo_modal_caption')) || '現品票写真';
    if (img) img.src = photoUrl;
    if (caption) caption.textContent = captionText || defaultCaption;
    if (modal) modal.classList.add('open');
}

function closePhotoModal() {
    const modal = document.getElementById('photoModal');
    if (modal) modal.classList.remove('open');
}

// Scrap Modal
function openScrapModal() {
    if (!state.activeItem) {
        const noActiveWarn = (typeof _t === 'function' && _t('fk2_no_active_lot_toast')) || '包装中のアイテムがありません';
        showToast(noActiveWarn, 'warning');
        return;
    }
    const modal = document.getElementById('scrapModal');
    const subtitle = document.getElementById('scrapModalSubtitle');
    const chkEntire = document.getElementById('chkScrapEntireLot');

    const curRoll = state.activeItem.currentRollIndex || state.activeItem.rollIndex || 1;
    const totalRolls = state.activeItem.totalRolls || 1;

    if (subtitle) {
        const promptTemplate = (typeof _t === 'function' && _t('fk2_scrap_modal_sub')) || '現在の巻を不良として破棄し、次の巻へ進めますか？';
        subtitle.textContent = `【${state.activeItem.hinban}】Roll #${curRoll} / ${totalRolls}: ${promptTemplate}`;
    }
    if (chkEntire) chkEntire.checked = false;

    state.selectedScrapReason = 'キズ・汚れ';
    updateScrapReasonButtons();

    if (modal) modal.classList.add('open');
}

function closeScrapModal() {
    const modal = document.getElementById('scrapModal');
    if (modal) modal.classList.remove('open');
}

function selectScrapReason(reason) {
    state.selectedScrapReason = reason;
    updateScrapReasonButtons();
}

function updateScrapReasonButtons() {
    const btns = document.querySelectorAll('#scrapReasonGrid .reason-btn');
    btns.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(`'${state.selectedScrapReason}'`) || onclickAttr.includes(`"${state.selectedScrapReason}"`)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

// Finish Early Modal
function openFinishEarlyModal() {
    if (!state.activeItem) {
        const noActiveWarn = (typeof _t === 'function' && _t('fk2_no_active_lot_toast')) || '包装中のアイテムがありません';
        showToast(noActiveWarn, 'warning');
        return;
    }
    const modal = document.getElementById('finishEarlyModal');
    const plannedDisplay = document.getElementById('plannedRollsDisplay');
    const inputActual = document.getElementById('inputActualRolls');

    const total = state.activeItem.totalRolls || 1;
    const currentRoll = state.activeItem.currentRollIndex || state.activeItem.rollIndex || 1;

    if (plannedDisplay) {
        const rollCountUnit = (typeof _t === 'function' && _t('fk_roll_count')) || '巻';
        const plannedTag = (typeof _t === 'function' && _t('fk2_planned_tag')) || '予定';
        plannedDisplay.textContent = `${total} ${rollCountUnit} (${plannedTag})`;
    }
    if (inputActual) {
        inputActual.value = Math.max(0, currentRoll - 1);
        inputActual.max = total;
    }

    if (modal) modal.classList.add('open');
}

function closeFinishEarlyModal() {
    const modal = document.getElementById('finishEarlyModal');
    if (modal) modal.classList.remove('open');
}

// -----------------------------------------------------
// Schedule Cache for resolving Tablet 1 List Hinban
// -----------------------------------------------------
let scheduleCache = {
    date: null,
    itemsMap: new Map(),
    itemsByOrder: new Map()
};

async function loadDailyScheduleForTablet2(dateStr) {
    if (!dateStr) return;
    if (scheduleCache.date === dateStr && scheduleCache.itemsMap.size > 0) return;

    try {
        const month = dateStr.slice(0, 7);
        const day = parseInt(dateStr.slice(8, 10), 10);
        let scheduleDoc = null;

        try {
            const dailyRes = await fetch(`${serverURL}/api/production/schedule/daily?month=${encodeURIComponent(month)}&date=${day}`);
            if (dailyRes.ok) {
                const dailyData = await dailyRes.json();
                if (dailyData.success && dailyData.schedule) {
                    scheduleDoc = dailyData.schedule;
                }
            }
        } catch (e) { }

        if (!scheduleDoc) {
            try {
                const res = await fetch(`${serverURL}/api/production/schedule?month=${encodeURIComponent(month)}`);
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && Array.isArray(json.schedules)) {
                        scheduleDoc = json.schedules.find(s => s.month === month && Number(s.date) === day) || null;
                    }
                }
            } catch (e) { }
        }

        const itemsMap = new Map();
        const itemsByOrder = new Map();

        if (scheduleDoc && Array.isArray(scheduleDoc.scheduleOrder)) {
            scheduleDoc.scheduleOrder.forEach((it, idx) => {
                const displayCode = it.kizai || it.hinban;
                if (displayCode) {
                    if (it.hinban) itemsMap.set(it.hinban, displayCode);
                    if (it.id) itemsMap.set(it.id, displayCode);
                    if (it.orderIndex !== undefined) itemsByOrder.set(Number(it.orderIndex), displayCode);
                    itemsMap.set(`group_${it.hinban}_${idx}`, displayCode);
                }
            });
        }

        scheduleCache = {
            date: dateStr,
            itemsMap,
            itemsByOrder,
            scheduleOrder: scheduleDoc && Array.isArray(scheduleDoc.scheduleOrder) ? scheduleDoc.scheduleOrder : []
        };
    } catch (err) {
        console.warn('Could not cache schedule for Tablet 2:', err);
    }
}

function getTablet1Hinban(item) {
    if (!item) return '品番未設定';

    // 1. Check schedule lookup
    if (scheduleCache && scheduleCache.itemsMap) {
        if (item.groupId && scheduleCache.itemsMap.has(item.groupId)) {
            return scheduleCache.itemsMap.get(item.groupId);
        }
        if (item.itemId && scheduleCache.itemsMap.has(item.itemId)) {
            return scheduleCache.itemsMap.get(item.itemId);
        }
        if (item.orderIndex !== undefined && scheduleCache.itemsByOrder.has(Number(item.orderIndex))) {
            return scheduleCache.itemsByOrder.get(Number(item.orderIndex));
        }
        if (item.hinban && scheduleCache.itemsMap.has(item.hinban)) {
            return scheduleCache.itemsMap.get(item.hinban);
        }
        if (item.groupId && typeof item.groupId === 'string' && item.groupId.startsWith('group_')) {
            const rawKey = item.groupId.replace(/^group_/, '').replace(/_\d+$/, '');
            if (scheduleCache.itemsMap.has(rawKey)) {
                return scheduleCache.itemsMap.get(rawKey);
            }
        }
    }

    // 2. Fallback to item.kizai or item.hinban
    return item.kizai || item.hinban || '品番未設定';
}

function getTablet1OrderIndex(item, fallback) {
    if (item && item.orderIndex !== undefined && item.orderIndex !== null && item.orderIndex !== '' && !isNaN(Number(item.orderIndex))) {
        return item.orderIndex;
    }
    if (scheduleCache && Array.isArray(scheduleCache.scheduleOrder) && item) {
        const matched = scheduleCache.scheduleOrder.find(s =>
            (item.itemId && s.id === item.itemId) ||
            (item.groupId && s.groupId === item.groupId && Number(s.rollIndex) === Number(item.rollIndex)) ||
            (s.hinban === item.hinban && (Number(s.rollIndex) === Number(item.rollIndex) || Number(s.orderIndex) === Number(item.orderIndex)))
        );
        if (matched && matched.orderIndex) return matched.orderIndex;
    }
    return fallback;
}

// -----------------------------------------------------
// Fetch Production Queue from API
// -----------------------------------------------------
async function fetchProductionQueue(showLoading = false) {
    if (!state.machineName) {
        console.warn('⚠️ No machine specified in URL params (?machine=...). Waiting for URL parameter.');
        state.queue = [];
        state.activeItem = null;
        state.waitingItems = [];
        state.completedItems = [];
        renderApp();
        return;
    }
    if (state.isLoadingQueue && !showLoading) return;
    state.isLoadingQueue = true;

    try {
        const url = `${serverURL}/api/production/queue?date=${encodeURIComponent(state.selectedDate)}&machine=${encodeURIComponent(state.machineName)}`;
        console.log(`📥 Fetching production queue: ${url}`);

        await Promise.all([
            fetch(url).then(async response => {
                if (!response.ok) {
                    throw new Error(`Queue fetch failed: HTTP ${response.status}`);
                }
                const data = await response.json();
                const rawQueue = Array.isArray(data.queue) ? data.queue : [];

                // Partition into Active, Queued (Waiting), and Completed
                const active = rawQueue.find(item => item.status === 'active') ||
                    rawQueue.find(item => item.status === 'in-progress');
                const queued = rawQueue.filter(item =>
                    item !== active && (
                        item.status === 'queued' ||
                        item.status === 'queue' ||
                        (item.status !== 'active' && item.status !== 'in-progress' && item.status !== 'completed' && item.status !== 'scrapped')
                    )
                );
                const completed = rawQueue.filter(item => item.status === 'completed' || item.status === 'scrapped');

                // Sort queued items by orderIndex if available, then queuePosition/createdAt
                queued.sort((a, b) => {
                    const oA = (a.orderIndex !== undefined && a.orderIndex !== null && !isNaN(Number(a.orderIndex))) ? Number(a.orderIndex) : null;
                    const oB = (b.orderIndex !== undefined && b.orderIndex !== null && !isNaN(Number(b.orderIndex))) ? Number(b.orderIndex) : null;
                    if (oA !== null && oB !== null && oA !== oB) return oA - oB;
                    const qA = Number(a.queuePosition) || 0;
                    const qB = Number(b.queuePosition) || 0;
                    if (qA !== qB) return qA - qB;
                    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
                });

                state.queue = rawQueue;
                state.activeItem = active || null;
                state.waitingItems = queued;
                state.completedItems = completed;

                // If no item is explicitly active, but there are queued items, default the first one as active target
                if (!state.activeItem && queued.length > 0) {
                    state.activeItem = queued[0];
                    state.waitingItems = queued.slice(1);
                }
                saveLocalQueue();
            }),
            loadDailyScheduleForTablet2(state.selectedDate)
        ]);

        renderApp();
    } catch (err) {
        console.warn('Could not fetch queue from server:', err);
        // If server is unavailable, fallback to localStorage cache
        fallbackToLocalQueue();
    } finally {
        state.isLoadingQueue = false;
    }
}

function fallbackToLocalQueue() {
    const cacheKey = `firstkojo2_queue_${state.selectedDate}_${state.machineName}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const list = JSON.parse(cached);
            state.queue = list;
            state.activeItem = list.find(i => i.status === 'active') || list.find(i => i.status === 'in-progress') || list[0] || null;
            state.waitingItems = list.filter(i => i !== state.activeItem && i.status !== 'completed' && i.status !== 'scrapped');
            renderApp();
            return;
        } catch {
            // ignore
        }
    }
    renderApp();
}

function saveLocalQueue() {
    const cacheKey = `firstkojo2_queue_${state.selectedDate}_${state.machineName}`;
    localStorage.setItem(cacheKey, JSON.stringify(state.queue));
}

// -----------------------------------------------------
// Render App UI
// -----------------------------------------------------
function renderApp() {
    renderHeroCard();
    renderQueueSection();
    renderHistory();
    updateLastPrintedInfo();
    updateHistoryBadges();
}

function renderHeroCard() {
    const wrapper = document.getElementById('heroCardWrapper');
    if (!wrapper) return;

    const item = state.activeItem;

    if (!item) {
        if (!state.machineName) {
            const noMachineTitle = (typeof _t === 'function' && _t('fk2_no_machine_title')) || '設備（machine）パラメータが指定されていません';
            const noMachineDesc = (typeof _t === 'function' && _t('fk2_no_machine_desc')) || 'URLに設備パラメータが付与されていません。<br>例: <code>?machine=PSA2&filter=第一工場</code> のように設備名を指定して開いてください。';
            wrapper.innerHTML = `
                <div class="empty-queue-card" style="border-color: #FCA5A5; background: #FFFBFB;">
                    <div class="empty-icon" style="background: #FEE2E2; color: #DC2626;">⚠️</div>
                    <h2 class="empty-title" style="color: #DC2626;">${noMachineTitle}</h2>
                    <p class="empty-subtitle">
                        ${noMachineDesc}
                    </p>
                </div>
            `;
            return;
        }

        // Empty State Placeholder
        const emptyTitle = (typeof _t === 'function' && _t('fk2_no_active_title')) || '待機中: 投入工程からの登録を待っています';
        const emptyDesc = (typeof _t === 'function' && _t('fk2_no_active_desc')) || '投入工程（Tablet 1）で原反QRまたは現品票写真が登録されると、自動的にここに表示されます。';
        const refreshQueueText = (typeof _t === 'function' && _t('fk2_refresh_queue')) || '🔄 キューを再確認';

        wrapper.innerHTML = `
            <div class="empty-queue-card">
                <div class="empty-icon">📦</div>
                <h2 class="empty-title">${emptyTitle}</h2>
                <p class="empty-subtitle">
                    ${emptyDesc}
                </p>
                <div class="empty-actions">
                    <button type="button" class="btn-edge" onclick="fetchProductionQueue(true)">
                        ${refreshQueueText}
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const curRoll = Number(item.currentRollIndex || item.rollIndex || 1);
    const totalRolls = Number(item.totalRolls) || 1;
    const hinban = getTablet1Hinban(item);
    const listNum = getTablet1OrderIndex(item, null);
    const color = item.color || '標準';
    const metersPerRoll = item.rollMeters || item.metersPerRoll || item.meters || 100;
    const photoUrl = item.imageUrl || item.photoUrl || '';

    const rollUnit = (typeof _t === 'function' && _t('fk_roll_unit')) || '巻き';
    const metersPerRollText = (typeof _t === 'function' && _t('fk2_meters_per_roll')) || 'm / 巻';
    const photoCaption = (typeof _t === 'function' && _t('fk2_photo_modal_caption')) || '現品票写真';
    const tapToEnlarge = (typeof _t === 'function' && _t('fk2_tap_to_enlarge')) || 'タップで拡大';
    const noPhotoText = (typeof _t === 'function' && _t('fk2_no_photo')) || '現品票写真なし';
    const mainPrintLabel = (typeof _t === 'function' && _t('fk2_main_print_label')) || 'ラベル印刷 (Print Roll Label)';
    const subPrintSuffix = (typeof _t === 'function' && _t('fk2_sub_print_label')) || 'のラベルを発行して次へ';
    const reprintLabel = (typeof _t === 'function' && _t('fk2_btn_reprint')) || '直前再印刷';
    const cantPrintLabel = (typeof _t === 'function' && _t('fk2_btn_cant_print')) || '印刷不可・次へ';
    const scrapLabel = (typeof _t === 'function' && _t('fk2_btn_scrap')) || '1巻破棄';
    const finishEarlyLabel = (typeof _t === 'function' && _t('fk2_btn_finish_early')) || '中途完了';

    const titleReprint = (typeof _t === 'function' && _t('fk2_title_reprint')) || '直前に印刷したラベルをそのまま再発行します';
    const titleCantPrint = (typeof _t === 'function' && _t('fk2_title_cant_print')) || 'プリンター障害等で印刷できない場合に手動で完了して次へ進めます';
    const titleScrap = (typeof _t === 'function' && _t('fk2_title_scrap')) || 'キズ・シワなどの不良で1巻破棄して次へ';
    const titleFinishEarly = (typeof _t === 'function' && _t('fk2_title_finish_early')) || '材料不足などで予定巻き数より早く終了';

    wrapper.innerHTML = `
        <div class="hero-wrapping-card has-active">
            <!-- Hinban Row: Exactly matching Tablet 1 List Tab (Now on top) -->
            <div class="hinban-hero-row">
                <div class="hinban-display">${escapeHtml(hinban)}</div>
            </div>

            <!-- Header of Hero: Metadata row (Below Name) -->
            <div class="hero-card-header">
                <div class="hero-meta-text">
                    ${listNum ? `<span class="roll-sub-badge" style="font-size: 0.825rem; font-weight: 800; color: #1E293B; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 2px 8px; border-radius: 6px;">#${listNum}</span><span class="hero-meta-divider">•</span>` : ''}
                    <span>Roll <strong style="font-size: 1.1rem;">${curRoll}</strong> / ${totalRolls} ${rollUnit}</span>
                    <span class="hero-meta-divider">•</span>
                    <span><strong>${metersPerRoll}</strong>${metersPerRollText}</span>
                    <span class="hero-meta-divider">•</span>
                    <span><strong>${escapeHtml(color)}</strong></span>
                </div>
            </div>

            <!-- Compact Work Row: Warehouse Photo Thumbnail + Print Actions side-by-side -->
            <div class="hero-work-row">
                <!-- Thumbnail Preview -->
                <div class="photo-preview-box" onclick="openPhotoModal('${photoUrl}', '${escapeHtml(hinban)} - ${escapeHtml(photoCaption)}')" title="${escapeHtml(tapToEnlarge)}">
                    ${photoUrl ? `
                        <img src="${photoUrl}" alt="${escapeHtml(photoCaption)}">
                        <div class="photo-badge-overlay">
                            <span>🔍</span>
                            <span>${escapeHtml(tapToEnlarge)}</span>
                        </div>
                    ` : `
                        <div class="photo-placeholder">
                            <span class="photo-placeholder-icon">📷</span>
                            <span class="photo-placeholder-text">${escapeHtml(noPhotoText)}</span>
                        </div>
                    `}
                </div>

                <!-- Print Action & Edge Controls -->
                <div class="hero-actions-box">
                    <button type="button" class="btn-massive-print" id="btnPrintRollLabel" onclick="handlePrintRollLabel()">
                        <span class="print-icon">🖨️</span>
                        <div class="print-text-group">
                            <span class="main-print-label">${escapeHtml(mainPrintLabel)}</span>
                            <span class="sub-print-label">Roll ${curRoll} / ${totalRolls} ${escapeHtml(subPrintSuffix)}</span>
                        </div>
                    </button>

                    <div class="edge-controls-bar">
                        <button type="button" class="btn-edge reprint-btn" onclick="handleReprintLastRoll()" title="${escapeHtml(titleReprint)}">
                            <span>🔄</span>
                            <span>${escapeHtml(reprintLabel)}</span>
                        </button>
                        <button type="button" class="btn-edge cant-print-btn" onclick="handleCantPrintAdvance()" title="${escapeHtml(titleCantPrint)}">
                            <span>⚠️</span>
                            <span>${escapeHtml(cantPrintLabel)}</span>
                        </button>
                        <button type="button" class="btn-edge skip-btn" onclick="openScrapModal()" title="${escapeHtml(titleScrap)}">
                            <span>🗑️</span>
                            <span>${escapeHtml(scrapLabel)}</span>
                        </button>
                        <button type="button" class="btn-edge finish-btn" onclick="openFinishEarlyModal()" title="${escapeHtml(titleFinishEarly)}">
                            <span>🏁</span>
                            <span>${escapeHtml(finishEarlyLabel)}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderQueueSection() {
    const container = document.getElementById('queueGridContainer');
    const badge = document.getElementById('queueCountBadge');
    if (!container) return;

    const items = state.waitingItems || [];
    const countUnit = (typeof _t === 'function' && _t('count_unit')) || '件';
    if (badge) badge.textContent = `${items.length}${countUnit}`;

    if (items.length === 0) {
        const noWaitingText = (typeof _t === 'function' && _t('fk2_no_waiting')) || '次工程キューに待機中のロットはありません';
        container.innerHTML = `
            <div style="grid-column: 1 / -1; background: var(--bg-surface); border: 1px dashed var(--border-strong); border-radius: var(--card-radius); padding: 36px 20px; text-align: center; color: var(--text-soft); font-weight: 700; box-shadow: var(--shadow-card);">
                ${escapeHtml(noWaitingText)}
            </div>
        `;
        return;
    }

    const rollCountUnit = (typeof _t === 'function' && _t('fk_roll_count')) || '巻';
    const plannedTag = (typeof _t === 'function' && _t('fk2_planned_tag')) || '予定';
    const customerPrefix = (typeof _t === 'function' && _t('fk2_customer_hinban')) || '客品番';
    const photoCaption = (typeof _t === 'function' && _t('fk2_photo_modal_caption')) || '現品票';

    container.innerHTML = items.map((item, index) => {
        const listNum = getTablet1OrderIndex(item, index + 1);
        const hinban = getTablet1Hinban(item);
        const color = item.color || '標準';
        const hinmei = item.hinmei || '-';
        const okyakuHinban = item.okyakuHinban || '';
        const rolls = item.totalRolls || 1;
        const photoUrl = item.imageUrl || item.photoUrl || '';
        const qId = item._id || item.queueId || '';

        return `
            <div class="queue-item-card" onclick="handleSelectQueueItem('${qId}', '${escapeHtml(hinban)}')">
                <div class="queue-card-top">
                    <div class="queue-pos-badge">#${listNum}</div>
                    <div class="queue-rolls-tag">${rolls} ${rollCountUnit} ${plannedTag}</div>
                </div>

                <div class="queue-item-body">
                    <div class="queue-thumb" onclick="event.stopPropagation(); openPhotoModal('${photoUrl}', '${escapeHtml(hinban)} - ${escapeHtml(photoCaption)}')">
                        ${photoUrl ? `<img src="${photoUrl}" alt="Photo">` : '📷'}
                    </div>
                    <div class="queue-info">
                        <div class="queue-hinban">${escapeHtml(hinban)}</div>
                        <div class="queue-color-hinmei">${escapeHtml(color)} · ${escapeHtml(hinmei)}</div>
                        ${okyakuHinban ? `<div class="queue-customer">${escapeHtml(customerPrefix)}: ${escapeHtml(okyakuHinban)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateLastPrintedInfo() {
    const el = document.getElementById('lastPrintedInfo');
    if (!el) return;
    if (state.lastPrinted) {
        const lastPrintedPrefix = (typeof _t === 'function' && _t('fk2_last_printed')) || '最終印刷';
        const timeStr = state.lastPrinted.timeStr || (new Date(state.lastPrinted.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
        el.textContent = `${lastPrintedPrefix}: [${state.lastPrinted.hinban}] Roll ${state.lastPrinted.rollIndex}/${state.lastPrinted.totalRolls} (${timeStr})`;
    } else {
        el.textContent = '';
    }
}

function calcLotNumber(rollIndex) {
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
    return `${yymmdd}-${rollIndex || 1}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// -----------------------------------------------------
// Tab & History Navigation for Tablet 2
// -----------------------------------------------------
function switchTablet2Tab(tabName) {
    state.currentTab = tabName;
    const tabBtnWork = document.getElementById('tabBtnWork');
    const tabBtnHistory = document.getElementById('tabBtnHistory');
    const viewWork = document.getElementById('viewWork');
    const viewHistory = document.getElementById('viewHistory');

    if (tabName === 'history') {
        if (tabBtnWork) tabBtnWork.classList.remove('active');
        if (tabBtnHistory) tabBtnHistory.classList.add('active');
        if (viewWork) viewWork.style.display = 'none';
        if (viewHistory) viewHistory.style.display = 'block';
        renderHistory();
    } else {
        if (tabBtnWork) tabBtnWork.classList.add('active');
        if (tabBtnHistory) tabBtnHistory.classList.remove('active');
        if (viewWork) viewWork.style.display = 'block';
        if (viewHistory) viewHistory.style.display = 'none';
        renderHeroCard();
        renderQueueSection();
    }
}

function setHistoryView(viewType) {
    state.historyView = viewType;
    const btnCard = document.getElementById('btnHistViewCard');
    const btnList = document.getElementById('btnHistViewList');

    if (btnCard) btnCard.classList.toggle('active', viewType === 'card');
    if (btnList) btnList.classList.toggle('active', viewType === 'list');

    renderHistory();
}

function updateHistoryBadges() {
    const completedBadge = document.getElementById('historyCompletedCountBadge');
    const scrappedBadge = document.getElementById('historyScrappedCountBadge');
    const navHistoryBadge = document.getElementById('navHistoryBadge');
    const navQueueBadge = document.getElementById('navQueueBadge');

    const completedDocs = state.completedItems || [];
    const completedCount = completedDocs.filter(it => it && it.status !== 'scrapped' && it.status !== 'skipped').length;
    const scrappedCount = completedDocs.filter(it => it && (it.status === 'scrapped' || it.status === 'skipped')).length;

    const completedText = (typeof _t === 'function' && _t('fk_status_completed')) || '完了';
    const scrappedText = (typeof _t === 'function' && _t('fk2_btn_scrap')) || '破棄/スキップ';
    const rollCountUnit = (typeof _t === 'function' && _t('fk_roll_count')) || '巻';

    if (completedBadge) completedBadge.textContent = `${completedText}: ${completedCount} ${rollCountUnit}`;
    if (scrappedBadge) scrappedBadge.textContent = `${scrappedText}: ${scrappedCount} ${rollCountUnit}`;

    if (navHistoryBadge) {
        navHistoryBadge.textContent = String(completedDocs.length);
        navHistoryBadge.style.display = completedDocs.length > 0 ? 'inline-block' : 'none';
    }

    const waitingCount = (state.waitingItems || []).length + (state.activeItem ? 1 : 0);
    if (navQueueBadge) {
        navQueueBadge.textContent = String(waitingCount);
        navQueueBadge.style.display = waitingCount > 0 ? 'inline-block' : 'none';
    }
}

function renderHistory() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    updateHistoryBadges();

    if (state.historyView === 'list') {
        container.classList.remove('history-flat-list');
        container.innerHTML = renderHistoryTableView();
    } else {
        container.classList.add('history-flat-list');
        container.innerHTML = renderHistoryCardView();
    }
}

function renderHistoryCardView() {
    const completedDocs = state.completedItems || [];
    if (completedDocs.length === 0) {
        const emptyText = (typeof _t === 'function' && _t('fk_history_empty')) || '完了した履歴項目がありません (No completed history)';
        return `
            <div class="staging-queue-empty">
                ${emptyText}
            </div>
        `;
    }

    const items = completedDocs.map((doc, qIdx) => {
        let matchedSched = null;
        if (scheduleCache && Array.isArray(scheduleCache.scheduleOrder)) {
            matchedSched = scheduleCache.scheduleOrder.find(s =>
                (doc.itemId && s.id === doc.itemId) ||
                (doc._id && s.id === doc._id) ||
                (doc.groupId && s.groupId === doc.groupId && Number(s.rollIndex) === Number(doc.rollIndex)) ||
                (s.hinban === doc.hinban && (Number(s.rollIndex) === Number(doc.rollIndex) || Number(s.orderIndex) === Number(doc.orderIndex))) ||
                (s.kizai === doc.kizai && Number(s.orderIndex) === Number(doc.orderIndex))
            );
        }

        let orderIndex = doc.orderIndex;
        if (!orderIndex || isNaN(Number(orderIndex))) {
            if (matchedSched && matchedSched.orderIndex) {
                orderIndex = matchedSched.orderIndex;
            } else if (scheduleCache && Array.isArray(scheduleCache.scheduleOrder)) {
                const foundIdx = scheduleCache.scheduleOrder.findIndex(s => s.hinban === doc.hinban || s.kizai === doc.kizai);
                if (foundIdx !== -1) orderIndex = foundIdx + 1;
            }
        }
        if (!orderIndex) orderIndex = doc.queuePosition || (qIdx + 1);

        const curRoll = Number(doc.currentRollIndex || doc.rollIndex || 1);
        const totalRolls = Number(doc.totalRolls) || 1;
        const hinban = (matchedSched && (matchedSched.kizai || matchedSched.hinban)) || getTablet1Hinban(doc) || doc.kizai || doc.hinban || '品番未設定';
        const color = doc.color || matchedSched?.color || '標準';
        const meters = doc.metersPerRoll || doc.rollMeters || doc.meters || doc.bicho || matchedSched?.meters || 0;
        const photoUrl = doc.imageUrl || doc.photoUrl || '';
        const status = doc.status || 'completed';
        const completedAt = doc.completedAt || doc.actualEndTime || doc.updatedAt || doc.createdAt;
        const worker = doc.wrapperWorker || doc.worker || '';
        const docId = String(doc._id || doc.queueId || doc.itemId || qIdx);

        return {
            doc,
            docId,
            orderIndex: Number(orderIndex) || (qIdx + 1),
            curRoll,
            totalRolls,
            hinban,
            color,
            meters,
            photoUrl,
            status,
            completedAt,
            worker
        };
    });

    // Sort by orderIndex ascending
    items.sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));

    const photoCaption = (typeof _t === 'function' && _t('fk2_photo_modal_caption')) || '現品票写真';
    const tapToEnlarge = (typeof _t === 'function' && _t('fk2_tap_to_enlarge')) || 'タップで拡大';
    const reprintText = (typeof _t === 'function' && _t('fk2_btn_reprint')) || '再印刷';

    return items.map(it => {
        let timeStr = '—';
        if (it.completedAt) {
            const d = new Date(it.completedAt);
            if (!isNaN(d.getTime())) {
                timeStr = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            } else if (typeof it.completedAt === 'string') {
                timeStr = it.completedAt;
            }
        }

        const isScrapped = it.status === 'scrapped' || it.status === 'skipped';
        const statusPill = isScrapped
            ? `<span class="history-type-badge history-type-excluded" style="background:#FEE2E2; color:#DC2626; border-color:#FCA5A5;">破棄/スキップ</span>`
            : `<span class="history-type-badge history-type-enqueued" style="background:#ECFDF5; color:#059669; border-color:#A7F3D0;">包装完了・印刷済</span>`;

        return `
            <div class="history-row ${isScrapped ? 'status-excluded' : 'status-enqueued'}" onclick="handleHistoryItemClick('${escapeHtml(it.docId)}')">
                <div class="history-left">
                    <div class="history-pos-badge" style="font-size: 0.95rem; font-weight: 800; color: #1E293B; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 4px 10px; border-radius: 8px; flex-shrink: 0;">#${it.orderIndex}</div>

                    ${it.photoUrl ? `
                        <img src="${it.photoUrl}" class="history-thumb" alt="Photo" onclick="event.stopPropagation(); openPhotoModal('${it.photoUrl}', '${escapeHtml(it.hinban)} - ${escapeHtml(photoCaption)}')" title="${escapeHtml(tapToEnlarge)}">
                    ` : `
                        <div class="history-thumb-placeholder">📷</div>
                    `}

                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span class="history-title">${escapeHtml(it.hinban)}</span>
                            ${statusPill}
                        </div>
                        <div class="history-meta">
                            <span>Roll <strong>${it.curRoll}</strong> / ${it.totalRolls} 巻</span>
                            <span>•</span>
                            <span><strong>${it.meters}</strong> m</span>
                            <span>•</span>
                            <span>${escapeHtml(it.color)}</span>
                            ${timeStr !== '—' ? `<span>•</span><span>完了: <strong>${escapeHtml(timeStr)}</strong></span>` : ''}
                            ${it.worker ? `<span>•</span><span>担当: <strong>${escapeHtml(it.worker)}</strong></span>` : ''}
                        </div>
                    </div>
                </div>

                <div class="history-right" onclick="event.stopPropagation();">
                    <button type="button" class="btn-edge reprint-btn" onclick="handleHistoryReprint('${escapeHtml(it.docId)}', ${it.curRoll}, ${it.totalRolls})" style="padding: 6px 14px; font-size: 0.825rem; font-weight: 700;" title="このロールのラベルをBrotherプリンターで再印刷">
                        <span>🔄</span>
                        <span>${escapeHtml(reprintText)}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderHistoryTableView() {
    const completedDocs = state.completedItems || [];

    if (completedDocs.length === 0) {
        const emptyText = (typeof _t === 'function' && _t('fk_history_empty')) || '完了した履歴項目がありません (No completed history)';
        return `
            <div class="staging-queue-empty">
                ${emptyText}
            </div>
        `;
    }

    const historyItems = [];
    completedDocs.forEach((doc, qIdx) => {
        let matchedSched = null;
        if (scheduleCache && Array.isArray(scheduleCache.scheduleOrder)) {
            matchedSched = scheduleCache.scheduleOrder.find(s =>
                (doc.itemId && s.id === doc.itemId) ||
                (doc._id && s.id === doc._id) ||
                (doc.groupId && s.groupId === doc.groupId && Number(s.rollIndex) === Number(doc.rollIndex)) ||
                (s.hinban === doc.hinban && (Number(s.rollIndex) === Number(doc.rollIndex) || Number(s.orderIndex) === Number(doc.orderIndex))) ||
                (s.kizai === doc.kizai && Number(s.orderIndex) === Number(doc.orderIndex))
            );
        }

        let orderIndex = doc.orderIndex;
        if (!orderIndex || isNaN(Number(orderIndex))) {
            if (matchedSched && matchedSched.orderIndex) {
                orderIndex = matchedSched.orderIndex;
            } else if (scheduleCache && Array.isArray(scheduleCache.scheduleOrder)) {
                const foundIdx = scheduleCache.scheduleOrder.findIndex(s => s.hinban === doc.hinban || s.kizai === doc.kizai);
                if (foundIdx !== -1) orderIndex = foundIdx + 1;
            }
        }
        if (!orderIndex) orderIndex = doc.queuePosition || (qIdx + 1);

        const kizaiName = (matchedSched && (matchedSched.kizai || matchedSched.hinban)) || getTablet1Hinban(doc) || doc.kizai || doc.hinban || '材料';

        historyItems.push({
            itemId: doc.itemId || doc._id || doc.queueId || String(qIdx + 1),
            mongoId: doc._id,
            orderIndex: Number(orderIndex) || (qIdx + 1),
            startTime: doc.actualStartTime || matchedSched?.startTime || '',
            endTime: doc.actualEndTime || matchedSched?.endTime || '',
            completedAt: doc.completedAt || doc.updatedAt || doc.createdAt || '',
            shippingDest: (matchedSched && matchedSched.shippingDest) || doc.shippingDest || '—',
            kizai: kizaiName,
            shori: (matchedSched && matchedSched.shori) || doc.shori || '—',
            color: doc.color || (matchedSched && matchedSched.color) || '—',
            habanaga: (matchedSched && matchedSched.habanaga) || doc.habanaga || '—',
            kataban: (matchedSched && matchedSched.kataban) || doc.kataban || '—',
            timeOption: matchedSched?.timeOption || doc.timeOption || '',
            rollIndex: doc.currentRollIndex || doc.rollIndex || matchedSched?.rollIndex || 1,
            totalRolls: doc.totalRolls || matchedSched?.totalRolls || 1,
            meters: doc.metersPerRoll || doc.rollMeters || doc.meters || doc.bicho || matchedSched?.meters || 0,
            unit: doc.unit || matchedSched?.unit || 'm',
            status: doc.status || 'completed',
            rawDoc: doc
        });
    });

    // Sort by orderIndex ascending
    historyItems.sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));

    let totalMeters = 0;
    let totalPieces = 0;
    let lastKizai = null;
    const rows = [];

    historyItems.forEach((item) => {
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

        const isScrapped = item.status === 'scrapped' || item.status === 'skipped';

        rows.push(`
            <tr class="item-row ${isScrapped ? 'scrapped-row' : ''}" style="cursor: pointer;" onclick="handleHistoryItemClick('${escapeHtml(String(item.itemId))}')" title="クリックでロール詳細・再印刷">
                <td class="center font-bold">${item.orderIndex}</td>
                <td class="center time-cell">${timeDisplay}</td>
                <td class="center dest-cell">${formattedDest}</td>
                <td class="left kizai-cell">${escapeHtml(item.kizai)}${isScrapped ? ' <span style="color:var(--red); font-size:0.75rem;">(破棄)</span>' : ''}</td>
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

async function handleHistoryReprint(itemId, rollIndex, totalRolls) {
    const item = (state.completedItems || []).find(d =>
        String(d._id) === String(itemId) ||
        String(d.queueId) === String(itemId) ||
        String(d.itemId) === String(itemId)
    );
    if (!item) {
        showToast('履歴データが見つかりません', 'warning');
        return;
    }

    const curRoll = Number(rollIndex) || Number(item.currentRollIndex || item.rollIndex || 1);
    const total = Number(totalRolls) || Number(item.totalRolls || 1);
    const hinban = getTablet1Hinban(item) || item.hinban || '品番';

    const confirmed = confirm(
        `【ラベル再印刷の確認】\n\n品番: ${hinban}\nRoll: ${curRoll} / ${total}\n\nこの完了済みロールのラベルをプリンターへ送信しますか？`
    );
    if (!confirmed) return;

    const fields = buildBrotherPrintFields(item, curRoll, total);
    showPrintProgressModal('再印刷中...', `【${hinban}】Roll ${curRoll} / ${total}`);

    try {
        const result = await executeBrotherPrint(fields);
        if (!result.success && !result.isConnectionRefused) {
            updatePrintProgressError(result.error || '再印刷エラー');
            return;
        }

        playChime('success');
        updatePrintProgressSuccess('再印刷完了', `Roll ${curRoll} / ${total}`);
        showToast(`🔄 [${hinban}] Roll ${curRoll} を再印刷しました`, 'success');
    } catch (err) {
        updatePrintProgressError(err.message || '再印刷に失敗しました');
    }
}

function handleHistoryItemClick(itemId) {
    const item = (state.completedItems || []).find(d =>
        String(d._id) === String(itemId) ||
        String(d.queueId) === String(itemId) ||
        String(d.itemId) === String(itemId)
    );
    if (!item) return;

    let matchedSched = null;
    if (scheduleCache && Array.isArray(scheduleCache.scheduleOrder)) {
        matchedSched = scheduleCache.scheduleOrder.find(s =>
            (item.itemId && s.id === item.itemId) ||
            (item._id && s.id === item._id) ||
            (item.groupId && s.groupId === item.groupId && Number(s.rollIndex) === Number(item.rollIndex)) ||
            (s.hinban === item.hinban && (Number(s.rollIndex) === Number(item.rollIndex) || Number(s.orderIndex) === Number(item.orderIndex))) ||
            (s.kizai === item.kizai && Number(s.orderIndex) === Number(item.orderIndex))
        );
    }

    const orderIndex = item.orderIndex || matchedSched?.orderIndex || item.queuePosition || 1;
    const curRoll = Number(item.currentRollIndex || item.rollIndex || 1);
    const totalRolls = Number(item.totalRolls || 1);
    const hinban = (matchedSched && (matchedSched.kizai || matchedSched.hinban)) || getTablet1Hinban(item) || item.kizai || item.hinban || '品番未設定';
    const color = item.color || matchedSched?.color || '標準';
    const dest = (matchedSched && matchedSched.shippingDest) || item.shippingDest || '—';
    const meters = item.metersPerRoll || item.rollMeters || item.meters || item.bicho || matchedSched?.meters || 0;
    const photoUrl = item.imageUrl || item.photoUrl || '';
    const completedAt = item.completedAt || item.actualEndTime || item.updatedAt || '';
    const worker = item.wrapperWorker || item.worker || '包装担当';
    const status = item.status || 'completed';

    let timeStr = '—';
    if (completedAt) {
        const d = new Date(completedAt);
        if (!isNaN(d.getTime())) {
            timeStr = `${d.toLocaleDateString('ja-JP')} ${d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            timeStr = String(completedAt);
        }
    }

    const modal = document.getElementById('historyDetailModal');
    if (!modal) return;

    const titleEl = document.getElementById('histModalTitle');
    const subEl = document.getElementById('histModalSubtitle');
    const bodyEl = document.getElementById('histModalBody');
    const reprintBtn = document.getElementById('btnHistModalReprint');

    if (titleEl) titleEl.textContent = `${hinban} (#${orderIndex})`;
    if (subEl) subEl.textContent = `Roll ${curRoll} / ${totalRolls} 巻 · ${meters}m · ${color}`;

    if (bodyEl) {
        const photoCaption = (typeof _t === 'function' && _t('fk2_photo_modal_caption')) || '現品票写真';
        const tapToEnlarge = (typeof _t === 'function' && _t('fk2_tap_to_enlarge')) || 'タップで拡大';

        bodyEl.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: var(--bg-inset); border: 1px solid var(--border); border-radius: var(--btn-radius); padding: 12px 14px; font-size: 0.85rem;">
                <div><span style="color: var(--text-soft); font-weight: 700;">状態:</span> <strong style="color: ${status === 'scrapped' ? 'var(--red)' : 'var(--brand)'};">${status === 'scrapped' ? '破棄/スキップ' : '包装完了・印刷済'}</strong></div>
                <div><span style="color: var(--text-soft); font-weight: 700;">出荷先:</span> <strong>${escapeHtml(dest)}</strong></div>
                <div><span style="color: var(--text-soft); font-weight: 700;">完了日時:</span> <strong>${escapeHtml(timeStr)}</strong></div>
                <div><span style="color: var(--text-soft); font-weight: 700;">作業担当:</span> <strong>${escapeHtml(worker)}</strong></div>
            </div>

            ${photoUrl ? `
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 0.825rem; font-weight: 700; color: var(--text-soft);">${escapeHtml(photoCaption)}:</span>
                    <div style="position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); max-height: 180px; cursor: pointer;" onclick="openPhotoModal('${photoUrl}', '${escapeHtml(hinban)} - ${escapeHtml(photoCaption)}')">
                        <img src="${photoUrl}" alt="Photo" style="width: 100%; height: 180px; object-fit: cover;">
                        <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.65); color: #fff; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: var(--r-pill);">
                            🔍 ${escapeHtml(tapToEnlarge)}
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    }

    if (reprintBtn) {
        reprintBtn.onclick = () => {
            closeHistoryDetailModal();
            handleHistoryReprint(itemId, curRoll, totalRolls);
        };
    }

    modal.classList.add('open');
}

function closeHistoryDetailModal() {
    const modal = document.getElementById('historyDetailModal');
    if (modal) modal.classList.remove('open');
}

// -----------------------------------------------------
// Print Action: Primary
// -----------------------------------------------------
async function handlePrintRollLabel() {
    if (!state.activeItem) {
        showToast('包装対象のロットがありません', 'warning');
        return;
    }
    if (state.isPrinting) return;
    state.isPrinting = true;

    const item = state.activeItem;
    const curRoll = Number(item.currentRollIndex || item.rollIndex || 1);
    const totalRolls = Number(item.totalRolls) || 1;

    // Build fields
    const fields = buildBrotherPrintFields(item, curRoll, totalRolls);
    console.log(`🖨️ Printing Roll ${curRoll}/${totalRolls} for [${item.hinban}]:`, fields);

    showPrintProgressModal('ラベル印刷中...', `【${item.hinban}】Roll ${curRoll} / ${totalRolls}`);

    try {
        const printResult = await executeBrotherPrint(fields);

        // Strictly check for print success - DO NOT ADVANCE if printing failed
        if (!printResult.success) {
            console.warn('Printer warning/error:', printResult.error);
            updatePrintProgressError(printResult.error || 'プリンターエラー (印刷未完了)');
            state.isPrinting = false;
            showToast('❌ 印刷に失敗しました。プリンターを確認してください。（障害時は「印刷不可・次へ」ボタンで進めます）', 'error', 6000);
            return;
        }

        // On confirmed print success:
        playChime('success');
        updatePrintProgressSuccess('印刷完了！', `Roll ${curRoll} / ${totalRolls} を発行しました`);

        // Record last printed
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        state.lastPrinted = {
            fields,
            hinban: item.hinban,
            rollIndex: curRoll,
            totalRolls: totalRolls,
            timestamp: now.toISOString(),
            timeStr
        };
        localStorage.setItem('firstkojo2_last_printed', JSON.stringify(state.lastPrinted));

        // Call advance API with print log details
        const printLogPayload = {
            rollIndex: curRoll,
            totalRolls: totalRolls,
            lotNo: item.lotNo || fields.txtLotNo || '',
            barcode: fields.txtBarcode || '',
            worker: state.workerName || '包装作業者',
            machine: state.machineName,
            timestamp: now.toISOString(),
            timeStr,
            printSuccess: true
        };

        await advanceQueueRoll(item, curRoll, totalRolls, { printLog: printLogPayload });

        showToast(`✅ Roll ${curRoll}/${totalRolls} のラベルを発行しました`, 'success');
    } catch (err) {
        console.error('Error during print flow:', err);
        updatePrintProgressError(err.message || '予期せぬエラー');
    } finally {
        state.isPrinting = false;
    }
}

// -----------------------------------------------------
// Manual Advance when Printer is Broken / Unavailable
// -----------------------------------------------------
async function handleCantPrintAdvance() {
    if (!state.activeItem) {
        showToast('包装対象のロットがありません', 'warning');
        return;
    }
    if (state.isPrinting) return;

    const item = state.activeItem;
    const curRoll = Number(item.currentRollIndex || item.rollIndex || 1);
    const totalRolls = Number(item.totalRolls) || 1;

    const confirmed = confirm(
        `【印刷不可の確認】\n\nプリンター障害・用紙切れ等でラベル印刷ができませんか？\n\nRoll ${curRoll} / ${totalRolls} の印刷をスキップして「完了」にし、次の巻へ進めますか？`
    );
    if (!confirmed) return;

    showPrintProgressModal('手動進行中...', `【${item.hinban}】Roll ${curRoll} / ${totalRolls} (印刷不可・進行)`);

    try {
        await advanceQueueRoll(item, curRoll, totalRolls, {
            manualAdvance: true,
            reason: '印刷不可による手動進行'
        });
        updatePrintProgressSuccess('完了！', `Roll ${curRoll} / ${totalRolls} を印刷不可として完了しました`);
        showToast(`⚠️ Roll ${curRoll}/${totalRolls} を印刷不可として完了し、次へ進めました`, 'warning', 4000);
    } catch (err) {
        console.error('Error during manual advance:', err);
        updatePrintProgressError(err.message || '進行エラー');
    }
}

async function advanceQueueRoll(item, curRoll, totalRolls, options = {}) {
    const queueId = item._id || item.queueId;
    const groupId = item.groupId;

    try {
        const payload = {
            _id: queueId,
            queueId: queueId,
            groupId,
            date: state.selectedDate,
            machine: state.machineName,
            worker: state.workerName || '包装作業者',
            rollIndex: curRoll,
            totalRolls,
            manualAdvance: Boolean(options.manualAdvance),
            reason: options.reason || '',
            printLog: options.printLog || null
        };

        const res = await fetch(`${serverURL}/api/production/queue/advance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.warn('Queue advance API response status:', res.status);
        } else {
            const data = await res.json();
            console.log('⏩ Queue advanced:', data);
        }
    } catch (e) {
        console.warn('Could not advance queue on server, updating locally:', e);
        // Local update
        item.status = 'completed';
        saveLocalQueue();
    }

    // Refresh queue smoothly
    await fetchProductionQueue();
}

async function logPrintToServer(item, curRoll, totalRolls, fields, timeStr) {
    try {
        await fetch(`${serverURL}/api/production/print-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduleId: item.scheduleId || null,
                groupId: item.groupId,
                date: state.selectedDate,
                machine: state.machineName,
                worker: state.workerName,
                hinban: item.hinban,
                rollIndex: Number(curRoll),
                totalRolls: Number(totalRolls),
                lotNo: fields.text_DateT,
                barcode: fields.barcode_barcode,
                timestamp: new Date().toISOString(),
                timeStr: timeStr
            })
        });
    } catch (e) {
        console.warn('Could not save print-log to server:', e);
    }
}

// -----------------------------------------------------
// Edge Case 1: Re-print Last Roll
// -----------------------------------------------------
async function handleReprintLastRoll() {
    if (!state.lastPrinted || !state.lastPrinted.fields) {
        showToast('直前の印刷履歴がありません', 'warning');
        return;
    }

    const { fields, hinban, rollIndex, totalRolls } = state.lastPrinted;

    const confirmed = confirm(
        `【再印刷の確認】\n\n品番: ${hinban}\nRoll: ${rollIndex} / ${totalRolls}\nロット: ${fields.text_DateT}\n\nこのラベルを再度プリンターへ送信しますか？\n（※ キューの進捗は進みません）`
    );
    if (!confirmed) return;

    showPrintProgressModal('再印刷中...', `【${hinban}】Roll ${rollIndex} / ${totalRolls}`);

    try {
        const result = await executeBrotherPrint(fields);
        if (!result.success && !result.isConnectionRefused) {
            updatePrintProgressError(result.error || '再印刷エラー');
            return;
        }

        playChime('success');
        updatePrintProgressSuccess('再印刷完了', `Roll ${rollIndex} / ${totalRolls}`);
        showToast(`🔄 [${hinban}] Roll ${rollIndex} を再印刷しました`, 'success');
    } catch (err) {
        updatePrintProgressError(err.message || '再印刷に失敗しました');
    }
}

// -----------------------------------------------------
// Edge Case 2: 1 Roll Scrap / Skip
// -----------------------------------------------------
async function submitScrapRoll() {
    if (!state.activeItem) return;

    const item = state.activeItem;
    const curRoll = Number(item.currentRollIndex || item.rollIndex || 1);
    const totalRolls = Number(item.totalRolls) || 1;
    const reason = state.selectedScrapReason || '不良破棄';
    const scrapEntireLot = document.getElementById('chkScrapEntireLot')?.checked || false;

    closeScrapModal();
    playChime('warning');

    try {
        const res = await fetch(`${serverURL}/api/production/queue/skip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName,
                queueId: item._id || item.queueId,
                groupId: item.groupId,
                rollIndex: curRoll,
                reason,
                scrapEntireLot
            })
        });

        if (!res.ok) {
            throw new Error(`Server skip failed: HTTP ${res.status}`);
        }

        showToast(`⚠️ Roll #${curRoll} を破棄処理しました（理由: ${reason}）`, 'warning');
        await fetchProductionQueue();
    } catch (err) {
        console.warn('Scrap API error, advancing locally:', err);
        if (scrapEntireLot || curRoll >= totalRolls) {
            item.status = 'scrapped';
        } else {
            item.currentRollIndex = curRoll + 1;
            item.scrappedRolls = (item.scrappedRolls || 0) + 1;
        }
        saveLocalQueue();
        await fetchProductionQueue();
        showToast(`⚠️ Roll #${curRoll} をスキップしました`, 'warning');
    }
}

// -----------------------------------------------------
// Edge Case 3: Finish Lot Early
// -----------------------------------------------------
async function submitFinishEarly() {
    if (!state.activeItem) return;

    const item = state.activeItem;
    const inputActual = document.getElementById('inputActualRolls');
    const selectReason = document.getElementById('selectFinishReason');

    const actualRolls = Number(inputActual?.value || 0);
    const reason = selectReason?.value || '材料短尺・原反不足';

    closeFinishEarlyModal();
    playChime('warning');

    try {
        const res = await fetch(`${serverURL}/api/production/queue/finish-early`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName,
                queueId: item._id || item.queueId,
                groupId: item.groupId,
                actualRollsProduced: actualRolls,
                reason
            })
        });

        if (!res.ok) {
            throw new Error(`Server finish-early failed: HTTP ${res.status}`);
        }

        showToast(`🏁 ロット中途完了: 実 ${actualRolls} 巻で完了しました`, 'info');
        await fetchProductionQueue();
    } catch (err) {
        console.warn('Finish early API error, advancing locally:', err);
        item.status = 'completed';
        item.actualRollsProduced = actualRolls;
        item.finishedEarly = true;
        saveLocalQueue();
        await fetchProductionQueue();
        showToast(`🏁 ロットを中途完了しました (実 ${actualRolls} 巻)`, 'info');
    }
}

// -----------------------------------------------------
// Edge Case 4: Select Queue Item Target
// -----------------------------------------------------
async function handleSelectQueueItem(queueId, hinban) {
    if (!queueId) return;

    const confirmed = confirm(`【包装対象の変更】\n\n「${hinban}」を現在の包装対象に設定しますか？\n（※ 投入順序が前後した場合などに切り替えられます）`);
    if (!confirmed) return;

    try {
        const res = await fetch(`${serverURL}/api/production/queue/select`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: state.selectedDate,
                machine: state.machineName,
                queueId
            })
        });

        if (!res.ok) {
            throw new Error(`Queue select failed: HTTP ${res.status}`);
        }

        playChime('beep');
        showToast(`🎯 包装対象を「${hinban}」に切り替えました`, 'info');
        await fetchProductionQueue();
    } catch (err) {
        console.warn('Queue select API error, switching locally:', err);
        // Local switch
        const found = state.queue.find(i => (i._id === queueId || i.queueId === queueId));
        if (found) {
            state.queue.forEach(i => {
                if (i.status === 'active' || i.status === 'in-progress') i.status = 'queued';
            });
            found.status = 'active';
            state.activeItem = found;
            state.waitingItems = state.queue.filter(i => i !== found && i.status !== 'completed' && i.status !== 'scrapped');
            saveLocalQueue();
            renderApp();
        }
    }
}

// -----------------------------------------------------
// Demo / Test Queue Item Injection (for testing without feeder)
// -----------------------------------------------------
async function injectDemoQueueItem() {
    const demoItems = [
        {
            hinban: '5020-001',
            color: '黒',
            hinmei: 'トリムテープ PSA',
            okyakuHinban: '75811-58010',
            labelHinban: '',
            totalRolls: 3,
            rollMeters: 100,
            totalMeters: 300,
            shippingDest: '豊田',
            rawMaterialQR: 'MTR-5020-BLK-98421,L=300m,KURACHI-PSA',
            rawMaterialLength: '300m',
            manufacturerUid: 'LOT-KUR-2609-01',
            photoUrl: 'src/warehouse_label_sample.png'
        },
        {
            hinban: 'NC2-8821',
            color: 'グレー',
            hinmei: '防音フォーム NC2',
            okyakuHinban: '86120-12340',
            labelHinban: 'NC2',
            totalRolls: 2,
            rollMeters: 50,
            totalMeters: 100,
            shippingDest: '田原',
            rawMaterialQR: 'MTR-NC2-GRY-1102,L=100m',
            rawMaterialLength: '100m',
            manufacturerUid: 'LOT-KUR-NC2-99',
            photoUrl: ''
        },
        {
            hinban: 'CNU/BLZ02B*GD/***W48',
            color: '黒',
            hinmei: '衣浦向け専用テープ',
            okyakuHinban: 'KINUURA-SPEC-01',
            labelHinban: '',
            totalRolls: 4,
            rollMeters: 100,
            totalMeters: 400,
            shippingDest: '衣浦',
            rawMaterialQR: 'KINUURA-RAW-4482',
            rawMaterialLength: '400m',
            manufacturerUid: 'MFG-KIN-882',
            photoUrl: ''
        }
    ];

    const pick = demoItems[Math.floor(Math.random() * demoItems.length)];
    const payload = {
        date: state.selectedDate,
        machine: state.machineName,
        worker: state.workerName,
        groupId: `DEMO-${Date.now()}`,
        ...pick
    };

    try {
        const res = await fetch(`${serverURL}/api/production/queue/enqueue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast(`➕ テスト用ロット「${pick.hinban}」を登録しました`, 'success');
            await fetchProductionQueue();
            return;
        }
    } catch (e) {
        console.warn('Enqueue API error, saving locally:', e);
    }

    // Fallback local injection
    const newItem = {
        _id: `local_${Date.now()}`,
        status: state.activeItem ? 'queued' : 'active',
        currentRollIndex: 1,
        createdAt: new Date(),
        ...payload
    };
    state.queue.push(newItem);
    if (!state.activeItem) state.activeItem = newItem;
    else state.waitingItems.push(newItem);
    saveLocalQueue();
    renderApp();
    showToast(`➕ [ローカル] テスト用ロット「${pick.hinban}」を追加しました`, 'success');
}

// -----------------------------------------------------
// Realtime SSE Synchronization
// -----------------------------------------------------
function initEventSource() {
    if (state.eventSource) {
        try {
            state.eventSource.close();
        } catch {
            // ignore
        }
        state.eventSource = null;
    }

    const sseUrl = `${serverURL}/api/production/events?date=${encodeURIComponent(state.selectedDate)}`;
    console.log(`🔌 Connecting SSE: ${sseUrl}`);

    try {
        state.eventSource = new EventSource(sseUrl);

        state.eventSource.onopen = () => {
            console.log('🟢 SSE connected successfully');
            setSseBadgeStatus(true);
            state.reconnectAttempts = 0;
            // Fetch fresh queue on initial or re-connection
            fetchProductionQueue();
        };

        state.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('⚡ SSE Event Received:', data);

                if (data.type === 'connected') {
                    setSseBadgeStatus(true);
                    return;
                }

                // Relevant production events
                const relevantTypes = [
                    'queue_updated',
                    'queue_roll_printed',
                    'queue_scrapped',
                    'status_update',
                    'print_log'
                ];

                if (relevantTypes.includes(data.type)) {
                    console.log(`🔄 Handling ${data.type} -> updating queue`);
                    fetchProductionQueue();
                }
            } catch (err) {
                console.warn('SSE message parse error:', err, event.data);
            }
        };

        state.eventSource.onerror = (err) => {
            console.warn('🔴 SSE error/disconnected:', err);
            setSseBadgeStatus(false);

            if (state.eventSource) {
                state.eventSource.close();
                state.eventSource = null;
            }

            // Exponential backoff reconnect
            state.reconnectAttempts++;
            const backoffMs = Math.min(30000, 1000 * Math.pow(1.5, state.reconnectAttempts));
            clearTimeout(state.reconnectTimeoutId);
            state.reconnectTimeoutId = setTimeout(() => {
                initEventSource();
            }, backoffMs);
        };
    } catch (err) {
        console.error('Failed to create EventSource:', err);
        setSseBadgeStatus(false);
    }
}

function setSseBadgeStatus(connected) {
    state.sseConnected = connected;
    const badge = document.getElementById('sseBadge');
    const text = document.getElementById('sseStatusText');

    if (!badge || !text) return;

    if (connected) {
        badge.className = 'sse-badge connected';
        const liveText = (typeof _t === 'function' && _t('sse_connected')) || '接続中';
        text.textContent = `${liveText} (Live)`;
    } else {
        badge.className = 'sse-badge disconnected';
        const offlineText = (typeof _t === 'function' && _t('sse_disconnected')) || '切断中';
        text.textContent = `${offlineText} (Offline)`;
    }
}

// -----------------------------------------------------
// Event Listeners & Initialization
// -----------------------------------------------------
function setupEventListeners() {
    // Listen for language changes from i18n
    document.addEventListener('languageChanged', () => {
        renderMachineTag();
        setSseBadgeStatus(state.sseConnected);
        renderApp();
    });

    // Date Navigation
    const btnPrev = document.getElementById('btnPrevDay');
    const btnNext = document.getElementById('btnNextDay');
    const btnToday = document.getElementById('btnToday');
    const datePicker = document.getElementById('datePickerInput');

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            changeSelectedDate(shiftDateString(state.selectedDate, -1));
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            changeSelectedDate(shiftDateString(state.selectedDate, 1));
        });
    }

    if (btnToday) {
        btnToday.addEventListener('click', () => {
            changeSelectedDate(getTodayDateString());
        });
    }

    if (datePicker) {
        datePicker.addEventListener('change', (e) => {
            if (e.target.value) {
                changeSelectedDate(e.target.value);
            }
        });
    }

    // Refresh button
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            btnRefresh.style.transform = 'rotate(180deg)';
            setTimeout(() => { btnRefresh.style.transform = ''; }, 300);
            fetchProductionQueue(true);
            showToast('キューを更新しました', 'info', 1800);
        });
    }

    // Sound toggle button
    const btnSound = document.getElementById('btnSoundToggle');
    if (btnSound) {
        updateSoundButtonUi();
        btnSound.addEventListener('click', () => {
            state.soundEnabled = !state.soundEnabled;
            localStorage.setItem('firstkojo2_sound_enabled', String(state.soundEnabled));
            updateSoundButtonUi();
            if (state.soundEnabled) playChime('success');
            showToast(state.soundEnabled ? '🔊 効果音をONにしました' : '🔇 効果音をOFFにしました', 'info', 1500);
        });
    }

    // Fullscreen toggle button
    const btnFull = document.getElementById('btnFullscreen');
    if (btnFull) {
        btnFull.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.().catch(() => { });
            } else {
                document.exitFullscreen?.().catch(() => { });
            }
        });
    }

    // Close modals on Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePhotoModal();
            closePrintProgressModal();
            closeScrapModal();
            closeFinishEarlyModal();
            closeHistoryDetailModal();
        }
    });

    // Close modals when clicking backdrop
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => {
        m.addEventListener('click', (e) => {
            if (e.target === m) {
                m.classList.remove('open');
            }
        });
    });
}

function updateSoundButtonUi() {
    const btnSound = document.getElementById('btnSoundToggle');
    if (btnSound) {
        btnSound.textContent = state.soundEnabled ? '🔊' : '🔇';
    }
}

function changeSelectedDate(newDate) {
    if (state.selectedDate === newDate) return;
    state.selectedDate = newDate;
    sessionStorage.setItem('firstkojo2_date', newDate);

    const datePicker = document.getElementById('datePickerInput');
    if (datePicker) datePicker.value = newDate;

    // Reconnect SSE for new date
    initEventSource();
    fetchProductionQueue(true);
}

// -----------------------------------------------------
// Bootstrapping
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 firstKojoNippo2 initialized (Tablet 2 Wrapping & Label Printing)');
    parseUrlParams();
    setupEventListeners();
    fetchProductionQueue(true);
    initEventSource();

    // Fallback polling interval (every 15s) in case SSE is interrupted by tablet sleep/proxy
    state.pollingIntervalId = setInterval(() => {
        if (!state.sseConnected) {
            fetchProductionQueue(false);
        }
    }, 15000);
});
