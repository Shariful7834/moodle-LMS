# Architecture Diagrams

Mermaid source for the diagrams used in `INTEGRATION.md`. Render with any Mermaid-compatible viewer (GitHub, VS Code Mermaid extension, mermaid.live).

## 1. System Overview

```mermaid
flowchart LR
    subgraph Browser
        Student[Student Browser]
        Professor[Professor Browser]
    end

    subgraph "Academic Wallet (Node.js, port 4000)"
        WAPI[Express REST API]
        WUI[React Frontend, port 5173]
        WDB[(data/db.json)]
    end

    subgraph "Moodle (PHP, port 8080)"
        MCore[Moodle Core]
        MPlugin[local_academic_wallet plugin]
        MWS[Web Services API]
    end

    subgraph "DEE-Core (Laravel, future)"
        DCore[DEE-Core API]
    end

    Student -->|JWT| WUI
    Professor -->|Moodle session| MCore
    WUI -->|JWT| WAPI
    MPlugin -->|X-API-Key / Bearer| WAPI
    WAPI -->|wstoken| MWS
    MPlugin --- MCore
    DCore -.->|X-API-Key / Bearer| WAPI
    WAPI --- WDB
```

## 2. Auth Model

```mermaid
flowchart TB
    A[External Service] -->|X-API-Key header<br/>system identity| W[Wallet]
    A -->|Authorization: Bearer<br/>per-student access token| W
    U[Student in Wallet UI] -->|JWT in localStorage| W
    W -->|wstoken query param| M[Moodle Web Services]
```

## 3. Flow A — Moodle Badge Import (Wallet pulls)

```mermaid
sequenceDiagram
    participant S as Student
    participant W as Wallet
    participant M as Moodle WS
    S->>W: GET /api/credentials/moodle-badges (JWT)
    W->>M: core_user_get_users_by_field (wstoken)
    M-->>W: {moodleUserId}
    W->>M: core_badges_get_user_badges (wstoken)
    M-->>W: [badges]
    W-->>S: badge list (alreadyImported flags)
    S->>W: POST /api/credentials/import-moodle-badge
    W->>W: badgeToOB3() conversion
    W->>W: db.credentials.create(ob3)
    W-->>S: 201 OB 3.0 credential stored
```

## 4. Flow B — Announcement & Upload (Moodle pushes)

```mermaid
sequenceDiagram
    participant P as Professor (Moodle)
    participant Pl as Wallet Plugin
    participant W as Wallet
    participant S as Student
    participant A as Admin
    P->>Pl: Submit announce form
    Pl->>W: POST /api/announce-certificate (X-API-Key)
    W->>W: db.announcements.create(expiresAt:+30d)
    W-->>Pl: 201 announcementId
    S->>W: GET /api/credentials/announcements (JWT)
    S->>W: POST /api/credentials/upload (multipart)
    A->>W: POST /api/credentials/verify-upload/:id
    W->>W: build OB 3.0 with evidence
    W->>W: db.credentials.create(status:issued)
```

## 5. Flow C — Consent-based Access (Flow 1, OAuth-like)

```mermaid
sequenceDiagram
    participant P as Professor (Moodle)
    participant Pl as Wallet Plugin
    participant W as Wallet
    participant S as Student
    P->>Pl: Click "Request Access"
    Pl->>W: POST /wallet/access/request (X-API-Key)
    W-->>Pl: 201 {requestId, status:pending}
    S->>W: GET /wallet/notifications (JWT)
    W-->>S: pending requests
    S->>W: POST /wallet/access/grant (JWT)
    W->>W: crypto.randomBytes(32) → token, expiry +7d
    W-->>S: {accessToken, tokenExpiresAt}
    Pl->>W: GET /wallet/access/status/:id (X-API-Key)
    W-->>Pl: {status:approved, accessToken}
    Pl->>W: GET /ims/ob/v3p0/credentials (Bearer)
    W-->>Pl: OB 3.0 credentials JSON
```
