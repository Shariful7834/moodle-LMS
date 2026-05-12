# SETUP — Running the Full Stack Locally

This guide walks through running the Academic Wallet and Moodle side by side on your local machine, with the `local_academic_wallet` plugin connecting them. Tested on Windows, macOS, and Linux.

The wallet ships in this repository. Moodle and `moodle-docker` are external upstream projects — clone them from their official sources.

---

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| Git | any recent | Cloning |
| Node.js | >= 18 | Wallet backend + frontend |
| npm | bundled with Node | Dependency install |
| Docker Desktop | recent | Running Moodle locally |

---

## Step 1 — Clone this repository

```sh
git clone https://github.com/Shariful7834/moodle-LMS.git
cd moodle-LMS
```

---

## Step 2 — Run the wallet

**Backend (terminal 1):**

```sh
cd server
npm install
npm start
```

Wallet API is now at `http://localhost:4000`. On first run it creates `data/db.json` with seed users and credentials.

**Frontend (terminal 2):**

```sh
cd client
npm install
npm run dev
```

Wallet UI is at `http://localhost:5173`. Log in with one of the demo accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@wallet.local` | `admin123` |
| Student | `student@university.edu` | `student123` |
| Viewer | `viewer@company.com` | `viewer123` |

Verify the API:

```sh
curl http://localhost:4000/api/health
# {"status":"ok",...}
```

---

## Step 3 — Run Moodle locally

You need a Moodle installation to test the plugin. The fastest way is via the official **moodle-docker** project.

**Clone moodle-docker and Moodle:**

```sh
# Put these next to (not inside) moodle-LMS
cd ..

git clone https://github.com/moodlehq/moodle-docker.git
git clone -b MOODLE_404_STABLE https://github.com/moodle/moodle.git
```

**Configure moodle-docker:**

```sh
cd moodle-docker

# Tell moodle-docker where Moodle source lives (one directory up)
export MOODLE_DOCKER_WWWROOT=../moodle
export MOODLE_DOCKER_DB=pgsql

# Windows PowerShell equivalent:
#   $env:MOODLE_DOCKER_WWWROOT = "../moodle"
#   $env:MOODLE_DOCKER_DB      = "pgsql"

# Copy the Moodle config template
cp config.docker-template.php ../moodle/config.php
```

**Start the containers:**

```sh
bin/moodle-docker-compose up -d
bin/moodle-docker-wait-for-db
bin/moodle-docker-compose exec webserver php admin/cli/install_database.php --agree-license --fullname="Test Moodle" --shortname="moodle" --adminpass="admin123" --adminemail="admin@example.com"
```

Moodle is now reachable at `http://localhost:8000` (default port for moodle-docker). Log in with `admin / admin123`.

---

## Step 4 — Install the plugin into Moodle

The plugin source lives in this repository at `moodle-plugin/`. Copy it into Moodle's `local/` folder, renamed to `academic_wallet`:

```sh
cp -r moodle-LMS/moodle-plugin  moodle/local/academic_wallet
```

Windows PowerShell:

```powershell
Copy-Item -Recurse moodle-LMS\moodle-plugin  moodle\local\academic_wallet
```

Then in Moodle:

1. Log in as admin
2. Go to *Site administration* → Moodle detects the new plugin
3. Click **Upgrade Moodle database now**

---

## Step 5 — Configure the plugin

In Moodle: *Site administration → Plugins → Local plugins → Academic Wallet*:

| Setting | Value |
|---|---|
| Wallet API URL | `http://host.docker.internal:4000` |
| Wallet API Key | `moodle-api-key-2024` |

> **Why `host.docker.internal`?** Moodle runs inside Docker. From inside that container, `localhost` refers to the container itself, not your machine. `host.docker.internal` resolves to the host where the wallet is listening. On Linux Docker you may need to add `--add-host=host.docker.internal:host-gateway` to the Moodle service in `moodle-docker`'s compose file.

---

## Step 6 — Verify the integration

The plugin now adds three pages to Moodle's left sidebar:

- **Search Student Credentials** — Flow C, request a student's credentials
- **Announce Certificate** — Flow B, broadcast a certificate request
- **My Requests** — list of your access requests and the approved tokens

Quick test (from your host machine):

```sh
# 1. Health check via the plugin's key
curl -H "X-API-Key: moodle-api-key-2024" http://localhost:4000/api/announcements

# 2. From inside Moodle (logged in as admin/professor), click "Search Student Credentials"
#    Search for: student@university.edu
#    Click Request Access

# 3. Open another browser, log into wallet as student
#    Click the Notifications bell → Approve the request

# 4. Back in Moodle, open "My Requests" → click "Read Credentials"
#    The OB 3.0 JSON appears
```

If you see the German B1 credential displayed in Moodle, the integration is working end to end.

---

## How It Works — Short Version

1. **The plugin in Moodle** sends every request with the header `X-API-Key: moodle-api-key-2024`. The wallet recognizes that key and treats the caller as Moodle.
2. **For credential reads**, the plugin first calls `POST /wallet/access/request` to ask for a specific student's credentials. The student receives a notification in the wallet and must approve.
3. **After approval**, the wallet issues a short-lived **Bearer access token** (32-byte hex, 7-day expiry). The plugin retrieves this token from `GET /wallet/access/status/<requestId>`.
4. **The plugin reads the credentials** by calling `GET /ims/ob/v3p0/credentials` with `Authorization: Bearer <token>`. The wallet returns the student's Open Badges 3.0 / W3C Verifiable Credentials JSON-LD.
5. **The student can revoke** at any time. The token becomes invalid immediately.

This is the same pattern any other external service (DEE-Core, an HR portal, an employer system) will use — only the API key value differs.

For the full technical reference, including all endpoints, status codes, and the consent-based flow in detail, see [`EXTERNAL_SERVICE_INTEGRATION.md`](EXTERNAL_SERVICE_INTEGRATION.md).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Plugin returns 401 in Moodle | Wrong API key in plugin settings. Re-enter `moodle-api-key-2024`. |
| Plugin says "could not connect" | Wrong wallet URL. From Docker Moodle use `http://host.docker.internal:4000`, not `http://localhost:4000`. |
| Bearer read returns "Invalid or expired access token" | Token older than 7 days or revoked. Submit a new `/wallet/access/request`. |
| `EADDRINUSE :::4000` when starting wallet | Wallet already running, or another process holds port 4000. Kill it, or set `PORT=4001 npm start`. |
| Moodle install fails | See moodle-docker docs: https://github.com/moodlehq/moodle-docker |

---

## Reset / Clean state

```sh
# Reset wallet data (loses all credentials and requests)
rm -rf moodle-LMS/data/db.json moodle-LMS/data/uploads
# Restart wallet — seed data is recreated

# Reset Moodle
cd moodle-docker
bin/moodle-docker-compose down -v
```
