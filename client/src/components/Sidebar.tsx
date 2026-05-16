import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/caseload', label: 'Caseload' },
  { to: '/worklist', label: 'Worklist' },
  { to: '/templates', label: 'Templates' },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  return (
    <nav className="w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200">
        <h1 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">PI Tracker</h1>
      </div>
      <ul className="flex-1 py-4 space-y-1 px-3">
        {links.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
