import { el, clear, formatDate, STATUS_LABELS, LEVEL_LABELS } from '../utils.js';
import { getChildren, sortTasks } from '../tasks.js';

export function renderTreeView(container, { tasks, allTasks, filterState, actions }) {
  clear(container);
  const wrapper = el('div', { class: 'tree-view' });

  const visibleIds = new Set(tasks.map(t => t.id));
  const roots = getChildren(allTasks, null).filter(t => visibleIds.has(t.id));
  const sorted = sortTasks(roots, filterState.sortKey || 'order', filterState.sortDir || 'asc');

  if (sorted.length === 0) {
    wrapper.appendChild(el('div', { class: 'empty-state' }, [
      el('h2', {}, 'タスクがありません'),
      el('p', {}, '「＋ 大項目を追加」ボタンから最初のタスクを作成してください。'),
    ]));
    container.appendChild(wrapper);
    return;
  }

  const list = el('ul', { class: 'tree-list' });
  for (const root of sorted) {
    list.appendChild(renderNode(root, allTasks, visibleIds, filterState, actions));
  }
  wrapper.appendChild(list);
  container.appendChild(wrapper);
}

function renderNode(task, allTasks, visibleIds, filterState, actions) {
  const children = getChildren(allTasks, task.id).filter(c => visibleIds.has(c.id));
  const sortedChildren = sortTasks(children, filterState.sortKey || 'order', filterState.sortDir || 'asc');
  const hasChildren = sortedChildren.length > 0;
  const expanded = task.expanded !== false;

  const toggle = el('button', {
    class: 'tree-toggle' + (hasChildren ? '' : ' invisible'),
    onclick: (e) => {
      e.stopPropagation();
      if (hasChildren) actions.toggleExpand(task.id);
    },
  }, hasChildren ? (expanded ? '▼' : '▶') : '·');

  const meta = [];
  if (task.assignee) meta.push(el('span', { class: 'assignee' }, task.assignee));
  if (task.startDate || task.endDate) {
    meta.push(el('span', { class: 'dates' },
      `${formatDate(task.startDate)}${task.startDate || task.endDate ? ' 〜 ' : ''}${formatDate(task.endDate)}`
    ));
  }
  meta.push(el('span', { class: 'status-badge status-' + task.status }, STATUS_LABELS[task.status]));
  meta.push(el('span', { class: 'progress-bar' }, [
    el('span', { class: 'progress-fill', style: { width: `${task.progress ?? 0}%` } }),
  ]));
  meta.push(el('span', { class: 'progress-text' }, `${task.progress ?? 0}%`));

  const actionsBtn = el('span', { class: 'tree-actions' }, [
    task.level < 3 && el('button', {
      title: '子タスクを追加',
      onclick: (e) => { e.stopPropagation(); actions.addChild(task.id); },
    }, '＋'),
    el('button', {
      title: '削除',
      onclick: (e) => {
        e.stopPropagation();
        if (confirm(`「${task.title}」とその子タスクを削除しますか？`)) actions.deleteTask(task.id);
      },
    }, '🗑'),
  ]);

  const node = el('div', {
    class: 'tree-node',
    onclick: () => actions.openTask(task.id),
  }, [
    toggle,
    el('span', { class: 'level-badge level-' + task.level }, LEVEL_LABELS[task.level]),
    el('span', { class: 'tree-title' }, task.title || '無題'),
    el('span', { class: 'tree-meta' }, meta),
    actionsBtn,
  ]);

  const li = el('li', {}, [node]);

  if (hasChildren && expanded) {
    const childList = el('ul', { class: 'tree-children' });
    for (const c of sortedChildren) {
      childList.appendChild(renderNode(c, allTasks, visibleIds, filterState, actions));
    }
    if (task.level < 3) {
      childList.appendChild(el('li', {}, [
        el('button', {
          class: 'tree-add-child',
          onclick: () => actions.addChild(task.id),
        }, `＋ ${LEVEL_LABELS[task.level + 1]}を追加`),
      ]));
    }
    li.appendChild(childList);
  } else if (!hasChildren && expanded && task.level < 3) {
    const childList = el('ul', { class: 'tree-children' });
    childList.appendChild(el('li', {}, [
      el('button', {
        class: 'tree-add-child',
        onclick: () => actions.addChild(task.id),
      }, `＋ ${LEVEL_LABELS[task.level + 1]}を追加`),
    ]));
    li.appendChild(childList);
  }

  return li;
}
