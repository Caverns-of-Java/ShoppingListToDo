const APP_CONFIG = {
  endpointUrl: "https://script.google.com/macros/s/AKfycbyBVcK1yEsCOJfXl36g9Fnan-l7DBnqWcQAr0b-rmNRutTHRTzqns37NPjZjwmxBo9Y/exec",
  passcodeHash: "21eb478c997305f06e5e0d043d3ec5acc63a85938da69e14f239f34a8348fc54",
  owners: ["Ken", "Ethan"]
};

const state = {
  status: "Synced",
  busy: false,
  currentTab: "shopping",
  records: {
    shopping: [],
    todo: [],
    fridge: []
  }
};

const el = {
  gate: document.getElementById("gate"),
  app: document.getElementById("app"),
  gateForm: document.getElementById("gate-form"),
  passcode: document.getElementById("passcode"),
  gateError: document.getElementById("gate-error"),
  statusChip: document.getElementById("status-chip"),
  tabSelect: document.getElementById("tab-select"),
  panels: Array.from(document.querySelectorAll(".panel")),
  shoppingList: document.getElementById("shopping-list"),
  todoList: document.getElementById("todo-list"),
  fridgeList: document.getElementById("fridge-list"),
  shoppingEmpty: document.getElementById("shopping-empty"),
  todoEmpty: document.getElementById("todo-empty"),
  fridgeEmpty: document.getElementById("fridge-empty"),
  shoppingToggleAdd: document.getElementById("shopping-toggle-add"),
  todoToggleAdd: document.getElementById("todo-toggle-add"),
  fridgeToggleAdd: document.getElementById("fridge-toggle-add"),
  shoppingAddForm: document.getElementById("shopping-add-form"),
  todoAddForm: document.getElementById("todo-add-form"),
  fridgeAddForm: document.getElementById("fridge-add-form")
};

function setHidden(node, shouldHide) {
  node.hidden = shouldHide;
  node.classList.toggle("hidden", shouldHide);
}

function setStatus(status) {
  state.status = status;
  const key = status.toLowerCase();
  el.statusChip.textContent = status;
  el.statusChip.className = `status-chip ${key}`;
}

function setBusy(isBusy, statusWhenBusy = "Loading") {
  state.busy = isBusy;
  if (isBusy) {
    setStatus(statusWhenBusy);
  }
  el.app.classList.toggle("busy", isBusy);
  el.tabSelect.disabled = isBusy;

  for (const form of [el.shoppingAddForm, el.todoAddForm, el.fridgeAddForm]) {
    for (const node of form.querySelectorAll("input, select, button")) {
      node.disabled = isBusy;
    }
  }
}

function toLocalDateLabel(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function sortByNewest(items) {
  return [...items].sort((a, b) => {
    const first = new Date(b.createdAt || 0).getTime();
    const second = new Date(a.createdAt || 0).getTime();
    return first - second;
  });
}

const FRIDGE_STATUSES = ["Ready to Eat", "In Fridge", "Freezer", "Pantry", "Used"];
const STATUS_ORDER = { "Ready to Eat": 0, "In Fridge": 1, "Freezer": 2, "Pantry": 3 };

function sortFridgeRecords(items) {
  return [...items].sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? 99;
    const orderB = STATUS_ORDER[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

function getOwnerLabel(tab) {
  return tab === "shopping" ? "Author" : "Assigned";
}

function parseRecords(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => {
      const completedValue = item.completed ?? item.Completed;
      const completed =
        completedValue === true ||
        completedValue === 1 ||
        String(completedValue).toLowerCase() === "true";

      return {
        id: String(item.id || item.Id || item.ID || ""),
        description: String(item.description || item.Description || "").trim(),
        owner: String(item.owner || item.Owner || item.author || item.Author || item.assigned || item.Assigned || "").trim(),
        completed,
        createdAt: item.createdAt || item.CreatedAt || "",
        updatedAt: item.updatedAt || item.UpdatedAt || "",
        completedAt: item.completedAt || item.CompletedAt || ""
      };
    })
    .filter((item) => item.id && item.description && APP_CONFIG.owners.includes(item.owner) && !item.completed);
}

function parseFridgeRecords(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => ({
      id: String(item.id || item.Id || item.ID || ""),
      description: String(item.description || item.Description || "").trim(),
      owner: String(item.owner || item.Owner || item.author || item.Author || "").trim(),
      status: String(item.status || item.Status || "In Fridge").trim(),
      createdAt: item.createdAt || item.CreatedAt || "",
      updatedAt: item.updatedAt || item.UpdatedAt || ""
    }))
    .filter((item) => item.id && item.description && APP_CONFIG.owners.includes(item.owner) && item.status !== "Used");
}

async function hashText(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function apiRequest(action, payload = {}) {
  if (!APP_CONFIG.endpointUrl) {
    throw new Error("Set APP_CONFIG.endpointUrl in app.js before using the app.");
  }

  const requestBody = JSON.stringify({ action, ...payload });
  const response = await fetch(APP_CONFIG.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: requestBody
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error("Backend response is not valid JSON text.");
  }

  if (!response.ok || !json.ok) {
    throw new Error(json && json.error ? json.error : "Request failed.");
  }

  return json;
}

async function loadRecords() {
  setBusy(true, "Loading");
  try {
    const [shoppingRes, todoRes, fridgeRes] = await Promise.all([
      apiRequest("listRecords", { listType: "shopping" }),
      apiRequest("listRecords", { listType: "todo" }),
      apiRequest("listRecords", { listType: "fridge" })
    ]);

    state.records.shopping = sortByNewest(parseRecords(shoppingRes.records));
    state.records.todo = sortByNewest(parseRecords(todoRes.records));
    state.records.fridge = sortFridgeRecords(parseFridgeRecords(fridgeRes.records));

    renderAll();
    setStatus("Synced");
  } catch (error) {
    console.error(error);
    setStatus("Offline");
  } finally {
    setBusy(false);
  }
}

function togglePanel(tab) {
  if (state.busy) {
    return;
  }

  state.currentTab = tab;
  el.tabSelect.value = tab;
  el.panels.forEach((panel) => {
    setHidden(panel, panel.dataset.panel !== tab);
  });
}

function buildRecordItem(tab, record) {
  const li = document.createElement("li");
  li.className = "record-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", `Mark ${record.description} as completed`);
  checkbox.addEventListener("change", async () => {
    await completeRecord(tab, record.id);
  });

  const main = document.createElement("div");
  main.className = "record-main";

  const desc = document.createElement("div");
  desc.className = "record-desc";
  desc.textContent = record.description;

  desc.addEventListener("click", () => {
    if (state.busy) {
      return;
    }
    renderEditState(tab, record, main);
  });

  const meta = document.createElement("div");
  meta.className = "record-meta";
  const ownerLabel = getOwnerLabel(tab);
  const when = toLocalDateLabel(record.createdAt);
  meta.textContent = `${ownerLabel}: ${record.owner}${when ? ` | Created: ${when}` : ""}`;

  main.append(desc, meta);
  li.append(checkbox, main);
  return li;
}

function buildFridgeItem(record) {
  const li = document.createElement("li");
  li.className = "record-item";

  const statusSelect = document.createElement("select");
  statusSelect.className = "fridge-status-select";
  statusSelect.setAttribute("aria-label", `Status for ${record.description}`);
  for (const s of FRIDGE_STATUSES) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    if (s === record.status) opt.selected = true;
    statusSelect.appendChild(opt);
  }
  statusSelect.addEventListener("change", async () => {
    await updateFridgeStatus(record.id, statusSelect.value, record);
  });

  const main = document.createElement("div");
  main.className = "record-main";

  const desc = document.createElement("div");
  desc.className = "record-desc";
  desc.textContent = record.description;
  desc.addEventListener("click", () => {
    if (state.busy) return;
    renderEditState("fridge", record, main);
  });

  const meta = document.createElement("div");
  meta.className = "record-meta";
  const when = toLocalDateLabel(record.createdAt);
  meta.textContent = `Author: ${record.owner}${when ? ` | Created: ${when}` : ""}`;

  main.append(desc, meta);
  li.append(statusSelect, main);
  return li;
}

function renderEditState(tab, record, targetNode) {
  targetNode.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "edit-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 240;
  input.value = record.description;

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save changes";
  save.addEventListener("click", async () => {
    await saveDescription(tab, record.id, input.value.trim());
  });

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    renderAll();
  });

  actions.append(save, cancel);
  wrap.append(input, actions);
  targetNode.appendChild(wrap);
  input.focus();
}

function renderList(tab) {
  const listNode = tab === "shopping" ? el.shoppingList : tab === "todo" ? el.todoList : el.fridgeList;
  const emptyNode = tab === "shopping" ? el.shoppingEmpty : tab === "todo" ? el.todoEmpty : el.fridgeEmpty;
  const records = state.records[tab];

  listNode.innerHTML = "";
  if (!records.length) {
    setHidden(emptyNode, false);
    return;
  }

  setHidden(emptyNode, true);
  for (const record of records) {
    listNode.appendChild(tab === "fridge" ? buildFridgeItem(record) : buildRecordItem(tab, record));
  }
}

function renderAll() {
  renderList("shopping");
  renderList("todo");
  renderList("fridge");
}

async function createRecord(tab, formData) {
  const owner = (formData.get("owner") || "").toString().trim();
  const description = (formData.get("description") || "").toString().trim();
  if (!description || !APP_CONFIG.owners.includes(owner)) {
    return;
  }

  setBusy(true, "Saving");
  try {
    const now = new Date().toISOString();
    await apiRequest("createRecord", {
      listType: tab,
      record: {
        description,
        owner,
        completed: false,
        createdAt: now,
        updatedAt: now,
        completedAt: ""
      }
    });

    (tab === "shopping" ? el.shoppingAddForm : el.todoAddForm).reset();
    setStatus("Synced");
    await loadRecords();
  } catch (error) {
    console.error(error);
    setStatus("Offline");
  } finally {
    setBusy(false);
  }
}

async function createFridgeRecord(formData) {
  const owner = (formData.get("owner") || "").toString().trim();
  const description = (formData.get("description") || "").toString().trim();
  const status = (formData.get("status") || "In Fridge").toString().trim();
  if (!description || !APP_CONFIG.owners.includes(owner)) {
    return;
  }

  setBusy(true, "Saving");
  try {
    const now = new Date().toISOString();
    await apiRequest("createRecord", {
      listType: "fridge",
      record: {
        description,
        owner,
        status,
        createdAt: now,
        updatedAt: now
      }
    });

    el.fridgeAddForm.reset();
    setStatus("Synced");
    await loadRecords();
  } catch (error) {
    console.error(error);
    setStatus("Offline");
  } finally {
    setBusy(false);
  }
}

async function saveDescription(tab, id, description) {
  if (!description) {
    return;
  }

  setBusy(true, "Saving");
  try {
    await apiRequest("updateRecord", {
      listType: tab,
      id,
      updates: {
        description,
        updatedAt: new Date().toISOString()
      }
    });

    setStatus("Synced");
    await loadRecords();
  } catch (error) {
    console.error(error);
    setStatus("Offline");
  } finally {
    setBusy(false);
  }
}

async function completeRecord(tab, id) {
  const original = state.records[tab];
  state.records[tab] = original.filter((item) => item.id !== id);
  renderList(tab);

  setBusy(true, "Saving");
  try {
    await apiRequest("completeRecord", {
      listType: tab,
      id,
      updates: {
        completed: true,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    setStatus("Synced");
    await loadRecords();
  } catch (error) {
    console.error(error);
    state.records[tab] = original;
    renderList(tab);
    setStatus("Offline");
  } finally {
    setBusy(false);
  }
}

async function updateFridgeStatus(id, newStatus, record) {
  const wasUsed = newStatus === "Used";
  if (wasUsed) {
    state.records.fridge = state.records.fridge.filter((item) => item.id !== id);
    renderList("fridge");
  }

  setBusy(true, "Saving");
  try {
    await apiRequest("updateRecord", {
      listType: "fridge",
      id,
      updates: {
        status: newStatus,
        updatedAt: new Date().toISOString()
      }
    });

    setStatus("Synced");
    await loadRecords();
  } catch (error) {
    console.error(error);
    if (wasUsed) {
      state.records.fridge = sortFridgeRecords([...state.records.fridge, record]);
      renderList("fridge");
    }
    setStatus("Offline");
  } finally {
    setBusy(false);
  }
}

function wireEvents() {
  el.gateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    el.gateError.textContent = "";

    const value = el.passcode.value.trim();
    if (!value) {
      el.gateError.textContent = "Passcode is required.";
      return;
    }

    try {
      const digest = await hashText(value);
      if (digest !== APP_CONFIG.passcodeHash) {
        el.gateError.textContent = "Incorrect passcode.";
        return;
      }

      el.gate.classList.add("hidden");
      el.gate.hidden = true;
      setHidden(el.app, false);
      await loadRecords();
    } catch (error) {
      console.error(error);
      el.gateError.textContent = "Could not validate passcode.";
    }
  });

  el.tabSelect.addEventListener("change", () => {
    togglePanel(el.tabSelect.value);
  });

  el.shoppingToggleAdd.addEventListener("click", () => {
    setHidden(el.shoppingAddForm, !el.shoppingAddForm.hidden);
  });

  el.todoToggleAdd.addEventListener("click", () => {
    setHidden(el.todoAddForm, !el.todoAddForm.hidden);
  });

  el.fridgeToggleAdd.addEventListener("click", () => {
    setHidden(el.fridgeAddForm, !el.fridgeAddForm.hidden);
  });

  el.shoppingAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createRecord("shopping", new FormData(el.shoppingAddForm));
  });

  el.todoAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createRecord("todo", new FormData(el.todoAddForm));
  });

  el.fridgeAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createFridgeRecord(new FormData(el.fridgeAddForm));
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.error("Service worker registration failed", error);
  }
}

registerServiceWorker();
wireEvents();
