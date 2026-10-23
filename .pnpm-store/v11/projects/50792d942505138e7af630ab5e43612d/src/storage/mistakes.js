import { mistakes as demoMistakes } from '@/mock/data'

const DB_NAME = 'cuotiben-local'
const STORE_NAME = 'mistakes'
const DB_VERSION = 1
const BUILT_INS_KEY = 'cuotiben-built-in-mistakes-v1'
const BUILT_IN_IDS = [128, 124, 121]

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

async function ensureBuiltInMistakes() {
  if (localStorage.getItem(BUILT_INS_KEY) === 'done') return
  const db = await openDatabase()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const existingIds = new Set(request.result.map((item) => Number(item.id)))
      for (const id of BUILT_IN_IDS) {
        if (existingIds.has(id)) continue
        const sample = demoMistakes.find((item) => item.id === id)
        if (!sample) continue
        store.put({
          ...sample,
          questionText: sample.questionText ?? '',
          answerImages: [],
          images: sample.images ?? [],
          masteryStatus: sample.masteryStatus === 'MASTERED' ? 'MASTERED' : 'TO_REVIEW',
          builtIn: true
        })
      }
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }).finally(() => db.close())
  localStorage.setItem(BUILT_INS_KEY, 'done')
}

export async function listLocalMistakes() {
  await ensureBuiltInMistakes()
  return runRequest('readonly', (store) => store.getAll()).then((items) =>
    items
      .map((item) => ({
        ...item,
        masteryStatus:
          item.masteryStatus === 'NOT_REVIEWED' || item.masteryStatus === 'REVIEWING'
            ? 'TO_REVIEW'
            : item.masteryStatus ?? 'TO_REVIEW'
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
    masteryStatus: mistake.masteryStatus ?? 'TO_REVIEW'
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
