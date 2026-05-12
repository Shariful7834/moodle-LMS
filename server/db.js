const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = {
  users: [],
  announcements: [],   // Moodle → all students (course certificate available)
  claims: [],          // Student claims an announcement
  uploads: [],         // Student uploads external certificate
  credentials: [],     // Verified OB 3.0 credentials
  shares: [],          // Share links
  accessRequests: [],  // Flow 1: external service requests access to student credential
  auditLog: [],
  _meta: { nextUserId: 1 }
};

let _data = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  if (_data) return _data;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    _data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    // Ensure new collections exist for upgrades
    if (!_data.announcements) _data.announcements = [];
    if (!_data.claims) _data.claims = [];
    if (!_data.uploads) _data.uploads = [];
    if (!_data.accessRequests) _data.accessRequests = [];
  } else {
    _data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  return _data;
}

function save() {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(_data, null, 2));
}

function nextUserId() {
  const id = _data._meta.nextUserId;
  _data._meta.nextUserId++;
  save();
  return id;
}

// ── Seed defaults ──────────────────────────────────────────
function seed() {
  load();

  if (!_data.users.find(u => u.email === 'admin@wallet.local')) {
    _data.users.push({
      id: nextUserId(),
      email: 'admin@wallet.local',
      password: bcrypt.hashSync('admin123', 10),
      name: 'System Admin',
      role: 'admin',
      studentId: null,
      createdAt: new Date().toISOString()
    });
  }

  if (!_data.users.find(u => u.email === 'student@university.edu')) {
    _data.users.push({
      id: nextUserId(),
      email: 'student@university.edu',
      password: bcrypt.hashSync('student123', 10),
      name: 'Max Mustermann',
      role: 'student',
      studentId: 'STU-2024-001',
      createdAt: new Date().toISOString()
    });
  }

  if (!_data.users.find(u => u.email === 'viewer@company.com')) {
    _data.users.push({
      id: nextUserId(),
      email: 'viewer@company.com',
      password: bcrypt.hashSync('viewer123', 10),
      name: 'HR Reviewer',
      role: 'viewer',
      studentId: null,
      createdAt: new Date().toISOString()
    });
  }

  save();
  console.log('[DB] Seeded successfully');
}

// ── Query helpers ──────────────────────────────────────────
const db = {
  load,
  save,
  seed,

  // Users
  users: {
    findByEmail: (email) => _data.users.find(u => u.email === email),
    findById: (id) => _data.users.find(u => u.id === id),
    getAll: () => _data.users.map(({ password, ...rest }) => rest),
    getStudents: () => _data.users.filter(u => u.role === 'student').map(({ password, ...rest }) => rest),
    search: (query) => {
      const q = (query || '').toLowerCase();
      return _data.users
        .filter(u => u.role === 'student' && (
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.studentId && u.studentId.toLowerCase().includes(q)) ||
          (u.name && u.name.toLowerCase().includes(q))
        ))
        .map(({ password, ...rest }) => rest);
    },
    create: (userData) => {
      const user = { id: nextUserId(), createdAt: new Date().toISOString(), ...userData };
      _data.users.push(user);
      save();
      return user;
    },
    delete: (id) => {
      _data.users = _data.users.filter(u => u.id !== id);
      save();
    }
  },

  // Announcements (Moodle → wallet, visible to ALL students)
  announcements: {
    findById: (id) => _data.announcements.find(a => a.id === id),
    getAll: () => _data.announcements,
    getActive: () => _data.announcements.filter(a => !a.expiresAt || new Date(a.expiresAt) > new Date()),
    create: (ann) => {
      ann.createdAt = new Date().toISOString();
      _data.announcements.push(ann);
      save();
      return ann;
    }
  },

  // Claims (student claims an announcement)
  claims: {
    findById: (id) => _data.claims.find(c => c.id === id),
    getByStudent: (studentId) => _data.claims.filter(c => c.studentId === studentId),
    getByAnnouncement: (annId) => _data.claims.filter(c => c.announcementId === annId),
    getAllPending: () => _data.claims.filter(c => c.status === 'pending'),
    getAll: () => _data.claims,
    create: (claim) => {
      claim.createdAt = new Date().toISOString();
      _data.claims.push(claim);
      save();
      return claim;
    },
    updateStatus: (id, status, extra = {}) => {
      const c = _data.claims.find(x => x.id === id);
      if (c) { Object.assign(c, { status, updatedAt: new Date().toISOString(), ...extra }); save(); }
    }
  },

  // Uploads (student uploads external certificate for admin verification)
  uploads: {
    findById: (id) => _data.uploads.find(u => u.id === id),
    getByStudent: (studentId) => _data.uploads.filter(u => u.studentId === studentId),
    getAllPending: () => _data.uploads.filter(u => u.status === 'pending'),
    getAll: () => _data.uploads,
    create: (upload) => {
      upload.createdAt = new Date().toISOString();
      _data.uploads.push(upload);
      save();
      return upload;
    },
    updateStatus: (id, status, extra = {}) => {
      const u = _data.uploads.find(x => x.id === id);
      if (u) { Object.assign(u, { status, updatedAt: new Date().toISOString(), ...extra }); save(); }
    },
    update: (id, updates) => {
      const u = _data.uploads.find(x => x.id === id);
      if (u) { Object.assign(u, { ...updates, updatedAt: new Date().toISOString() }); save(); }
      return u;
    },
    delete: (id) => {
      _data.uploads = _data.uploads.filter(u => u.id !== id);
      save();
    }
  },

  // Credentials (verified OB 3.0 badges in wallet)
  credentials: {
    findById: (id) => _data.credentials.find(c => c.id === id),
    getByHolder: (holderId) => _data.credentials.filter(c => c.holderId === holderId),
    getAll: () => _data.credentials,
    create: (cred) => {
      cred.createdAt = new Date().toISOString();
      _data.credentials.push(cred);
      save();
      return cred;
    },
    update: (id, updates) => {
      const c = _data.credentials.find(x => x.id === id);
      if (c) { Object.assign(c, { ...updates, updatedAt: new Date().toISOString() }); save(); }
    }
  },

  // Shared credential links
  shares: {
    findByToken: (token) => _data.shares.find(s => s.token === token),
    getByCredential: (credId) => _data.shares.filter(s => s.credentialId === credId),
    create: (share) => {
      share.createdAt = new Date().toISOString();
      share.viewCount = 0;
      _data.shares.push(share);
      save();
      return share;
    },
    incrementView: (token) => {
      const s = _data.shares.find(x => x.token === token);
      if (s) { s.viewCount++; save(); }
    }
  },

  // Access requests (Flow 1: Moodle requests credential FROM wallet)
  accessRequests: {
    findById: (id) => _data.accessRequests.find(r => r.id === id),
    getByStudent: (studentId) => _data.accessRequests.filter(r => r.studentId === studentId),
    getPendingByStudent: (studentId) => _data.accessRequests.filter(r => r.studentId === studentId && r.status === 'pending'),
    getByToken: (token) => _data.accessRequests.find(r => r.accessToken === token && r.status === 'approved'),
    getAll: () => _data.accessRequests,
    create: (req) => {
      req.createdAt = new Date().toISOString();
      _data.accessRequests.push(req);
      save();
      return req;
    },
    update: (id, updates) => {
      const r = _data.accessRequests.find(x => x.id === id);
      if (r) { Object.assign(r, { ...updates, updatedAt: new Date().toISOString() }); save(); }
      return r;
    }
  },

  // Audit log
  audit: {
    log: (entry) => {
      _data.auditLog.push({ ...entry, createdAt: new Date().toISOString() });
      save();
    },
    getAll: (limit = 50) => _data.auditLog.slice(-limit).reverse()
  },

  // Stats
  stats: () => ({
    users: {
      total: _data.users.length,
      students: _data.users.filter(u => u.role === 'student').length,
      admins: _data.users.filter(u => u.role === 'admin').length,
      viewers: _data.users.filter(u => u.role === 'viewer').length
    },
    announcements: {
      total: _data.announcements.length,
      active: _data.announcements.filter(a => !a.expiresAt || new Date(a.expiresAt) > new Date()).length
    },
    claims: {
      total: _data.claims.length,
      pending: _data.claims.filter(c => c.status === 'pending').length,
      approved: _data.claims.filter(c => c.status === 'approved').length,
      rejected: _data.claims.filter(c => c.status === 'rejected').length
    },
    uploads: {
      total: _data.uploads.length,
      pending: _data.uploads.filter(u => u.status === 'pending').length,
      verified: _data.uploads.filter(u => u.status === 'verified').length,
      rejected: _data.uploads.filter(u => u.status === 'rejected').length
    },
    credentials: {
      total: _data.credentials.length,
      issued: _data.credentials.filter(c => c.status === 'issued').length,
      shareApproved: _data.credentials.filter(c => c.shareApproved).length
    }
  })
};

module.exports = db;
