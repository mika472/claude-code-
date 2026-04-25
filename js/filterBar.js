import { el, clear, STATUS_LABELS } from './utils.js';
import { uniqueAssignees } from './tasks.js';

const SORT_OPTIONS = [
  { key: 'order', label: '並び順 (デフォルト)' },
  { key: 'title', label: 'タイトル' },
  { key: 'startDate', label: '開始日' },
  { key: 'endDate', label: '終了日' },
  { key: 'progress', label: '進捗' },
  { key: 'assignee', label: '担当者' },
  { key: 'status', label: '状態' },
];

export function renderFilterBar(container, { allTasks, filterState, onChange }) {
  clear(container);

  const queryInput = el('input', {
    type: 'text',
    placeholder: '検索 (タイトル / 詳細 / 担当者)',
    value: filterState.query ?? '',
    oninput: (e) => onChange({ ...filterState, query: e.target.value }),
  });

  const statusSelect = el('select', {
    onchange: (e) => onChange({ ...filterState, status: e.target.value }),
  }, [
    el('option', { value: '', selected: !filterState.status }, 'すべて'),
    ...Object.entries(STATUS_LABELS).map(([v, label]) =>
      el('option', { value: v, selected: filterState.status === v }, label)
    ),
  ]);

  const assigneeOpts = uniqueAssignees(allTasks);
  const assigneeSelect = el('select', {
    onchange: (e) => onChange({ ...filterState, assignee: e.target.value }),
  }, [
    el('option', { value: '', selected: !filterState.assignee }, 'すべて'),
    ...assigneeOpts.map(a =>
      el('option', { value: a, selected: filterState.assignee === a }, a)
    ),
  ]);

  const sortKeySelect = el('select', {
    onchange: (e) => onChange({ ...filterState, sortKey: e.target.value }),
  },
    SORT_OPTIONS.map(o =>
      el('option', { value: o.key, selected: (filterState.sortKey || 'order') === o.key }, o.label)
    )
  );

  const sortDirSelect = el('select', {
    onchange: (e) => onChange({ ...filterState, sortDir: e.target.value }),
  }, [
    el('option', { value: 'asc', selected: (filterState.sortDir || 'asc') === 'asc' }, '昇順'),
    el('option', { value: 'desc', selected: filterState.sortDir === 'desc' }, '降順'),
  ]);

  const resetBtn = el('button', {
    class: 'btn btn-ghost',
    onclick: () => onChange({ query: '', status: '', assignee: '', sortKey: 'order', sortDir: 'asc' }),
  }, 'リセット');

  container.append(
    el('div', { class: 'filter-group' }, [queryInput]),
    el('div', { class: 'filter-group' }, [
      el('label', {}, '状態'),
      statusSelect,
    ]),
    el('div', { class: 'filter-group' }, [
      el('label', {}, '担当者'),
      assigneeSelect,
    ]),
    el('div', { class: 'filter-group' }, [
      el('label', {}, '並び替え'),
      sortKeySelect,
      sortDirSelect,
    ]),
    resetBtn,
  );
}
