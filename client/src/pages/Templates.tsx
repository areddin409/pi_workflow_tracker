import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { TaskTemplate, Phase, Priority } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEMPLATE_PHASES: Phase[] = [
  'file_setup',
  'treating',
  'demand_drafting',
  'demand_sent',
  'negotiations',
];

const PHASE_LABELS: Record<Phase, string> = {
  file_setup: 'File Setup',
  treating: 'Treating',
  demand_drafting: 'Demand Drafting',
  demand_sent: 'Demand Sent',
  negotiations: 'Negotiations',
  closed: 'Closed',
};

const PRIORITY_CLASSES: Record<Priority, string> = {
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

// ── Types ──────────────────────────────────────────────────────────────────

// Local row — either a persisted template or a new (unsaved) one
type NewId = `new-${number}`;

interface LocalRow {
  localId: number | NewId; // negative counter for new rows, real id for existing
  id: number | null;       // null for new tasks
  phase: Phase;
  title: string;
  priority: Priority;
  sort_order: number;
  isNew: boolean;
}

// ── Helper ─────────────────────────────────────────────────────────────────

let newIdCounter = 0;
function nextNewId(): NewId {
  newIdCounter -= 1;
  return `new-${newIdCounter}`;
}

function templateToRow(t: TaskTemplate): LocalRow {
  return {
    localId: t.id,
    id: t.id,
    phase: t.phase,
    title: t.title,
    priority: t.priority,
    sort_order: t.sort_order,
    isNew: false,
  };
}

// ── PhaseSection ──────────────────────────────────────────────────────────

interface PhaseSectionProps {
  phase: Phase;
  original: TaskTemplate[];
  onSaved: () => void;
}

function PhaseSection({ phase, original, onSaved }: PhaseSectionProps) {
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<LocalRow[]>(() => original.map(templateToRow));
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local state when original data refreshes
  useEffect(() => {
    setRows(original.map(templateToRow));
    setRemoved(new Set());
  }, [original]);

  const updateRow = (localId: LocalRow['localId'], field: keyof LocalRow, value: string | number) => {
    setRows(prev =>
      prev.map(r => (r.localId === localId ? { ...r, [field]: value } : r))
    );
  };

  const markRemoved = (row: LocalRow) => {
    if (row.isNew) {
      // Remove new (unsaved) rows immediately from list
      setRows(prev => prev.filter(r => r.localId !== row.localId));
    } else if (row.id !== null) {
      setRemoved(prev => new Set(prev).add(row.id as number));
    }
  };

  const addTask = () => {
    const newId = nextNewId();
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    setRows(prev => [
      ...prev,
      {
        localId: newId,
        id: null,
        phase,
        title: '',
        priority: 'medium',
        sort_order: maxOrder + 10,
        isNew: true,
      },
    ]);
  };

  const handleSave = async () => {
    const confirmed = window.confirm(
      'This will update pending tasks across active cases. Continue?'
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    try {
      // Existing tasks that changed
      const changedExisting = rows.filter(r => {
        if (r.isNew || r.id === null) return false;
        if (removed.has(r.id)) return false;
        const orig = original.find(o => o.id === r.id);
        if (!orig) return false;
        return (
          orig.title !== r.title ||
          orig.priority !== r.priority ||
          orig.sort_order !== r.sort_order
        );
      });

      // New tasks
      const newTasks = rows.filter(r => r.isNew && !removed.has(r.id as number));

      // Run all mutations in parallel
      await Promise.all([
        ...changedExisting.map(r =>
          api.templates.update(r.id as number, {
            title: r.title,
            priority: r.priority,
            sort_order: r.sort_order,
          })
        ),
        ...newTasks.map(r =>
          api.templates.create({
            phase: r.phase,
            title: r.title,
            priority: r.priority,
            sort_order: r.sort_order,
          })
        ),
        ...[...removed].map(id => api.templates.delete(id)),
      ]);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const visibleRows = rows.filter(r => r.id === null || !removed.has(r.id));
  const hasChanges =
    removed.size > 0 ||
    rows.some(r => {
      if (r.isNew) return true;
      const orig = original.find(o => o.id === r.id);
      if (!orig) return false;
      return (
        orig.title !== r.title ||
        orig.priority !== r.priority ||
        orig.sort_order !== r.sort_order
      );
    });

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">
          {PHASE_LABELS[phase]}
        </span>
        <span className="text-gray-400 text-xs select-none">
          {open ? '▼' : '▶'}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {/* Task rows */}
          {visibleRows.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No tasks. Add one below.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleRows.map(row => (
                <div
                  key={String(row.localId)}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  {/* Title */}
                  <input
                    type="text"
                    value={row.title}
                    onChange={e => updateRow(row.localId, 'title', e.target.value)}
                    placeholder="Task title"
                    className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Priority */}
                  <select
                    value={row.priority}
                    onChange={e => updateRow(row.localId, 'priority', e.target.value)}
                    className={`border border-gray-300 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${PRIORITY_CLASSES[row.priority]}`}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>

                  {/* Sort order */}
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Order</label>
                    <input
                      type="number"
                      value={row.sort_order}
                      onChange={e => updateRow(row.localId, 'sort_order', parseInt(e.target.value, 10) || 0)}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => markRemoved(row)}
                    className="shrink-0 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer: Add Task + Save */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={addTask}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Task
            </button>

            <div className="flex items-center gap-3">
              {success && (
                <span className="text-xs text-green-600 font-medium">Saved successfully</span>
              )}
              {error && (
                <span className="text-xs text-red-600">{error}</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded text-sm font-medium transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Templates (page) ──────────────────────────────────────────────────────

export default function Templates() {
  const [templateMap, setTemplateMap] = useState<Record<string, TaskTemplate[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    api.templates
      .list()
      .then(setTemplateMap)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">Failed to load templates: {error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
      <p className="text-sm text-gray-500">
        Manage default tasks per phase. Changes propagate to open cases automatically.
      </p>

      {TEMPLATE_PHASES.map(phase => (
        <PhaseSection
          key={phase}
          phase={phase}
          original={templateMap?.[phase] ?? []}
          onSaved={fetchTemplates}
        />
      ))}
    </div>
  );
}
