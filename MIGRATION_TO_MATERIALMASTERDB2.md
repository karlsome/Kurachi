# Migration to materialMasterDB2 - Change Summary

## Date: October 15, 2025

## Overview
This document summarizes the changes made to migrate from `materialDB` to `materialMasterDB2` collection in the label printer application.

## Database Structure

### New Collection: `materialMasterDB2`
- **Database**: `Sasaki_Coating_MasterDB`
- **Collection**: `materialMasterDB2`

### Key Fields Used:
- `品番` - Product number (used for matching with QR codes)
- `お客様品番` - Customer product number
- `品名` - Product name
- `ラベル品番` - Label product number
- `構成品番` - Component product number
- `NMOJI_色コード` - Color code
- `基材長` - Base material length
- `梱包数` - Packaging quantity
- `imageURL` - Image URL

## Changes Made

### 1. Normal QR Flow (`fetchProductDetails` function)

#### Database Query Change:
```javascript
// OLD: Query materialDB using 材料品番
{
  dbName: "Sasaki_Coating_MasterDB",
  collectionName: "materialDB",
  query: { "材料品番": matched材料品番 }
}

// NEW: Query materialMasterDB2 using 品番
{
  dbName: "Sasaki_Coating_MasterDB",
  collectionName: "materialMasterDB2",
  query: { "品番": selected品番Value }
}
```

#### Field Mapping Changes:
| Form Field | OLD Source | NEW Source |
|------------|------------|------------|
| 材料背番号 | `material.材料背番号` | `material.ラベル品番` |
| 材料品番 | `material.材料品番` | `material.品番` |
| 品名 | (not set in this function) | `material.品名` |
| material | `material.材料` | `material.構成品番` |
| material-color | `material.色` | `material.NMOJI_色コード` |
| length | `material.length` | `material.基材長` |

#### Print Progress Calculation:
```javascript
// OLD: Based on (生産数 / materialLength) / 100
const rollTimes = (生産数 / materialLength) / 100;
targetForCompletion = Math.ceil(rollTimes);

// NEW: Based on 生産数 / 梱包数
const 梱包数 = parseInt(material.梱包数, 10);
targetForCompletion = Math.ceil(生産数 / 梱包数);
```

**Example:**
- 生産数 = 15000
- 梱包数 = 10000
- Target = Math.ceil(15000 / 10000) = 2 labels needed

### 2. Special QR Flow (`handleSpecialQR` function)

#### Database Query Change:
```javascript
// OLD: Multi-step lookup using 粘着品番 → 材料品番 → materialDB
// 1. Find by 粘着品番 to get 材料品番
// 2. Query materialDB with 材料品番

// NEW: Direct lookup in materialMasterDB2 using 品番
{
  dbName: "Sasaki_Coating_MasterDB",
  collectionName: "materialMasterDB2",
  query: { "品番": qrCodeMessage }
}
```

#### Field Mapping Changes:
Same as normal flow (see table above)

#### Print Progress Calculation:
Same new calculation as normal flow (生産数 / 梱包数)

### 3. Print Label Function (`printLabel` function)

#### Special QR Printer URL Fields:
```javascript
// Field mappings for printing:
printFields = {
  品番: material.お客様品番,      // ← お客様品番 (Customer Product Number)
  背番号: material.品名,          // ← 品名 (Product Name)
  収容数: calculatedCapacity,    // ← 生産順番 / 10
  色: material.NMOJI_色コード    // ← NMOJI_色コード (Color Code)
}

// Barcode value:
barcodeFullValue = material.お客様品番  // Just the customer product number
```

**Printer URL Template:**
```
brotherwebprint://print?filename=kinuuraLabel.lbx&size=RollW62&copies=1
&text_品番=<お客様品番>
&text_背番号=<品名>
&text_収容数=<生産順番/10>
&text_色=<NMOJI_色コード>
&text_DateT=<currentLotNo>
&barcode_barcode=<お客様品番>
```

## Data Flow Summary

### Normal QR Code Scanning:
1. Scan QR code (e.g., "T12/EM**DG*/R/*10W*0")
2. Match against `materialRequestDB.品番` → get request data
3. Query `materialMasterDB2` where `品番` = scanned QR
4. Populate form with materialMasterDB2 data
5. Calculate print target = 生産数 / 梱包数
6. Print with standard label template

### Special QR Code Scanning:
1. Scan special QR (e.g., "CNU/CMX70B*GD/***W48")
2. Check against special patterns (kinuura labels)
3. Match against `materialRequestDB.品番` → get request data
4. Query `materialMasterDB2` where `品番` = scanned QR
5. Populate form with materialMasterDB2 data
6. Calculate print target = 生産数 / 梱包数
7. Print with `kinuuraLabel.lbx` template using:
   - 品番 = お客様品番
   - 背番号 = 品名
   - Barcode = お客様品番

## Testing Checklist

- [ ] Test normal QR code scanning
- [ ] Verify form fields populate correctly
- [ ] Check print progress calculation (denominator)
- [ ] Test special QR code scanning
- [ ] Verify special QR printer fields (お客様品番, 品名)
- [ ] Test barcode generation for special QR
- [ ] Verify image display from materialMasterDB2.imageURL
- [ ] Test with no request for today scenario
- [ ] Test print label functionality (iOS and Android)
- [ ] Verify MongoDB update after printing

## Notes

1. **Backward Compatibility**: The old `materialDB` is no longer queried. Ensure `materialMasterDB2` is fully populated before deploying.

2. **Error Handling**: If a 品番 is not found in `materialMasterDB2`, an error will be shown to the user.

3. **Image URLs**: The system now uses `imageURL` field from `materialMasterDB2` instead of calling Google Apps Script.

4. **Print Denominator**: The new calculation (生産数 / 梱包数) may produce different target values than the old formula. Ensure this matches business requirements.

5. **Special QR Patterns**: The following patterns are recognized as special QR codes:
   - "CNU/C2E2SB*/D/***WA8"
   - "CNU/C2Z1YG*/D/***WA8"
   - "CNU/CMX70B*GD/***W48"
   - "CNU/CMH70G*GD/***W48"
   - "CNU/BLZ02B*GD/***W48"
   - "CNU/85ULBB*GD/***W48"
   - "CNU/B0474B*GD/***W*6"

## Rollback Plan

If issues arise, revert the following functions in `firstKojoLabelPrinter.js`:
1. `fetchProductDetails()` - lines ~328-520
2. `handleSpecialQR()` - lines ~697-830
3. `printLabel()` special QR section - lines ~1500-1615

Keep a backup of the original file before deployment.
