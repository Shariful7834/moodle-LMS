/**
 * Moodle Integration — connects to a real Moodle instance via REST API
 * Used by the Academic Wallet to fetch badges and convert to OB 3.0
 */

const MOODLE_URL = process.env.MOODLE_URL || 'http://localhost:8080';
const MOODLE_TOKEN = process.env.MOODLE_TOKEN || '92036c0b19fd8d28d6d3aec9c814c06e';

/**
 * Call a Moodle web service function
 */
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

/**
 * Get Moodle site info
 */
async function getSiteInfo() {
  return moodleCall('core_webservice_get_site_info');
}

/**
 * Get badges for a Moodle user
 */
async function getUserBadges(userid) {
  const data = await moodleCall('core_badges_get_user_badges', { userid: String(userid) });
  return data.badges || [];
}

/**
 * Get Moodle user by email
 */
async function getUserByEmail(email) {
  const result = await moodleCall('core_user_get_users_by_field', {
    field: 'email',
    'values[0]': email
  });
  return Array.isArray(result) && result.length > 0 ? result[0] : null;
}

/**
 * Get enrolled users in a course
 */
async function getEnrolledUsers(courseid) {
  return moodleCall('core_enrol_get_enrolled_users', { courseid: String(courseid) });
}

/**
 * Get all courses
 */
async function getCourses() {
  return moodleCall('core_course_get_courses');
}

/**
 * Convert a Moodle badge to OB 3.0 credential JSON-LD
 */
function badgeToOB3(badge, student, credentialId) {
  const issuedDate = new Date(badge.dateissued * 1000).toISOString();
  const expireDate = badge.dateexpire
    ? new Date(badge.dateexpire * 1000).toISOString()
    : new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();

  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
    ],
    id: `urn:uuid:${credentialId}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: badge.name,
    description: badge.description,
    issuer: {
      id: `did:web:${new URL(MOODLE_URL).hostname}`,
      type: ['Profile'],
      name: badge.issuername,
      description: `${badge.issuername} - credential issuer via Moodle LMS`,
      url: badge.issuerurl || MOODLE_URL,
      email: badge.issuercontact || ''
    },
    validFrom: issuedDate,
    validUntil: expireDate,
    credentialSubject: {
      id: student.did || `urn:uuid:${credentialId}-subject`,
      type: ['AchievementSubject'],
      identifier: [{
        type: 'IdentityObject',
        identityHash: student.email,
        identityType: 'emailAddress',
        hashed: false,
        salt: 'not-used'
      }],
      achievement: {
        id: `urn:uuid:${credentialId}-achievement`,
        type: ['Achievement'],
        achievementType: 'Badge',
        name: badge.name,
        description: badge.description,
        criteria: {
          narrative: `Awarded by ${badge.issuername} via Moodle LMS`
        },
        creator: {
          id: `did:web:${new URL(MOODLE_URL).hostname}`,
          type: ['Profile'],
          name: badge.issuername,
          url: badge.issuerurl || MOODLE_URL
        },
        image: badge.badgeurl ? {
          id: badge.badgeurl,
          type: 'Image',
          caption: badge.name
        } : undefined
      },
      awardedDate: issuedDate
    },
    credentialSchema: [{
      id: 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json',
      type: '1EdTechJsonSchemaValidator2019'
    }]
  };
}

module.exports = {
  moodleCall,
  getSiteInfo,
  getUserBadges,
  getUserByEmail,
  getEnrolledUsers,
  getCourses,
  badgeToOB3,
  MOODLE_URL,
  MOODLE_TOKEN
};
