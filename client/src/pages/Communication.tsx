import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCommunication } from '../hooks/useCommunication';
import { api } from '../lib/api';
import type {
  CommunicationSummary, ContactAttemptType, ContactStatus,
  Sentiment, FollowUpType, Phase
} from '../types';

// ── Constants ──────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
  file_setup: 'File Setup',
  treating: 'Treating',
  demand_drafting: 'Demand Drafting',
  demand_sent: 'Demand Sent',
  negotiations: 'Negotiations',
  closed: 'Closed',
};

const SENTIMENT_CLASSES: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-yellow-100 text-yellow-700',
  negative: 'bg-red-100 text-red-700',
  at_risk: 'bg-red-100 text-red-700',
};

const FOLLOW_UP_LABELS: Record<FollowUpType, string> = {
  none_needed: 'None Needed',
  cm_follow_up: 'CM Follow Up Needed',
  attorney_review: 'Attorney Review Needed',
  attorney_contact: 'Attorney Contact Needed',
  urgent_escalation: 'Urgent Escalation',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString();
}

// ── Log form state ─────────────────────────────────────────────────────────

interface LogForm {
  contacted_at: string;
  last_attempted: string;
  contact_attempt_type: ContactAttemptType;
  contact_status: ContactStatus;
  client_sentiment: Sentiment | 'at_risk';
  follow_up_type: FollowUpType;
  action_item: string;
}

const defaultForm = (): LogForm => ({
  contacted_at: new Date().toISOString().slice(0, 10),
  last_attempted: '',
  contact_attempt_type: 'attempted',
  contact_status: 'no_answer',
  client_sentiment: 'neutral',
  follow_up_type: 'none_needed',
  action_item: '',
});

// ── Component ──────────────────────────────────────────────────────────────

export default function Communication() {
  const { data, loading, error, refetch } = useCommunication();
  const [filter, setFilter] = useState<'all' | 'due'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<LogForm>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const caseId = searchParams.get('caseId');
    if (caseId && data) {
      const id = Number(caseId);
      if (data.find(c => c.case_id === id)) {
        setSelectedId(id);
      }
    }
  }, [searchParams, data]);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">Failed to load communication data.</div>;
  if (!data) return null;

  const overdueCount = data.filter(c => c.is_overdue).length;
  const filtered = filter === 'due' ? data.filter(c => c.is_overdue) : data;
  const selected = data.find(c => c.case_id === selectedId) ?? null;

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setForm(defaultForm());
    setSaveError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.communication.log(selectedId, {
        contacted_at: form.contacted_at,
        last_attempted: form.last_attempted || null,
        contact_attempt_type: form.contact_attempt_type,
        contact_status: form.contact_status,
        client_sentiment: form.client_sentiment,
        follow_up_type: form.follow_up_type,
        action_item: form.action_item.trim() || null,
      });
      refetch();
      setForm(defaultForm());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );

  const inputClass = "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white border border-gray-200 rounded-lg overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-gray-900">Communication Hub</h1>
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`text-xs px-2.5 py-1 rounded ${filter === 'all' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('due')}
              className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 ${filter === 'due' ? 'bg-red-100 text-red-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              Contacts Due
              {overdueCount > 0 && (
                <span className={`text-xs font-bold ${filter === 'due' ? 'text-red-700' : 'text-red-500'}`}>
                  ●{overdueCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-sm text-gray-400 text-center">No cases to show</li>
          )}
          {filtered.map(c => (
            <li
              key={c.case_id}
              onClick={() => handleSelect(c.case_id)}
              className={`px-4 py-3 cursor-pointer transition-colors ${
                selectedId === c.case_id
                  ? 'bg-blue-50 border-l-[3px] border-blue-600'
                  : c.is_overdue
                  ? 'bg-red-50 border-l-[3px] border-red-400 hover:bg-red-100'
                  : 'hover:bg-gray-50 border-l-[3px] border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${selectedId === c.case_id ? 'text-blue-700' : 'text-gray-900'}`}>
                  {c.client_name}
                </span>
                {c.client_sentiment && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${SENTIMENT_CLASSES[c.client_sentiment] ?? 'bg-gray-100 text-gray-600'}`}>
                    {c.client_sentiment === 'at_risk' ? 'At Risk' : c.client_sentiment}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-gray-500">{c.attorney} · Last: {formatDate(c.last_contact_date)}</span>
                {c.is_overdue ? (
                  <span className="text-xs text-red-600 font-medium">⚠ {formatDate(c.next_contact_due)} Overdue</span>
                ) : (
                  <span className="text-xs text-gray-400">Next: {formatDate(c.next_contact_due)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">Select a case to view details and log a contact</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selected.client_name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Attorney: {selected.attorney} · Phase: {PHASE_LABELS[selected.current_phase]}
                </p>
              </div>
              {selected.is_overdue && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">Contact Overdue</span>
              )}
            </div>

            {/* Summary tiles */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Initial Contact', value: formatDate(selected.initial_contact_date) },
                { label: 'Last Contact', value: formatDate(selected.last_contact_date) },
                { label: 'Next Contact Due', value: formatDate(selected.next_contact_due), overdue: selected.is_overdue },
              ].map(tile => (
                <div
                  key={tile.label}
                  className={`border rounded-lg px-3 py-2 ${tile.overdue ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}
                >
                  <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${tile.overdue ? 'text-red-500' : 'text-gray-400'}`}>
                    {tile.label}
                  </p>
                  <p className={`text-sm font-semibold ${tile.overdue ? 'text-red-600' : 'text-gray-900'}`}>{tile.value}</p>
                </div>
              ))}
            </div>

            {/* Log contact form */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                Log New Contact
              </h3>
              <form onSubmit={handleSave} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {field('Contact Date *',
                    <input type="date" required value={form.contacted_at}
                      onChange={e => setForm(f => ({ ...f, contacted_at: e.target.value }))}
                      className={inputClass} />
                  )}
                  {field('Last Attempted',
                    <input type="date" value={form.last_attempted}
                      onChange={e => setForm(f => ({ ...f, last_attempted: e.target.value }))}
                      className={inputClass} />
                  )}
                  {field('Contact Type *',
                    <select value={form.contact_attempt_type}
                      onChange={e => setForm(f => ({ ...f, contact_attempt_type: e.target.value as ContactAttemptType }))}
                      className={inputClass}>
                      <option value="attempted">Attempted</option>
                      <option value="not_attempted">Not Attempted</option>
                      <option value="completed">Completed</option>
                    </select>
                  )}
                  {field('Contact Status *',
                    <select value={form.contact_status}
                      onChange={e => setForm(f => ({ ...f, contact_status: e.target.value as ContactStatus }))}
                      className={inputClass}>
                      <option value="answered">Answered</option>
                      <option value="voicemail">Left Voicemail</option>
                      <option value="no_answer">Not Answered</option>
                    </select>
                  )}
                  {field('Client Sentiment *',
                    <select value={form.client_sentiment}
                      onChange={e => setForm(f => ({ ...f, client_sentiment: e.target.value as Sentiment | 'at_risk' }))}
                      className={inputClass}>
                      <option value="positive">Positive</option>
                      <option value="neutral">Neutral</option>
                      <option value="negative">Negative</option>
                      <option value="at_risk">At Risk</option>
                    </select>
                  )}
                  {field('Follow Up Necessary *',
                    <select value={form.follow_up_type}
                      onChange={e => setForm(f => ({ ...f, follow_up_type: e.target.value as FollowUpType }))}
                      className={inputClass}>
                      {(Object.entries(FOLLOW_UP_LABELS) as [FollowUpType, string][]).map(
                        ([value, label]) => <option key={value} value={value}>{label}</option>
                      )}
                    </select>
                  )}
                </div>
                {field('Contact Action Items',
                  <input type="text" value={form.action_item}
                    onChange={e => setForm(f => ({ ...f, action_item: e.target.value }))}
                    placeholder="e.g. Call back tomorrow morning"
                    className={inputClass} />
                )}
                {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setForm(defaultForm())}
                    className="border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm text-gray-700">
                    Reset
                  </button>
                  <button type="submit" disabled={saving}
                    className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save Contact'}
                  </button>
                </div>
              </form>
            </div>

            {/* Contact history */}
            {selected.last_contact_date && (
              <ContactHistory caseId={selected.case_id} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contact history sub-component ──────────────────────────────────────────

// Matches the shape of Contact records that have been logged via the hub
interface HubContact {
  id: number;
  contacted_at: string;
  contact_attempt_type: string | null;
  contact_status: string | null;
  follow_up_type: string | null;
  action_item: string | null;
}

function ContactHistory({ caseId }: { caseId: number }) {
  const [contacts, setContacts] = useState<HubContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.contacts.list({ case_id: String(caseId) })
      .then((data) => {
        const hubContacts = (data as unknown as HubContact[])
          .filter((c) => c.contact_attempt_type != null)
          .sort((a, b) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime());
        setContacts(hubContacts);
      })
      .catch(() => { /* silently hide history on error */ })
      .finally(() => setLoading(false));
  }, [caseId]);

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const FOLLOW_UP_DISPLAY: Record<string, string> = {
    none_needed: 'None Needed', cm_follow_up: 'CM Follow Up', attorney_review: 'Attorney Review',
    attorney_contact: 'Attorney Contact', urgent_escalation: 'Urgent Escalation',
  };

  if (loading || contacts.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact History (Hub)</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {contacts.map(c => (
          <li key={c.id} className="px-4 py-2.5">
            <button onClick={() => toggle(c.id)} className="w-full text-left flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{new Date(c.contacted_at + 'T00:00:00').toLocaleDateString()}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 capitalize">{c.contact_attempt_type?.replace(/_/g, ' ')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{c.contact_status?.replace(/_/g, ' ')}</span>
              </div>
              <span className="text-xs text-gray-400">{expanded.has(c.id) ? '▲' : '▼'}</span>
            </button>
            {expanded.has(c.id) && (
              <div className="mt-2 pl-1 space-y-1 text-sm text-gray-600">
                {c.follow_up_type && <p><span className="font-medium">Follow Up:</span> {FOLLOW_UP_DISPLAY[c.follow_up_type] ?? c.follow_up_type}</p>}
                {c.action_item && <p><span className="font-medium">Action:</span> {c.action_item}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
