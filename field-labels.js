// English names for database field names (masterDB, press / SRS / Kensa boxes and submitted records), shared by
// infoScanner.html and the Kensa interactive "More info". Terms follow the DCP interactive English (i18n.js):
// 品番 = Product Number, 背番号 = Product Code. Japanese (and unknown) keys are shown as stored.
(function () {
  var EN = {
    // masterDB
    '品番': 'Product Number', '背番号': 'Product Code', '品名': 'Product Name', 'モデル': 'Model', '形状': 'Shape', 'R/L': 'R/L', '色': 'Color',
    '顧客/納入先': 'Customer / Delivery', '備考': 'Remarks', '加工設備': 'Processing Equipment', 'QR CODE': 'QR Code', '型番': 'Model Number',
    '材料背番号': 'Material Product Code', '材料': 'Material', '収容数': 'Box Quantity', '工場': 'Factory', '秒数(1pcs何秒)': 'Seconds per Piece',
    '離型紙上/下': 'Release Paper (Top/Bottom)', '送りピッチ': 'Feeding Pitch', 'SRS': 'SRS', 'SLIT': 'Slit', 'imageURL': 'Image',
    'pickingIOT': 'Picking IoT', 'pcPerCycle': 'Pieces per Cycle', 'pricePerBox': 'Price per Box', 'pricePerPc': 'Price per Piece',
    'boardData': 'Board Data', 'labelMarking': 'Label Marking', '刃物': 'Blade', '材料品番': 'Material Part Number',
    // boxes (Cutting / SRS / Kensa labels)
    'boxId': 'Box ID', 'boxUid': 'Box UID', 'seq': 'Sequence', 'factory': 'Factory', 'runId': 'Run ID', 'workOrderNumber': 'Work Order',
    'machines': 'Machines', 'machine': 'Machine', 'worker': 'Worker', 'workers': 'Workers', 'startedAt': 'Started At', 'finishedAt': 'Finished At',
    'qtyLabel': 'Label Quantity', 'qtyMeasured': 'Measured Quantity', 'lots': 'Lots', 'snapshot': 'Snapshot', 'approximate': 'Approximate',
    'notes': 'Notes', 'capped': 'Capped', 'producedSinceLastBox': 'Produced Since Last Box', 'carriedOverPieces': 'Carried-over Pieces',
    'fillMethod': 'Fill Method', 'pressId': 'Press ID', 'kensaConsumed': 'Used by Kensa', 'srsConsumed': 'Used by SRS', 'kensa': 'Kensa',
    'kensaRuns': 'Kensa Runs', 'srsId': 'SRS ID', 'kensaId': 'Kensa ID', 'status': 'Status', 'mismatch': 'Quantity Mismatch', 'lines': 'Lines',
    'parentKensaId': 'Parent Kensa ID', 'replacedBy': 'Replaced By', 'printedAt': 'Printed At', 'printedBy': 'Printed By', 'copies': 'Copies',
    'layoutId': 'Label Layout', 'kensaRecordId': 'Kensa Record ID', 'void': 'Voided', 'createdAt': 'Created At', 'submittedAt': 'Submitted At',
    'lotNumber': 'Lot', 'lotNumbers': 'Lots', 'lotDetails': 'Lot Details', 'carried': 'Carried Over', 'good': 'Good', 'ng': 'NG', 'ngTotal': 'NG Total',
    'spare': 'Spare', 'legacy': 'Legacy QR', 'qty': 'Quantity', 'pieces': 'Pieces', 'at': 'At', 'username': 'Username', 'name': 'Name',
    'hinban': 'Product Number', 'sebango': 'Product Code', 'hinmei': 'Product Name', 'model': 'Model', 'shape': 'Shape',
    // submitted records
    '設備': 'Equipment', 'Total': 'Total (Good)', 'Worker_Name': 'Worker', 'Process_Quantity': 'Process Quantity', 'Remaining_Quantity': 'Remaining Quantity',
    'Date': 'Date', 'Time_start': 'Start Time', 'Time_end': 'End Time', 'Counters': 'Defect Counters', 'Total_NG': 'Total NG', 'Cycle_Time': 'Cycle Time (sec)',
    '製造ロット': 'Production Lot', 'Comment': 'Comment', 'Spare': 'Spare (pcs)', 'スペアからの部分数': 'Partial from Spare', 'Spare_Lots': 'Spare Lots',
    'Tablet_Home': 'Home Tablet', 'Kensa_Box_IDs': 'Kensa Box IDs', 'Box_IDs': 'Box IDs', 'Srs_Box_IDs': 'SRS Box IDs', 'Lot_Details': 'Lot Details',
    'Kensa_Label_Bypass': 'Label Bypass', 'Submit_UID': 'Submit ID', 'Kensa_Unlabelled_NG': 'Unlabelled NG', 'Break_Time_Total_Minutes': 'Total Break (min)',
    'Break_Time_Data': 'Breaks', 'Maintenance_Data': 'Maintenance', 'StopCall': 'Leader Calls', 'records': 'Records', 'totalMinutes': 'Total Minutes',
    'totalHours': 'Total Hours', 'count': 'Count', 'totalWaitSeconds': 'Total Wait (sec)', 'totalWaitMinutes': 'Total Wait (min)',
    '初物チェック画像': 'First-Piece Check Image', '終物チェック画像': 'Last-Piece Check Image', 'defectImages': 'Defect Images', 'defectImagesCount': 'Defect Image Count',
    '材料ロット': 'Material Lot', '疵引不良': 'Non Conforming (Supplier)', '加工不良': 'Non Conforming (Internal)', 'その他': 'Other', 'ショット数': 'Shot Count',
    'Total_Break_Minutes': 'Total Break (min)', 'Total_Break_Hours': 'Total Break (hours)', 'Total_Trouble_Minutes': 'Total Trouble (min)',
    'Total_Trouble_Hours': 'Total Trouble (hours)', 'Total_Work_Hours': 'Total Work (hours)', 'Total_Meters': 'Total Meters', 'Total_Pieces': 'Total Pieces',
    'Run_ID': 'Run ID', '2HourQualityCheck': '2-Hour Quality Check', 'WorkOrder_Info': 'Work Order Info', 'Machine_Summary': 'Machine Summary',
    '材料ラベル画像': 'Material Label Images', 'materialLabelImages': 'Material Label Images', 'materialLabelImageCount': 'Material Label Image Count'
  };
  // 'counter-5' -> 'Defect 5', counter 12 -> 'Other' (same numbering as the Kensa page)
  window.fieldLabel = function (k, lang) {
    if (lang === 'ja') return k;
    var m = /^counter-(\d+)$/.exec(k);
    if (m) return +m[1] === 12 ? 'Other' : 'Defect ' + m[1];
    if (Object.prototype.hasOwnProperty.call(EN, k)) return EN[k];
    // unknown plain-ASCII keys: "firstCycleAt" -> "First Cycle At", "break1" -> "Break 1"
    if (/^[A-Za-z][A-Za-z0-9_ ]*$/.test(k) && !/^[A-Z][A-Z0-9]*$/.test(k)) {
      return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); }).replace(/\bQr\b/g, 'QR').replace(/\bIp\b/g, 'IP').replace(/\bSku\b/g, 'SKU').replace(/\bNc\b/g, 'NC').replace(/\bIds?\b/g, function (w) { return w === 'Id' ? 'ID' : 'IDs'; });
    }
    return k;
  };
})();
