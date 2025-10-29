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
    listSettings: document.getElementById('list-settings-modal'),
    promptEmail: document.getElementById('prompt-email-modal'),
    promptPhone: document.getElementById('prompt-phone-modal'),
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
        renderTable(list.columns, list.data, {
            isSent: (key) => new Set(list.sentKeys || []).has(key)
        });
    }
}

function saveCurrentList() {
    if (!state.currentListId) return;
    const list = state.lists[state.currentListId];
    list.modifiedAt = new Date().toISOString();
    list.sentKeys = Array.from(new Set(list.sentKeys || []));
    saveState();
}

async function sendToGoogleSheets(dataArray, rowKey) {
    if (!state.currentListId) return;
    const list = state.lists[state.currentListId];
    if (!list.googleSheetUrl) {
        document.getElementById('last-scan-status').textContent = `Sem URL do Google Sheets configurada.`;
        return;
    }

    const payload = {};
    list.columns.forEach((col, index) => {
        payload[col] = dataArray[index] !== undefined ? dataArray[index] : '';
    });

    try {
        const res = await fetch(list.googleSheetUrl, {
            method: 'POST',
            mode: 'cors', // require CORS so we can detect failure
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: new Date().toISOString(), data: payload })
        });

        // Only mark as sent if we have a successful HTTP response
        if (!res.ok) {
            document.getElementById('last-scan-status').textContent = `Falha ao enviar (HTTP ${res.status}).`;
            return;
        }

        // Try to read response (optional success flag handling)
        let ok = true;
        try {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                const json = await res.json();
                ok = json.success !== false; // treat explicit success=false as failure
            } else {
                const text = await res.text();
                // If Apps Script returns specific failure text, treat as failure
                if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) ok = false;
            }
        } catch {
            // If parsing fails but HTTP ok, assume success
            ok = true;
        }

        if (!ok) {
            document.getElementById('last-scan-status').textContent = `Falha ao enviar (resposta do servidor).`;
            return;
        }

        const set = new Set(list.sentKeys || []);
        if (rowKey) set.add(rowKey);
        list.sentKeys = Array.from(set);

        renderTable(list.columns, list.data, { isSent: (k) => new Set(list.sentKeys || []).has(k) });
        document.getElementById('last-scan-status').textContent = `Linha enviada à planilha.`;
        saveCurrentList();
    } catch (error) {
        console.error('Error sending data to Google Sheets:', error);
        document.getElementById('last-scan-status').textContent = `Erro de rede ao enviar para o Google Sheets.`;
        // Do not mark as sent on error
    }
}

function addDataToList(dataArray) {
    if (!state.currentListId) return;
    const list = state.lists[state.currentListId];
    
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toLocaleTimeString('pt-BR'); // HH:MM:SS
    const rowWithTimestamp = [date, time, ...dataArray];

    list.data.push(rowWithTimestamp);
    renderTable(list.columns, list.data, { isSent: (k) => new Set(list.sentKeys || []).has(k) });
    saveCurrentList();
    const rowKey = `${date}T${time}`;
    sendToGoogleSheets(dataArray, rowKey);

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
                recipientName: '',
                recipientEmail: '',
                recipientPhone: '',
                googleSheetUrl: '',
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

    document.getElementById('list-settings-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        if (!list) return;

        document.getElementById('recipient-name').value = list.recipientName || '';
        document.getElementById('recipient-email').value = list.recipientEmail || '';
        document.getElementById('recipient-phone').value = list.recipientPhone || '';
        document.getElementById('google-sheet-url').value = list.googleSheetUrl || '';

        showModal(modals.listSettings);
    });

    document.getElementById('save-list-settings-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        if (!list) return;

        list.recipientName = document.getElementById('recipient-name').value.trim();
        list.recipientEmail = document.getElementById('recipient-email').value.trim();
        list.recipientPhone = document.getElementById('recipient-phone').value.trim();
        list.googleSheetUrl = document.getElementById('google-sheet-url').value.trim();

        saveCurrentList();
        hideAllModals();
    });

    document.getElementById('read-qr-btn').addEventListener('click', () => {
        showModal(modals.qrScanner);
        startScanner((data) => {
            stopScanner();
            const preview = document.getElementById('qr-data-preview');
            preview.innerHTML = '';
            const currentList = state.lists[state.currentListId];
            try {
                const obj = JSON.parse(data);
                const cols = (currentList && currentList.columns.length > 0) ? currentList.columns : Object.keys(obj);
                cols.forEach(col => {
                    const row = document.createElement('div');
                    row.className = 'qr-edit-row';
                    const val = (obj && typeof obj === 'object') ? (obj[col] ?? '') : '';
                    row.innerHTML = `<input class="qr-key" type="text" value="${col}"> <input class="qr-value" type="text" value="${val}">`;
                    preview.appendChild(row);
                });
            } catch {
                // Handle CSV (comma-separated) data: split into values and map to existing columns or create campoN
                const raw = String(data);
                const values = raw.split(',').map(s => s.trim());
                const colsExisting = (currentList && currentList.columns.length > 0)
                    ? currentList.columns
                    : values.map((_, i) => `campo${i + 1}`);
                const maxLen = Math.max(colsExisting.length, values.length);
                for (let i = 0; i < maxLen; i++) {
                    const colName = colsExisting[i] ?? `campo${i + 1}`;
                    const val = values[i] ?? '';
                    const row = document.createElement('div');
                    row.className = 'qr-edit-row';
                    row.innerHTML = `<input class="qr-key" type="text" value="${colName}"> <input class="qr-value" type="text" value="${val}">`;
                    preview.appendChild(row);
                }
            }
            showModal(modals.qrPreview);
        });
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
        if (!state.currentListId) return;
        const list = state.lists[state.currentListId];
        const columnsWithTimestamp = ['Data', 'Hora', ...list.columns];
        exportToCSV(list.name, columnsWithTimestamp, list.data);
    });

    document.getElementById('send-email-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        if (!list) return;

        if (list.recipientEmail) {
            sendEmail(list.recipientEmail);
        } else {
            document.getElementById('prompt-email-input').value = '';
            showModal(modals.promptEmail);
        }
    });

    document.getElementById('confirm-prompt-email-btn').addEventListener('click', () => {
        const email = document.getElementById('prompt-email-input').value.trim();
        if (email) {
            sendEmail(email);
            hideAllModals();
        } else {
            alert('Por favor, insira um e-mail válido.');
        }
    });

    document.getElementById('send-whatsapp-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        if (!list) return;

        if (list.recipientPhone) {
            sendWhatsApp(list.recipientPhone);
        } else {
            document.getElementById('prompt-phone-input').value = '';
            showModal(modals.promptPhone);
        }
    });

    document.getElementById('confirm-prompt-phone-btn').addEventListener('click', () => {
        const phone = document.getElementById('prompt-phone-input').value.trim();
        if (phone) {
            sendWhatsApp(phone);
            hideAllModals();
        } else {
            alert('Por favor, insira um número válido.');
        }
    });

    function getCsvContent() {
        const list = state.lists[state.currentListId];
        const columnsWithTimestamp = ['Data', 'Hora', ...list.columns];
        
        const header = columnsWithTimestamp.join(',');
        const rows = list.data.map(row =>
            row.map(cellValue => {
                let cell = cellValue === undefined ? '' : String(cellValue);
                if (cell.includes('"') || cell.includes(',')) {
                    cell = `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',')
        );
        return [header, ...rows].join('\n');
    }

    function sendEmail(email) {
        const list = state.lists[state.currentListId];
        const columnsWithTimestamp = ['Data', 'Hora', ...list.columns];

        // 1. Download CSV
        exportToCSV(list.name, columnsWithTimestamp, list.data);
        
        // 2. Prepare and open mailto link
        const subject = `Dados da lista: ${list.name}`;
        const body = `Olá,\n\nO arquivo CSV com os dados da lista "${list.name}" foi baixado.\n\nPor favor, anexe o arquivo "${list.name.replace(/ /g, '_')}.csv" da sua pasta de downloads a este e-mail antes de enviar.\n\nObrigado.`;
        const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink, '_blank');
    }
    
    function sendWhatsApp(phone) {
        const list = state.lists[state.currentListId];
        const columnsWithTimestamp = ['Data', 'Hora', ...list.columns];

        // 1. Download CSV
        exportToCSV(list.name, columnsWithTimestamp, list.data);

        // 2. Prepare and open WhatsApp link
        const recipientName = list.recipientName ? `, ${list.recipientName}` : '';
        const message = `Olá${recipientName}!\n\nO arquivo CSV com os dados da lista "${list.name}" acaba de ser baixado.\n\nPor favor, anexe o arquivo ao chat para enviá-lo.`;
        const cleanPhone = phone.replace(/[^0-9]/g, ''); // Remove non-numeric chars
        const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappLink, '_blank');
    }

    // QR Preview Modal
    document.getElementById('confirm-qr-data-btn').addEventListener('click', () => {
        const preview = document.getElementById('qr-data-preview');
        const rows = Array.from(preview.querySelectorAll('.qr-edit-row'));
        const kvs = rows.map(r => ({
            k: r.querySelector('.qr-key').value.trim(),
            v: r.querySelector('.qr-value').value
        })).filter(p => p.k);
        const currentList = state.lists[state.currentListId];
        if (!currentList) return;
        if (currentList.columns.length === 0) {
            currentList.columns = kvs.map(p => p.k);
        } else {
            kvs.forEach(p => { if (!currentList.columns.includes(p.k)) currentList.columns.push(p.k); });
        }
        const values = currentList.columns.map(col => {
            const found = kvs.find(p => p.k === col);
            return found ? found.v : '';
        });
        addDataToList(values);
        saveCurrentList();
        hideAllModals();
    });

    // Define Columns Modal
    document.getElementById('define-cols-manual-btn').addEventListener('click', () => {
        hideAllModals();
        openEditColumnsModal();
    });
    document.getElementById('define-cols-qr-btn')?.addEventListener('click', () => { // Made optional
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
    const editColsBtn = document.getElementById('edit-columns-btn');
    if (editColsBtn) editColsBtn.addEventListener('click', openEditColumnsModal);

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
        const sendBtn = e.target.closest('.row-send-btn');
        if (sendBtn) {
            const idx = parseInt(sendBtn.dataset.rowIndex, 10);
            const list = state.lists[state.currentListId];
            if (!list) return;
            const row = list.data[idx];
            const rowKey = `${row[0]}T${row[1]}`;
            const values = list.columns.map((_, i) => row[i + 2] || '');
            sendToGoogleSheets(values, rowKey);
        }
    });

    // Wire confirm/cancel delete modal
    document.getElementById('confirm-delete-row-btn').addEventListener('click', () => {
        const list = state.lists[state.currentListId];
        if (!list || pendingDelete.rowIndex === null) return;
        const row = list.data[pendingDelete.rowIndex];
        const key = `${row[0]}T${row[1]}`;
        if (list.sentKeys) {
            const set = new Set(list.sentKeys);
            set.delete(key);
            list.sentKeys = Array.from(set);
        }
        list.data.splice(pendingDelete.rowIndex, 1);
        saveCurrentList();
        renderTable(list.columns, list.data, { isSent: (k) => new Set(list.sentKeys || []).has(k) });
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
                // Adjust for hidden date & time columns. colIndex from UI maps to colIndex+2 in data array.
                list.data[rowIndex][colIndex + 2] = cell.textContent;
                saveCurrentList();
            }
        }
    }, true);

    document.getElementById('qr-preview-modal').addEventListener('click', (e) => {
        if (e.target.id === 'add-qr-field-btn') {
            const preview = document.getElementById('qr-data-preview');
            const row = document.createElement('div');
            row.className = 'qr-edit-row';
            row.innerHTML = `<input class="qr-key" type="text" placeholder="Novo campo"> <input class="qr-value" type="text" placeholder="Valor">`;
            preview.appendChild(row);
        }
    });

    document.getElementById('send-pending-btn').addEventListener('click', async () => {
        const list = state.lists[state.currentListId];
        if (!list) return;
        const sentSet = new Set(list.sentKeys || []);
        for (let i = 0; i < list.data.length; i++) {
            const row = list.data[i];
            const key = `${row[0]}T${row[1]}`;
            if (!sentSet.has(key)) {
                const values = list.columns.map((_, idx) => row[idx + 2] || '');
                await sendToGoogleSheets(values, key);
            }
        }
    });
}

// --- INITIALIZATION ---
function init() {
    loadState();
    // ensure lists have sentKeys field
    Object.values(state.lists).forEach(list => { if (!list.sentKeys) list.sentKeys = []; });
    renderHomeScreen();
    setupEventListeners();
}

init();