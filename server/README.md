# Academic Wallet Server

Backend server for the Academic Achievement Wallet demo.

## Requirements

- Node.js 18 or later
- npm 9 or later

## Install

```bash
npm install
```

## Configuration

This server can run with its built-in demo defaults, but for a cleaner setup create a `.env` file in the server folder.

Example:

```env
PORT=4000
JWT_SECRET=replace-with-a-secure-jwt-secret
MOODLE_URL=http://localhost:8080
MOODLE_TOKEN=replace-with-your-moodle-token
```

You can copy the sample file:

```bash
copy .env.example .env
```

## Run

```bash
npm start
```

The server starts on `http://localhost:4000` by default.

## Development Notes

- Frontend development URL expected by CORS: `http://localhost:5173`
- Local session auth is enabled
- The app seeds demo users automatically on startup
- Runtime data is stored in a sibling `data` folder outside this repo

## Demo Accounts

- Admin: `admin@wallet.local` / `admin123`
- Student: `student@university.edu` / `student123`
- Viewer: `viewer@company.com` / `viewer123`

## API Keys Included In Demo Mode

- Moodle: `moodle-api-key-2024`
- DEE Core: `dee-core-api-key-2024`

## Project Scripts

- `npm start` - start the server
- `npm run dev` - start the server in dev mode

## Put It On GitHub

Initialize and commit locally:

```bash
git init -b main
git add .
git commit -m "Initial commit"
```

Then create an empty GitHub repository and connect this folder to it:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

If Git asks for your identity before committing, set it once:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```