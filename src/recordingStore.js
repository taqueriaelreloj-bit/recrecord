const DATABASE_NAME = "recrecord";
const DATABASE_VERSION = 1;
const STORE_NAME = "takes";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open recording storage"));
    request.onblocked = () => reject(new Error("Recording storage is blocked by another tab"));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runTransaction(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onerror = () => reject(request.error ?? new Error("Recording storage operation failed"));
      request.onsuccess = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Recording storage transaction aborted"));
    });
  } finally {
    database.close();
  }
}

export function loadStoredTakes() {
  return runTransaction("readonly", (store) => store.getAll());
}

export function saveStoredTake(take) {
  const storedTake = {
    id: take.id,
    name: take.name,
    duration: take.duration,
    type: take.type,
    blob: take.blob,
  };
  return runTransaction("readwrite", (store) => store.put(storedTake));
}

export function deleteStoredTake(id) {
  return runTransaction("readwrite", (store) => store.delete(id));
}
