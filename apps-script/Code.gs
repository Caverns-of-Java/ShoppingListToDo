/*
  Google Apps Script Web App backend for Shopping List + To Do app.
  Deploy as: Execute as Me, Who has access: Anyone.

  Expected POST body (text/plain with JSON string):
  {
    "action": "listRecords|createRecord|updateRecord|completeRecord",
    "listType": "shopping|todo",
    ...
  }
*/

const SHEET_NAMES = {
  shopping: "Shopping",
  todo: "Todo",
  fridge: "Fridge"
};

const LIST_SCHEMAS = {
  shopping: ["Id", "Description", "Owner", "Completed", "CreatedAt", "UpdatedAt", "CompletedAt"],
  todo: ["Id", "Description", "Owner", "Completed", "CreatedAt", "UpdatedAt", "CompletedAt"],
  fridge: ["Id", "Description", "Owner", "Status", "CreatedAt", "UpdatedAt"]
};

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const action = payload.action;
    const listType = payload.listType;

    if (!action || !listType || !SHEET_NAMES[listType]) {
      return json_({ ok: false, error: "Invalid action or list type." });
    }

    switch (action) {
      case "listRecords":
        return json_({ ok: true, records: listRecords_(listType) });
      case "createRecord":
        createRecord_(listType, payload.record || {});
        return json_({ ok: true });
      case "updateRecord":
        updateRecord_(listType, payload.id, payload.updates || {});
        return json_({ ok: true });
      case "completeRecord":
        updateRecord_(listType, payload.id, payload.updates || {});
        return json_({ ok: true });
      default:
        return json_({ ok: false, error: "Unsupported action." });
    }
  } catch (error) {
    return json_({ ok: false, error: error.message || "Unknown server error." });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Missing payload.");
  }
  return JSON.parse(e.postData.contents);
}

function getSheet_(listType) {
  const sheetName = SHEET_NAMES[listType];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Missing sheet: " + sheetName);
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  const sheetName = sheet.getName();
  const listType = Object.keys(SHEET_NAMES).find(function (key) {
    return SHEET_NAMES[key] === sheetName;
  });
  const headers = LIST_SCHEMAS[listType] || [];
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = firstRow.some(function (value) {
    return String(value || "").trim() !== "";
  });

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function listRecords_(listType) {
  const sheet = getSheet_(listType);
  ensureHeaders_(sheet);
  const headers = LIST_SCHEMAS[listType];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  if (listType === "fridge") {
    return values.map(function (row) {
      return {
        id: String(row[0] || ""),
        description: String(row[1] || ""),
        owner: String(row[2] || ""),
        status: String(row[3] || "In Fridge"),
        createdAt: String(row[4] || ""),
        updatedAt: String(row[5] || "")
      };
    });
  }

  return values.map(function (row) {
    return {
      id: String(row[0] || ""),
      description: String(row[1] || ""),
      owner: String(row[2] || ""),
      completed: Boolean(row[3]),
      createdAt: String(row[4] || ""),
      updatedAt: String(row[5] || ""),
      completedAt: String(row[6] || "")
    };
  });
}

function createRecord_(listType, record) {
  const sheet = getSheet_(listType);
  ensureHeaders_(sheet);

  const id = Utilities.getUuid();
  if (listType === "fridge") {
    const fridgeRow = [
      id,
      String(record.description || "").trim(),
      String(record.owner || "").trim(),
      String(record.status || "In Fridge").trim(),
      String(record.createdAt || ""),
      String(record.updatedAt || "")
    ];
    sheet.appendRow(fridgeRow);
    return;
  }

  const row = [
    id,
    String(record.description || "").trim(),
    String(record.owner || "").trim(),
    Boolean(record.completed),
    String(record.createdAt || ""),
    String(record.updatedAt || ""),
    String(record.completedAt || "")
  ];

  sheet.appendRow(row);
}

function updateRecord_(listType, id, updates) {
  if (!id) {
    throw new Error("Missing id.");
  }

  const sheet = getSheet_(listType);
  ensureHeaders_(sheet);
  const headers = LIST_SCHEMAS[listType];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    throw new Error("No records available.");
  }

  const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let rowIndex = -1;

  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0]) === String(id)) {
      rowIndex = i + 2;
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error("Record not found.");
  }

  const current = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  if (listType === "fridge") {
    current[1] = updates.description !== undefined ? String(updates.description) : current[1];
    current[3] = updates.status !== undefined ? String(updates.status) : current[3];
    current[5] = updates.updatedAt !== undefined ? String(updates.updatedAt) : current[5];
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([current]);
    return;
  }

  current[1] = updates.description !== undefined ? String(updates.description) : current[1];
  current[3] = updates.completed !== undefined ? Boolean(updates.completed) : current[3];
  current[5] = updates.updatedAt !== undefined ? String(updates.updatedAt) : current[5];
  current[6] = updates.completedAt !== undefined ? String(updates.completedAt) : current[6];

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([current]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
