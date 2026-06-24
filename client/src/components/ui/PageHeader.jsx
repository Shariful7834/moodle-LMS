import { Link } from 'react-router-dom';

/**
 * Consistent page header used across all pages so users always see, in the same
 * place: where they are (title), what the page is for (subtitle), and the single
 * most important action they can take here (primary action button).
 */
export default function PageHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex-shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-gray-500 text-sm mt-1 max-w-2xl">{subtitle}</p>}
        </div>
      </div>

      {action && (
        <div className="flex-shrink-0">
          {action.to ? (
            <Link
              to={action.to}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition"
            >
              {action.icon && <action.icon className="w-4 h-4" />}
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition"
            >
              {action.icon && <action.icon className="w-4 h-4" />}
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
