import { el, clear, formatDate, STATUS_LABELS, STATUS_ORDER } from '../utils.js';
import { getBreadcrumb, sortTasks } from '../tasks.js';

export function renderBoardView(container, { tasks, allTasks, filterState, actions }) {
  clear(container);
  const board = el('div', { class: 'board-view' });

  if (tasks.length === 0) {
    board.style.display = 'block';
    board.appendChild(el('div', { class: 'empty-state' }, [
      el('h2', {}, '該当するタスクがありません'),
    ]));
    container.appendChild(board);
    return;
  }

  const sorted = sortTasks(tasks, filterState.sortKey || 'order', filterState.sortDir || 'asc');

  for (const status of STATUS_ORDER) {
    const colTasks = sorted.filter(t => t.status === status);
    const column = el('div', {
      class: 'board-column',
      dataset: { status },
      ondragover: (e) => {
        e.preventDefault();
        column.classList.add('drop-target');
      },
      ondragleave: () => column.classList.remove('drop-target'),
      ondrop: (e) => {
        e.preventDefault();
        column.classList.remove('drop-target');
        const id = e.dataTransfer.getData('text/plain');
        if (id) actions.changeStatus(id, status);
      },
    }, [
      el('div', { class: 'board-column-header' }, [
        el('span', { class: 'status-badge status-' + status }, STATUS_LABELS[status]),
        el('span', { class: 'count' }, `${colTasks.length}`),
      ]),
      el('div', { class: 'board-cards' }, colTasks.map(t => renderCard(t, allTasks, actions))),
    ]);
    board.appendChild(column);
  }

  container.appendChild(board);
}

function renderCard(task, allTasks, actions) {
  const crumbs = getBreadcrumb(allTasks, task.id);
  const meta = [];
  if (task.assignee) meta.push(el('span', {}, '👤 ' + task.assignee));
  if (task.endDate) meta.push(el('span', {}, '📅 ' + formatDate(task.endDate)));

  const card = el('div', {
    class: 'board-card',
    draggable: 'true',
    ondragstart: (e) => {
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    },
    ondragend: () => card.classList.remove('dragging'),
    onclick: () => actions.openTask(task.id),
  }, [
    crumbs.length ? el('div', { class: 'breadcrumb' }, crumbs.join(' › ')) : null,
    el('div', { class: 'board-card-title' }, task.title || '無題'),
    meta.length ? el('div', { class: 'board-card-meta' }, meta) : null,
    el('div', { class: 'board-card-progress' }, [
      el('div', { class: 'progress-bar' }, [
        el('div', { class: 'progress-fill', style: { width: `${task.progress ?? 0}%` } }),
      ]),
    ]),
  ]);

  return card;
}
