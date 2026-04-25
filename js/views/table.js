import { el, clear, formatDate, STATUS_LABELS, LEVEL_LABELS } from '../utils.js';
import { getBreadcrumb, sortTasks } from '../tasks.js';

export function renderTableView(container, { tasks, allTasks, filterState, actions }) {
  clear(container);
  const wrapper = el('div', { class: 'table-view' });

  if (tasks.length === 0) {
    wrapper.appendChild(el('div', { class: 'empty-state' }, [
      el('h2', {}, '該当するタスクがありません'),
    ]));
    container.appendChild(wrapper);
    return;
  }

  const sorted = sortTasks(tasks, filterState.sortKey || 'order', filterState.sortDir || 'asc');

  const table = el('table', { class: 'task-table' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, '階層'),
        el('th', {}, 'タイトル'),
        el('th', {}, '担当者'),
        el('th', {}, '状態'),
        el('th', {}, '進捗'),
        el('th', {}, '開始日'),
        el('th', {}, '終了日'),
      ]),
    ]),
    el('tbody', {}, sorted.map(t => renderRow(t, allTasks, actions))),
  ]);

  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function renderRow(task, allTasks, actions) {
  const crumbs = getBreadcrumb(allTasks, task.id);
  const breadcrumb = crumbs.length
    ? el('div', { class: 'breadcrumb' },
        crumbs.map((c, i) => [
          el('span', {}, c),
          i < crumbs.length - 1 ? el('span', { class: 'breadcrumb-sep' }, '›') : null,
        ]).flat().filter(Boolean))
    : null;

  return el('tr', {}, [
    el('td', {}, el('span', { class: 'level-badge level-' + task.level }, LEVEL_LABELS[task.level])),
    el('td', {}, [
      breadcrumb,
      el('div', { class: 'cell-title', onclick: () => actions.openTask(task.id) }, task.title || '無題'),
    ]),
    el('td', {}, task.assignee || '—'),
    el('td', {}, el('span', { class: 'status-badge status-' + task.status }, STATUS_LABELS[task.status])),
    el('td', {}, el('div', { class: 'cell-progress' }, [
      el('span', { class: 'progress-bar' }, [
        el('span', { class: 'progress-fill', style: { width: `${task.progress ?? 0}%` } }),
      ]),
      el('span', { class: 'progress-text' }, `${task.progress ?? 0}%`),
    ])),
    el('td', {}, formatDate(task.startDate) || '—'),
    el('td', {}, formatDate(task.endDate) || '—'),
  ]);
}
