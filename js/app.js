import * as store from './store.js';
import * as tasks from './tasks.js';
import { renderFilterBar } from './filterBar.js';
import { openTaskModal } from './taskModal.js';
import { renderTreeView } from './views/tree.js';
import { renderTableView } from './views/table.js';
import { renderBoardView } from './views/board.js';
import { renderGanttView } from './views/gantt.js';

const state = {
  tasks: [],
  view: 'tree',
  filterState: {
    query: '',
    status: '',
    assignee: '',
    sortKey: 'order',
    sortDir: 'asc',
  },
};

const viewRenderers = {
  tree: renderTreeView,
  table: renderTableView,
  board: renderBoardView,
  gantt: renderGanttView,
};

function persist() {
  store.saveAll(state.tasks);
}

function setTasks(next) {
  state.tasks = next;
  persist();
  renderAll();
}

const actions = {
  openTask(id) {
    const task = tasks.getTaskById(state.tasks, id);
    if (!task) return;
    openTaskModal({
      task,
      allTasks: state.tasks,
      onSave: (taskId, patch) => setTasks(tasks.updateTask(state.tasks, taskId, patch)),
      onDelete: (taskId) => setTasks(tasks.deleteTask(state.tasks, taskId)),
    });
  },
  addChild(parentId) {
    const parent = parentId ? tasks.getTaskById(state.tasks, parentId) : null;
    if (parent && parent.level >= 3) return;
    const created = tasks.createTask(state.tasks, parentId);
    const next = [...state.tasks, created];
    setTasks(next);
    actions.openTask(created.id);
  },
  toggleExpand(id) {
    const t = tasks.getTaskById(state.tasks, id);
    if (!t) return;
    setTasks(tasks.updateTask(state.tasks, id, { expanded: !(t.expanded !== false) }));
  },
  deleteTask(id) {
    setTasks(tasks.deleteTask(state.tasks, id));
  },
  changeStatus(id, status) {
    setTasks(tasks.updateTask(state.tasks, id, { status }));
  },
};

function renderFilters() {
  const filterBarEl = document.getElementById('filterBar');
  renderFilterBar(filterBarEl, {
    allTasks: state.tasks,
    filterState: state.filterState,
    onChange: (next) => {
      const assigneeChanged = next.assignee !== state.filterState.assignee;
      const isReset = !next.query && !next.status && !next.assignee;
      state.filterState = next;
      // Only re-render filter bar when reset (to update select states)
      // For typing in search/changing dropdowns, just re-render the view
      // to preserve input focus.
      if (isReset || assigneeChanged) {
        renderFilters();
      }
      renderView();
    },
  });
}

function renderView() {
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });

  const matched = tasks.searchAndFilter(state.tasks, state.filterState);
  const needsAncestors = state.view === 'tree' || state.view === 'gantt';
  const visibleTasks = needsAncestors
    ? tasks.expandWithAncestors(state.tasks, matched)
    : matched;

  const container = document.getElementById('viewContainer');
  const renderer = viewRenderers[state.view] ?? renderTreeView;
  renderer(container, {
    tasks: visibleTasks,
    allTasks: state.tasks,
    filterState: state.filterState,
    actions,
  });
}

function renderAll() {
  renderFilters();
  renderView();
}

function bindHeader() {
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      renderView();
    });
  });

  document.getElementById('addRootBtn').addEventListener('click', () => {
    actions.addChild(null);
  });
}

function maybeSeedDemo() {
  if (state.tasks.length > 0) return;
  if (!confirm('タスクが空です。サンプルデータを読み込みますか？')) return;
  const seed = buildSeedData();
  setTasks(seed);
}

function buildSeedData() {
  const now = Date.now();
  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const make = (overrides) => ({
    id: crypto.randomUUID(),
    parentId: null,
    level: 1,
    title: '',
    description: '',
    startDate: null,
    endDate: null,
    status: 'not_started',
    progress: 0,
    assignee: '',
    order: 0,
    expanded: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const renewal = make({
    title: 'Webサイトリニューアル', level: 1, order: 0,
    startDate: iso(0), endDate: iso(45),
    status: 'in_progress', progress: 30, assignee: '佐藤',
    description: '会社サイト全面リニューアルプロジェクト',
  });
  const design = make({
    title: 'デザイン', parentId: renewal.id, level: 2, order: 0,
    startDate: iso(0), endDate: iso(20),
    status: 'in_progress', progress: 50, assignee: '田中',
  });
  const dev = make({
    title: '実装', parentId: renewal.id, level: 2, order: 1,
    startDate: iso(15), endDate: iso(40),
    status: 'not_started', progress: 0, assignee: '鈴木',
  });
  const qa = make({
    title: 'テスト・公開', parentId: renewal.id, level: 2, order: 2,
    startDate: iso(35), endDate: iso(45),
    status: 'not_started', progress: 0, assignee: '佐藤',
  });
  const wireframe = make({
    title: 'ワイヤーフレーム作成', parentId: design.id, level: 3, order: 0,
    startDate: iso(0), endDate: iso(7),
    status: 'completed', progress: 100, assignee: '田中',
  });
  const mockup = make({
    title: 'モックアップ作成', parentId: design.id, level: 3, order: 1,
    startDate: iso(7), endDate: iso(20),
    status: 'in_progress', progress: 60, assignee: '田中',
  });
  const front = make({
    title: 'フロントエンド開発', parentId: dev.id, level: 3, order: 0,
    startDate: iso(15), endDate: iso(30),
    status: 'not_started', progress: 0, assignee: '鈴木',
  });
  const back = make({
    title: 'バックエンド開発', parentId: dev.id, level: 3, order: 1,
    startDate: iso(20), endDate: iso(40),
    status: 'not_started', progress: 0, assignee: '高橋',
  });

  return [renewal, design, dev, qa, wireframe, mockup, front, back];
}

function init() {
  state.tasks = store.loadAll();
  bindHeader();
  renderAll();
  if (state.tasks.length === 0) {
    setTimeout(maybeSeedDemo, 100);
  }
}

document.addEventListener('DOMContentLoaded', init);
