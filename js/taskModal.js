import { el, clear, STATUS_LABELS, LEVEL_LABELS } from './utils.js';
import { getBreadcrumb } from './tasks.js';

let currentEscHandler = null;

export function openTaskModal({ task, allTasks, onSave, onDelete }) {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  closeModal();

  const breadcrumb = getBreadcrumb(allTasks, task.id);
  const breadcrumbText = breadcrumb.length
    ? breadcrumb.join(' › ') + ' › '
    : '';

  const titleInput = el('input', { type: 'text', value: task.title ?? '', placeholder: 'タイトル' });
  const descInput = el('textarea', { placeholder: '詳細', value: task.description ?? '' });
  descInput.value = task.description ?? '';
  const startInput = el('input', { type: 'date', value: task.startDate ?? '' });
  const endInput = el('input', { type: 'date', value: task.endDate ?? '' });
  const assigneeInput = el('input', { type: 'text', value: task.assignee ?? '', placeholder: '担当者名' });

  const statusSelect = el('select', {},
    Object.entries(STATUS_LABELS).map(([value, label]) =>
      el('option', { value, selected: value === task.status }, label)
    )
  );

  const progressInput = el('input', {
    type: 'range', min: 0, max: 100, step: 5, value: String(task.progress ?? 0),
  });
  const progressOut = el('span', { class: 'progress-text' }, `${task.progress ?? 0}%`);
  progressInput.addEventListener('input', () => {
    progressOut.textContent = `${progressInput.value}%`;
  });

  const modal = el('div', { class: 'modal' }, [
    el('h2', {}, `${LEVEL_LABELS[task.level] ?? ''}を編集`),
    breadcrumbText && el('div', { class: 'breadcrumb', style: { marginBottom: '12px' } }, breadcrumbText + (task.title || '')),
    el('div', { class: 'form-row' }, [
      el('label', {}, 'タイトル'),
      titleInput,
    ]),
    el('div', { class: 'form-row' }, [
      el('label', {}, '詳細'),
      descInput,
    ]),
    el('div', { class: 'form-row split' }, [
      el('div', {}, [el('label', {}, '開始日'), startInput]),
      el('div', {}, [el('label', {}, '終了日'), endInput]),
    ]),
    el('div', { class: 'form-row split' }, [
      el('div', {}, [el('label', {}, '状態'), statusSelect]),
      el('div', {}, [el('label', {}, '担当者'), assigneeInput]),
    ]),
    el('div', { class: 'form-row' }, [
      el('label', {}, '進捗'),
      el('div', { class: 'range-row' }, [progressInput, progressOut]),
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', {
        class: 'btn btn-danger',
        onclick: () => {
          if (confirm('このタスクとすべての子タスクを削除しますか？')) {
            closeModal();
            onDelete?.(task.id);
          }
        },
      }, '削除'),
      el('div', { class: 'right' }, [
        el('button', { class: 'btn', onclick: () => closeModal() }, 'キャンセル'),
        el('button', {
          class: 'btn btn-primary',
          onclick: () => {
            const patch = {
              title: titleInput.value.trim() || '無題',
              description: descInput.value,
              startDate: startInput.value || null,
              endDate: endInput.value || null,
              status: statusSelect.value,
              progress: Number(progressInput.value),
              assignee: assigneeInput.value.trim(),
            };
            closeModal();
            onSave?.(task.id, patch);
          },
        }, '保存'),
      ]),
    ]),
  ]);

  const backdrop = el('div', {
    class: 'modal-backdrop',
    onclick: (e) => { if (e.target === backdrop) closeModal(); },
  }, [modal]);

  root.appendChild(backdrop);

  currentEscHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', currentEscHandler);

  setTimeout(() => titleInput.focus(), 0);
}

export function closeModal() {
  const root = document.getElementById('modalRoot');
  if (root) clear(root);
  if (currentEscHandler) {
    document.removeEventListener('keydown', currentEscHandler);
    currentEscHandler = null;
  }
}
