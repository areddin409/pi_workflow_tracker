import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { ContactType, ContactStatus, Sentiment } from '../types';

interface Props {
  caseId: number;
  onClose: () => void;
  onLogged: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function LogContactModal({ caseId, onClose, onLogged }: Props) {
  const [contactedAt, setContactedAt] = useState(today());
  const [contactType, setContactType] = useState<ContactType>('phone');
  const [contactStatus, setContactStatus] = useState<ContactStatus>('answered');
  const [sentiment, setSentiment] = useState<Sentiment>('neutral');
  const [followUpNecessary, setFollowUpNecessary] = useState(false);
  const [notes, setNotes] = useState('');
  const [actionItem, setActionItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.contacts.create({
        case_id: caseId,
        contacted_at: contactedAt,
        contact_type: contactType,
        contact_status: contactStatus,
        client_sentiment: sentiment,
        follow_up_necessary: followUpNecessary,
        notes: notes.trim() || null,
        action_item: actionItem.trim() || null,
      });
      onLogged();
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Failed to log contact');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Log Contact</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={contactedAt}
              onChange={e => setContactedAt(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Type</label>
              <select
                value={contactType}
                onChange={e => setContactType(e.target.value as ContactType)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="text">Text</option>
                <option value="letter">Letter</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={contactStatus}
                onChange={e => setContactStatus(e.target.value as ContactStatus)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="answered">Answered</option>
                <option value="voicemail">Voicemail</option>
                <option value="no_answer">No Answer</option>
              </select>
            </div>
          </div>

          {/* Sentiment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Sentiment</label>
            <select
              value={sentiment}
              onChange={e => setSentiment(e.target.value as Sentiment)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Call notes…"
            />
          </div>

          {/* Action Item */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action Item (optional)</label>
            <input
              type="text"
              value={actionItem}
              onChange={e => setActionItem(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Send medical records request"
            />
          </div>

          {/* Follow-up checkbox */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={followUpNecessary}
              onChange={e => setFollowUpNecessary(e.target.checked)}
              className="rounded"
            />
            Follow-up necessary
          </label>

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
              {saving ? 'Saving…' : 'Log Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
