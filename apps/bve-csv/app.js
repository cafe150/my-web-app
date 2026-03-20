// BVE CSV Time Interpolation Tool
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const previewSection = document.getElementById('previewSection');
    const actionsSection = document.getElementById('actionsSection');
    const statsSection = document.getElementById('statsSection');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const interpolateBtn = document.getElementById('interpolateBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    let csvData = null;
    let headers = null;
    let headerLine = '';
    let isInterpolated = false;
    let arrivalTimeIndex = -1;
    let departureTimeIndex = -1;
    let interpolationInfo = { arrival: new Set(), departure: new Set() };

    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            processFile(file);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    });

    uploadArea.addEventListener('click', (e) => {
        if (e.target !== fileInput && !e.target.closest('.upload-btn')) {
            fileInput.click();
        }
    });

    interpolateBtn.addEventListener('click', interpolateTimes);
    downloadBtn.addEventListener('click', downloadCSV);

    function processFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            parseCSV(content);
        };
        // Try to read as Shift-JIS first, fallback to UTF-8
        reader.readAsText(file, 'Shift_JIS');
    }

    function parseCSV(content) {
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            alert('CSVファイルが空か、データが不足しています。');
            return;
        }

        // First line is the format header
        headerLine = lines[0];

        // Second line is the column headers
        headers = lines[1].split(',');

        // Find arrivalTime and departureTime columns
        arrivalTimeIndex = headers.findIndex(h => h.toLowerCase().includes('arrivaltime'));
        departureTimeIndex = headers.findIndex(h => h.toLowerCase().includes('deperturetime') || h.toLowerCase().includes('departuretime'));

        if (arrivalTimeIndex === -1 && departureTimeIndex === -1) {
            alert('arrivalTime または departureTime カラムが見つかりません。');
            return;
        }

        // Parse data rows
        csvData = [];
        for (let i = 2; i < lines.length; i++) {
            const row = parseCSVRow(lines[i]);
            if (row.length > 0) {
                csvData.push(row);
            }
        }

        // Reset interpolation state
        isInterpolated = false;
        interpolationInfo = { arrival: new Set(), departure: new Set() };
        downloadBtn.disabled = true;

        displayData();
        updateStats();
    }

    function parseCSVRow(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    function displayData() {
        // Display headers
        tableHead.innerHTML = '<tr>' + headers.map((h, i) => {
            const isTimeColumn = i === arrivalTimeIndex || i === departureTimeIndex;
            return `<th${isTimeColumn ? ' style="background: rgba(0, 212, 255, 0.2);"' : ''}>${h}</th>`;
        }).join('') + '</tr>';

        // Display data rows
        tableBody.innerHTML = csvData.map((row, rowIndex) => {
            return '<tr>' + row.map((cell, colIndex) => {
                let className = '';

                if (colIndex === arrivalTimeIndex) {
                    if (interpolationInfo.arrival.has(rowIndex)) {
                        className = 'interpolated';
                    } else if (cell.toLowerCase() === 'p') {
                        className = 'pass-station';
                    } else if (cell === '' || cell === undefined) {
                        className = 'empty-cell';
                    }
                } else if (colIndex === departureTimeIndex) {
                    if (interpolationInfo.departure.has(rowIndex)) {
                        className = 'interpolated';
                    } else if (cell.toLowerCase() === 'p') {
                        className = 'pass-station';
                    } else if (cell === '' || cell === undefined) {
                        className = 'empty-cell';
                    }
                }

                return `<td class="${className}">${cell !== undefined ? cell : ''}</td>`;
            }).join('') + '</tr>';
        }).join('');

        previewSection.style.display = 'block';
        actionsSection.style.display = 'flex';
        statsSection.style.display = 'grid';
    }

    function interpolateTimes() {
        if (!csvData || csvData.length === 0) return;

        // Clear previous interpolation info
        interpolationInfo = { arrival: new Set(), departure: new Set() };

        // Interpolate arrivalTime
        if (arrivalTimeIndex !== -1) {
            interpolateColumn(arrivalTimeIndex, 'arrival');
        }

        // Interpolate departureTime
        if (departureTimeIndex !== -1) {
            interpolateColumn(departureTimeIndex, 'departure');
        }

        isInterpolated = true;
        downloadBtn.disabled = false;
        displayData();
        updateStats();
    }

    function interpolateColumn(colIndex, type) {
        // Find segments between valid times (skip 'p' entries, focus on empty cells)
        let i = 0;
        while (i < csvData.length) {
            const cellValue = csvData[i][colIndex];

            // Skip if this cell is 'p' (pass station) or already has a valid time
            if (cellValue && cellValue.toLowerCase() === 'p') {
                i++;
                continue;
            }

            if (isValidTime(cellValue)) {
                i++;
                continue;
            }

            // Found an empty cell - find the range to interpolate
            const startIndex = findPreviousValidTime(colIndex, i);
            const endIndex = findNextValidTime(colIndex, i);

            if (startIndex !== -1 && endIndex !== -1) {
                // Interpolate between startIndex and endIndex
                const startTime = parseTime(csvData[startIndex][colIndex]);

                // Count how many cells need interpolation (excluding 'p')
                let cellsToInterpolate = [];
                for (let j = startIndex + 1; j < endIndex; j++) {
                    const val = csvData[j][colIndex];
                    if (!val || val === '' || (val.toLowerCase() !== 'p' && !isValidTime(val))) {
                        cellsToInterpolate.push(j);
                    }
                }

                if (cellsToInterpolate.length > 0) {
                    // 15秒間隔で補間
                    const step = 15; // 15秒固定

                    cellsToInterpolate.forEach((idx, position) => {
                        const interpolatedTime = startTime + step * (position + 1);
                        csvData[idx][colIndex] = formatTime(interpolatedTime);
                        interpolationInfo[type].add(idx);
                    });
                }

                i = endIndex + 1;
            } else {
                i++;
            }
        }
    }

    function findPreviousValidTime(colIndex, currentIndex) {
        for (let i = currentIndex - 1; i >= 0; i--) {
            const cell = csvData[i][colIndex];
            if (isValidTime(cell)) {
                return i;
            }
        }
        return -1;
    }

    function findNextValidTime(colIndex, currentIndex) {
        for (let i = currentIndex + 1; i < csvData.length; i++) {
            const cell = csvData[i][colIndex];
            if (isValidTime(cell)) {
                return i;
            }
        }
        return -1;
    }

    function isValidTime(value) {
        if (!value || value === '') return false;
        if (value.toLowerCase() === 'p' || value.toLowerCase() === 't') return false;
        // Check if it matches time format H:MM:SS or HH:MM:SS
        return /^\d{1,2}:\d{2}:\d{2}$/.test(value);
    }

    function parseTime(timeStr) {
        const parts = timeStr.split(':');
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(parts[2], 10);
        return hours * 3600 + minutes * 60 + seconds;
    }

    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.round(totalSeconds % 60);
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function updateStats() {
        document.getElementById('totalRows').textContent = csvData ? csvData.length : 0;
        document.getElementById('interpolatedArrival').textContent = interpolationInfo.arrival.size;
        document.getElementById('interpolatedDeparture').textContent = interpolationInfo.departure.size;
    }

    function downloadCSV() {
        if (!csvData || !isInterpolated) return;

        // Reconstruct CSV
        let csvContent = headerLine + '\n';
        csvContent += headers.join(',') + '\n';
        csvContent += csvData.map(row => row.join(',')).join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'interpolated_stations.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});
