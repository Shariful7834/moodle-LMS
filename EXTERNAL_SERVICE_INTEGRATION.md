# Academic Wallet External Integration

This document explains how the Academic Achievement Wallet connects with
external services such as Moodle and DEE-Core.

The wallet stores academic achievements as Open Badges 3.0 / W3C Verifiable
Credentials. Students own their credentials and can decide when an external
service may access them.

## About

The wallet provides:

- a React frontend for students, admins, and viewers
- a Node.js/Express backend API
- a JSON demo database in `data/db.json`
- Open Badges 3.0 credential output
- REST endpoints for external systems

External systems do not log in as wallet users. They connect through API keys.
When they need a student's credentials, the recommended flow is consent-based:

```text
External service requests access
Student approves inside the wallet
Wallet issues a temporary access token
External service reads OB 3.0 credentials
```

## Current Status

| Service | Status |
| --- | --- |
| Moodle | Implemented through the `local_academic_wallet` plugin |
| DEE-Core | Wallet side is ready; DEE-Core can use the same REST pattern |
| Other services | Can be added by registering a new API key |

## Architecture

```text
Student Browser
    |
    | JWT
    v
Academic Wallet UI
    |
    v
Academic Wallet API
    |
    v
Wallet Database

Moodle Plugin / DEE-Core
    |
    | X-API-Key
    | Bearer token after student approval
    v
Academic Wallet API
```

Important wallet files:

| File | Purpose |
| --- | --- |
| `server/index.js` | Starts the Express API and registers routes |
| `server/auth.js` | JWT authentication and external API keys |
| `server/routes/externalRoutes.js` | External service endpoints |
| `server/routes/walletRoutes.js` | Access request, approve, deny, revoke |
| `server/routes/ob3Routes.js` | Open Badges 3.0 credential API |
| `server/moodle.js` | Wallet-to-Moodle badge import client |

Important Moodle plugin files:

| File | Purpose |
| --- | --- |
| `moodle-plugin/settings.php` | Wallet URL and API key settings |
| `moodle-plugin/classes/wallet_api.php` | Moodle HTTP client for wallet API |
| `moodle-plugin/index.php` | Search students and request access |
| `moodle-plugin/announce.php` | Announce certificate requests |
| `moodle-plugin/requests.php` | Check requests and read approved credentials |

## Authentication Model

The integration uses three authentication types.

| Caller | Token | Used for |
| --- | --- | --- |
| Wallet user | JWT | Student/admin/viewer login |
| Moodle or DEE-Core | `X-API-Key` | Identifying the external service |
| Moodle or DEE-Core after consent | Bearer access token | Reading approved student credentials |

External API keys are registered in:

```text
server/auth.js
```

Current demo keys:

```js
const API_KEYS = {
  'moodle-api-key-2024': { system: 'moodle', name: 'Moodle LMS' },
  'dee-core-api-key-2024': { system: 'dee-core', name: 'DEE Core System' },
  'test-api-key': { system: 'test', name: 'Test Client' }
};
```

The API key identifies the system. It does not identify a student. Student
credential access is handled by the temporary Bearer token after approval.

## Moodle Integration

Moodle is connected by a **local plugin** (Moodle convention — site-wide plugins live in Moodle's `local/` folder). The plugin source ships inside this repo at `moodle-plugin/`. To install:

```sh
# Copy plugin source into your Moodle installation
cp -r moodle-plugin  <moodle-root>/local/academic_wallet
# Log in to Moodle as admin → Site administration → Upgrade Moodle database now
```

The Moodle admin configures:

| Setting | Example |
| --- | --- |
| Wallet API URL | `http://host.docker.internal:4000` |
| Wallet API Key | `moodle-api-key-2024` |

In Moodle this is configured at:

```text
Site administration -> Plugins -> Local plugins -> Academic Wallet
```

The plugin sends this header when calling the wallet:

```http
X-API-Key: moodle-api-key-2024
```

### Moodle Flow 1: Announce a Certificate

This is used when a professor wants students to submit proof of a certificate.

```text
Professor in Moodle
  -> Announce Certificate
  -> Wallet creates announcement
  -> Student uploads proof in wallet
  -> Admin verifies upload
  -> Wallet issues OB 3.0 credential
```

Main endpoint:

```http
POST /api/announce-certificate
```

Main files:

```text
moodle-plugin/announce.php
server/routes/externalRoutes.js
server/routes/credentialRoutes.js
```

### Moodle Flow 2: Request Credential Access

This is the main consent-based sharing flow.

```text
Professor searches student in Moodle
  -> Professor requests access
  -> Student sees request in wallet
  -> Student approves or denies
  -> Wallet issues access token if approved
  -> Moodle reads OB 3.0 credentials
```

Main endpoints:

```http
POST /wallet/access/request
GET  /wallet/access/status/:requestId
GET  /ims/ob/v3p0/credentials
```

The final credential read uses:

```http
Authorization: Bearer <accessToken>
```

Main files:

```text
moodle-plugin/index.php
moodle-plugin/requests.php
server/routes/walletRoutes.js
server/routes/ob3Routes.js
```

### Moodle Flow 3: Import Moodle Badges

This flow starts from the wallet UI.

```text
Student opens Moodle Badges in wallet
  -> Wallet finds Moodle account by email
  -> Wallet fetches Moodle badges
  -> Student imports badge
  -> Wallet converts it to OB 3.0
```

Moodle web-service functions used:

```text
core_user_get_users_by_field
core_badges_get_user_badges
```

Required wallet environment variables:

```bash
MOODLE_URL=http://localhost:8080
MOODLE_TOKEN=<moodle-web-service-token>
```

Main files:

```text
server/moodle.js
server/routes/credentialRoutes.js
client/src/pages/MoodleBadges.jsx
```

## DEE-Core Integration

DEE-Core can use the same model as Moodle.

The wallet already knows DEE-Core through this API key:

```js
'dee-core-api-key-2024': { system: 'dee-core', name: 'DEE Core System' }
```

DEE-Core needs a Laravel HTTP client that sends:

```http
X-API-Key: dee-core-api-key-2024
```

When a student approves access, DEE-Core reads credentials with:

```http
Authorization: Bearer <accessToken>
```

DEE-Core can use the same endpoints:

| Action | Endpoint |
| --- | --- |
| Search students | `GET /api/students/search?q=` |
| Announce certificate | `POST /api/announce-certificate` |
| Request access | `POST /wallet/access/request` |
| Check status | `GET /wallet/access/status/:requestId` |
| Read credentials | `GET /ims/ob/v3p0/credentials` |

## Main Endpoints

External service endpoints use `X-API-Key`:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Check wallet is running |
| `GET /api/students/search?q=` | Search wallet students |
| `POST /api/announce-certificate` | Announce a certificate |
| `POST /wallet/access/request` | Request student consent |
| `GET /wallet/access/status/:requestId` | Check approval status |

Credential read endpoints use `Authorization: Bearer <accessToken>`:

| Endpoint | Purpose |
| --- | --- |
| `GET /ims/ob/v3p0/credentials` | Read approved OB 3.0 credentials |
| `GET /ims/ob/v3p0/credentials/:id` | Read one credential |
| `GET /ims/ob/v3p0/profile` | Read student profile |

Student approval endpoints use the student's wallet JWT:

| Endpoint | Purpose |
| --- | --- |
| `GET /wallet/notifications` | Student sees pending requests |
| `POST /wallet/access/grant` | Student approves |
| `POST /wallet/access/deny` | Student denies |
| `DELETE /wallet/access/:requestId` | Student revokes access |

## Short Demo Walkthrough

For a short demonstration, show these four parts:

1. Open `server/auth.js`
   - Show Moodle and DEE-Core API keys.

2. Open `moodle-plugin/classes/wallet_api.php`
   - Show that Moodle sends `X-API-Key` to the wallet.

3. Demonstrate the access request flow:
   - In Moodle, search a student.
   - Click "Request Access".
   - Login to the wallet as the student.
   - Open "Access Requests".
   - Approve the request.
   - Return to Moodle "My Access Requests".
   - Click "Read Credentials".

4. Show the result:
   - Moodle receives Open Badges 3.0 JSON-LD from the wallet.

This demonstrates the complete integration:

```text
Moodle -> Wallet request
Wallet -> Student approval
Wallet -> Access token
Moodle -> OB 3.0 credential read
```

## Local Setup

Start the wallet backend:

```bash
cd academic-wallet/server
npm install
npm start
```

Start the wallet frontend:

```bash
cd academic-wallet/client
npm install
npm run dev
```

Wallet URLs:

```text
Backend:  http://localhost:4000
Frontend: http://localhost:5173
```

If Moodle runs in Docker, set the Moodle plugin wallet URL to:

```text
http://host.docker.internal:4000
```

If Moodle runs directly on the same machine, use:

```text
http://localhost:4000
```

## Troubleshooting

| Problem | Cause | Solution |
| --- | --- | --- |
| `X-API-Key header required` | API key missing | Add the `X-API-Key` header |
| `Invalid API key` | Wrong key | Match the value in `server/auth.js` |
| Moodle cannot reach wallet | Docker URL issue | Use `host.docker.internal` |
| Request remains pending | Student has not approved | Student approves in wallet |
| Bearer token fails | Expired or revoked token | Create a new request |
| No credentials returned | No matching credential | Try without a credential filter |
| Moodle badge import fails | Moodle token or URL wrong | Check `MOODLE_URL` and `MOODLE_TOKEN` |

## Summary

The external integration works like this:

1. Moodle or DEE-Core identifies itself with `X-API-Key`.
2. The service requests access to a student's credentials.
3. The student approves the request in the wallet.
4. The wallet creates a temporary Bearer token.
5. The external service reads Open Badges 3.0 credentials.

Moodle already implements this through the `local_academic_wallet` plugin.
DEE-Core can use the same endpoints through a Laravel service client.


Thank you. 