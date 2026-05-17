interface Props {
  incompleteTasks: number;
  isClose?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PhaseAdvanceModal({ incompleteTasks, isClose = false, onConfirm, onCancel }: Props) {
  const action = isClose ? 'Close Case' : 'Advance Phase';
  const informational = incompleteTasks > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          {informational ? 'Phase Advanced' : action}
        </h2>
        {informational && (
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-4">
            {incompleteTasks} task{incompleteTasks !== 1 ? 's were' : ' was'} not yet complete. You may want to review them on the case page.
          </p>
        )}
        {!informational && (
          <p className="text-sm text-gray-600 mb-4">
            Are you sure you want to {action.toLowerCase()}?
          </p>
        )}
        <div className="flex justify-end gap-2">
          {!informational && (
            <button
              onClick={onCancel}
              className="border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-sm text-gray-700"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded text-sm"
          >
            {informational ? 'OK' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
