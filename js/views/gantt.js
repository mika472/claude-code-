import { el, clear, parseDate, addDays, toISODate, formatDate, STATUS_LABELS, LEVEL_LABELS } from '../utils.js';
import { sortTasks, getAncestors } from '../tasks.js';

const DAY_WIDTH = 28;

export function renderGanttView(container, { tasks, allTasks, filterState, actions }) {
  clear(container);
  const wrapper = el('div', { class: 'gantt-view' });

  const datedTasks = tasks.filter(t => parseDate(t.startDate) && parseDate(t.endDate));
  if (datedTasks.length === 0) {
    wrapper.appendChild(el('div', { class: 'gantt-no-dates' },
      'ガントチャートには開始日と終了日の両方が設定されたタスクが必要です。'
    ));
    container.appendChild(wrapper);
    return;
  }

  let minDate = parseDate(datedTasks[0].startDate);
  let maxDate = parseDate(datedTasks[0].endDate);
  for (const t of datedTasks) {
    const s = parseDate(t.startDate);
    const e = parseDate(t.endDate);
    if (s < minDate) minDate = s;
    if (e > maxDate) maxDate = e;
  }
  minDate = addDays(minDate, -1);
  maxDate = addDays(maxDate, 1);
  const totalDays = Math.max(1, Math.round((maxDate - minDate) / 86400000) + 1);

  const sorted = sortTasks(datedTasks, filterState.sortKey || 'startDate', filterState.sortDir || 'asc');

  const grid = el('div', {
    class: 'gantt-grid',
    style: { '--day-width': DAY_WIDTH + 'px' },
  });

  // Header row
  grid.appendChild(el('div', { class: 'gantt-header-cell' }, 'タスク'));
  grid.appendChild(el('div', { class: 'gantt-axis', style: { width: (totalDays * DAY_WIDTH) + 'px' } },
    buildAxis(minDate, totalDays)
  ));

  // Task rows
  for (const t of sorted) {
    const ancestors = getAncestors(allTasks, t.id);
    const indentLevel = ancestors.length;
    const startD = parseDate(t.startDate);
    const endD = parseDate(t.endDate);
    const offset = Math.round((startD - minDate) / 86400000);
    const length = Math.max(1, Math.round((endD - startD) / 86400000) + 1);

    grid.appendChild(el('div', {
      class: 'gantt-row-label',
      onclick: () => actions.openTask(t.id),
    }, [
      el('span', { class: 'indent', style: { width: (indentLevel * 16) + 'px' } }),
      el('span', { class: 'level-badge level-' + t.level }, LEVEL_LABELS[t.level]),
      el('span', { class: 'title' }, t.title || '無題'),
    ]));

    grid.appendChild(el('div', {
      class: 'gantt-row-track',
      style: { width: (totalDays * DAY_WIDTH) + 'px' },
    }, [
      el('div', {
        class: 'gantt-bar status-' + t.status,
        title: `${t.title} (${formatDate(t.startDate)} 〜 ${formatDate(t.endDate)}) ${STATUS_LABELS[t.status]} ${t.progress ?? 0}%`,
        style: {
          left: (offset * DAY_WIDTH) + 'px',
          width: (length * DAY_WIDTH - 2) + 'px',
        },
        onclick: () => actions.openTask(t.id),
      }, [
        el('div', { class: 'gantt-bar-fill', style: { width: `${100 - (t.progress ?? 0)}%`, left: `${t.progress ?? 0}%` } }),
        el('div', { class: 'gantt-bar-label' }, `${t.title} · ${t.progress ?? 0}%`),
      ]),
    ]));
  }

  wrapper.appendChild(grid);
  container.appendChild(wrapper);
}

function buildAxis(minDate, totalDays) {
  const ticks = [];
  let lastMonthLabel = '';
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(minDate, i);
    const monthLabel = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    let label;
    if (totalDays > 60) {
      // Show only first day of each week
      if (d.getDay() === 1 || i === 0) {
        label = monthLabel + '/' + String(d.getDate()).padStart(2, '0');
      }
    } else {
      label = (monthLabel !== lastMonthLabel ? monthLabel + '/' : '') + String(d.getDate()).padStart(2, '0');
      lastMonthLabel = monthLabel;
    }
    if (label) {
      ticks.push(el('div', {
        class: 'gantt-axis-tick',
        style: { left: (i * DAY_WIDTH) + 'px' },
      }, label));
    }
  }
  return ticks;
}
