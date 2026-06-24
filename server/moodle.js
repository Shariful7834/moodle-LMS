/**
 * Moodle Integration — connects to a real Moodle instance via REST API.
 * Imported badges are converted to OB 3.0 AchievementCredentials and signed as JWT-VC.
 */

const jwtVc = require('./jwtVc');
const statusList = require('./statusList');
const keys = require('./keys');

const MOODLE_URL = process.env.MOODLE_URL || 'http://localhost:8080';
const MOODLE_TOKEN = process.env.MOODLE_TOKEN || '92036c0b19fd8d28d6d3aec9c814c06e';

async function moodleCall(wsfunction, params = {}) {
  const url = new URL('/webservice/rest/server.php', MOODLE_URL);
  url.searchParams.set('wstoken', MOODLE_TOKEN);
  url.searchParams.set('wsfunction', wsfunction);
  url.searchParams.set('moodlewsrestformat', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.exception) {
    throw new Error(`Moodle API error: ${data.message} (${data.errorcode})`);
  }
  return data;
}

async function getSiteInfo() { return moodleCall('core_webservice_get_site_info'); }
async function getUserBadges(userid) {
  const data = await moodleCall('core_badges_get_user_badges', { userid: String(userid) });
  return data.badges || [];
}
async function getUserByEmail(email) {
  const result = await moodleCall('core_user_get_users_by_field', {
    field: 'email',
    'values[0]': email
  });
  return Array.isArray(result) && result.length > 0 ? result[0] : null;
}
async function getEnrolledUsers(courseid) {
  return moodleCall('core_enrol_get_enrolled_users', { courseid: String(courseid) });
}
async function getCourses() { return moodleCall('core_course_get_courses'); }

/**
 * Convert a Moodle badge → OB 3.0 AchievementCredential payload (vc).
 * Uses the wallet's issuer DID (so verification works against /api/badges/issuer/did.json).
 * The original Moodle issuer name is preserved in vc.issuer.name.
 */
function badgeToOB3(badge, student, credentialId, { statusListId, statusListIndex, identitySalt } = {}) {
  const issuedDate = new Date(badge.dateissued * 1000).toISOString();
  const expireDate = badge.dateexpire
    ? new Date(badge.dateexpire * 1000).toISOString()
    : new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();

  return jwtVc.buildAchievementCredential({
    credentialId,
    achievementId: `moodle-badge-${badge.id}`,
    achievementName: badge.name,
    achievementDescription: badge.description,
    achievementType: 'Badge',
    criteriaNarrative: `Awarded by ${badge.issuername} via Moodle LMS.`,
    imageUrl: badge.badgeurl || undefined,
    imageCaption: badge.name,
    studentEmail: student.email,
    studentName: student.name,
    issuerName: badge.issuername || 'Moodle LMS',
    issuerDescription: `${badge.issuername || 'Moodle LMS'} (issued via Moodle)`,
    issuerUrl: badge.issuerurl || keys.getState().issuerBaseUrl,
    issuerEmail: badge.issuercontact || undefined,
    validFromIso: issuedDate,
    validUntilIso: expireDate,
    statusListId,
    statusListIndex,
    statusListType: 'BitstringStatusListEntry',
    identitySalt,
    // Tag with source + badge id so the LMS can recognise imported Moodle badges.
    tag: ['moodle', `badge-${badge.id}`]
  });
}

/**
 * Convert + sign a Moodle badge in one call.
 */
async function importMoodleBadgeAsJwtVc(badge, student, credentialId) {
  const listId = statusList.DEFAULT_LIST_ID;
  const listIndex = statusList.nextIndex(listId);
  const identitySalt = jwtVc.generateSalt();
  const vc = badgeToOB3(badge, student, credentialId, { statusListId: listId, statusListIndex: listIndex, identitySalt });
  const signed = await jwtVc.signCredential(vc, { studentEmail: student.email });
  return { vc, ...signed, statusListId: listId, statusListIndex: listIndex, identitySalt };
}

module.exports = {
  moodleCall,
  getSiteInfo,
  getUserBadges,
  getUserByEmail,
  getEnrolledUsers,
  getCourses,
  badgeToOB3,
  importMoodleBadgeAsJwtVc,
  MOODLE_URL,
  MOODLE_TOKEN
};
