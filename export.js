function convertToCSV(columns, data) {
    const header = columns.join(',');
    const rows = data.map(row => {
        // Assume row already includes timestamp if columns has it.
        // We ensure data passed matches columns.
        return row.map(cellValue => {
            let cell = cellValue === undefined || cellValue === null ? '' : String(cellValue);
            // Escape quotes and handle commas
            if (cell.includes('"') || cell.includes(',')) {
                cell = `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        }).join(',');
    });
    return [header, ...rows].join('\n');
}

export function exportToCSV(listName, columns, data) {
    const csvContent = convertToCSV(columns, data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    const filename = `${listName.replace(/ /g, '_')}.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}