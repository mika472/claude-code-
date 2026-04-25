const STORAGE_KEY = 'taskmgr.tasks.v1';

export function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error('Failed to load tasks from localStorage', err);
    return [];
  }
}

export function saveAll(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error('Failed to save tasks to localStorage', err);
  }
}

export function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
}
