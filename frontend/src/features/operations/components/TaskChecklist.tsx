import { useRef, useState } from 'react';
import { CheckSquare, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChecklistItem } from '../api/types';

interface TaskChecklistProps {
  items: ChecklistItem[];
  canEdit: boolean;
  ready: boolean;
  loading: boolean;
  loadError: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onRetry: () => void;
  onChange: (items: ChecklistItem[]) => Promise<unknown>;
}

export function TaskChecklist({
  items, canEdit, ready, loading, loadError, disabled, disabledReason, onRetry, onChange,
}: TaskChecklistProps) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<'subtask' | 'document'>('subtask');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const locked = !canEdit || !ready || loading || loadError || disabled || saving;
  const controlClass = 'h-8 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-xs text-[#1E293B] disabled:cursor-not-allowed';

  const save = async (nextItems: ChecklistItem[]) => {
    if (locked || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onChange(nextItems);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save checklist. Please try again.');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const updateItem = (id: string, updates: Partial<ChecklistItem>) =>
    save(items.map((item) => item.id === id ? { ...item, ...updates } : item));

  const addItem = async () => {
    if (!text.trim() || locked) return;
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    if (await save([...items, {
      id, text: text.trim(), completed: false, category,
      periodYear: category === 'document' ? year.trim() || null : null,
    }])) setText('');
  };

  return (
    <section className="space-y-2" aria-label="Task checklist" aria-busy={loading || saving}>
      <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#475569]">
        <CheckSquare className="h-3.5 w-3.5" />
        {ready && !loadError
          ? `Checklist (${items.filter((item) => item.completed).length}/${items.length})`
          : 'Checklist'}
      </h4>

      {loadError || (!loading && !ready) ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[#CBD5E1] p-3 text-xs text-[#475569]">
          <span>Unable to load checklist. Retry before making changes.</span>
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>Retry</Button>
        </div>
      ) : loading && !ready ? (
        <p role="status" className="p-3 text-xs text-[#475569]">Loading checklist…</p>
      ) : items.length > 0 ? (
        <div className="divide-y divide-[#E2E8F0] rounded-[6px] border border-[#E2E8F0] bg-white px-3">
          {items.map((item) => {
            const dependencies = item.dependsOn ? [item.dependsOn].flat() : [];
            const blocked = dependencies.some((id) => items.some((other) => other.id === id && !other.completed));
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-2 py-2.5 text-xs">
                <label className="flex min-w-0 basis-full items-center gap-2 sm:basis-0 sm:flex-1">
                  <input type="checkbox" checked={item.completed}
                    onChange={() => void updateItem(item.id, { completed: !item.completed })}
                    disabled={locked || blocked}
                    title={blocked ? 'Waiting for prerequisite checklist items' : disabledReason}
                    className="rounded accent-[#1D4ED8]" />
                  <span className={`break-words ${item.completed ? 'text-[#475569] line-through' : 'font-medium text-[#1E293B]'}`}>{item.text}</span>
                </label>
                <button type="button" className={`${controlClass} ml-5 flex shrink-0 items-center gap-1 sm:ml-0`}
                  aria-label={`Change checklist type for ${item.text}`} disabled={locked}
                  title={disabledReason}
                  onClick={() => void updateItem(item.id, {
                    category: item.category === 'document' ? 'subtask' : 'document',
                    periodYear: item.category === 'document' ? item.periodYear : item.periodYear ?? String(new Date().getFullYear()),
                  })}>
                  {item.category === 'document' ? <><FileText className="h-3 w-3" /> Doc</> : 'Sub-task'}
                </button>
                {item.category === 'document' && (
                  <Input key={`${item.id}-${item.periodYear ?? ''}`} type="text" inputMode="numeric"
                    aria-label={`Document year for ${item.text}`} placeholder="Year" maxLength={100}
                    defaultValue={item.periodYear ?? ''} disabled={locked} title={disabledReason}
                    onBlur={(event) => {
                      const nextYear = event.target.value.trim() || null;
                      if (nextYear !== (item.periodYear ?? null)) void updateItem(item.id, { periodYear: nextYear });
                    }} className={`${controlClass} w-24`} />
                )}
                {item.assigneeName && <span className="text-[#475569]">{item.assigneeName}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-center text-xs italic text-[#475569]">No checklist items yet.</p>
      )}

      {canEdit && (
        <div className="space-y-2 pt-1">
          <label className="block text-xs font-medium text-[#475569]" htmlFor="new-task-checklist-text">New checklist item</label>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="new-task-checklist-text" placeholder="Add a new checklist item..." value={text} maxLength={500}
              onChange={(event) => setText(event.target.value)} disabled={locked} title={disabledReason}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); void addItem(); }
              }} className={`${controlClass} min-w-40 flex-1`} />
            <select aria-label="New checklist item type" value={category} disabled={locked} title={disabledReason}
              onChange={(event) => setCategory(event.target.value as 'subtask' | 'document')} className={controlClass}>
              <option value="subtask">Sub-task</option>
              <option value="document">Doc</option>
            </select>
            {category === 'document' && (
              <Input aria-label="New document year" type="text" inputMode="numeric" placeholder="Year" maxLength={100}
                value={year} onChange={(event) => setYear(event.target.value)} disabled={locked}
                className={`${controlClass} w-24`} />
            )}
            <Button type="button" size="xs" onClick={() => void addItem()} disabled={locked || !text.trim()}
              title={disabledReason} className="h-8 gap-1 rounded-[6px] text-xs">
              <Plus className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Add'}
            </Button>
          </div>
        </div>
      )}
      {saveError && <p role="alert" className="text-xs text-[#991B1B]">{saveError}</p>}
    </section>
  );
}
