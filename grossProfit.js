let nouhinData = null;
let hacchuData = null;
let finalMergedData = null;
let allDates = [];

const fileNouhin = document.getElementById('file-nouhin');
const fileHacchu = document.getElementById('file-hacchu');
const statusNouhin = document.getElementById('status-nouhin');
const statusHacchu = document.getElementById('status-hacchu');
const btnProcess = document.getElementById('btn-process');
const btnExportExcel = document.getElementById('btn-export-excel');
const btnExportPdf = document.getElementById('btn-export-pdf');
const resultsContainer = document.getElementById('results-container');
const tableWrapper = document.getElementById('table-wrapper');

// File upload handlers
fileNouhin.addEventListener('change', (e) => handleFileUpload(e, 'nouhin'));
fileHacchu.addEventListener('change', (e) => handleFileUpload(e, 'hacchu'));

btnProcess.addEventListener('click', processData);
btnExportExcel.addEventListener('click', exportToExcel);
btnExportPdf.addEventListener('click', exportToPdf);

function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const statusEl = type === 'nouhin' ? statusNouhin : statusHacchu;

    // Validate filename
    if (type === 'nouhin' && !fileName.includes('納品登録')) {
        statusEl.textContent = 'エラー：ファイル名に「納品登録」が含まれている必要があります';
        statusEl.className = 'status error';
        return;
    }
    if (type === 'hacchu' && !fileName.includes('発注受入登録')) {
        statusEl.textContent = 'エラー：ファイル名に「発注受入登録」が含まれている必要があります';
        statusEl.className = 'status error';
        return;
    }

    // Read Excel
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON (array of arrays)
        // raw: false ensures we get formatted strings like "2026-05" instead of excel serial numbers for dates
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false });
        
        if (type === 'nouhin') {
            nouhinData = json;
            statusEl.textContent = `読み込み完了: ${fileName}`;
            statusEl.className = 'status success';
        } else {
            hacchuData = json;
            statusEl.textContent = `読み込み完了: ${fileName}`;
            statusEl.className = 'status success';
        }

        checkReadyToProcess();
    };
    reader.readAsArrayBuffer(file);
}

function checkReadyToProcess() {
    if (nouhinData && hacchuData) {
        btnProcess.style.display = 'block';
    }
}

function processData() {
    // Both excels start data at Row 4 (index 3 in 0-indexed array)
    if (nouhinData.length < 4 || hacchuData.length < 4) {
        alert("Excelのフォーマットが正しくありません。4行目にヘッダーがあることを確認してください。");
        return;
    }

    const nouhinHeaders = nouhinData[3];
    const hacchuHeaders = hacchuData[3];

    // Extract dates (assuming column index 1 and onwards are dates matching yyyy-mm or similar)
    const nouhinDates = nouhinHeaders.slice(1).filter(Boolean).map(String);
    const hacchuDates = hacchuHeaders.slice(1).filter(Boolean).map(String);

    // Merge unique dates and sort them
    const datesSet = new Set([...nouhinDates, ...hacchuDates]);
    allDates = Array.from(datesSet).sort();

    // Map data by 取引先コード
    const dataByCode = {};

    // Helper to process rows
    const processRows = (rows, headerRow, typeKey) => {
        for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0 || row[0] === null || row[0] === undefined) continue;
            
            const code = String(row[0]).trim();
            if (code === "") continue;

            if (!dataByCode[code]) {
                dataByCode[code] = { nouhin: {}, hacchu: {}, hasNouhin: false, hasHacchu: false };
            }
            
            if (typeKey === 'nouhin') dataByCode[code].hasNouhin = true;
            if (typeKey === 'hacchu') dataByCode[code].hasHacchu = true;

            // Fill date values
            for (let j = 1; j < headerRow.length; j++) {
                const dateKey = String(headerRow[j]);
                if (dateKey && dateKey !== "null" && dateKey !== "undefined") {
                    // Remove commas and parse float, default to 0
                    const rawVal = row[j] !== null && row[j] !== undefined ? String(row[j]).replace(/,/g, '') : "0";
                    const val = parseFloat(rawVal) || 0;
                    dataByCode[code][typeKey][dateKey] = val;
                }
            }
        }
    };

    processRows(nouhinData, nouhinHeaders, 'nouhin');
    processRows(hacchuData, hacchuHeaders, 'hacchu');

    // Filter out codes that don't exist in both files
    const filteredData = {};
    for (const code in dataByCode) {
        if (dataByCode[code].hasNouhin && dataByCode[code].hasHacchu) {
            filteredData[code] = dataByCode[code];
        }
    }

    finalMergedData = filteredData;
    renderTable();

    // Show export buttons
    btnExportExcel.style.display = 'inline-block';
    btnExportPdf.style.display = 'inline-block';
}

function renderTable() {
    let html = `<table id="result-table">
        <thead>
            <tr>
                <th>取引先コード</th>
                <th>項目</th>`;
    
    // Date headers
    allDates.forEach(date => {
        html += `<th>${date}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Sort codes numerically if possible
    const sortedCodes = Object.keys(finalMergedData).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b);
    });

    sortedCodes.forEach(code => {
        const item = finalMergedData[code];
        
        // 1. 納品登録 row
        html += `<tr>
            <td class="code-cell" rowspan="4">${code}</td>
            <td class="label-cell highlight-row">納品登録</td>`;
        allDates.forEach(date => {
            const val = item.nouhin[date] || 0;
            html += `<td class="highlight-row">${formatNumber(val)}</td>`;
        });
        html += `</tr>`;

        // 2. 発注受入登録 row
        html += `<tr>
            <td class="label-cell highlight-row">発注受入登録</td>`;
        allDates.forEach(date => {
            const val = item.hacchu[date] || 0;
            html += `<td class="highlight-row">${formatNumber(val)}</td>`;
        });
        html += `</tr>`;

        // 3. 粗利 row
        html += `<tr>
            <td class="label-cell">粗利</td>`;
        allDates.forEach(date => {
            const nouhin = item.nouhin[date] || 0;
            const hacchu = item.hacchu[date] || 0;
            const profit = nouhin - hacchu;
            html += `<td>${formatNumber(profit)}</td>`;
        });
        html += `</tr>`;

        // 4. 粗利率 row
        html += `<tr>
            <td class="label-cell">粗利率</td>`;
        allDates.forEach(date => {
            const nouhin = item.nouhin[date] || 0;
            const hacchu = item.hacchu[date] || 0;
            const profit = nouhin - hacchu;
            let margin = 0;
            if (nouhin !== 0) {
                margin = (profit / nouhin) * 100;
            }
            html += `<td>${margin.toFixed(2)}%</td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    
    tableWrapper.innerHTML = html;
    resultsContainer.style.display = 'block';
}

function formatNumber(num) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function exportToExcel() {
    if (!finalMergedData || allDates.length === 0) return;

    const aoa = [];
    const headerRow = ["取引先コード", "項目", ...allDates];
    aoa.push(headerRow);

    const sortedCodes = Object.keys(finalMergedData).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b);
    });

    sortedCodes.forEach(code => {
        const item = finalMergedData[code];
        
        const rowNouhin = [code, "納品登録"];
        const rowHacchu = ["", "発注受入登録"];
        const rowProfit = ["", "粗利"];
        const rowMargin = ["", "粗利率"];

        allDates.forEach(date => {
            const nouhin = item.nouhin[date] || 0;
            const hacchu = item.hacchu[date] || 0;
            const profit = nouhin - hacchu;
            let margin = 0;
            if (nouhin !== 0) {
                margin = profit / nouhin;
            }

            rowNouhin.push(nouhin);
            rowHacchu.push(hacchu);
            rowProfit.push(profit);
            rowMargin.push(margin); // Export as raw number for excel percentage formatting
        });

        aoa.push(rowNouhin);
        aoa.push(rowHacchu);
        aoa.push(rowProfit);
        aoa.push(rowMargin);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Apply formatting
    const range = XLSX.utils.decode_range(ws['!ref']);
    for(let R = range.s.r; R <= range.e.r; ++R) {
        if (R > 0 && (R - 4) % 4 === 0) {
            // Margin rows
            for(let C = 2; C <= range.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({r: R, c: C});
                if(!ws[cellRef]) continue;
                ws[cellRef].z = "0.00%";
            }
        } else if (R > 0) {
            // Other numbers
            for(let C = 2; C <= range.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({r: R, c: C});
                if(!ws[cellRef]) continue;
                ws[cellRef].z = "#,##0";
            }
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gross Profit");
    XLSX.writeFile(wb, "GrossProfit_Export.xlsx");
}

function exportToPdf() {
    const element = document.getElementById('table-wrapper');
    
    // Configure html2pdf
    // Using default fonts in the page for the PDF to support Japanese characters via html2canvas
    const opt = {
        margin:       10,
        filename:     'GrossProfit_Export.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save();
}
