# Academic Achievement Wallet

A digital credential wallet implementing the **Open Badges 3.0 (OB 3.0)** specification. Students can collect, store, and selectively share verifiable credentials. External systems (like Moodle LMS) can request access to credentials through a consent-based flow.

## Architecture

```
academic-wallet/
├── server/          # Node.js + Express backend (port 4000)
│   ├── index.js     # Entry point, route wiring
│   ├── db.js        # Flat-file JSON database (data/db.json)
│   ├── auth.js      # JWT authentication + API key middleware
│   ├── moodle.js    # Moodle REST API integration
│   └── routes/
│       ├── authRoutes.js        # Login / Register
│       ├── credentialRoutes.js  # CRUD credentials, Moodle badge import
│       ├── externalRoutes.js    # External API (search students, health)
│       ├── adminRoutes.js       # Admin panel endpoints
│       ├── walletRoutes.js      # Flow 1: access request/grant/deny/revoke
│       └── ob3Routes.js         # OB 3.0 standard endpoints
├── client/          # React + Vite frontend (port 5173)
│   └── src/
│       ├── pages/       # Dashboard, Credentials, Notifications, etc.
│       ├── components/  # Layout, ProtectedRoute
│       └── services/    # api.js (Axios client)
└── data/
    └── db.json      # Runtime database (auto-created on first run)
```

## Prerequisites

- **Node.js** v18 or later — [https://nodejs.org](https://nodejs.org)
- **npm** (comes with Node.js)
- **Git** (optional, for cloning)

## Quick Start

### 1. Install backend dependencies

```bash
cd academic-wallet/server
npm install
```

### 2. Install frontend dependencies

```bash
cd academic-wallet/client
npm install
```

### 3. Start the backend server

```bash
cd academic-wallet/server
npm start
```

The server starts at **http://localhost:4000**. On first run it creates `data/db.json` with seed data (demo users + sample credentials).

### 4. Start the frontend dev server

Open a **second terminal**:

```bash
cd academic-wallet/client
npm run dev
```

The frontend starts at **http://localhost:5173**.

### 5. Open in browser

Go to **http://localhost:5173** and log in with one of the demo accounts below.

## Demo Accounts

| Role    | Email                    | Password    | Purpose                        |
|---------|--------------------------|-------------|--------------------------------|
| Admin   | admin@wallet.local       | admin123    | Manage users, announcements    |
| Student | student@university.edu   | student123  | View/share credentials         |
| Viewer  | viewer@company.com       | viewer123   | View shared credentials        |

## API Keys (for external systems)

| System   | API Key                  | Header                              |
|----------|--------------------------|--------------------------------------|
| Moodle   | `moodle-api-key-2024`    | `X-API-Key: moodle-api-key-2024`    |
| DEE Core | `dee-core-api-key-2024`  | `X-API-Key: dee-core-api-key-2024`  |

## Key API Endpoints

### Authentication
| Method | Endpoint          | Description          |
|--------|-------------------|----------------------|
| POST   | `/auth/login`     | Login, returns JWT   |
| POST   | `/auth/register`  | Register new user    |

### Credentials (requires JWT)
| Method | Endpoint                             | Description                    |
|--------|--------------------------------------|--------------------------------|
| GET    | `/api/credentials`                   | List student's credentials     |
| POST   | `/api/credentials`                   | Create credential              |
| GET    | `/api/credentials/moodle-badges`     | Fetch badges from Moodle       |
| POST   | `/api/credentials/import-moodle-badge` | Import Moodle badge as OB 3.0 |

### External API (requires API key)
| Method | Endpoint                       | Description                        |
|--------|--------------------------------|------------------------------------|
| GET    | `/api/health`                  | Health check                       |
| GET    | `/api/students/search?q=`      | Search students                    |
| GET    | `/api/students/:id`            | Get single student                 |
| GET    | `/api/students/:id/credentials`| Get student credentials            |
| POST   | `/api/announce-certificate`    | Broadcast certificate announcement |
| GET    | `/api/announcements`           | List active announcements          |

### Flow 1 — Credential Access Request
| Method | Endpoint                           | Auth      | Description                               |
|--------|------------------------------------|-----------|-------------------------------------------|
| POST   | `/wallet/access/request`           | API Key   | External system requests credential       |
| GET    | `/wallet/notifications`            | JWT       | Student sees pending requests             |
| POST   | `/wallet/access/grant`             | JWT       | Student approves → access token issued    |
| POST   | `/wallet/access/deny`              | JWT       | Student denies request                    |
| GET    | `/wallet/access/status/:requestId` | API Key   | Check request status + retrieve token     |
| GET    | `/wallet/access/requests`          | API Key   | List all requests (filter by student_email) |
| DELETE | `/wallet/access/:id`               | JWT       | Student revokes access                    |

### OB 3.0 Standard Endpoints
| Method | Endpoint                        | Auth                 | Description              |
|--------|---------------------------------|----------------------|--------------------------|
| GET    | `/ims/ob/v3p0/credentials`      | Bearer token or API key | List OB 3.0 credentials |
| GET    | `/ims/ob/v3p0/credentials/:id`  | Bearer token or API key | Single credential       |
| GET    | `/ims/ob/v3p0/profile`          | Bearer token or API key | Student profile         |

## Flow 1: Credential Access Request Cycle

This implements the consent-based credential sharing flow:

```
Step 1: Moodle POST /wallet/access/request     → "I need student's German B2 cert"
Step 2: Student GET  /wallet/notifications      → "Moodle wants your cert — Approve?"
Step 3: Student POST /wallet/access/grant       → Access token issued (7-day expiry)
Step 4: Moodle GET   /ims/ob/v3p0/credentials   → Signed OB 3.0 credential returned
```

## Production Build

To serve the frontend from the backend (single process):

```bash
cd academic-wallet/client
npm run build
```

This creates `client/dist/`. The backend automatically serves it as static files. Access everything at **http://localhost:4000**.

## Environment Variables

| Variable     | Default | Description        |
|--------------|---------|--------------------|
| `PORT`       | 4000    | Backend port       |
| `JWT_SECRET` | (built-in dev key) | JWT signing key |

## Troubleshooting

- **Port 4000 already in use**: Kill the existing process or use `PORT=4001 node index.js`
- **CORS errors**: The frontend must run on `http://localhost:5173` (configured in `index.js`)
- **Empty credentials**: Login as `student@university.edu` — seed data includes sample credentials
- **Moodle badge import fails**: Ensure Moodle is running at `http://localhost:8080` with a valid API token configured in `server/moodle.js`
