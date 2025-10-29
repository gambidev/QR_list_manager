const tableContainer = document.getElementById('table-container');

export function renderTable(columns, data, options = {}) {
    clearTable();
    if (!columns || columns.length === 0) {
        tableContainer.innerHTML = '<p>Nenhuma coluna definida para esta lista.</p>';
        updateRowCount(0);
        return;
    }

    const table = document.createElement('table');
    
    // Create header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    // spare column for delete icon
    const thDel = document.createElement('th');
    thDel.style.width = '40px';
    headerRow.appendChild(thDel);
    const thStatus = document.createElement('th');
    thStatus.textContent = 'Status';
    headerRow.appendChild(thStatus);
    columns.forEach(colName => {
        const th = document.createElement('th');
        th.textContent = colName;
        headerRow.appendChild(th);
    });

    // Create body
    const tbody = table.createTBody();
    data.forEach((rowData, rowIndex) => {
        const row = tbody.insertRow();
        row.dataset.rowIndex = rowIndex;
        
        // Delete icon cell
        const delCell = row.insertCell();
        delCell.className = 'row-del-cell';
        delCell.innerHTML = `<button class="row-del-btn" title="Remover linha" data-row-index="${rowIndex}">🗑️</button>`;
        
        // Ensure rowData has an entry for each column
        // The first two elements of rowData are the hidden date and time, so we start data access from index 2
        const statusCell = row.insertCell();
        statusCell.className = 'row-status-cell';
        const rowKey = `${rowData[0]}T${rowData[1]}`;
        const sent = options.isSent ? options.isSent(rowKey) : false;
        statusCell.innerHTML = sent ? '☁️' : `<button class="row-send-btn" data-row-index="${rowIndex}">Enviar</button>`;
        
        for (let i = 0; i < columns.length; i++) {
            const cellData = rowData[i + 2] !== undefined ? rowData[i + 2] : '';
            const cell = row.insertCell();
            cell.textContent = cellData;
            cell.setAttribute('contenteditable', 'true');
            cell.dataset.colIndex = i;
        }

        // If there is more data than columns, add an indicator
        // We subtract 2 from rowData.length to account for the date and time
        if ((rowData.length - 2) > columns.length) {
            const extraCell = row.insertCell();
            extraCell.textContent = '...';
            extraCell.title = `Dados extras: ${rowData.slice(columns.length + 2).join(', ')}`;
        }
    });

    tableContainer.appendChild(table);
    updateRowCount(data.length);
}

export function clearTable() {
    tableContainer.innerHTML = '';
}

export function updateRowCount(count) {
    document.getElementById('row-count').textContent = `Linhas: ${count}`;
}