export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') {
      node.className = value;
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) {
        node.dataset[dk] = dv;
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [sk, sv] of Object.entries(value)) {
        if (sk.startsWith('--')) {
          node.style.setProperty(sk, sv);
        } else {
          node.style[sk] = sv;
        }
      }
    } else if (key in node && typeof node[key] !== 'object') {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(node, c);
    return;
  }
  if (children instanceof Node) {
    node.appendChild(children);
    return;
  }
  node.appendChild(document.createTextNode(String(children)));
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function parseDate(s) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  if (!d) return s;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function diffDays(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / (24 * 3600 * 1000));
}

export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

export function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const STATUS_LABELS = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
  on_hold: '保留',
};

export const STATUS_ORDER = ['not_started', 'in_progress', 'completed', 'on_hold'];

export const LEVEL_LABELS = {
  1: '大項目',
  2: '中項目',
  3: '小項目',
};
