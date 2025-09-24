const tableContainer = document.getElementById('table-container');

export function renderTable(columns, data) {
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
        for (let i = 0; i < columns.length; i++) {
            const cellData = rowData[i] !== undefined ? rowData[i] : '';
            const cell = row.insertCell();
            cell.textContent = cellData;
            cell.setAttribute('contenteditable', 'true');
            cell.dataset.colIndex = i;
        }

        // If there is more data than columns, add an indicator
        if (rowData.length > columns.length) {
            const extraCell = row.insertCell();
            extraCell.textContent = '...';
            extraCell.title = `Dados extras: ${rowData.slice(columns.length).join(', ')}`;
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