const trimTrailingSlash = (value) => value.replace(/\/$/, '');

const createDemoAccount = (label, email, password) => {
  if (!email || !password) return null;
  return { label, email, password };
};

const apiBaseUrl = trimTrailingSlash((import.meta.env.VITE_API_BASE_URL || '').trim());

export const appConfig = {
  apiBaseUrl,
  defaultMoodleApiKey: (import.meta.env.VITE_DEFAULT_MOODLE_API_KEY || '').trim(),
  demoAccounts: [
    createDemoAccount('Admin', import.meta.env.VITE_DEMO_ADMIN_EMAIL, import.meta.env.VITE_DEMO_ADMIN_PASSWORD),
    createDemoAccount('Student', import.meta.env.VITE_DEMO_STUDENT_EMAIL, import.meta.env.VITE_DEMO_STUDENT_PASSWORD),
    createDemoAccount('Viewer', import.meta.env.VITE_DEMO_VIEWER_EMAIL, import.meta.env.VITE_DEMO_VIEWER_PASSWORD),
  ].filter(Boolean),
};

export function buildApiUrl(path) {
  return appConfig.apiBaseUrl ? `${appConfig.apiBaseUrl}${path}` : path;
}
