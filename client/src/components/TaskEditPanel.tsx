import { useState } from 'react';
import { api } from '../lib/api';
import type { Task, TaskStatus, WaitingOn } from '../types';

interface Props {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' },
];

const WAITING_ON_OPTIONS: { value: WaitingOn; label: string }[] = [
  { value: null, label: '— None' },
  { value: 'client', label: 'Client' },
  { value: 'adjuster', label: 'Adjuster' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'provider', label: 'Provider' },
];

export default function TaskEditPanel({ task, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [waitingOn, setWaitingOn] = useState<WaitingOn>(task.waiting_on);
  const [lastAction, setLastAction] = useState(task.last_action ?? '');
  const [nextFollowUp, setNextFollowUp] = useState(task.next_follow_up ?? '');
  const [notes, setNotes] = useState(task.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Partial<Task> = {
        status,
        waiting_on: waitingOn,
        last_action: lastAction || null,
        next_follow_up: nextFollowUp || null,
        notes: notes || null,
      };
      if (status === 'completed') {
        body.completion_date = new Date().toISOString().slice(0, 10);
      }
      await api.tasks.update(task.id, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-30"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 flex flex-col z-40">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{task.title}</h2>
            {task.client_name && (
              <p className="text-xs text-gray-500 mt-0.5">{task.client_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close panel"
          >
            &times;
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as TaskStatus)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Waiting On */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Waiting On</label>
            <select
              value={waitingOn ?? ''}
              onChange={e => setWaitingOn((e.target.value || null) as WaitingOn)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {WAITING_ON_OPTIONS.map(opt => (
                <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Last Action */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Last Action</label>
            <input
              type="text"
              value={lastAction}
              onChange={e => setLastAction(e.target.value)}
              placeholder="What was the last action taken?"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Next Follow-Up */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Next Follow-Up</label>
            <input
              type="date"
              value={nextFollowUp}
              onChange={e => setNextFollowUp(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={5}
              placeholder="Add notes..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded text-sm text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
