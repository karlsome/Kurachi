// Production TV Monitor - Real-time factory production monitoring
// Displays goal vs actual and time ahead/behind for all equipment

// Configuration
//const SERVER_URL = 'https://kurachi.onrender.com';
 const SERVER_URL = 'http://localhost:3000';
// const SERVER_URL = 'http://192.168.1.176:3000';

// State
let factoryId = null;
let currentDate = null;
let equipmentList = []; // List of all equipment in the factory
let productionPlan = null;
let actualProduction = {};
let inProgressData = {};
let eventSource = null;

// DOM Elements
const factoryDisplay = document.getElementById('factoryDisplay');
const dateDisplay = document.getElementById('dateDisplay');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const mainContent = document.getElementById('mainContent');
const loadingIndicator = document.getElementById('loadingIndicator');
const refreshTime = document.getElementById('refreshTime');

// ============================================
// INITIALIZATION
// ============================================

// Get factory from URL parameter
function getFactoryFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('factory');
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    factoryId = getFactoryFromURL();
    
    if (!factoryId) {
        showError('❌ Factory parameter is missing!<br><br>Please use: <code>?factory=小瀬</code>');
        return;
    }
    
    // Get current date
    currentDate = new Date().toISOString().split('T')[0];
    
    // Update header
    factoryDisplay.textContent = factoryId;
    dateDisplay.textContent = formatDate(currentDate);
    document.title = `${factoryId} - Production Monitor`;
    
    // Load initial data
    await loadInitialData();
    
    // Connect to SSE for real-time updates
    connectSSE();
    
    // Update refresh time every second
    setInterval(updateRefreshTime, 1000);
});

// ============================================
// DATA LOADING
// ============================================

async function loadInitialData() {
    try {
        console.log(`📊 Loading production data for ${factoryId} on ${currentDate}...`);
        
        // Load equipment list first
        await loadEquipmentList();
        
        // Load production plan
        await loadProductionPlan();
        
        // Load actual production data
        await loadActualProduction();
        
        // Load in-progress data
        await loadInProgressData();
        
        // Render the display
        renderEquipmentGrid();
        
        loadingIndicator.style.display = 'none';
        
    } catch (error) {
        console.error('❌ Error loading initial data:', error);
        showError('Failed to load production data. Please refresh the page.');
    }
}

// Load equipment list from setsubiList (master equipment list)
async function loadEquipmentList() {
    try {
        const response = await fetch(`${SERVER_URL}/getSetsubiList?factory=${factoryId}`);
        
        const data = await response.json();
        
        // Get unique equipment values
        const equipmentSet = new Set();
        data.forEach(item => {
            if (item.設備) {
                equipmentSet.add(item.設備);
            }
        });
        
        equipmentList = Array.from(equipmentSet).sort();
        console.log(`✅ Equipment list loaded (${equipmentList.length} unique items):`, equipmentList);
        
    } catch (error) {
        console.error('❌ Error loading equipment list:', error);
        // Fallback: use equipment from pressDB
        await loadEquipmentListFromPressDB();
    }
}

// Fallback: Load equipment from pressDB if setsubiList fails
async function loadEquipmentListFromPressDB() {
    try {
        const response = await fetch(`${SERVER_URL}/queries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dbName: 'submittedDB',
                collectionName: 'pressDB',
                query: { 工場: factoryId }
            })
        });
        
        const data = await response.json();
        
        // Extract unique equipment
        const equipmentSet = new Set();
        data.forEach(item => {
            if (item.設備) {
                equipmentSet.add(item.設備);
            }
        });
        
        equipmentList = Array.from(equipmentSet).sort();
        console.log(`⚠️ Equipment list loaded from pressDB (${equipmentList.length} items):`, equipmentList);
        
    } catch (error) {
        console.error('❌ Error loading equipment from pressDB:', error);
        equipmentList = [];
    }
}

// Load production plan from productionPlansDB
async function loadProductionPlan() {
    try {
        const response = await fetch(`${SERVER_URL}/queries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dbName: 'submittedDB',
                collectionName: 'productionPlansDB',
                query: {
                    factory: factoryId,
                    date: currentDate
                }
            })
        });
        
        const plans = await response.json();
        
        if (plans && plans.length > 0) {
            productionPlan = plans[0];
            console.log('✅ Production plan loaded:', productionPlan);
        } else {
            productionPlan = null;
            console.log('⚠️ No production plan found for today');
        }
        
    } catch (error) {
        console.error('❌ Error loading production plan:', error);
        throw error;
    }
}

// Load actual production from pressDB
async function loadActualProduction() {
    try {
        const response = await fetch(`${SERVER_URL}/queries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dbName: 'submittedDB',
                collectionName: 'pressDB',
                query: {
                    工場: factoryId,
                    Date: currentDate
                }
            })
        });
        
        const records = await response.json();
        
        // Group by equipment and sebanggo
        actualProduction = processActualProductionData(records);
        
        console.log('✅ Actual production loaded:', actualProduction);
        
    } catch (error) {
        console.error('❌ Error loading actual production:', error);
        throw error;
    }
}

// Process actual production data by equipment and sebanggo
function processActualProductionData(records) {
    const grouped = {};
    
    records.forEach(record => {
        const equipment = record.設備;
        const sebanggo = record.背番号;
        
        if (!equipment || !sebanggo) return;
        
        const key = `${equipment}_${sebanggo}`;
        
        if (!grouped[key]) {
            grouped[key] = {
                equipment: equipment,
                sebanggo: sebanggo,
                totalQuantity: 0,
                records: []
            };
        }
        
        grouped[key].totalQuantity += (record.Total || 0);
        grouped[key].records.push(record);
    });
    
    return grouped;
}

// Load in-progress data from tabletLogDB
async function loadInProgressData() {
    try {
        const response = await fetch(`${SERVER_URL}/queries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dbName: 'submittedDB',
                collectionName: 'tabletLogDB',
                query: {
                    工場: factoryId,
                    Date: currentDate,
                    Status: 'in-progress'
                }
            })
        });
        
        const records = await response.json();
        
        // Get latest in-progress record per equipment
        inProgressData = processInProgressData(records);
        
        console.log('✅ In-progress data loaded:', inProgressData);
        
    } catch (error) {
        console.error('❌ Error loading in-progress data:', error);
        throw error;
    }
}

// Process in-progress data to get latest per equipment
function processInProgressData(records) {
    const latest = {};
    
    records.forEach(record => {
        const equipment = record.設備;
        if (!equipment) return;
        
        // Keep only the latest record per equipment
        if (!latest[equipment] || new Date(record.Timestamp) > new Date(latest[equipment].Timestamp)) {
            latest[equipment] = record;
        }
    });
    
    return latest;
}

// ============================================
// SSE CONNECTION
// ============================================

function connectSSE() {
    console.log(`🔌 Connecting to factory SSE: ${factoryId}...`);
    
    eventSource = new EventSource(`${SERVER_URL}/sse/factory/${factoryId}`);
    
    eventSource.onopen = function() {
        console.log('✅ SSE Connection opened');
        statusDot.classList.add('connected');
        statusText.textContent = '接続済み';
    };
    
    eventSource.onerror = function(error) {
        console.error('❌ SSE Connection error:', error);
        statusDot.classList.remove('connected');
        statusText.textContent = '接続エラー';
        
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            eventSource.close();
            connectSSE();
        }, 5000);
    };
    
    eventSource.onmessage = function(event) {
        console.log('📨 Received SSE message:', event.data);
        
        try {
            const data = JSON.parse(event.data);
            handleSSEMessage(data);
        } catch (error) {
            console.error('Error parsing SSE message:', error);
        }
    };
}

// Handle incoming SSE messages
function handleSSEMessage(data) {
    console.log('📊 Processing SSE message:', data);
    
    if (data.type === 'connected') {
        console.log(`✅ Connected to factory ${data.factoryId}`);
        return;
    }
    
    if (data.type === 'production_update') {
        // Update actual production data
        const key = `${data.equipment}_${data.sebanggo}`;
        
        if (!actualProduction[key]) {
            actualProduction[key] = {
                equipment: data.equipment,
                sebanggo: data.sebanggo,
                totalQuantity: 0,
                records: []
            };
        }
        
        // Reload actual production data for accurate count
        loadActualProduction().then(() => {
            renderEquipmentGrid();
        });
    }
    
    if (data.type === 'in_progress_update') {
        // Update in-progress data
        if (data.equipment) {
            inProgressData[data.equipment] = {
                背番号: data.sebanggo,
                品番: data.hinban,
                Action: data.action,
                Status: data.status,
                Timestamp: data.timestamp
            };
            
            renderEquipmentGrid();
        }
    }
}

// ============================================
// RENDERING
// ============================================

function renderEquipmentGrid() {
    if (!equipmentList || equipmentList.length === 0) {
        mainContent.innerHTML = `
            <div class="no-plan">
                <div style="font-size: 3em; margin-bottom: 20px;">📋</div>
                <div>No equipment found for this factory</div>
                <div style="font-size: 0.9em; margin-top: 10px; opacity: 0.7;">
                    ${factoryId} - ${formatDate(currentDate)}
                </div>
            </div>
        `;
        return;
    }
    
    let html = '<div class="equipment-grid">';
    
    // Create a tile for each equipment
    equipmentList.forEach(equipment => {
        html += renderEquipmentCard(equipment);
    });
    
    html += '</div>';
    
    mainContent.innerHTML = html;
}

function renderEquipmentCard(equipment) {
    // Find production plan for this equipment
    const plannedProduct = productionPlan?.products?.find(p => p.equipment === equipment);
    
    // If no plan, show idle state
    if (!plannedProduct) {
        return `
            <div class="equipment-card idle">
                <div class="equipment-name">
                    ${equipment}
                </div>
                
                <div class="sebanggo-display">
                    -
                </div>
                
                <div class="progress-section">
                    <div class="progress-row">
                        <div class="progress-item">
                            <div class="progress-label">Goal / 目標</div>
                            <div class="progress-value goal">-</div>
                        </div>
                        <div class="progress-item">
                            <div class="progress-label">Actual / 実績</div>
                            <div class="progress-value actual">-</div>
                        </div>
                    </div>
                </div>
                
                <div class="time-status idle">
                    <span class="time-icon">💤</span>
                    生産予定なし
                </div>
            </div>
        `;
    }
    
    const sebanggo = plannedProduct.背番号;
    const goalQuantity = plannedProduct.quantity || 0;
    
    // Get actual production
    const actualKey = `${equipment}_${sebanggo}`;
    const actual = actualProduction[actualKey];
    const actualQuantity = actual ? actual.totalQuantity : 0;
    
    // Get in-progress status
    const inProgress = inProgressData[equipment];
    const isInProgress = inProgress && inProgress.背番号 === sebanggo;
    
    // Calculate time status
    const timeStatus = calculateTimeStatus(plannedProduct, actualQuantity);
    
    // Determine card class
    let cardClass = 'equipment-card';
    if (actualQuantity === 0) {
        cardClass += ' idle';
    } else if (timeStatus.status === 'ahead') {
        cardClass += ' ahead';
    } else if (timeStatus.status === 'behind') {
        cardClass += ' behind';
    }
    
    return `
        <div class="${cardClass}">
            <div class="equipment-name">
                ${equipment}
                ${isInProgress ? '<span class="in-progress-badge">🔄 作業中</span>' : ''}
            </div>
            
            <div class="sebanggo-display">
                ${sebanggo}
            </div>
            
            <div class="progress-section">
                <div class="progress-row">
                    <div class="progress-item">
                        <div class="progress-label">Goal / 目標</div>
                        <div class="progress-value goal">${goalQuantity}</div>
                    </div>
                    <div class="progress-item">
                        <div class="progress-label">Actual / 実績</div>
                        <div class="progress-value actual">${actualQuantity}</div>
                    </div>
                </div>
            </div>
            
            <div class="time-status ${timeStatus.status}">
                <span class="time-icon">${timeStatus.icon}</span>
                ${timeStatus.message}
            </div>
        </div>
    `;
}

// ============================================
// TIME CALCULATIONS
// ============================================

function calculateTimeStatus(product, actualQuantity) {
    // If no actual production yet, show waiting
    if (actualQuantity === 0) {
        return {
            status: 'idle',
            icon: '⏳',
            message: '生産開始待ち'
        };
    }
    
    // Get current time in minutes from start of day
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Get planned start time in minutes
    const startTime = product.startTime || '08:45';
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    
    // If before start time, show waiting
    if (currentMinutes < startMinutes) {
        return {
            status: 'idle',
            icon: '⏳',
            message: `開始予定: ${startTime}`
        };
    }
    
    // Calculate elapsed time since start (in minutes)
    const elapsedMinutes = currentMinutes - startMinutes;
    
    // Get estimated production time
    const estimatedTime = product.estimatedTime || {};
    const totalSeconds = estimatedTime.totalSeconds || 0;
    const cycleTimeSeconds = totalSeconds / (product.quantity || 1);
    
    // Calculate expected quantity at this time
    const elapsedSeconds = elapsedMinutes * 60;
    const expectedQuantity = Math.floor(elapsedSeconds / cycleTimeSeconds);
    
    // Calculate difference
    const difference = actualQuantity - expectedQuantity;
    
    // Calculate time difference in minutes
    const timeDiffSeconds = Math.abs(difference * cycleTimeSeconds);
    const timeDiffMinutes = Math.round(timeDiffSeconds / 60);
    
    if (difference > 0) {
        // Ahead of schedule
        return {
            status: 'ahead',
            icon: '🚀',
            message: `予定より ${timeDiffMinutes}分 早い`
        };
    } else if (difference < 0) {
        // Behind schedule
        return {
            status: 'behind',
            icon: '⚠️',
            message: `予定より ${timeDiffMinutes}分 遅れ`
        };
    } else {
        // On track
        return {
            status: 'on-track',
            icon: '✓',
            message: '予定通り'
        };
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
}

function updateRefreshTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    refreshTime.textContent = `最終更新: ${timeStr}`;
}

function showError(message) {
    loadingIndicator.style.display = 'none';
    mainContent.innerHTML = `
        <div class="error-message">
            ${message}
        </div>
    `;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (eventSource) {
        eventSource.close();
    }
});
