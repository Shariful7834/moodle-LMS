<?php
/**
 * Academic Wallet — Search & View Student Credentials
 *
 * This is the main page for professors to:
 *   1. Search students by name/email/student ID
 *   2. View their credentials from the wallet
 *   3. Request access to specific credentials (Flow 1)
 *
 * @package    local_academic_wallet
 */

require_once(__DIR__ . '/../../config.php');
require_login();
require_capability('local/academic_wallet:viewcredentials', context_system::instance());

$PAGE->set_url(new moodle_url('/local/academic_wallet/index.php'));
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('wallet_search', 'local_academic_wallet'));
$PAGE->set_heading(get_string('wallet_search', 'local_academic_wallet'));
$PAGE->set_pagelayout('standard');

$api = new \local_academic_wallet\wallet_api();

// Handle form submissions
$action  = optional_param('action', '', PARAM_ALPHA);
$query   = optional_param('q', '', PARAM_RAW);
$query   = clean_param($query, PARAM_TEXT);

$studentid    = optional_param('studentid', 0, PARAM_INT);
$studentemail = optional_param('studentemail', '', PARAM_EMAIL);

$students    = [];
$credentials = [];
$student     = null;
$message     = '';
$messagetype = 'info';

// Action: request access (Flow 1)
if ($action === 'request' && confirm_sesskey()) {
    $reqemail = required_param('studentemail', PARAM_EMAIL);
    $credtype = optional_param('credentialtype', '', PARAM_TEXT);
    $reqmsg   = optional_param('requestmessage', '', PARAM_TEXT);

    if (empty($reqmsg)) {
        $reqmsg = "Professor " . fullname($USER) . " from Moodle requests access to your credentials.";
    }

    $result = $api->request_access($reqemail, $credtype, $reqmsg);
    if ($result && !empty($result['requestId']) && empty($result['error'])) {
        $message = get_string('request_sent', 'local_academic_wallet') .
                   ' Request ID: ' . $result['requestId'];
        $messagetype = 'success';
    } else if ($result && !empty($result['error']) && ($result['_http_code'] ?? 0) == 409) {
        // A pending request already exists — not an error, just inform the professor
        $message = 'An access request for this student is already pending. Request ID: ' .
                   ($result['requestId'] ?? 'unknown') .
                   '. Please wait for the student to approve or deny it.';
        $messagetype = 'info';
    } else {
        $message = get_string('request_failed', 'local_academic_wallet');
        $messagetype = 'error';
    }
    // Stay on same view
    if (!empty($reqemail)) {
        $studentemail = $reqemail;
    }
}

// Search students
if (!empty($query)) {
    $students = $api->search_students($query);
}

// View individual student credentials
if (!empty($studentid) || !empty($studentemail)) {
    if (!empty($studentid)) {
        $student = $api->get_student($studentid);
        if ($student && !empty($student['student']['email'])) {
            $studentemail = $student['student']['email'];
        }
    }
    if (!empty($studentemail)) {
        $credentials = $api->get_student_credentials_by_email($studentemail);
        if (empty($student)) {
            // Build a minimal student object from search
            $searchresult = $api->search_students($studentemail);
            if (!empty($searchresult)) {
                $student = ['student' => $searchresult[0]];
            }
        }
    }
}

// ─── Output ────────────────────────────────────────────────
echo $OUTPUT->header();
?>

<style>
    .aw-container { max-width: 960px; margin: 0 auto; }
    .aw-card { background: #fff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .aw-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .aw-search-form { display: flex; gap: 8px; margin-bottom: 24px; }
    .aw-search-form input[type="text"] { flex: 1; padding: 10px 14px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; }
    .aw-search-form button { padding: 10px 20px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; }
    .aw-search-form button:hover { background: #4338ca; }
    .aw-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .aw-badge-green { background: #d1fae5; color: #065f46; }
    .aw-badge-blue { background: #dbeafe; color: #1e40af; }
    .aw-badge-gray { background: #f3f4f6; color: #374151; }
    .aw-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; }
    .aw-btn-primary { background: #4f46e5; color: #fff; }
    .aw-btn-primary:hover { background: #4338ca; color: #fff; text-decoration: none; }
    .aw-btn-green { background: #059669; color: #fff; }
    .aw-btn-green:hover { background: #047857; color: #fff; text-decoration: none; }
    .aw-btn-outline { background: transparent; color: #4f46e5; border: 1px solid #4f46e5; }
    .aw-btn-outline:hover { background: #eef2ff; text-decoration: none; }
    .aw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
    .aw-cred-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .aw-cred-name { font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 4px; }
    .aw-cred-issuer { font-size: 12px; color: #64748b; }
    .aw-cred-date { font-size: 11px; color: #94a3b8; margin-top: 6px; }
    .aw-student-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    .aw-avatar { width: 48px; height: 48px; border-radius: 50%; background: #4f46e5; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600; }
    .aw-json-toggle { font-size: 12px; color: #4f46e5; cursor: pointer; margin-top: 8px; background: none; border: none; text-decoration: underline; }
    .aw-json-block { display: none; margin-top: 8px; background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 12px; font-family: monospace; white-space: pre-wrap; max-height: 300px; overflow: auto; }
    .aw-msg { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    .aw-msg-success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .aw-msg-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .aw-msg-info { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .aw-request-form { margin-top: 16px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .aw-request-form label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px; }
    .aw-request-form input, .aw-request-form textarea { width: 100%; padding: 8px 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 13px; margin-bottom: 12px; box-sizing: border-box; }
    .aw-request-form textarea { height: 60px; resize: vertical; }
    .aw-section-title { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
    .aw-back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #4f46e5; text-decoration: none; margin-bottom: 16px; }
    .aw-back-link:hover { text-decoration: underline; }
    table.aw-table { width: 100%; border-collapse: collapse; }
    table.aw-table th, table.aw-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    table.aw-table th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 13px; }
    table.aw-table tr:hover { background: #f1f5f9; }
</style>

<div class="aw-container">

<?php if (!empty($message)): ?>
    <div class="aw-msg aw-msg-<?php echo $messagetype; ?>">
        <?php echo htmlspecialchars($message, ENT_QUOTES, 'UTF-8'); ?>
    </div>
<?php endif; ?>

<?php if ($student && !empty($credentials)): ?>
    <!-- ═══ Student Credential View ═══ -->
    <a href="<?php echo (new moodle_url('/local/academic_wallet/index.php', ['q' => $query]))->out(); ?>" class="aw-back-link">
        ← Back to search results
    </a>

    <div class="aw-card">
        <div class="aw-student-header">
            <div class="aw-avatar">
                <?php echo strtoupper(substr($student['student']['name'] ?? '?', 0, 1)); ?>
            </div>
            <div>
                <div style="font-size: 18px; font-weight: 600; color: #1e293b;">
                    <?php echo htmlspecialchars($student['student']['name'] ?? 'Unknown', ENT_QUOTES, 'UTF-8'); ?>
                </div>
                <div style="font-size: 13px; color: #64748b;">
                    <?php echo htmlspecialchars($student['student']['email'] ?? '', ENT_QUOTES, 'UTF-8'); ?>
                    <?php if (!empty($student['student']['studentId'])): ?>
                        &middot; <?php echo htmlspecialchars($student['student']['studentId'], ENT_QUOTES, 'UTF-8'); ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <h3 class="aw-section-title">
            Open Badges 3.0 Credentials (<?php echo count($credentials); ?>)
        </h3>

        <?php foreach ($credentials as $i => $cred): ?>
            <div class="aw-cred-card" style="margin-bottom: 12px;">
                <div class="aw-cred-name">
                    <?php echo htmlspecialchars($cred['name'] ?? 'Unnamed Credential', ENT_QUOTES, 'UTF-8'); ?>
                </div>
                <div class="aw-cred-issuer">
                    Issuer: <?php echo htmlspecialchars($cred['issuer']['name'] ?? 'Unknown', ENT_QUOTES, 'UTF-8'); ?>
                </div>
                <?php if (!empty($cred['credentialSubject']['achievement']['achievementType'])): ?>
                    <span class="aw-badge aw-badge-blue">
                        <?php echo htmlspecialchars($cred['credentialSubject']['achievement']['achievementType'], ENT_QUOTES, 'UTF-8'); ?>
                    </span>
                <?php endif; ?>
                <?php if (!empty($cred['validFrom'])): ?>
                    <div class="aw-cred-date">
                        Issued: <?php echo date('M j, Y', strtotime($cred['validFrom'])); ?>
                    </div>
                <?php endif; ?>

                <!-- Show OB 3.0 JSON toggle -->
                <button class="aw-json-toggle" onclick="var el=document.getElementById('json-<?php echo $i; ?>'); el.style.display = el.style.display === 'block' ? 'none' : 'block';">
                    Show/Hide OB 3.0 JSON-LD
                </button>
                <div id="json-<?php echo $i; ?>" class="aw-json-block"><?php echo htmlspecialchars(json_encode($cred, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8'); ?></div>
            </div>
        <?php endforeach; ?>

        <?php if (empty($credentials)): ?>
            <p style="color: #64748b; font-size: 14px;">
                <?php echo get_string('no_credentials', 'local_academic_wallet'); ?>
            </p>
        <?php endif; ?>
    </div>

    <!-- ═══ Request Access Form (Flow 1) ═══ -->
    <div class="aw-card">
        <h3 class="aw-section-title">Request Access (Flow 1)</h3>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
            Send an access request to this student. They will be notified in their wallet and must approve before you can read their credentials via the standard OB 3.0 API.
        </p>
        <form method="post" class="aw-request-form">
            <input type="hidden" name="action" value="request">
            <input type="hidden" name="sesskey" value="<?php echo sesskey(); ?>">
            <input type="hidden" name="studentemail" value="<?php echo htmlspecialchars($studentemail, ENT_QUOTES, 'UTF-8'); ?>">
            <input type="hidden" name="studentid" value="<?php echo $studentid; ?>">
            <input type="hidden" name="q" value="<?php echo htmlspecialchars($query, ENT_QUOTES, 'UTF-8'); ?>">

            <label for="credentialtype"><?php echo get_string('credential_type', 'local_academic_wallet'); ?></label>
            <input type="text" id="credentialtype" name="credentialtype" placeholder="e.g. German B2, Badge, Certificate...">

            <label for="requestmessage"><?php echo get_string('request_message', 'local_academic_wallet'); ?></label>
            <textarea id="requestmessage" name="requestmessage" placeholder="Professor <?php echo htmlspecialchars(fullname($USER), ENT_QUOTES, 'UTF-8'); ?> from Moodle requests access to your credentials."></textarea>

            <button type="submit" class="aw-btn aw-btn-green">
                📨 <?php echo get_string('request_access', 'local_academic_wallet'); ?>
            </button>
        </form>
    </div>

<?php elseif ($student && empty($credentials)): ?>
    <!-- Student found but no credentials -->
    <a href="<?php echo (new moodle_url('/local/academic_wallet/index.php', ['q' => $query]))->out(); ?>" class="aw-back-link">
        ← Back to search results
    </a>

    <div class="aw-card">
        <div class="aw-student-header">
            <div class="aw-avatar">
                <?php echo strtoupper(substr($student['student']['name'] ?? '?', 0, 1)); ?>
            </div>
            <div>
                <div style="font-size: 18px; font-weight: 600;">
                    <?php echo htmlspecialchars($student['student']['name'] ?? 'Unknown', ENT_QUOTES, 'UTF-8'); ?>
                </div>
                <div style="font-size: 13px; color: #64748b;">
                    <?php echo htmlspecialchars($student['student']['email'] ?? '', ENT_QUOTES, 'UTF-8'); ?>
                </div>
            </div>
        </div>
        <p style="color: #64748b;">This student has no credentials in the wallet yet, or credentials are not shared. You can request access:</p>

        <form method="post" class="aw-request-form" style="margin-top:12px;">
            <input type="hidden" name="action" value="request">
            <input type="hidden" name="sesskey" value="<?php echo sesskey(); ?>">
            <input type="hidden" name="studentemail" value="<?php echo htmlspecialchars($studentemail, ENT_QUOTES, 'UTF-8'); ?>">
            <input type="hidden" name="q" value="<?php echo htmlspecialchars($query, ENT_QUOTES, 'UTF-8'); ?>">

            <label for="credentialtype2"><?php echo get_string('credential_type', 'local_academic_wallet'); ?></label>
            <input type="text" id="credentialtype2" name="credentialtype" placeholder="e.g. German B2">

            <button type="submit" class="aw-btn aw-btn-green">📨 <?php echo get_string('request_access', 'local_academic_wallet'); ?></button>
        </form>
    </div>

<?php else: ?>
    <!-- ═══ Search Form ═══ -->
    <div class="aw-card">
        <h3 class="aw-section-title">🔍 Search Student Credentials</h3>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
            Search the Academic Wallet for students by name, email address, or student ID.
        </p>
        <form method="get" class="aw-search-form">
            <input type="text" name="q" value="<?php echo htmlspecialchars($query, ENT_QUOTES, 'UTF-8'); ?>"
                   placeholder="<?php echo get_string('search_placeholder', 'local_academic_wallet'); ?>"
                   autofocus>
            <button type="submit"><?php echo get_string('search_button', 'local_academic_wallet'); ?></button>
        </form>
    </div>

    <?php if (!empty($query)): ?>
        <div class="aw-card">
            <?php if (empty($students)): ?>
                <p style="color: #64748b; text-align: center; padding: 20px 0;">
                    <?php echo get_string('no_results', 'local_academic_wallet'); ?>
                </p>
            <?php else: ?>
                <h3 class="aw-section-title">Results (<?php echo count($students); ?>)</h3>
                <table class="aw-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Student ID</th>
                            <th>Credentials</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($students as $s): ?>
                            <tr>
                                <td><strong><?php echo htmlspecialchars($s['name'], ENT_QUOTES, 'UTF-8'); ?></strong></td>
                                <td><?php echo htmlspecialchars($s['email'], ENT_QUOTES, 'UTF-8'); ?></td>
                                <td>
                                    <?php if (!empty($s['studentId'])): ?>
                                        <span class="aw-badge aw-badge-gray"><?php echo htmlspecialchars($s['studentId'], ENT_QUOTES, 'UTF-8'); ?></span>
                                    <?php else: ?>
                                        —
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <span class="aw-badge aw-badge-green"><?php echo intval($s['credentialCount'] ?? 0); ?></span>
                                </td>
                                <td>
                                    <a href="<?php echo (new moodle_url('/local/academic_wallet/index.php', [
                                        'studentid' => $s['id'],
                                        'studentemail' => $s['email'],
                                        'q' => $query,
                                    ]))->out(); ?>" class="aw-btn aw-btn-primary">
                                        <?php echo get_string('view_credentials', 'local_academic_wallet'); ?>
                                    </a>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
    <?php endif; ?>
<?php endif; ?>

</div>

<?php
echo $OUTPUT->footer();
