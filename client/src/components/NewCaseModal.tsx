import { useState } from 'react';
import { api } from '../lib/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function NewCaseModal({ onClose, onCreated }: Props) {
  const [clientName, setClientName] = useState('');
  const [attorney, setAttorney] = useState('');
  const [dateAssigned, setDateAssigned] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !attorney.trim() || !dateAssigned) return;
    setSaving(true);
    setError(null);
    try {
      await api.cases.create({
        client_name: clientName.trim(),
        attorney: attorney.trim(),
        date_assigned: dateAssigned,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">New Case</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attorney</label>
            <input
              type="text"
              value={attorney}
              onChange={e => setAttorney(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Assigned</label>
            <input
              type="date"
              value={dateAssigned}
              onChange={e => setDateAssigned(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
