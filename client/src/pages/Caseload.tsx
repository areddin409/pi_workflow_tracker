import { useState, useMemo } from 'react';
import { useCases } from '../hooks/useCases';
import NewCaseModal from '../components/NewCaseModal';
import PhaseAdvanceModal from '../components/PhaseAdvanceModal';
import type { Case, Phase, Priority } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
  file_setup: 'File Setup',
  treating: 'Treating',
  demand_drafting: 'Demand Draft',
  demand_sent: 'Demand Sent',
  negotiations: 'Negotiations',
  closed: 'Closed',
};

const PHASES: Phase[] = ['file_setup', 'treating', 'demand_drafting', 'demand_sent', 'negotiations', 'closed'];

const PRIORITY_CLASSES: Record<Priority, string> = {
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

function priorityClass(p: Priority | undefined): string {
  if (!p) return 'bg-gray-100 text-gray-600';
  return PRIORITY_CLASSES[p] ?? 'bg-gray-100 text-gray-600';
}

// ── Types ──────────────────────────────────────────────────────────────────

interface AdvancePending {
  caseId: number;
  incompleteTasks: number;
  isClose: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Caseload() {
  const [showClosed, setShowClosed] = useState(false);
  const { data, loading, error, refetch, advance, remove } = useCases({ include_closed: showClosed });

  // Filters
  const [phaseFilter, setPhaseFilter] = useState<Phase | ''>('');
  const [attorneyFilter, setAttorneyFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');

  // Modals
  const [showNewCase, setShowNewCase] = useState(false);
  const [advancePending, setAdvancePending] = useState<AdvancePending | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Case | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Build attorney options from loaded data
  const attorneys = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map(c => c.attorney))).sort();
  }, [data]);

  // Filtered + split data
  const { active, closed } = useMemo(() => {
    if (!data) return { active: [], closed: [] };

    const filter = (c: Case) => {
      if (phaseFilter && c.current_phase !== phaseFilter) return false;
      if (attorneyFilter && c.attorney !== attorneyFilter) return false;
      if (priorityFilter && c.case_badge_priority !== priorityFilter) return false;
      return true;
    };

    const active = data.filter(c => c.current_phase !== 'closed').filter(filter);
    const closed = showClosed ? data.filter(c => c.current_phase === 'closed').filter(filter) : [];
    return { active, closed };
  }, [data, phaseFilter, attorneyFilter, priorityFilter, showClosed]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAdvanceClick = async (c: Case) => {
    try {
      const result = await advance(c.id);
      if (result.incompleteTasks > 0) {
        setAdvancePending({
          caseId: c.id,
          incompleteTasks: result.incompleteTasks,
          isClose: c.current_phase === 'negotiations',
        });
      } else {
        refetch();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to advance phase');
    }
  };

  const handleAdvanceConfirm = () => {
    // The case was already advanced in handleAdvanceClick.
    // This modal is informational only (incomplete tasks warning).
    refetch();
    setAdvancePending(null);
  };

  const handleDelete = (c: Case) => setDeleteConfirm(c);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      await remove(deleteConfirm.id);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete case');
    } finally {
      setDeleteConfirm(null);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderRow = (c: Case, dimmed = false) => (
    <tr key={c.id} className={`hover:bg-gray-50 ${dimmed ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.client_name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{c.attorney}</td>
      <td className="px-4 py-3 text-sm text-gray-700">{PHASE_LABELS[c.current_phase]}</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {c.days_in_phase != null ? `${c.days_in_phase}d` : '—'}
      </td>
      <td className="px-4 py-3">
        {c.case_badge_priority ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityClass(c.case_badge_priority)}`}>
            {c.case_badge_priority}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {c.current_phase !== 'closed' && (
            <button
              onClick={() => handleAdvanceClick(c)}
              className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded text-sm"
            >
              {c.current_phase === 'negotiations' ? 'Close Case' : 'Advance Phase'}
            </button>
          )}
          {c.current_phase === 'closed' && (
            <button
              onClick={() => handleDelete(c)}
              className="bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 rounded text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  // ── JSX ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">Failed to load cases: {error}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Caseload</h1>
        <button
          onClick={() => setShowNewCase(true)}
          className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded text-sm"
        >
          + New Case
        </button>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded flex justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Filters + toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={phaseFilter}
          onChange={e => setPhaseFilter(e.target.value as Phase | '')}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Phases</option>
          {PHASES.filter(p => p !== 'closed').map(p => (
            <option key={p} value={p}>{PHASE_LABELS[p]}</option>
          ))}
        </select>

        <select
          value={attorneyFilter}
          onChange={e => setAttorneyFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Attorneys</option>
          {attorneys.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as Priority | '')}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-700 ml-auto cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={e => setShowClosed(e.target.checked)}
            className="rounded"
          />
          Show Closed Cases
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
              <th className="px-4 py-3 text-left font-medium">Client Name</th>
              <th className="px-4 py-3 text-left font-medium">Attorney</th>
              <th className="px-4 py-3 text-left font-medium">Phase</th>
              <th className="px-4 py-3 text-left font-medium">Days in Phase</th>
              <th className="px-4 py-3 text-left font-medium">Priority</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {active.length === 0 && closed.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                  No cases found
                </td>
              </tr>
            ) : (
              <>
                {active.map(c => renderRow(c, false))}
                {closed.map(c => renderRow(c, true))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showNewCase && (
        <NewCaseModal
          onClose={() => setShowNewCase(false)}
          onCreated={refetch}
        />
      )}

      {advancePending && (
        <PhaseAdvanceModal
          incompleteTasks={advancePending.incompleteTasks}
          isClose={advancePending.isClose}
          onConfirm={handleAdvanceConfirm}
          onCancel={() => { setAdvancePending(null); refetch(); }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Delete Case</h2>
            <p className="text-sm text-gray-600 mb-4">
              Delete case for <strong>{deleteConfirm.client_name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 rounded text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
