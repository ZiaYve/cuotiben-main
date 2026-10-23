const DB_NAME = 'cuotiben-local'
const STORE_NAME = 'mistakes'
const DB_VERSION = 1

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runRequest(mode, callback) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = callback(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}

export function listLocalMistakes() {
  return runRequest('readonly', (store) => store.getAll()).then((items) =>
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
}

export function getLocalMistake(id) {
  return runRequest('readonly', (store) => store.get(Number(id)))
}

export async function saveLocalMistake(mistake) {
  const record = {
    ...mistake,
    id: mistake.id ?? Date.now(),
    createdAt: mistake.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    masteryStatus: mistake.masteryStatus ?? 'NOT_REVIEWED'
  }
  await runRequest('readwrite', (store) => store.put(record))
  return record
}

export function deleteLocalMistake(id) {
  return runRequest('readwrite', (store) => store.delete(Number(id)))
}

export function localImageUrl(image) {
  return URL.createObjectURL(image.blob)
}
