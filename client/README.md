# Academic Wallet Client

Frontend for the Academic Achievement Wallet built with Vite, React, React Router, Axios, and Tailwind CSS.

## Features

- Role-based authentication for student, viewer, and admin users
- Student dashboard for credentials, uploads, notifications, and Moodle badge import
- Admin panel for upload verification, user management, announcements, and Moodle lookup
- Public credential verification and shared credential views

## Tech Stack

- React 19
- Vite 6
- React Router 7
- Axios
- Tailwind CSS 4
- Lucide React

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A running backend API for the wallet service

## Local Development

```bash
npm install
copy .env.example .env
npm run dev
```

By default, the Vite dev server proxies `/auth`, `/api`, `/wallet`, and `/ims` requests to `http://localhost:4000`.

## Environment Variables

Create a `.env` file from `.env.example`.

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | No | Base URL for the backend in non-proxied environments, for example `https://api.example.com`. Leave empty for local Vite proxy usage. |
| `VITE_DEFAULT_MOODLE_API_KEY` | No | Optional default API key value for Moodle testing screens. |
| `VITE_DEMO_ADMIN_EMAIL` | No | Optional demo login email shown on the sign-in page. |
| `VITE_DEMO_ADMIN_PASSWORD` | No | Optional demo login password shown on the sign-in page. |
| `VITE_DEMO_STUDENT_EMAIL` | No | Optional student demo login email. |
| `VITE_DEMO_STUDENT_PASSWORD` | No | Optional student demo login password. |
| `VITE_DEMO_VIEWER_EMAIL` | No | Optional viewer demo login email. |
| `VITE_DEMO_VIEWER_PASSWORD` | No | Optional viewer demo login password. |

## Scripts

- `npm run dev` starts the Vite development server
- `npm run build` creates a production build in `dist/`
- `npm run preview` previews the production build locally

## Project Structure

```text
src/
  components/    Shared UI shell and layout
  config/        Environment-backed client configuration
  context/       Auth state and hooks
  pages/         Route-level screens
  services/      API client and request helpers
```

## Publishing To GitHub

This folder now includes a `.gitignore` so `node_modules`, build output, and local environment files are not committed.

Typical commands:

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

Before pushing, make sure `.env` contains only local values and is not added to Git.
