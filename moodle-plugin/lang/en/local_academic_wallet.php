<?php
/**
 * Language strings for local_academic_wallet
 *
 * @package    local_academic_wallet
 */

$string['pluginname'] = 'Academic Wallet';
$string['wallet_search'] = 'Search Student Credentials';
$string['search_placeholder'] = 'Enter student name, email, or student ID...';
$string['search_button'] = 'Search';
$string['no_results'] = 'No students found.';
$string['credentials'] = 'Credentials';
$string['request_access'] = 'Request Access';
$string['view_credentials'] = 'View Credentials';
$string['credential_type'] = 'Credential Type (optional)';
$string['request_message'] = 'Request Message';
$string['request_sent'] = 'Access request sent. The student will be notified.';
$string['request_failed'] = 'Failed to send access request.';
$string['access_granted'] = 'Access has been granted by the student.';
$string['access_pending'] = 'Waiting for student approval...';
$string['access_denied'] = 'The student has denied this access request.';
$string['no_credentials'] = 'No credentials found for this student.';
$string['no_credentials_token'] = 'No credentials returned for this token. The student may not have matching credentials.';
$string['request_not_found'] = 'Access request not found or token expired.';

// Announce Certificate
$string['announce_certificate'] = 'Announce Certificate';
$string['announce_help'] = 'Broadcast a certificate requirement to all wallet students. Students will see this on their wallet dashboard and can upload proof of the certificate for verification.';
$string['achievement_name'] = 'Certificate / Achievement Name';
$string['achievement_description'] = 'Description';
$string['achievement_type'] = 'Type';
$string['course_id'] = 'Course ID (optional)';
$string['course_id_hint'] = 'Link this announcement to a specific Moodle course';
$string['criteria_label'] = 'Criteria (optional)';
$string['issuer_name'] = 'Issuer Name (optional)';
$string['issuer_hint'] = 'Leave blank to use your name automatically';
$string['announce_button'] = 'Announce to Students';
$string['announce_success'] = 'Certificate "{$a}" has been announced to all wallet students.';
$string['announce_failed'] = 'Failed to announce certificate. Check the wallet connection.';
$string['active_announcements'] = 'Active Announcements';

// My Access Requests
$string['my_requests'] = 'My Access Requests';
$string['my_requests_help'] = 'Track Flow 1 access requests you have sent. When a student approves, you can read their OB 3.0 credentials.';
$string['no_requests'] = 'No access requests sent yet. Search for a student and click "Request Access" to start.';
$string['credentials_via_token'] = 'Credentials (via approved access token)';
