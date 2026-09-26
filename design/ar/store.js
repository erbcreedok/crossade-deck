// МОИ МЕТКИ — в IndexedDB этого браузера (скомпилированная метка ~100–300 КБ, localStorage мал).
// Для стенда этого хватает; в продукте метка поедет в аккаунт, чтобы жить между устройствами.
// Если база недоступна (приватный режим, превью) — метки живут до перезагрузки, в памяти.

const DB = "crossade-ar", STORE = "markers";
const memory = new Map();

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listMarkers() {
  try { return (await run("readonly", (s) => s.getAll())).sort((a, b) => b.created - a.created); }
  catch { return [...memory.values()].sort((a, b) => b.created - a.created); }
}

export async function saveMarker(m) {
  try { await run("readwrite", (s) => s.put(m)); } catch { memory.set(m.id, m); }
}

export async function deleteMarker(id) {
  try { await run("readwrite", (s) => s.delete(id)); } catch { memory.delete(id); }
}
