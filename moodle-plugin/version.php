<?php
/**
 * Local plugin: Academic Wallet Integration
 *
 * Allows professors in Moodle to:
 *   - Search students in the Academic Wallet by name/email/ID
 *   - View their OB 3.0 credentials
 *   - Request access to credentials (Flow 1)
 *
 * @package    local_academic_wallet
 */

defined('MOODLE_INTERNAL') || die();

$plugin->version   = 2026040501;
$plugin->requires  = 2024042200;  // Moodle 4.4+
$plugin->component = 'local_academic_wallet';
$plugin->maturity  = MATURITY_ALPHA;
$plugin->release   = '1.1.0';
