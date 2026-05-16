interface StatCardProps {
  label: string;
  value: number | string;
  highlight?: 'red' | 'yellow' | 'green';
}

export default function StatCard({ label, value, highlight }: StatCardProps) {
  const valueColor =
    highlight === 'red'
      ? 'text-red-600'
      : highlight === 'yellow'
      ? 'text-yellow-600'
      : highlight === 'green'
      ? 'text-green-600'
      : 'text-gray-900';
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
    </div>
  );
}
