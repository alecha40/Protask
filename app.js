const DB_NAME = "protask-db";
const DB_VERSION = 2;
const STORE_PROFILES = "profiles";
const STORE_NOTES = "notes";
const STORE_OUTBOX = "outbox";
const SESSION_KEY = "protask-session";
const SUPABASE_URL = "https://xbvxlknwlqrtiuafkwzk.supabase.co";
const SUPABASE_KEY = "sb_publishable_WRlnbtQ5ieh02JxHxkgLDw_mFHEhlvu";

const NOTE_TYPES = {
  note: "Заметка",
  list: "Список",
  planner: "Планировщик",
};

const PLANNER_COLUMNS = [
  { id: "inbox", title: "Что сделать" },
  { id: "doing", title: "Что делаю" },
  { id: "waiting", title: "Ожидает" },
  { id: "done", title: "Готово" },
];

const PRIORITIES = {
  normal: "Обычная",
  important: "Важная",
  priority: "Приоритетная",
};

const state = {
  db: null,
  user: null,
  notes: [],
  activeNoteId: null,
  deferredPrompt: null,
  saveTimer: null,
  draggedTask: null,
  syncTimer: null,
};

const elements = {
  authView: document.querySelector("#authView"),
  appShell: document.querySelector("#appShell"),
  authForm: document.querySelector("#authForm"),
  loginInput: document.querySelector("#loginInput"),
  passwordInput: document.querySelector("#passwordInput"),
  currentUserLabel: document.querySelector("#currentUserLabel"),
  logoutButton: document.querySelector("#logoutButton"),
  syncNowButton: document.querySelector("#syncNowButton"),
  syncStatus: document.querySelector("#syncStatus"),
  installButton: document.querySelector("#installButton"),
  newNoteButton: document.querySelector("#newNoteButton"),
  noteList: document.querySelector("#noteList"),
  noteTitleInput: document.querySelector("#noteTitleInput"),
  noteTypeLabel: document.querySelector("#noteTypeLabel"),
  updatedAtLabel: document.querySelector("#updatedAtLabel"),
  savedStatus: document.querySelector("#savedStatus"),
  editorEmptyState: document.querySelector("#editorEmptyState"),
  editorPanel: document.querySelector("#editorPanel"),
  textEditor: document.querySelector("#textEditor"),
  listEditor: document.querySelector("#listEditor"),
  plannerEditor: document.querySelector("#plannerEditor"),
  deleteNoteButton: document.querySelector("#deleteNoteButton"),
  noteTypeDialog: document.querySelector("#noteTypeDialog"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  typeCards: document.querySelectorAll("[data-create-type]"),
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        db.createObjectStore(STORE_PROFILES, { keyPath: "login" });
      }

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const noteStore = db.createObjectStore(STORE_NOTES, { keyPath: "id" });
        noteStore.createIndex("userId", "userId");
        noteStore.createIndex("updatedAt", "updatedAt");
      }

      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storePut(storeName, value) {
  return requestToPromise(tx(storeName, "readwrite").put(value));
}

function storeDelete(storeName, key) {
  return requestToPromise(tx(storeName, "readwrite").delete(key));
}

function storeGetAll(storeName) {
  return requestToPromise(tx(storeName).getAll());
}

function normalizeLogin(login) {
  return login.trim().toLowerCase().replace(/\s+/g, "-");
}

function loginToEmail(login) {
  return `${normalizeLogin(login)}@protask.local`;
}

function getSession() {
  const rawSession = localStorage.getItem(SESSION_KEY);
  return rawSession ? JSON.parse(rawSession) : null;
}

function saveSession(session, login) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
      login,
      user: session.user,
    }),
  );
}

function getAuthHeaders() {
  const session = getSession();
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${session?.accessToken ?? SUPABASE_KEY}`,
  };
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(options.auth === false ? {} : getAuthHeaders()),
      ...options.headers,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || "Ошибка Supabase.");
  }

  return data;
}

async function refreshSessionIfNeeded() {
  const session = getSession();
  if (!session?.refreshToken) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt && session.expiresAt - now > 60) return session;

  const refreshed = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });

  saveSession(refreshed, session.login);
  return getSession();
}

async function signIn(login, password) {
  const normalizedLogin = normalizeLogin(login);
  const email = loginToEmail(normalizedLogin);

  try {
    const session = await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password }),
    });
    saveSession(session, normalizedLogin);
    state.user = { id: session.user.id, login: normalizedLogin, email };
    return;
  } catch (error) {
    const shouldCreate = /invalid|credentials|login|not found/i.test(error.message);
    if (!shouldCreate) throw error;
  }

  const session = await supabaseFetch("/auth/v1/signup", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      email,
      password,
      data: { login: normalizedLogin },
    }),
  });

  if (!session.access_token) {
    throw new Error("Профиль создан. В Supabase нужно отключить email confirmations или подтвердить пользователя вручную.");
  }

  saveSession(session, normalizedLogin);
  state.user = { id: session.user.id, login: normalizedLogin, email };
}

async function restoreSession() {
  const session = await refreshSessionIfNeeded().catch(() => null);
  if (!session?.user?.id) return;

  state.user = {
    id: session.user.id,
    login: session.login ?? session.user.user_metadata?.login ?? session.user.email,
    email: session.user.email,
  };
}

async function loadNotes() {
  if (!state.user) {
    state.notes = [];
    state.activeNoteId = null;
    return;
  }

  const index = tx(STORE_NOTES).index("userId");
  const notes = await requestToPromise(index.getAll(state.user.id));
  state.notes = notes.filter((note) => !note.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (!state.notes.some((note) => note.id === state.activeNoteId)) {
    state.activeNoteId = state.notes[0]?.id ?? null;
  }
}

function toRemoteNote(note) {
  return {
    id: note.id,
    user_id: state.user.id,
    title: note.title,
    type: note.type,
    body: note.body,
    version: note.version,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted_at: note.deletedAt,
  };
}

function fromRemoteNote(note) {
  return {
    id: note.id,
    userId: note.user_id,
    title: note.title,
    type: note.type,
    body: note.body ?? "",
    version: note.version ?? 1,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    deletedAt: note.deleted_at,
  };
}

async function upsertRemoteNote(note) {
  await refreshSessionIfNeeded();
  await supabaseFetch("/rest/v1/notes?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(toRemoteNote(note)),
  });
}

async function pullRemoteNotes() {
  await refreshSessionIfNeeded();
  const remoteNotes = await supabaseFetch("/rest/v1/notes?select=*&order=updated_at.desc");

  await Promise.all(remoteNotes.map((note) => storePut(STORE_NOTES, fromRemoteNote(note))));
  await loadNotes();
}

async function syncOutbox() {
  if (!state.user || !navigator.onLine) return;

  try {
    elements.syncStatus.textContent = "Синхронизация...";
    const outbox = (await storeGetAll(STORE_OUTBOX))
      .filter((item) => item.userId === state.user.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const item of outbox) {
      if (item.entity === "note") {
        await upsertRemoteNote(item.payload);
        await storeDelete(STORE_OUTBOX, item.id);
      }
    }

    await pullRemoteNotes();
    elements.syncStatus.textContent = outbox.length > 0 ? "Синхронизировано" : "Актуально";
    render();
  } catch (error) {
    elements.syncStatus.textContent = "Ждет синхронизации";
    console.error(error);
  }
}

function scheduleSync() {
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(syncOutbox, 650);
}

function getActiveNote() {
  return state.notes.find((note) => note.id === state.activeNoteId) ?? null;
}

async function saveNote(note, operation = "upsert") {
  await storePut(STORE_NOTES, note);
  await storePut(STORE_OUTBOX, {
    id: crypto.randomUUID(),
    userId: state.user.id,
    operation,
    entity: "note",
    payload: note,
    createdAt: new Date().toISOString(),
  });
  elements.syncStatus.textContent = navigator.onLine ? "Ждет синхронизации" : "Офлайн";
  scheduleSync();
}

function getDefaultBody(type) {
  if (type === "list") {
    return JSON.stringify([{ id: crypto.randomUUID(), text: "", done: false }]);
  }

  if (type === "planner") {
    return JSON.stringify({
      columns: Object.fromEntries(PLANNER_COLUMNS.map((column) => [column.id, []])),
    });
  }

  return "";
}

async function createNote(type = "note") {
  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    userId: state.user.id,
    title: NOTE_TYPES[type],
    type,
    body: getDefaultBody(type),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
  };

  await saveNote(note);
  state.activeNoteId = note.id;
  await loadNotes();
  closeCreateDialog();
  render();

  if (type === "note") elements.textEditor.focus();
  if (type === "list") elements.listEditor.querySelector(".list-text")?.focus();
  if (type === "planner") elements.plannerEditor.querySelector(".planner-add-input")?.focus();
}

function parseList(note) {
  if (note.type !== "list") return [];

  try {
    const parsed = JSON.parse(note.body);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return note.body
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        id: crypto.randomUUID(),
        text: line.replace(/^\s*-\s\[( |x)\]\s?/i, ""),
        done: /^\s*-\s\[x\]/i.test(line),
      }));
  }

  return [{ id: crypto.randomUUID(), text: "", done: false }];
}

function parsePlanner(note) {
  const fallback = {
    columns: Object.fromEntries(PLANNER_COLUMNS.map((column) => [column.id, []])),
  };

  if (note.type !== "planner") return fallback;

  try {
    const parsed = JSON.parse(note.body);
    return { columns: { ...fallback.columns, ...parsed.columns } };
  } catch {
    return fallback;
  }
}

function normalizePriority(priority) {
  if (priority === "high") return "important";
  if (priority === "low") return "normal";
  return PRIORITIES[priority] ? priority : "normal";
}

function scheduleActiveNoteSave(getBody) {
  clearTimeout(state.saveTimer);
  elements.savedStatus.textContent = "Сохраняю...";
  state.saveTimer = setTimeout(() => saveActiveNoteFromEditor(getBody), 220);
}

async function saveActiveNoteFromEditor(getBody) {
  const note = getActiveNote();
  if (!note) return;

  const now = new Date().toISOString();
  const updatedNote = {
    ...note,
    title: elements.noteTitleInput.value.trim() || NOTE_TYPES[note.type],
    body: typeof getBody === "function" ? getBody() : getBodyFromEditor(note),
    updatedAt: now,
    version: note.version + 1,
  };

  await saveNote(updatedNote);
  state.notes = state.notes
    .map((item) => (item.id === updatedNote.id ? updatedNote : item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  state.activeNoteId = updatedNote.id;
  elements.savedStatus.textContent = "Сохранено локально";
  elements.updatedAtLabel.textContent = `Обновлено ${formatDateTime(updatedNote.updatedAt)}`;
  renderNoteList();
}

function getBodyFromEditor(note) {
  if (note.type === "note") return elements.textEditor.value;
  if (note.type === "list") return JSON.stringify(readListFromEditor());
  if (note.type === "planner") return JSON.stringify(readPlannerFromEditor());
  return note.body;
}

async function deleteActiveNote() {
  const note = getActiveNote();
  if (!note) return;

  const now = new Date().toISOString();
  await saveNote(
    {
      ...note,
      deletedAt: now,
      updatedAt: now,
      version: note.version + 1,
    },
    "delete",
  );

  state.activeNoteId = null;
  await loadNotes();
  render();
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderNoteList() {
  const items = state.notes.map((note) => {
    const button = document.createElement("button");
    button.className = `note-item ${note.id === state.activeNoteId ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <strong></strong>
      <span>${NOTE_TYPES[note.type]} · ${formatDateTime(note.updatedAt)}</span>
    `;
    button.querySelector("strong").textContent = note.title;
    button.addEventListener("click", () => {
      state.activeNoteId = note.id;
      render();
    });
    return button;
  });

  elements.noteList.replaceChildren(...items);
}

function renderTextEditor(note) {
  elements.textEditor.hidden = false;
  elements.listEditor.hidden = true;
  elements.plannerEditor.hidden = true;

  if (document.activeElement !== elements.textEditor) {
    elements.textEditor.value = note.body;
  }
}

function renderListEditor(note) {
  elements.textEditor.hidden = true;
  elements.listEditor.hidden = false;
  elements.plannerEditor.hidden = true;

  const items = parseList(note);
  const rows = items.map((item, index) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.dataset.itemId = item.id;
    row.innerHTML = `
      <input class="list-check" type="checkbox" aria-label="Выполнено" ${item.done ? "checked" : ""} />
      <input class="list-text" type="text" placeholder="Пункт списка" />
    `;

    const checkbox = row.querySelector(".list-check");
    const input = row.querySelector(".list-text");
    input.value = item.text;

    checkbox.addEventListener("change", () => {
      saveListItems(readListFromEditor());
    });

    input.addEventListener("input", () => {
      saveListItems(readListFromEditor());
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const nextItems = readListFromEditor();
        nextItems.splice(index + 1, 0, { id: crypto.randomUUID(), text: "", done: false });
        saveListItems(nextItems, index + 1);
      }

      if (event.key === "Backspace" && input.value === "" && items.length > 1) {
        event.preventDefault();
        const nextItems = readListFromEditor().filter((nextItem) => nextItem.id !== item.id);
        saveListItems(nextItems, Math.max(0, index - 1));
      }
    });

    return row;
  });

  elements.listEditor.replaceChildren(...rows);
}

function readListFromEditor() {
  return [...elements.listEditor.querySelectorAll(".list-row")].map((row) => ({
    id: row.dataset.itemId,
    text: row.querySelector(".list-text").value,
    done: row.querySelector(".list-check").checked,
  }));
}

function saveListItems(items, focusIndex = null) {
  scheduleActiveNoteSave(() => JSON.stringify(items));

  if (focusIndex !== null) {
    renderListEditor({ ...getActiveNote(), body: JSON.stringify(items) });
    elements.listEditor.querySelectorAll(".list-text")[focusIndex]?.focus();
  }
}

function renderPlannerEditor(note) {
  elements.textEditor.hidden = true;
  elements.listEditor.hidden = true;
  elements.plannerEditor.hidden = false;

  const planner = parsePlanner(note);
  const columns = PLANNER_COLUMNS.map((column) => {
    const columnNode = document.createElement("section");
    columnNode.className = "planner-column";
    columnNode.dataset.columnId = column.id;
    columnNode.innerHTML = `
      <header>
        <h3>${column.title}</h3>
        <span>${planner.columns[column.id].length}</span>
      </header>
      <div class="planner-cards"></div>
      <form class="planner-add-form">
        <input class="planner-add-input" type="text" placeholder="Добавить задачу" />
        <select class="planner-add-priority" aria-label="Важность">
          <option value="normal">Обычная</option>
          <option value="important">Важная</option>
          <option value="priority">Приоритетная</option>
        </select>
        <button class="ghost-button" type="submit">Добавить</button>
      </form>
    `;

    const cards = planner.columns[column.id].map((task) => renderPlannerCard(task, column.id));
    const cardsNode = columnNode.querySelector(".planner-cards");
    cardsNode.replaceChildren(...cards);

    cardsNode.addEventListener("dragover", (event) => {
      event.preventDefault();
      columnNode.classList.add("drag-over");
    });

    cardsNode.addEventListener("dragleave", (event) => {
      if (!columnNode.contains(event.relatedTarget)) {
        columnNode.classList.remove("drag-over");
      }
    });

    cardsNode.addEventListener("drop", (event) => {
      event.preventDefault();
      columnNode.classList.remove("drag-over");
      dropPlannerTask(column.id);
    });

    columnNode.querySelector(".planner-add-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = columnNode.querySelector(".planner-add-input");
      const priority = columnNode.querySelector(".planner-add-priority");
      const text = input.value.trim();
      if (!text) return;

      planner.columns[column.id].push({
        id: crypto.randomUUID(),
        text,
        priority: priority.value,
      });

      savePlanner(planner, column.id);
    });

    return columnNode;
  });

  elements.plannerEditor.replaceChildren(...columns);
}

function renderPlannerCard(task, columnId) {
  const card = document.createElement("article");
  const priority = normalizePriority(task.priority);
  card.className = `planner-card priority-${priority}`;
  card.dataset.taskId = task.id;
  card.dataset.priority = priority;
  card.draggable = true;
  card.innerHTML = `
    <button class="planner-card-summary" type="button">
      <span class="planner-card-title"></span>
    </button>
    <div class="planner-card-details" hidden>
      <input class="planner-card-text" type="text" />
      <div class="priority-pills" role="group" aria-label="Важность">
        <button class="priority-pill priority-normal" data-priority="normal" type="button">Обычная</button>
        <button class="priority-pill priority-important" data-priority="important" type="button">Важная</button>
        <button class="priority-pill priority-priority" data-priority="priority" type="button">Приоритетная</button>
      </div>
      <button class="ghost-button move-left" type="button" aria-label="Переместить влево">←</button>
      <button class="ghost-button move-right" type="button" aria-label="Переместить вправо">→</button>
      <button class="danger-button remove-task" type="button" aria-label="Удалить">×</button>
    </div>
  `;

  const summary = card.querySelector(".planner-card-summary");
  const title = card.querySelector(".planner-card-title");
  const details = card.querySelector(".planner-card-details");
  const textInput = card.querySelector(".planner-card-text");
  title.textContent = task.text || "Без названия";
  textInput.value = task.text;

  card.addEventListener("dragstart", (event) => {
    state.draggedTask = { taskId: task.id, columnId };
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  });

  card.addEventListener("dragend", () => {
    state.draggedTask = null;
    card.classList.remove("dragging");
    elements.plannerEditor.querySelectorAll(".drag-over").forEach((column) => column.classList.remove("drag-over"));
  });

  summary.addEventListener("click", () => {
    details.hidden = !details.hidden;
    if (!details.hidden) textInput.focus();
  });

  textInput.addEventListener("input", () => {
    title.textContent = textInput.value || "Без названия";
    updatePlannerTask(task.id, columnId, { text: textInput.value });
  });

  card.querySelectorAll(".priority-pill").forEach((button) => {
    button.classList.toggle("active", button.dataset.priority === priority);
    button.addEventListener("click", () => {
      const nextPriority = button.dataset.priority;
      card.className = `planner-card priority-${nextPriority}`;
      card.dataset.priority = nextPriority;
      card.querySelectorAll(".priority-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.priority === nextPriority);
      });
      updatePlannerTask(task.id, columnId, { priority: nextPriority });
    });
  });
  card.querySelector(".remove-task").addEventListener("click", () => removePlannerTask(task.id, columnId));
  card.querySelector(".move-left").addEventListener("click", () => movePlannerTask(task.id, columnId, -1));
  card.querySelector(".move-right").addEventListener("click", () => movePlannerTask(task.id, columnId, 1));

  return card;
}

function readPlannerFromEditor() {
  const columns = {};

  PLANNER_COLUMNS.forEach((column) => {
    columns[column.id] = [...elements.plannerEditor.querySelectorAll(`[data-column-id="${column.id}"] .planner-card`)].map((card) => ({
      id: card.dataset.taskId,
      text: card.querySelector(".planner-card-text").value,
      priority: normalizePriority(card.dataset.priority),
    }));
  });

  return { columns };
}

function savePlanner(planner, focusColumnId = null) {
  scheduleActiveNoteSave(() => JSON.stringify(planner));
  renderPlannerEditor({ ...getActiveNote(), body: JSON.stringify(planner) });
  if (focusColumnId) {
    elements.plannerEditor.querySelector(`[data-column-id="${focusColumnId}"] .planner-add-input`)?.focus();
  }
}

function updatePlannerTask(taskId, columnId, patch) {
  const planner = readPlannerFromEditor();
  planner.columns[columnId] = planner.columns[columnId].map((task) => (task.id === taskId ? { ...task, ...patch } : task));
  scheduleActiveNoteSave(() => JSON.stringify(planner));
}

function removePlannerTask(taskId, columnId) {
  const planner = readPlannerFromEditor();
  planner.columns[columnId] = planner.columns[columnId].filter((task) => task.id !== taskId);
  savePlanner(planner);
}

function movePlannerTask(taskId, columnId, direction) {
  const planner = readPlannerFromEditor();
  const fromIndex = PLANNER_COLUMNS.findIndex((column) => column.id === columnId);
  const toColumn = PLANNER_COLUMNS[fromIndex + direction];
  if (!toColumn) return;

  const task = planner.columns[columnId].find((item) => item.id === taskId);
  if (!task) return;

  planner.columns[columnId] = planner.columns[columnId].filter((item) => item.id !== taskId);
  planner.columns[toColumn.id].push(task);
  savePlanner(planner, toColumn.id);
}

function dropPlannerTask(targetColumnId) {
  if (!state.draggedTask) return;

  const { taskId, columnId } = state.draggedTask;
  if (columnId === targetColumnId) return;

  const planner = readPlannerFromEditor();
  const task = planner.columns[columnId].find((item) => item.id === taskId);
  if (!task) return;

  planner.columns[columnId] = planner.columns[columnId].filter((item) => item.id !== taskId);
  planner.columns[targetColumnId].push(task);
  savePlanner(planner, targetColumnId);
}

function renderEditor() {
  const note = getActiveNote();
  const hasNote = Boolean(note);

  elements.editorEmptyState.hidden = hasNote;
  elements.editorPanel.hidden = !hasNote;
  elements.noteTitleInput.disabled = !hasNote;
  elements.deleteNoteButton.disabled = !hasNote;

  if (!note) {
    elements.noteTitleInput.value = "";
    elements.updatedAtLabel.textContent = "";
    elements.noteTypeLabel.textContent = "";
    return;
  }

  if (document.activeElement !== elements.noteTitleInput) {
    elements.noteTitleInput.value = note.title;
  }

  elements.noteTypeLabel.textContent = NOTE_TYPES[note.type];
  elements.updatedAtLabel.textContent = `Обновлено ${formatDateTime(note.updatedAt)}`;

  if (note.type === "note") renderTextEditor(note);
  if (note.type === "list") renderListEditor(note);
  if (note.type === "planner") renderPlannerEditor(note);
}

function render() {
  const isAuthenticated = Boolean(state.user);
  elements.authView.hidden = isAuthenticated;
  elements.appShell.hidden = !isAuthenticated;
  elements.currentUserLabel.textContent = state.user?.login ?? "Гость";
  if (!isAuthenticated) {
    elements.syncStatus.textContent = "Локальный режим";
  } else if (!navigator.onLine) {
    elements.syncStatus.textContent = "Офлайн";
  } else if (!elements.syncStatus.textContent.includes("Синх")) {
    elements.syncStatus.textContent = "Онлайн";
  }

  if (!isAuthenticated) return;

  renderNoteList();
  renderEditor();
}

function openCreateDialog() {
  elements.noteTypeDialog.hidden = false;
}

function closeCreateDialog() {
  elements.noteTypeDialog.hidden = true;
}

function bindEvents() {
  elements.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await signIn(elements.loginInput.value, elements.passwordInput.value);
      await loadNotes();
      await syncOutbox();
      render();
    } catch (error) {
      alert(error.message);
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    await supabaseFetch("/auth/v1/logout", { method: "POST" }).catch(() => null);
    localStorage.removeItem(SESSION_KEY);
    state.user = null;
    state.notes = [];
    state.activeNoteId = null;
    render();
  });

  elements.newNoteButton.addEventListener("click", openCreateDialog);
  elements.closeDialogButton.addEventListener("click", closeCreateDialog);
  elements.noteTypeDialog.addEventListener("click", (event) => {
    if (event.target === elements.noteTypeDialog) closeCreateDialog();
  });
  elements.typeCards.forEach((card) => {
    card.addEventListener("click", () => createNote(card.dataset.createType));
  });

  elements.deleteNoteButton.addEventListener("click", deleteActiveNote);
  elements.syncNowButton.addEventListener("click", syncOutbox);
  elements.noteTitleInput.addEventListener("input", () => scheduleActiveNoteSave());
  elements.textEditor.addEventListener("input", () => scheduleActiveNoteSave());

  window.addEventListener("online", () => {
    render();
    syncOutbox();
  });
  window.addEventListener("offline", render);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    elements.installButton.hidden = true;
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("sw.js");
  }
}

async function init() {
  state.db = await openDatabase();
  bindEvents();
  await restoreSession();
  await loadNotes();
  await syncOutbox();
  await registerServiceWorker();
  render();
}

init();
