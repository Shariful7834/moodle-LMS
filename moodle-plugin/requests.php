<?php
/**
 * My Access Requests — professors track Flow 1 requests and read approved credentials.
 *
 * Shows all access requests sent from Moodle with their status (pending/approved/denied).
 * When approved, the professor can read the student's OB 3.0 credentials using the token.
 *
 * @package    local_academic_wallet
 */

require_once(__DIR__ . '/../../config.php');
require_login();
require_capability('local/academic_wallet:viewcredentials', context_system::instance());

$PAGE->set_url(new moodle_url('/local/academic_wallet/requests.php'));
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('my_requests', 'local_academic_wallet'));
$PAGE->set_heading(get_string('my_requests', 'local_academic_wallet'));
$PAGE->set_pagelayout('standard');

$api = new \local_academic_wallet\wallet_api();

$message     = '';
$messagetype = 'info';

// Action: read credentials with token
$action    = optional_param('action', '', PARAM_ALPHA);
$requestid = optional_param('requestid', '', PARAM_ALPHANUMEXT);
$credentials = [];
$viewrequest = null;

if ($action === 'read' && !empty($requestid)) {
    // Get the request status + token
    $status = $api->get_request_status($requestid);
    if ($status && $status['status'] === 'approved' && !empty($status['accessToken'])) {
        $viewrequest = $status;
        $credentials = $api->get_credentials_with_token($status['accessToken']);
        if (empty($credentials)) {
            $message = get_string('no_credentials_token', 'local_academic_wallet');
            $messagetype = 'info';
        }
    } else if ($status && $status['status'] === 'pending') {
        $message = get_string('access_pending', 'local_academic_wallet');
        $messagetype = 'info';
    } else if ($status && $status['status'] === 'denied') {
        $message = get_string('access_denied', 'local_academic_wallet');
        $messagetype = 'error';
    } else {
        $message = get_string('request_not_found', 'local_academic_wallet');
        $messagetype = 'error';
    }
}

// Fetch all requests
$requests = $api->get_access_requests();

echo $OUTPUT->header();
?>

<style>
    .aw-container { max-width: 960px; margin: 0 auto; }
    .aw-card { background: #fff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .aw-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .aw-section-title { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
    .aw-msg { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    .aw-msg-success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .aw-msg-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .aw-msg-info { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .aw-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .aw-badge-green { background: #d1fae5; color: #065f46; }
    .aw-badge-orange { background: #fef3c7; color: #92400e; }
    .aw-badge-red { background: #fee2e2; color: #991b1b; }
    .aw-badge-gray { background: #f3f4f6; color: #374151; }
    .aw-badge-blue { background: #dbeafe; color: #1e40af; }
    .aw-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; }
    .aw-btn-primary { background: #4f46e5; color: #fff; }
    .aw-btn-primary:hover { background: #4338ca; color: #fff; text-decoration: none; }
    .aw-btn-green { background: #059669; color: #fff; }
    .aw-btn-green:hover { background: #047857; color: #fff; text-decoration: none; }
    .aw-back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #4f46e5; text-decoration: none; margin-bottom: 16px; }
    .aw-back-link:hover { text-decoration: underline; }
    table.aw-table { width: 100%; border-collapse: collapse; }
    table.aw-table th, table.aw-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    table.aw-table th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 13px; }
    table.aw-table tr:hover { background: #f1f5f9; }
    .aw-cred-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .aw-cred-name { font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 4px; }
    .aw-cred-issuer { font-size: 12px; color: #64748b; }
    .aw-cred-date { font-size: 11px; color: #94a3b8; margin-top: 6px; }
    .aw-json-toggle { font-size: 12px; color: #4f46e5; cursor: pointer; margin-top: 8px; background: none; border: none; text-decoration: underline; }
    .aw-json-block { display: none; margin-top: 8px; background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 12px; font-family: monospace; white-space: pre-wrap; max-height: 300px; overflow: auto; }
    .aw-flow-step { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
    .aw-flow-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
    .aw-flow-done { background: #d1fae5; color: #065f46; }
    .aw-flow-active { background: #fef3c7; color: #92400e; }
    .aw-flow-wait { background: #f3f4f6; color: #9ca3af; }
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

<?php if ($action === 'read' && $viewrequest && !empty($credentials)): ?>
    <!-- ═══ Credential View (via Flow 1 token) ═══ -->
    <a href="<?php echo (new moodle_url('/local/academic_wallet/requests.php'))->out(); ?>" class="aw-back-link">
        ← Back to My Requests
    </a>

    <div class="aw-card">
        <h3 class="aw-section-title">🔓 <?php echo get_string('credentials_via_token', 'local_academic_wallet'); ?></h3>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 4px;">
            Student: <strong><?php echo htmlspecialchars($viewrequest['studentEmail'], ENT_QUOTES, 'UTF-8'); ?></strong>
            <?php if (!empty($viewrequest['credentialType'])): ?>
                &middot; Type: <span class="aw-badge aw-badge-blue"><?php echo htmlspecialchars($viewrequest['credentialType'], ENT_QUOTES, 'UTF-8'); ?></span>
            <?php endif; ?>
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-bottom: 16px;">
            Token expires: <?php echo date('M j, Y H:i', strtotime($viewrequest['tokenExpiresAt'])); ?>
        </p>

        <!-- Flow 1 Steps -->
        <div style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
            <div class="aw-flow-step">
                <div class="aw-flow-num aw-flow-done">1</div>
                <span style="font-size: 13px;">✅ Request sent from Moodle</span>
            </div>
            <div class="aw-flow-step">
                <div class="aw-flow-num aw-flow-done">2</div>
                <span style="font-size: 13px;">✅ Student notified in wallet</span>
            </div>
            <div class="aw-flow-step">
                <div class="aw-flow-num aw-flow-done">3</div>
                <span style="font-size: 13px;">✅ Student approved — access token issued</span>
            </div>
            <div class="aw-flow-step">
                <div class="aw-flow-num aw-flow-done">4</div>
                <span style="font-size: 13px;">✅ Reading OB 3.0 credentials below</span>
            </div>
        </div>

        <h4 style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 10px;">
            OB 3.0 Credentials (<?php echo count($credentials); ?>)
        </h4>

        <?php foreach ($credentials as $i => $cred): ?>
            <div class="aw-cred-card">
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
                    <div class="aw-cred-date">Issued: <?php echo date('M j, Y', strtotime($cred['validFrom'])); ?></div>
                <?php endif; ?>
                <button class="aw-json-toggle" onclick="var el=document.getElementById('rjson-<?php echo $i; ?>'); el.style.display = el.style.display === 'block' ? 'none' : 'block';">
                    Show/Hide OB 3.0 JSON-LD
                </button>
                <div id="rjson-<?php echo $i; ?>" class="aw-json-block"><?php echo htmlspecialchars(json_encode($cred, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8'); ?></div>
            </div>
        <?php endforeach; ?>
    </div>

<?php else: ?>
    <!-- ═══ All Access Requests ═══ -->
    <div class="aw-card">
        <h3 class="aw-section-title">📋 <?php echo get_string('my_requests', 'local_academic_wallet'); ?></h3>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
            <?php echo get_string('my_requests_help', 'local_academic_wallet'); ?>
        </p>

        <?php if (empty($requests)): ?>
            <p style="color: #64748b; text-align: center; padding: 20px 0;">
                <?php echo get_string('no_requests', 'local_academic_wallet'); ?>
            </p>
        <?php else: ?>
            <table class="aw-table">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Credential Type</th>
                        <th>Status</th>
                        <th>Requested</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($requests as $req): ?>
                        <tr>
                            <td><?php echo htmlspecialchars($req['studentEmail'] ?? '', ENT_QUOTES, 'UTF-8'); ?></td>
                            <td>
                                <?php if (!empty($req['credentialType'])): ?>
                                    <span class="aw-badge aw-badge-blue"><?php echo htmlspecialchars($req['credentialType'], ENT_QUOTES, 'UTF-8'); ?></span>
                                <?php else: ?>
                                    <span class="aw-badge aw-badge-gray">All</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php
                                $status = $req['status'] ?? 'unknown';
                                $badgeclass = 'aw-badge-gray';
                                $icon = '⏳';
                                if ($status === 'approved') { $badgeclass = 'aw-badge-green'; $icon = '✅'; }
                                else if ($status === 'denied') { $badgeclass = 'aw-badge-red'; $icon = '❌'; }
                                else if ($status === 'revoked') { $badgeclass = 'aw-badge-gray'; $icon = '🚫'; }
                                else if ($status === 'pending') { $badgeclass = 'aw-badge-orange'; $icon = '⏳'; }
                                ?>
                                <span class="aw-badge <?php echo $badgeclass; ?>"><?php echo $icon; ?> <?php echo htmlspecialchars($status, ENT_QUOTES, 'UTF-8'); ?></span>
                            </td>
                            <td style="font-size: 13px; color: #64748b;">
                                <?php echo !empty($req['createdAt']) ? date('M j, Y H:i', strtotime($req['createdAt'])) : '—'; ?>
                            </td>
                            <td>
                                <?php if ($status === 'approved' && !empty($req['hasToken'])): ?>
                                    <a href="<?php echo (new moodle_url('/local/academic_wallet/requests.php', [
                                        'action' => 'read',
                                        'requestid' => $req['requestId']
                                    ]))->out(); ?>" class="aw-btn aw-btn-green">
                                        🔓 Read Credentials
                                    </a>
                                <?php elseif ($status === 'pending'): ?>
                                    <span style="font-size: 12px; color: #92400e;">Waiting for student...</span>
                                <?php elseif ($status === 'denied'): ?>
                                    <span style="font-size: 12px; color: #991b1b;">Student declined</span>
                                <?php elseif ($status === 'revoked'): ?>
                                    <span style="font-size: 12px; color: #6b7280;">Access revoked</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

    <!-- ═══ Flow 1 Explanation ═══ -->
    <div class="aw-card" style="background: #f8fafc;">
        <h3 class="aw-section-title">ℹ️ How Flow 1 Works</h3>
        <div class="aw-flow-step">
            <div class="aw-flow-num aw-flow-done">1</div>
            <span style="font-size: 13px;"><strong>Request:</strong> You search a student and click "Request Access" on their profile page</span>
        </div>
        <div class="aw-flow-step">
            <div class="aw-flow-num aw-flow-active">2</div>
            <span style="font-size: 13px;"><strong>Notify:</strong> Student sees the request in their Academic Wallet notifications</span>
        </div>
        <div class="aw-flow-step">
            <div class="aw-flow-num aw-flow-wait">3</div>
            <span style="font-size: 13px;"><strong>Approve:</strong> Student approves or denies — an access token is issued on approval</span>
        </div>
        <div class="aw-flow-step">
            <div class="aw-flow-num aw-flow-wait">4</div>
            <span style="font-size: 13px;"><strong>Read:</strong> Click "Read Credentials" to fetch the OB 3.0 credential using the token</span>
        </div>
    </div>
<?php endif; ?>

</div>

<?php
echo $OUTPUT->footer();
