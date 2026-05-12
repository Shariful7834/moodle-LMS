<?php
/**
 * Announce Certificate — professors broadcast a certificate request to all wallet students.
 *
 * Students will see the announcement on their wallet dashboard (/announcements)
 * and can upload proof of the certificate.
 *
 * @package    local_academic_wallet
 */

require_once(__DIR__ . '/../../config.php');
require_login();
require_capability('local/academic_wallet:viewcredentials', context_system::instance());

$PAGE->set_url(new moodle_url('/local/academic_wallet/announce.php'));
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('announce_certificate', 'local_academic_wallet'));
$PAGE->set_heading(get_string('announce_certificate', 'local_academic_wallet'));
$PAGE->set_pagelayout('standard');

$api = new \local_academic_wallet\wallet_api();

$message     = '';
$messagetype = 'info';

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST' && confirm_sesskey()) {
    $name        = required_param('achievement_name', PARAM_TEXT);
    $description = optional_param('achievement_description', '', PARAM_TEXT);
    $type        = optional_param('achievement_type', 'Certificate', PARAM_TEXT);
    $courseid    = optional_param('course_id', '', PARAM_TEXT);
    $criteria    = optional_param('criteria', '', PARAM_TEXT);
    $issuername  = optional_param('issuer_name', '', PARAM_TEXT);

    if (empty($issuername)) {
        $issuername = 'Moodle LMS - ' . fullname($USER);
    }

    $result = $api->announce_certificate($name, $description, $type, $courseid, $criteria, $issuername);
    if ($result && !empty($result['announcementId'])) {
        $message = get_string('announce_success', 'local_academic_wallet', $name);
        $messagetype = 'success';
    } else if ($result && !empty($result['error'])) {
        $message = $result['error'];
        $messagetype = 'error';
    } else {
        $message = get_string('announce_failed', 'local_academic_wallet');
        $messagetype = 'error';
    }
}

// Fetch existing announcements
$announcements = $api->get_announcements();

echo $OUTPUT->header();
?>

<style>
    .aw-container { max-width: 960px; margin: 0 auto; }
    .aw-card { background: #fff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .aw-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .aw-section-title { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
    .aw-form label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px; }
    .aw-form input, .aw-form textarea, .aw-form select { width: 100%; padding: 8px 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 13px; margin-bottom: 12px; box-sizing: border-box; }
    .aw-form textarea { height: 80px; resize: vertical; }
    .aw-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
    .aw-btn-primary { background: #4f46e5; color: #fff; }
    .aw-btn-primary:hover { background: #4338ca; }
    .aw-msg { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    .aw-msg-success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .aw-msg-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .aw-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .aw-badge-blue { background: #dbeafe; color: #1e40af; }
    .aw-badge-gray { background: #f3f4f6; color: #374151; }
    .aw-ann-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
    .aw-ann-name { font-weight: 600; font-size: 14px; color: #1e293b; }
    .aw-ann-desc { font-size: 13px; color: #64748b; margin-top: 4px; }
    .aw-ann-meta { font-size: 11px; color: #94a3b8; margin-top: 6px; }
    .aw-back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #4f46e5; text-decoration: none; margin-bottom: 16px; }
    .aw-back-link:hover { text-decoration: underline; }
    .aw-hint { font-size: 11px; color: #9ca3af; margin-top: -8px; margin-bottom: 12px; }
</style>

<div class="aw-container">

<a href="<?php echo (new moodle_url('/local/academic_wallet/index.php'))->out(); ?>" class="aw-back-link">
    ← Back to Search
</a>

<?php if (!empty($message)): ?>
    <div class="aw-msg aw-msg-<?php echo $messagetype; ?>">
        <?php echo htmlspecialchars($message, ENT_QUOTES, 'UTF-8'); ?>
    </div>
<?php endif; ?>

<!-- ═══ Announce Certificate Form ═══ -->
<div class="aw-card">
    <h3 class="aw-section-title">📢 <?php echo get_string('announce_certificate', 'local_academic_wallet'); ?></h3>
    <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
        <?php echo get_string('announce_help', 'local_academic_wallet'); ?>
    </p>

    <form method="post" class="aw-form">
        <input type="hidden" name="sesskey" value="<?php echo sesskey(); ?>">

        <label for="achievement_name"><?php echo get_string('achievement_name', 'local_academic_wallet'); ?> *</label>
        <input type="text" id="achievement_name" name="achievement_name" required
               placeholder="e.g. German B2 Language Certificate, AWS Cloud Practitioner">

        <label for="achievement_description"><?php echo get_string('achievement_description', 'local_academic_wallet'); ?></label>
        <textarea id="achievement_description" name="achievement_description"
                  placeholder="Describe what this certificate proves..."></textarea>

        <label for="achievement_type"><?php echo get_string('achievement_type', 'local_academic_wallet'); ?></label>
        <select id="achievement_type" name="achievement_type">
            <option value="Certificate">Certificate</option>
            <option value="OpenBadgeCredential">Open Badge</option>
            <option value="Diploma">Diploma</option>
            <option value="License">License</option>
            <option value="Assessment">Assessment</option>
        </select>

        <label for="course_id"><?php echo get_string('course_id', 'local_academic_wallet'); ?></label>
        <input type="text" id="course_id" name="course_id" placeholder="e.g. CS101, LANG-B2">
        <p class="aw-hint"><?php echo get_string('course_id_hint', 'local_academic_wallet'); ?></p>

        <label for="criteria"><?php echo get_string('criteria_label', 'local_academic_wallet'); ?></label>
        <textarea id="criteria" name="criteria"
                  placeholder="e.g. Must pass B2 level exam with score >= 60%"></textarea>

        <label for="issuer_name"><?php echo get_string('issuer_name', 'local_academic_wallet'); ?></label>
        <input type="text" id="issuer_name" name="issuer_name"
               placeholder="<?php echo htmlspecialchars('Moodle LMS - ' . fullname($USER), ENT_QUOTES, 'UTF-8'); ?>">
        <p class="aw-hint"><?php echo get_string('issuer_hint', 'local_academic_wallet'); ?></p>

        <button type="submit" class="aw-btn aw-btn-primary">
            📢 <?php echo get_string('announce_button', 'local_academic_wallet'); ?>
        </button>
    </form>
</div>

<!-- ═══ Existing Announcements ═══ -->
<?php if (!empty($announcements)): ?>
<div class="aw-card">
    <h3 class="aw-section-title">📋 <?php echo get_string('active_announcements', 'local_academic_wallet'); ?> (<?php echo count($announcements); ?>)</h3>
    <?php foreach ($announcements as $ann): ?>
        <div class="aw-ann-card">
            <div class="aw-ann-name"><?php echo htmlspecialchars($ann['achievementName'] ?? '', ENT_QUOTES, 'UTF-8'); ?></div>
            <?php if (!empty($ann['achievementDescription'])): ?>
                <div class="aw-ann-desc"><?php echo htmlspecialchars($ann['achievementDescription'], ENT_QUOTES, 'UTF-8'); ?></div>
            <?php endif; ?>
            <div style="margin-top: 6px;">
                <span class="aw-badge aw-badge-blue"><?php echo htmlspecialchars($ann['achievementType'] ?? 'Certificate', ENT_QUOTES, 'UTF-8'); ?></span>
                <?php if (!empty($ann['courseId'])): ?>
                    <span class="aw-badge aw-badge-gray">Course: <?php echo htmlspecialchars($ann['courseId'], ENT_QUOTES, 'UTF-8'); ?></span>
                <?php endif; ?>
            </div>
            <div class="aw-ann-meta">
                Source: <?php echo htmlspecialchars($ann['sourceName'] ?? 'Unknown', ENT_QUOTES, 'UTF-8'); ?>
                <?php if (!empty($ann['createdAt'])): ?>
                    &middot; Created: <?php echo date('M j, Y', strtotime($ann['createdAt'])); ?>
                <?php endif; ?>
                <?php if (!empty($ann['expiresAt'])): ?>
                    &middot; Expires: <?php echo date('M j, Y', strtotime($ann['expiresAt'])); ?>
                <?php endif; ?>
            </div>
        </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>

</div>

<?php
echo $OUTPUT->footer();
