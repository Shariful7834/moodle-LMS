import { Link } from 'react-router-dom';

/**
 * Actionable empty state. An empty screen must never be a dead end — it tells the
 * user what is missing AND gives them the button to fix it. Pass one or more
 * actions; the first is styled as the primary call-to-action.
 */
export default function EmptyState({ icon: Icon, title, description, actions = [] }) {
  return (
    <div className="text-center py-16 px-6 bg-white rounded-xl border border-gray-200">
      {Icon && <Icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />}
      <p className="text-gray-900 font-semibold">{title}</p>
      {description && <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">{description}</p>}

      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions.map((a, i) => {
            const isPrimary = i === 0;
            const cls = isPrimary
              ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition'
              : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition';
            return a.to ? (
              <Link key={i} to={a.to} className={cls}>
                {a.icon && <a.icon className="w-4 h-4" />}
                {a.label}
              </Link>
            ) : (
              <button key={i} onClick={a.onClick} className={cls}>
                {a.icon && <a.icon className="w-4 h-4" />}
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
