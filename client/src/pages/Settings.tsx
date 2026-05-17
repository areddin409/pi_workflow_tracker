import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { PhaseSettings, Phase, Priority } from '../types';

const PHASE_LABELS: Record<Phase, string> = {
  file_setup: 'File Setup',
  treating: 'Treating',
  demand_drafting: 'Demand Drafting',
  demand_sent: 'Demand Sent',
  negotiations: 'Negotiations',
  closed: 'Closed',
};

const PRIORITY_OPTIONS: Priority[] = ['high', 'medium', 'low'];

function parseIntOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function settingsEqual(a: PhaseSettings, b: PhaseSettings): boolean {
  return (
    a.case_badge_priority === b.case_badge_priority &&
    a.auto_due_offset_days === b.auto_due_offset_days &&
    a.overdue_threshold_days === b.overdue_threshold_days
  );
}

export default function Settings() {
  const [original, setOriginal] = useState<PhaseSettings[] | null>(null);
  const [local, setLocal] = useState<PhaseSettings[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.settings
      .list()
      .then(data => {
        setOriginal(data);
        setLocal(data.map(row => ({ ...row })));
      })
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = useCallback(() => {
    if (!original || !local) return false;
    return local.some((row, i) => !settingsEqual(row, original[i]));
  }, [original, local]);

  function updateRow(phase: Phase, field: keyof Omit<PhaseSettings, 'phase'>, value: string) {
    setLocal(prev =>
      prev
        ? prev.map(row => {
            if (row.phase !== phase) return row;
            if (field === 'case_badge_priority') {
              return { ...row, case_badge_priority: value as Priority };
            }
            return { ...row, [field]: parseIntOrNull(value) };
          })
        : prev
    );
  }

  async function handleSave() {
    if (!local || !original) return;
    setSaving(true);
    setSaveError(null);
    setSuccessMsg(null);

    const changed = local.filter((row, i) => !settingsEqual(row, original[i]));

    try {
      await Promise.all(
        changed.map(row =>
          api.settings.update(row.phase, {
            case_badge_priority: row.case_badge_priority,
            auto_due_offset_days: row.auto_due_offset_days,
            overdue_threshold_days: row.overdue_threshold_days,
          })
        )
      );
      // Refresh original to match saved state
      const updated = await api.settings.list();
      setOriginal(updated);
      setLocal(updated.map(row => ({ ...row })));
      setSuccessMsg('Settings saved successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setSaveError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;
  if (!local) return null;

  const changed = hasChanges();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <div className="flex items-center gap-3">
          {successMsg && (
            <span className="text-sm text-green-700 bg-green-100 px-3 py-1 rounded-md">
              {successMsg}
            </span>
          )}
          {saveError && (
            <span className="text-sm text-red-700 bg-red-100 px-3 py-1 rounded-md">
              {saveError}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !changed}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Phase Configuration</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                <th className="px-5 py-3 text-left font-medium">Phase</th>
                <th className="px-5 py-3 text-left font-medium">Case Badge Priority</th>
                <th className="px-5 py-3 text-left font-medium">Auto Due Offset (days)</th>
                <th className="px-5 py-3 text-left font-medium">Overdue Threshold (days)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {local.map((row, i) => {
                const isDirty = original ? !settingsEqual(row, original[i]) : false;
                return (
                  <tr key={row.phase} className={isDirty ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">
                      {PHASE_LABELS[row.phase] ?? row.phase}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={row.case_badge_priority}
                        onChange={e => updateRow(row.phase, 'case_badge_priority', e.target.value)}
                        className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {PRIORITY_OPTIONS.map(p => (
                          <option key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        min={0}
                        value={row.auto_due_offset_days ?? ''}
                        onChange={e => updateRow(row.phase, 'auto_due_offset_days', e.target.value)}
                        placeholder="—"
                        className="text-sm border border-gray-300 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        min={0}
                        value={row.overdue_threshold_days ?? ''}
                        onChange={e => updateRow(row.phase, 'overdue_threshold_days', e.target.value)}
                        placeholder="—"
                        className="text-sm border border-gray-300 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Empty number fields are stored as null (no limit). Changed rows are highlighted in blue until saved.
      </p>
    </div>
  );
}
