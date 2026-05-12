# Academic Wallet — Moodle Plugin

A Moodle local plugin (v1.1.0) that connects to the **Academic Achievement Wallet** to let professors search students, view OB 3.0 credentials, announce certificates, and track access requests.

## Features

- **Search** students by name, email, or student ID
- **View** student credentials in full OB 3.0 JSON-LD format
- **Request access** to specific credentials (Flow 1 consent cycle)
- **Announce certificates** — broadcast to wallet students that a certificate is available
- **Track requests** — monitor request status (pending/approved/denied) and read credentials via granted tokens
- **Navbar button** — quick-access "Announce Certificate" button in the Moodle top navigation bar
- Toggle raw JSON-LD view for each credential

## Requirements

- Moodle 4.1 or later
- Academic Achievement Wallet running and accessible from the Moodle server

## Installation

The plugin files are already in `moodle/local/academic_wallet/`. To register it with Moodle:

```bash
docker exec moodle-app php admin/cli/upgrade.php --non-interactive
```

Or: Login as admin → go to **Site Administration** → Moodle will detect the new plugin and prompt to upgrade.

## Configuration

Go to **Site administration → Plugins → Local plugins → Academic Wallet**:

| Setting        | Default                              | Description                              |
|----------------|--------------------------------------|------------------------------------------|
| Wallet API URL | `http://host.docker.internal:4000`   | Base URL of the wallet backend           |
| API Key        | `moodle-api-key-2024`                | API key for authenticating with the wallet |

> **Docker users:** Use `http://host.docker.internal:4000` as the URL. This DNS name resolves to the Docker host machine.
>
> **Non-Docker users:** Use `http://localhost:4000` or the actual server address.

## Usage

1. Login to Moodle as an admin or teacher
2. The plugin adds three links in the **left sidebar** and an **Announce Certificate** button in the top navbar

### Pages

| Page                      | Sidebar Link               | Direct URL                              |
|---------------------------|----------------------------|-----------------------------------------|
| Search Student Credentials| Search Student Credentials | `/local/academic_wallet/index.php`      |
| Announce Certificate      | Announce Certificate       | `/local/academic_wallet/announce.php`   |
| My Access Requests        | My Access Requests         | `/local/academic_wallet/requests.php`   |

### Search Students

Type a student name, email, or ID in the search box and click Search. Results show a table of matching students with their credential count.

### View Credentials

Click **View Credentials** on any student row. The page shows:
- Student info (name, email, student ID)
- All OB 3.0 credentials with issuer name, issue date, and description
- Toggle button to view the full JSON-LD for each credential

### Request Access (Flow 1 — Step 1)

At the bottom of the credential view page, use the **Request Access** form:
1. Enter a credential type (e.g., "German B2")
2. Enter a message explaining why access is needed
3. Click **Send Request**

The student will see this request in their wallet's **Access Requests** page and can approve or deny it.

### Announce Certificate

Broadcast a certificate announcement so wallet students know a credential is available:
1. Click **Announce Certificate** in the sidebar (or the navbar button)
2. Fill in: achievement name (required), description, type, course ID, criteria, issuer name
3. Click **Announce** — the announcement appears in the wallet frontend
4. Active announcements are listed at the bottom of the page

### My Access Requests (Flow 1 — Steps 2–4)

Track all credential access requests and read credentials when approved:
1. Click **My Access Requests** in the sidebar
2. See a table listing each request with student email, credential type, status, and date
3. **Pending** — waiting for the student to approve/deny in the wallet
4. **Approved** — click **Read Credentials** to view the OB 3.0 verifiable credential via the granted token
5. **Denied** — the student rejected the request

## File Structure

```
local/academic_wallet/
├── classes/
│   └── wallet_api.php     # PHP API client for the wallet
├── db/
│   └── access.php         # Capability definitions
├── lang/
│   └── en/
│       └── local_academic_wallet.php  # English language strings
├── announce.php           # Announce certificate page
├── index.php              # Main UI page (search + view + request)
├── lib.php                # Navigation hooks + navbar button
├── requests.php           # Access requests tracking + credential reader
├── settings.php           # Admin settings page
└── version.php            # Plugin version (1.1.0)
```

## Capabilities

| Capability                              | Default roles                    |
|-----------------------------------------|----------------------------------|
| `local/academic_wallet:viewcredentials` | Manager, Editing teacher, Teacher |

## Troubleshooting

- **"URL is blocked"**: The `wallet_api.php` sets `ignoresecurity => true` on the Moodle curl client. If you still see this error, ensure the file is up to date.
- **"Class curl not found"**: The `wallet_api.php` must include `require_once($CFG->libdir . '/filelib.php')` at the top.
- **Empty search results**: Verify the wallet server is running and the API URL/key are correct in plugin settings.
- **Plugin not in navigation**: Clear Moodle caches: **Site administration → Development → Purge all caches**.
