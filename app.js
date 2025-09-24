import { renderTable, clearTable, updateRowCount } from './list-view.js';
import { startScanner, stopScanner } from './qr-scanner.js';
import { exportToCSV } from './export.js';

const screens = {
    home: document.getElementById('home-screen'),
    listView: document.getElementById('list-view-screen'),
};

const modals = {
    backdrop: document.getElementById('modal-backdrop'),
    newList: document.getElementById('new-list-modal'),
    defineCols: document.getElementById('define-columns-modal'),
    editCols: document.getElementById('edit-columns-modal'),
    addManual: document.getElementById('add-manual-modal'),
    qrScanner: document.getElementById('qr-scanner-modal'),
    qrPreview: document.getElementById('qr-preview-modal'),
    confirmDeleteRow: document.getElementById('confirm-delete-row-modal'),
};

const state = {
    lists: {},
    currentListId: null,
};

let pendingDelete = {
    rowIndex: null
};

// --- MODAL MANAGEMENT ---
function showModal(modal) {
    modals.backdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
}
function hideAllModals() {
    modals.backdrop.classList.add('hidden');
    Object.values(modals).forEach(m => m.classList.add('hidden'));
}

// --- DATA PERSISTENCE ---
function saveState() {
    localStorage.setItem('qr-list-manager-data', JSON.stringify(state.lists));
}
function loadState() {
    const data = localStorage.getItem('qr-list-manager-data');
    if (data) {
        state.lists = JSON.parse(data);
    }
}

// --- SCREEN NAVIGATION ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// --- HOME SCREEN LOGIC ---
function renderHomeScreen() {
    const container = document.getElementById('list-container');
    container.innerHTML = '';
    const listIds = Object.keys(state.lists);

    if (listIds.length === 0) {
        container.innerHTML = '<p>Nenhuma lista encontrada. Crie uma para começar!</p>';
        return;
    }

    listIds.sort((a, b) => (state.lists[b].modifiedAt || 0) - (state.lists[a].modifiedAt || 0));

    for (const id of listIds) {
        const list = state.lists[id];
        const card = document.createElement('div');
        card.className = 'list-card';
        const lastMod = list.modifiedAt ? new Date(list.modifiedAt).toLocaleString() : 'Nunca';
        card.innerHTML = `
            <h3>${list.name}</h3>
            <p>Última modificação: ${lastMod}</p>
            <div class="list-card-actions">
                <button class="btn btn-danger" data-id="${id}" data-action="delete">Excluir</button>
                <button class="btn btn-primary" data-id="${id}" data-action="open">Abrir</button>
            </div>
        `;
        container.appendChild(card);
    }
}

// --- LIST VIEW LOGIC ---
function openList(listId) {
    state.currentListId = listId;
    const list = state.lists[listId];

    if (!list) return;

    document.getElementById('list-name-display').textContent = list.name;

    showScreen('listView');

    if (list.columns.length === 0) {
        showModal(modals.defineCols);
    } else {
        renderTable(list.columns, list.data);
    }
}

function saveCurrentList() {
    if (!state.currentListId) return;
    const list = state.lists[state.currentListId];
    list.modifiedAt = new Date().toISOString();
    saveState();
}

function addDataToList(dataArray) {
    if (!state.currentListId) return;
    const list = state.lists[state.currentListId];
    list.data.push(dataArray);
    renderTable(list.columns, list.data);
    saveCurrentList();
    const statusText = Array.isArray(dataArray) ? dataArray.join(', ') : dataArray;
    document.getElementById('last-scan-status').textContent = `Última leitura: ${statusText.substring(0, 30)}...`;
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Home Screen
    document.getElementById('create-new-list-btn').addEventListener('click', () => {
        document.getElementById('new-list-name-input').value = '';
        showModal(modals.newList);
    });

    document.getElementById('list-container').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        const action = target.dataset.action;

        if (action === 'open') {
            openList(id);
        } else if (action === 'delete') {
            if (confirm(`Tem certeza que deseja excluir a lista "${state.lists[id].name}"?`)) {
                delete state.lists[id];
                saveState();
                renderHomeScreen();
            }
        }
    });

    // New List Modal
    document.getElementById('confirm-new-list-btn').addEventListener('click', () => {
        const name = document.getElementById('new-list-name-input').value.trim();
        if (name) {
            const id = `list_${Date.now()}`;
            state.lists[id] = {
                id,
                name,
                columns: [],
                data: [],
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
            };
            saveState();
            hideAllModals();
            openList(id);
        }
    });

    // List View
    document.getElementById('back-to-home-btn').addEventListener('click', () => {
        state.currentListId = null;
        clearTable();
        showScreen('home');
        renderHomeScreen();
    });

    document.getElementById('list-name-display').addEventListener('blur', (e) => {
        if (!state.currentListId) return;
        const newName = e.target.textContent.trim();
        if (newName) {
            state.lists[state.currentListId].name = newName;
            saveCurrentList();
        } else {
            e.target.textContent = state.lists[state.currentListId].name; // revert
        }
    });

    document.getElementById('read-qr-btn').addEventListener('click', () => {
        showModal(modals.qrScanner);
        startScanner((data) => {
            stopScanner();
            const previewContainer = document.getElementById('qr-data-preview');
            previewContainer.innerHTML = ''; // Clear previous preview

            try {
                const jsonData = JSON.parse(data);
                // It's a valid JSON
                const pre = document.createElement('pre');
                pre.textContent = data;
                pre.className = 'hidden'; // Hide the raw data
                previewContainer.appendChild(pre);

                for (const [key, value] of Object.entries(jsonData)) {
                    const entryDiv = document.createElement('div');
                    entryDiv.className = 'qr-preview-item';
                    entryDiv.innerHTML = `<span class="qr-preview-key">${key}:</span> <span class="qr-preview-value">${value}</span>`;
                    previewContainer.appendChild(entryDiv);
                }

            } catch (e) {
                // Not a JSON, treat as plain text
                const pre = document.createElement('pre');
                pre.textContent = data;
                previewContainer.appendChild(pre);
            }

            showModal(modals.qrPreview);
        });
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
        if (!state.currentListId) return;
        const list = state.lists[state.currentListId];
        exportToCSV(list.name, list.columns, list.data);
    });

    // QR Preview Modal
    document.getElementById('confirm-qr-data-btn').addEventListener('click', () => {
        const previewContainer = document.getElementById('qr-data-preview');
        const rawDataPre = previewContainer.querySelector('pre');
        if (!rawDataPre) return;

        const data = rawDataPre.textContent;
        const currentList = state.lists[state.currentListId];
        let dataArray;
        let isJson = false;

        try {
            const jsonData = JSON.parse(data);
            dataArray = Object.values(jsonData);
            isJson = true;

            // Special case: defining columns from JSON keys for a new list
            if (currentList.columns.length === 0) {
                const newColumns = Object.keys(jsonData);
                currentList.columns = newColumns;
            }
        } catch (e) {
            // Fallback for non-JSON data
            dataArray = data.split(',').map(s => s.trim());
        }

        // Add data to the list
        if (currentList.columns.length === 0 && !isJson) {
            // For non-json QR on a new list, create generic columns
            const newColumns = dataArray.map((_, i) => `Campo ${i + 1}`);
            currentList.columns = newColumns;
            currentList.data.push(dataArray);
            renderTable(currentList.columns, currentList.data);
        } else {
            // For existing lists, or new lists with JSON QR, just add the data
            currentList.data.push(dataArray);
            renderTable(currentList.columns, currentList.data);
        }

        saveCurrentList();
        hideAllModals();
    });

    // Define Columns Modal
    document.getElementById('define-cols-manual-btn').addEventListener('click', () => {
        hideAllModals();
        openEditColumnsModal();
    });
    document.getElementById('define-cols-qr-btn').addEventListener('click', () => {
        hideAllModals();
        showModal(modals.qrScanner);
        startScanner((data) => {
            stopScanner();
            const dataArray = data.split(',').map(s => s.trim());
            const newColumns = dataArray.map((_, i) => `Campo ${i + 1}`);
            const currentList = state.lists[state.currentListId];
            currentList.columns = newColumns;
            currentList.data.push(dataArray);
            saveCurrentList();
            hideAllModals();
            renderTable(currentList.columns, currentList.data);
        });
    });

    // Edit Columns
    document.getElementById('edit-columns-btn').addEventListener('click', openEditColumnsModal);

    function openEditColumnsModal() {
        const list = state.lists[state.currentListId];
        const container = document.getElementById('edit-columns-container');
        container.innerHTML = '';
        list.columns.forEach((col, index) => {
            const div = document.createElement('div');
            div.className = 'column-edit-item';
            div.innerHTML = `
                <input type="text" value="${col}" data-index="${index}">
                <button class="btn btn-danger" data-index="${index}">Remover</button>
            `;
            container.appendChild(div);
        });
        showModal(modals.editCols);
    }

    document.getElementById('edit-columns-modal').addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON' && e.target.textContent === 'Remover') {
            e.target.closest('.column-edit-item').remove();
        }
    });

    document.getElementById('add-column-btn').addEventListener('click', () => {
        const container = document.getElementById('edit-columns-container');
        const newIndex = container.children.length;
        const div = document.createElement('div');
        div.className = 'column-edit-item';
        div.innerHTML = `
            <input type="text" placeholder="Nova Coluna" data-index="${newIndex}">
            <button class="btn btn-danger" data-index="${newIndex}">Remover</button>
        `;
        container.appendChild(div);
    });

    document.getElementById('save-edit-cols-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        const inputs = document.querySelectorAll('#edit-columns-container input');
        const newColumns = Array.from(inputs).map(input => input.value.trim()).filter(Boolean);

        list.columns = newColumns;
        saveCurrentList();
        renderTable(list.columns, list.data);
        hideAllModals();
    });

    // Add Manual
    document.getElementById('add-manual-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        const form = document.getElementById('manual-add-form');
        form.innerHTML = '';
        list.columns.forEach((col, i) => {
            const div = document.createElement('div');
            div.className = 'manual-add-item';
            div.innerHTML = `
                <label for="manual-input-${i}">${col}</label>
                <input type="text" id="manual-input-${i}" data-col-name="${col}">
            `;
            form.appendChild(div);
        });
        showModal(modals.addManual);
    });

    document.getElementById('confirm-manual-add-btn').addEventListener('click', () => {
        const inputs = document.querySelectorAll('#manual-add-form input');
        const newRow = Array.from(inputs).map(input => input.value);
        addDataToList(newRow);
        hideAllModals();
    });

    // Table interactions: open deletion confirmation when trash clicked
    document.getElementById('table-container').addEventListener('click', (e) => {
        const btn = e.target.closest('.row-del-btn');
        if (btn) {
            const idx = parseInt(btn.dataset.rowIndex, 10);
            pendingDelete.rowIndex = idx;
            showModal(modals.confirmDeleteRow);
        }
    });

    // Wire confirm/cancel delete modal
    document.getElementById('confirm-delete-row-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        if (!list || pendingDelete.rowIndex === null) return;
        // remove the row from data
        list.data.splice(pendingDelete.rowIndex, 1);
        // persist and re-render
        saveCurrentList();
        renderTable(list.columns, list.data);
        pendingDelete.rowIndex = null;
        hideAllModals();
    });

    document.getElementById('cancel-delete-row-btn').addEventListener('click', () => {
        pendingDelete.rowIndex = null;
        hideAllModals();
    });

    // Generic Modal Cancel
    document.addEventListener('click', (e) => {
        if (e.target.id === 'modal-backdrop' || e.target.id.startsWith('cancel-') || e.target.id === 'close-qr-scanner-btn') {
            hideAllModals();
            stopScanner();
        }
    });

    // Table cell edits
    document.getElementById('table-container').addEventListener('blur', (e) => {
        if(e.target.matches('td[contenteditable="true"]')) {
            const cell = e.target;
            const rowIndex = parseInt(cell.parentElement.dataset.rowIndex, 10);
            const colIndex = parseInt(cell.dataset.colIndex, 10);
            const list = state.lists[state.currentListId];

            if (list && list.data[rowIndex] && list.data[rowIndex][colIndex] !== undefined) {
                list.data[rowIndex][colIndex] = cell.textContent;
                saveCurrentList();
            }
        }
    }, true);
}

// --- INITIALIZATION ---
function init() {
    loadState();
    renderHomeScreen();
    setupEventListeners();
}

init();