<?php
/**
 * Navigation hooks — makes the plugin appear in Moodle's left sidebar and nav drawer.
 *
 * @package    local_academic_wallet
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Adds "Search Student Credentials" to the flat navigation (left sidebar drawer)
 * in Moodle 4.x Boost theme. This is the most reliable hook for the sidebar.
 */
function local_academic_wallet_extend_navigation(global_navigation $navigation) {
    global $PAGE;
    if (!isloggedin() || isguestuser()) {
        return;
    }
    if (has_capability('local/academic_wallet:viewcredentials', context_system::instance())) {
        $node = $navigation->add(
            get_string('wallet_search', 'local_academic_wallet'),
            new moodle_url('/local/academic_wallet/index.php'),
            navigation_node::TYPE_CUSTOM,
            null,
            'academic_wallet',
            new pix_icon('i/badge', '')
        );
        $node->showinflatnavigation = true;

        $node2 = $navigation->add(
            get_string('announce_certificate', 'local_academic_wallet'),
            new moodle_url('/local/academic_wallet/announce.php'),
            navigation_node::TYPE_CUSTOM,
            null,
            'academic_wallet_announce',
            new pix_icon('i/bullhorn', '')
        );
        $node2->showinflatnavigation = true;

        $node3 = $navigation->add(
            get_string('my_requests', 'local_academic_wallet'),
            new moodle_url('/local/academic_wallet/requests.php'),
            navigation_node::TYPE_CUSTOM,
            null,
            'academic_wallet_requests',
            new pix_icon('i/permissions', '')
        );
        $node3->showinflatnavigation = true;
    }
}

/**
 * Also add to the front-page navigation so it shows on the dashboard.
 */
function local_academic_wallet_extend_navigation_frontpage(navigation_node $frontpage) {
    if (has_capability('local/academic_wallet:viewcredentials', context_system::instance())) {
        $node = $frontpage->add(
            get_string('wallet_search', 'local_academic_wallet'),
            new moodle_url('/local/academic_wallet/index.php'),
            navigation_node::TYPE_CUSTOM,
            null,
            'academic_wallet_fp',
            new pix_icon('i/badge', '')
        );
        $node->showinflatnavigation = true;
    }
}

/**
 * Render an "Announce Certificate" button in the top navbar.
 */
function local_academic_wallet_render_navbar_output(\renderer_base $renderer) {
    global $PAGE;
    if (!isloggedin() || isguestuser()) {
        return '';
    }
    if (!has_capability('local/academic_wallet:viewcredentials', context_system::instance())) {
        return '';
    }
    $announceurl = new moodle_url('/local/academic_wallet/announce.php');
    $icon = $renderer->pix_icon('i/bullhorn', '', 'moodle', ['class' => 'icon mr-1']);
    $label = get_string('announce_certificate', 'local_academic_wallet');

    $requestsurl = new moodle_url('/local/academic_wallet/requests.php');
    $icon2 = $renderer->pix_icon('i/permissions', '', 'moodle', ['class' => 'icon mr-1']);
    $label2 = get_string('my_requests', 'local_academic_wallet');

    return '<div class="nav-item">' .
           '<a class="btn btn-sm btn-outline-primary mx-1" href="' . $announceurl->out(true) . '">' .
           $icon . $label .
           '</a></div>' .
           '<div class="nav-item">' .
           '<a class="btn btn-sm btn-outline-secondary mx-1" href="' . $requestsurl->out(true) . '">' .
           $icon2 . $label2 .
           '</a></div>';
}
