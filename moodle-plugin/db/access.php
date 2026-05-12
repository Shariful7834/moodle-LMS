<?php
/**
 * Capabilities for local_academic_wallet
 *
 * @package    local_academic_wallet
 */

defined('MOODLE_INTERNAL') || die();

$capabilities = [
    'local/academic_wallet:viewcredentials' => [
        'captype'      => 'read',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes'   => [
            'manager'        => CAP_ALLOW,
            'editingteacher' => CAP_ALLOW,
            'teacher'        => CAP_ALLOW,
        ],
    ],
];
