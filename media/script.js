/* global acquireVsCodeApi */   // Resolve ESLint warning (no-undef)
const vscode = acquireVsCodeApi(); // Resolve ESLint warning (no-undef)

document.addEventListener('DOMContentLoaded', () => {
   const tableContainer = document.getElementById('table-container');

   function triggerCommand(message) {
      console.log('triggerCommand called with message:', message);
      vscode.postMessage({
         command: 'showMessage',
         text: message
      });
   }

   window.triggerCommand = triggerCommand; // Resolve ESLint warning (no-unused-vars)

   // Adjust the height of the table container dynamically
   function adjustTableHeight() {
      const metadataHeight = document.getElementById('metadata').offsetHeight;
      const availableHeight = window.innerHeight - metadataHeight - 20; // 20px for padding/margin
      tableContainer.style.height = `${availableHeight}px`;
   }

   // Initial adjustment
   adjustTableHeight();

   // Adjust on window resize
   window.addEventListener('resize', adjustTableHeight);

   // initial data fetching and population
   fetchData().then(data => {
      populateTable(data);
      updateMetadata(data);
   });

   // Sorting functionality - does not work (as headers are replaced when updating table)
   // document.querySelectorAll('#data-table th').forEach((header, index) => {
   //    header.addEventListener('click', () => {
   //       sortTableByColumn(index);
   //    });
   // });

   // Sorting functionality using event delegation
   const thead = document.querySelector('#data-table thead');
   thead.addEventListener('click', (event) => {
      if (event.target.tagName === 'TH' && event.target.cellIndex > 0) { // Ensure it's a <th> and not the first column
         console.log('Header clicked:', event.target.cellIndex - 1);
         sortTableByColumn(event.target.cellIndex - 1); // Adjust index to account for the row number column
      }
   });

});

let sortOrder = {}; // Object to keep track of sort order for each column

function fetchData() {
   // Simulate fetching data from the extension back-end
   return new Promise(resolve => {
      const data = {
         headers: ['Header 1', 'Header 2', 'Header 3', 'Header 4', 'Header 5', 'Header 6', 'Header 7'], // Example headers
         rows: [
            ['Row 1, Col 1', 'Row 1, Col 2', 'Row 1, Col 3', 'Row 1, Col 4', 'Row 1, Col 5', 'Row 1, Col 6', 'Row 1, Col 7'],
            ['Row 2, Col 1', 'Row 2, Col 2', 'Row 2, Col 3', 'Row 2, Col 4', 'Row 2, Col 5', 'Row 2, Col 6', 'Row 2, Col 7'],
            ['Row 3, Col 1', 'Row 3, Col 2', 'Row 3, Col 3', 'Row 3, Col 4', 'Row 3, Col 5', 'Row 3, Col 6', 'Row 3, Col 7'],
            ['Row 4, Col 1', 'Row 4, Col 2', 'Row 4, Col 3', 'Row 4, Col 4', 'Row 4, Col 5', 'Row 4, Col 6', 'Row 4, Col 7'],
            ['Row 5, Col 1', 'Row 5, Col 2', 'Row 5, Col 3', 'Row 5, Col 4', 'Row 5, Col 5', 'Row 5, Col 6', 'Row 5, Col 7'],
            ['Row 6, Col 1', 'Row 6, Col 2', 'Row 6, Col 3', 'Row 6, Col 4', 'Row 6, Col 5', 'Row 6, Col 6', 'Row 6, Col 7'],
            ['Row 7, Col 1', 'Row 7, Col 2', 'Row 7, Col 3', 'Row 7, Col 4', 'Row 7, Col 5', 'Row 7, Col 6', 'Row 7, Col 7'],
            ['Row 8, Col 1', 'Row 8, Col 2', 'Row 8, Col 3', 'Row 8, Col 4', 'Row 8, Col 5', 'Row 8, Col 6', 'Row 8, Col 7'],
            ['Row 9, Col 1', 'Row 9, Col 2', 'Row 9, Col 3', 'Row 9, Col 4', 'Row 9, Col 5', 'Row 9, Col 6', 'Row 9, Col 7'],
            ['Row 10, Col 1', 'Row 10, Col 2', 'Row 10, Col 3', 'Row 10, Col 4', 'Row 10, Col 5', 'Row 10, Col 6', 'Row 10, Col 7'],
            ['Row 11, Col 1', 'Row 11, Col 2', 'Row 11, Col 3', 'Row 11, Col 4', 'Row 11, Col 5', 'Row 11, Col 6', 'Row 11, Col 7'],
            ['Row 12, Col 1', 'Row 12, Col 2', 'Row 12, Col 3', 'Row 12, Col 4', 'Row 12, Col 5', 'Row 12, Col 6', 'Row 12, Col 7'],
            ['Row 13, Col 1', 'Row 13, Col 2', 'Row 13, Col 3', 'Row 13, Col 4', 'Row 13, Col 5', 'Row 13, Col 6', 'Row 13, Col 7'],
            ['Row 14, Col 1', 'Row 14, Col 2', 'Row 14, Col 3', 'Row 14, Col 4', 'Row 14, Col 5', 'Row 14, Col 6', 'Row 14, Col 7'],
            ['Row 15, Col 1', 'Row 15, Col 2', 'Row 15, Col 3', 'Row 15, Col 4', 'Row 15, Col 5', 'Row 15, Col 6', 'Row 15, Col 7'],
            ['Row 16, Col 1', 'Row 16, Col 2', 'Row 16, Col 3', 'Row 16, Col 4', 'Row 16, Col 5', 'Row 16, Col 6', 'Row 16, Col 7'],
            ['Row 17, Col 1', 'Row 17, Col 2', 'Row 17, Col 3', 'Row 17, Col 4', 'Row 17, Col 5', 'Row 17, Col 6', 'Row 17, Col 7'],
            ['Row 18, Col 1', 'Row 18, Col 2', 'Row 18, Col 3', 'Row 18, Col 4', 'Row 18, Col 5', 'Row 18, Col 6', 'Row 18, Col 7'],
            ['Row 19, Col 1', 'Row 19, Col 2', 'Row 19, Col 3', 'Row 19, Col 4', 'Row 19, Col 5', 'Row 19, Col 6', 'Row 19, Col 7'],
            ['Row 20, Col 1', 'Row 20, Col 2', 'Row 20, Col 3', 'Row 20, Col 4', 'Row 20, Col 5', 'Row 20, Col 6', 'Row 20, Col 7'],
            ['Row 21, Col 1', 'Row 21, Col 2', 'Row 21, Col 3', 'Row 21, Col 4', 'Row 21, Col 5', 'Row 21, Col 6', 'Row 21, Col 7'],
            ['Row 22, Col 1', 'Row 22, Col 2', 'Row 22, Col 3', 'Row 22, Col 4', 'Row 22, Col 5', 'Row 22, Col 6', 'Row 22, Col 7'],
            ['Row 23, Col 1', 'Row 23, Col 2', 'Row 23, Col 3', 'Row 23, Col 4', 'Row 23, Col 5', 'Row 23, Col 6', 'Row 23, Col 7'],
            ['Row 24, Col 1', 'Row 24, Col 2', 'Row 24, Col 3', 'Row 24, Col 4', 'Row 24, Col 5', 'Row 24, Col 6', 'Row 24, Col 7'],
            ['Row 25, Col 1', 'Row 25, Col 2', 'Row 25, Col 3', 'Row 25, Col 4', 'Row 25, Col 5', 'Row 25, Col 6', 'Row 25, Col 7'],
            ['Row 26, Col 1', 'Row 26, Col 2', 'Row 26, Col 3', 'Row 26, Col 4', 'Row 26, Col 5', 'Row 26, Col 6', 'Row 26, Col 7'],
            ['Row 27, Col 1', 'Row 27, Col 2', 'Row 27, Col 3', 'Row 27, Col 4', 'Row 27, Col 5', 'Row 27, Col 6', 'Row 27, Col 7'],
            ['Row 28, Col 1', 'Row 28, Col 2', 'Row 28, Col 3', 'Row 28, Col 4', 'Row 28, Col 5', 'Row 28, Col 6', 'Row 28, Col 7'],
            ['Row 29, Col 1', 'Row 29, Col 2', 'Row 29, Col 3', 'Row 29, Col 4', 'Row 29, Col 5', 'Row 29, Col 6', 'Row 29, Col 7'],
            ['Row 30, Col 1', 'Row 30, Col 2', 'Row 30, Col 3', 'Row 30, Col 4', 'Row 30, Col 5', 'Row 30, Col 6', 'Row 30, Col 7'],
               // Add more rows as needed
         ]
      };
      if (!data.rowHeaders) {
         data.rowHeaders = data.rows.map((r,i) => `Obs ${i+1}`);
      }
      resolve(data);
   });
}

function populateTable(data) {
   const thead = document.querySelector('#data-table thead');
   const tbody = document.querySelector('#data-table tbody');

   // Clear existing table content
   thead.innerHTML = '';
   tbody.innerHTML = '';

   // Create table headers
   const headerRow = document.createElement('tr');
   const numberHeader = document.createElement('th');
   numberHeader.textContent = '#';
   headerRow.appendChild(numberHeader);

   data.headers.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      headerRow.appendChild(th);
   });
   thead.appendChild(headerRow);

   // Create table rows
   data.rows.forEach((rowData, index) => {
      const tr = document.createElement('tr');
      const rowHeaderCell = document.createElement('th');
      rowHeaderCell.textContent = data.rowHeaders[index];
      tr.appendChild(rowHeaderCell);

      rowData.forEach(cellData => {
         const td = document.createElement('td');
         td.textContent = cellData;
         tr.appendChild(td);
      });
      tbody.appendChild(tr);
   });
}

function updateMetadata(data) {
   document.getElementById('source').textContent = 'Example Source';
   document.getElementById('filters').textContent = 'None';
   document.getElementById('start').textContent = 1;
   document.getElementById('end').textContent = data.rows.length;
   document.getElementById('total').textContent = data.rows.length;
}

function sortTableByColumn(columnIndex) {
   console.log(`sortTableByColumn called with columnIndex: ${columnIndex}`);
   const table = document.getElementById('data-table');
   const tbody = table.querySelector('tbody');
   const rows = Array.from(tbody.querySelectorAll('tr'));

   // Determine the sort order for this column
   const order = sortOrder[columnIndex] === 'asc' ? 'desc' : 'asc';
   sortOrder[columnIndex] = order;
   console.log(`Sorting in ${order} order...`);

   const sortedRows = rows.sort((a, b) => {
      const aText = a.children[columnIndex + 1].textContent; // +1 to account for the row number column
      const bText = b.children[columnIndex + 1].textContent;
      return order === 'asc' ? aText.localeCompare(bText) : bText.localeCompare(aText);
   });

   tbody.innerHTML = '';
   sortedRows.forEach(row => tbody.appendChild(row));
}



window.addEventListener('message', event => {
   const message = event.data;

   if (message.command === 'updateData') {
      populateTable(message.data);
      updateMetadata(message.metadata);
   }
});

// Example button click to request data update
document.getElementById('update-button').addEventListener('click', () => {
   vscode.postMessage({ command: 'requestData' });
});