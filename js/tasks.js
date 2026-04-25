import { uuid, parseDate } from './utils.js';

export function createTask(allTasks, parentId, fields = {}) {
  const parent = parentId ? allTasks.find(t => t.id === parentId) : null;
  const level = parent ? Math.min(3, parent.level + 1) : 1;
  const siblings = allTasks.filter(t => t.parentId === parentId);
  const order = siblings.length;
  const now = Date.now();
  return {
    id: uuid(),
    parentId: parentId ?? null,
    level,
    title: fields.title ?? '新規タスク',
    description: fields.description ?? '',
    startDate: fields.startDate ?? null,
    endDate: fields.endDate ?? null,
    status: fields.status ?? 'not_started',
    progress: fields.progress ?? 0,
    assignee: fields.assignee ?? '',
    order,
    expanded: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTask(allTasks, id, patch) {
  return allTasks.map(t =>
    t.id === id ? { ...t, ...patch, id: t.id, updatedAt: Date.now() } : t
  );
}

export function deleteTask(allTasks, id) {
  const toDelete = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of allTasks) {
      if (t.parentId && toDelete.has(t.parentId) && !toDelete.has(t.id)) {
        toDelete.add(t.id);
        changed = true;
      }
    }
  }
  return allTasks.filter(t => !toDelete.has(t.id));
}

export function getChildren(allTasks, parentId) {
  return allTasks
    .filter(t => t.parentId === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getRoots(allTasks) {
  return getChildren(allTasks, null);
}

export function getDescendants(allTasks, id) {
  const result = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    const children = allTasks.filter(t => t.parentId === current);
    for (const c of children) {
      result.push(c);
      stack.push(c.id);
    }
  }
  return result;
}

export function getAncestors(allTasks, id) {
  const result = [];
  let current = allTasks.find(t => t.id === id);
  while (current && current.parentId) {
    const parent = allTasks.find(t => t.id === current.parentId);
    if (!parent) break;
    result.unshift(parent);
    current = parent;
  }
  return result;
}

export function getBreadcrumb(allTasks, id) {
  return getAncestors(allTasks, id).map(t => t.title);
}

export function searchAndFilter(allTasks, filterState) {
  const { query = '', status = '', assignee = '' } = filterState ?? {};
  const q = query.trim().toLowerCase();
  return allTasks.filter(t => {
    if (status && t.status !== status) return false;
    if (assignee && t.assignee !== assignee) return false;
    if (q) {
      const hay = (t.title + ' ' + (t.description ?? '') + ' ' + (t.assignee ?? '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortTasks(tasks, key, dir = 'asc') {
  const factor = dir === 'desc' ? -1 : 1;
  const copy = [...tasks];
  copy.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
  return copy;
}

function sortValue(t, key) {
  switch (key) {
    case 'title': return (t.title ?? '').toLowerCase();
    case 'assignee': return (t.assignee ?? '').toLowerCase();
    case 'progress': return t.progress ?? 0;
    case 'startDate': return parseDate(t.startDate)?.getTime() ?? null;
    case 'endDate': return parseDate(t.endDate)?.getTime() ?? null;
    case 'status': return t.status ?? '';
    case 'order': return t.order ?? 0;
    default: return null;
  }
}

export function uniqueAssignees(allTasks) {
  const set = new Set();
  for (const t of allTasks) {
    if (t.assignee) set.add(t.assignee);
  }
  return [...set].sort();
}

export function getTaskById(allTasks, id) {
  return allTasks.find(t => t.id === id) ?? null;
}

/**
 * Returns the visible (matching filter) set including ancestors,
 * so that hierarchy in tree/gantt views remains intact.
 */
export function expandWithAncestors(allTasks, matchedTasks) {
  const ids = new Set(matchedTasks.map(t => t.id));
  for (const t of matchedTasks) {
    let p = t.parentId;
    while (p) {
      if (ids.has(p)) break;
      ids.add(p);
      const parent = allTasks.find(x => x.id === p);
      p = parent ? parent.parentId : null;
    }
  }
  return allTasks.filter(t => ids.has(t.id));
}
