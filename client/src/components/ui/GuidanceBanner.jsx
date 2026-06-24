import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * "What should I do next?" banner. Surfaces the single best next action in a
 * given context so users never get stuck wondering where to go — the main
 * usability gap reported in student testing.
 */
export default function GuidanceBanner({ icon: Icon, title, description, action }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 text-white flex-shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <p className="font-semibold text-indigo-900">{title}</p>
          {description && <p className="text-sm text-indigo-700/80 mt-0.5">{description}</p>}
        </div>
      </div>

      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition flex-shrink-0 self-start sm:self-auto"
        >
          {action.label}
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
