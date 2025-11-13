// IndexedDB Cache System for QR Learning Patterns
// This handles local storage of customer-specific QR patterns with hash validation

// Global configuration - Change server URL here
const QR_PATTERN_CONFIG = {
  serverURL: "https://kurachi.onrender.com"
  // Alternative: "http://localhost:3000"
};

class QRPatternCache {
  constructor() {
    this.dbName = 'QRPatternCacheDB';
    this.version = 1;
    this.db = null;
    this.initialized = false;
  }

  // Initialize IndexedDB
  async init() {
    if (this.initialized) return true;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('IndexedDB initialization failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        console.log('IndexedDB initialized successfully');
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create patterns store
        if (!db.objectStoreNames.contains('patterns')) {
          const patternsStore = db.createObjectStore('patterns', { keyPath: 'customerType' });
          patternsStore.createIndex('hash', 'hash', { unique: false });
          patternsStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }

        // Create hashes store for quick hash checking
        if (!db.objectStoreNames.contains('hashes')) {
          const hashesStore = db.createObjectStore('hashes', { keyPath: 'customerType' });
        }

        console.log('IndexedDB stores created');
      };
    });
  }

  // Get stored pattern for a customer
  async getPattern(customerType) {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['patterns'], 'readonly');
      const store = transaction.objectStore('patterns');
      const request = store.get(customerType);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log(`Retrieved pattern for ${customerType}:`, result);
          resolve(result);
        } else {
          console.log(`No pattern found for ${customerType}`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error(`Error retrieving pattern for ${customerType}:`, request.error);
        reject(request.error);
      };
    });
  }

  // Store pattern for a customer
  async storePattern(customerType, patternData) {
    if (!this.initialized) await this.init();

    const patternRecord = {
      customerType: customerType,
      hash: patternData.hash,
      patterns: patternData.patterns,
      extractionRules: patternData.extractionRules,
      detectionRules: patternData.detectionRules,
      metadata: patternData.metadata,
      lastUpdated: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['patterns', 'hashes'], 'readwrite');
      
      // Store pattern
      const patternsStore = transaction.objectStore('patterns');
      const patternsRequest = patternsStore.put(patternRecord);

      // Store hash for quick checking
      const hashesStore = transaction.objectStore('hashes');
      const hashRecord = {
        customerType: customerType,
        hash: patternData.hash,
        lastUpdated: patternRecord.lastUpdated
      };
      const hashesRequest = hashesStore.put(hashRecord);

      transaction.oncomplete = () => {
        console.log(`Pattern stored successfully for ${customerType}`);
        resolve(true);
      };

      transaction.onerror = () => {
        console.error(`Error storing pattern for ${customerType}:`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  // Get stored hash for a customer (for quick comparison)
  async getStoredHash(customerType) {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['hashes'], 'readonly');
      const store = transaction.objectStore('hashes');
      const request = store.get(customerType);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve(result.hash);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error(`Error retrieving hash for ${customerType}:`, request.error);
        reject(request.error);
      };
    });
  }

  // Delete pattern for a customer
  async deletePattern(customerType) {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['patterns', 'hashes'], 'readwrite');
      
      const patternsStore = transaction.objectStore('patterns');
      const hashesStore = transaction.objectStore('hashes');
      
      patternsStore.delete(customerType);
      hashesStore.delete(customerType);

      transaction.oncomplete = () => {
        console.log(`Pattern deleted for ${customerType}`);
        resolve(true);
      };

      transaction.onerror = () => {
        console.error(`Error deleting pattern for ${customerType}:`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  // Clear all patterns
  async clearAllPatterns() {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['patterns', 'hashes'], 'readwrite');
      
      const patternsStore = transaction.objectStore('patterns');
      const hashesStore = transaction.objectStore('hashes');
      
      patternsStore.clear();
      hashesStore.clear();

      transaction.oncomplete = () => {
        console.log('All patterns cleared');
        resolve(true);
      };

      transaction.onerror = () => {
        console.error('Error clearing patterns:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  // Get all stored customer types
  async getAllCustomerTypes() {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['patterns'], 'readonly');
      const store = transaction.objectStore('patterns');
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Error retrieving customer types:', request.error);
        reject(request.error);
      };
    });
  }

  // Check if pattern needs update by comparing hashes
  async needsUpdate(customerType, serverHash) {
    try {
      const storedHash = await this.getStoredHash(customerType);
      const needsUpdate = !storedHash || storedHash !== serverHash;
      
      console.log(`Hash check for ${customerType}: stored=${storedHash}, server=${serverHash}, needsUpdate=${needsUpdate}`);
      return needsUpdate;
    } catch (error) {
      console.error('Error checking hash:', error);
      return true; // If error, assume update is needed
    }
  }
}

// QR Pattern Sync System
class QRPatternSync {
  constructor(serverURL) {
    this.serverURL = serverURL;
    this.cache = new QRPatternCache();
    this.isOnline = navigator.onLine;
    
    // Monitor network status
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('Network connection restored');
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('Network connection lost');
    });
  }

  // Initialize the sync system
  async init() {
    await this.cache.init();
    console.log('QR Pattern Sync system initialized');
  }

  // Check and update patterns for a specific customer
  async syncCustomerPattern(customerType) {
    if (!this.isOnline) {
      console.log('Offline - using cached patterns only');
      return await this.cache.getPattern(customerType);
    }

    try {
      // Get server hash for comparison
      const response = await fetch(`${this.serverURL}/qr-patterns/hash/${customerType}`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const { hash: serverHash } = await response.json();
      
      // Check if update is needed
      const needsUpdate = await this.cache.needsUpdate(customerType, serverHash);
      
      if (needsUpdate) {
        console.log(`Updating patterns for ${customerType}`);
        
        // Fetch new patterns from server
        const patternsResponse = await fetch(`${this.serverURL}/qr-patterns/${customerType}`);
        if (!patternsResponse.ok) {
          throw new Error(`Failed to fetch patterns: ${patternsResponse.status}`);
        }

        const patternData = await patternsResponse.json();
        
        // Store in cache
        await this.cache.storePattern(customerType, patternData);
        
        console.log(`Patterns updated for ${customerType}`);
        return patternData;
      } else {
        console.log(`Patterns are up to date for ${customerType}`);
        return await this.cache.getPattern(customerType);
      }
    } catch (error) {
      console.error(`Error syncing patterns for ${customerType}:`, error);
      
      // Fallback to cached version
      console.log('Falling back to cached patterns');
      return await this.cache.getPattern(customerType);
    }
  }

  // Get pattern for customer (with automatic sync)
  async getCustomerPattern(customerType) {
    return await this.syncCustomerPattern(customerType);
  }

  // Delete customer pattern from cache
  async deleteCustomerPattern(customerType) {
    return await this.cache.deletePattern(customerType);
  }

  // Clear all cached patterns
  async clearAllPatterns() {
    return await this.cache.clearAllPatterns();
  }

  // Force refresh all patterns from server
  async forceRefreshAll() {
    if (!this.isOnline) {
      throw new Error('Cannot refresh patterns while offline');
    }

    try {
      const customerTypes = await this.cache.getAllCustomerTypes();
      const refreshPromises = customerTypes.map(customerType => {
        // Force update by clearing hash first
        return this.cache.deletePattern(customerType)
          .then(() => this.syncCustomerPattern(customerType));
      });

      await Promise.all(refreshPromises);
      console.log('All patterns refreshed from server');
    } catch (error) {
      console.error('Error refreshing patterns:', error);
      throw error;
    }
  }
}

// Global instance
let qrPatternSync = null;

// Set global server URL
function setQRPatternServerURL(url) {
  QR_PATTERN_CONFIG.serverURL = url;
  console.log(`QR Pattern server URL updated to: ${url}`);
  
  // Reset the global instance to force re-initialization with new URL
  qrPatternSync = null;
}

// Get current server URL
function getQRPatternServerURL() {
  return QR_PATTERN_CONFIG.serverURL;
}

// Initialize the system
async function initQRPatternSystem(serverURL = null) {
  const finalServerURL = serverURL || QR_PATTERN_CONFIG.serverURL;
  
  if (!qrPatternSync) {
    qrPatternSync = new QRPatternSync(finalServerURL);
    await qrPatternSync.init();
    console.log(`QR Pattern System initialized with server: ${finalServerURL}`);
  }
  return qrPatternSync;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    QRPatternCache, 
    QRPatternSync, 
    initQRPatternSystem,
    setQRPatternServerURL,
    getQRPatternServerURL,
    QR_PATTERN_CONFIG
  };
}