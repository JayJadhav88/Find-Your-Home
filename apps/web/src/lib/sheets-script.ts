// Google Apps Script the owner pastes into their spreadsheet (Extensions → Apps Script).
// Keep in sync with docs/10-notifications-and-team.md.
export const SHEETS_APPS_SCRIPT = `// Find Your Home → Google Sheets: adds or updates one row per enquiry.
// 1. Paste this into Extensions → Apps Script and replace PASTE_SECRET_HERE.
// 2. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
// 3. Copy the web app URL (ending in /exec) into Admin → Integrations → Google Sheets.
const SECRET = 'PASTE_SECRET_HERE';
const SHEET_NAME = 'Enquiries';

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  if (!SECRET || SECRET === 'PASTE_SECRET_HERE' || body.secret !== SECRET) return reply({ ok: false, error: 'forbidden' });
  const row = body.enquiry || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const book = SpreadsheetApp.getActive();
    const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
    const keys = Object.keys(row);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(keys);
      sheet.setFrozenRows(1);
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    keys.forEach(function (key) {
      if (headers.indexOf(key) === -1) {
        headers.push(key);
        sheet.getRange(1, headers.length).setValue(key);
      }
    });
    // Values arrive as plain text; text that could be a formula is already escaped.
    const values = headers.map(function (key) { return row[key] === undefined ? '' : String(row[key]); });
    const found = sheet.getRange('A:A').createTextFinder(String(row['Enquiry ID'])).matchEntireCell(true).findNext();
    if (found && found.getRow() > 1) {
      sheet.getRange(found.getRow(), 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
`;
