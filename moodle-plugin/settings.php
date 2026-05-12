<?php
/**
 * Settings for local_academic_wallet
 *
 * @package    local_academic_wallet
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_academic_wallet', get_string('pluginname', 'local_academic_wallet'));

    $settings->add(new admin_setting_configtext(
        'local_academic_wallet/wallet_url',
        'Wallet API URL',
        'Base URL of the Academic Wallet API',
        'http://host.docker.internal:4000'
    ));

    $settings->add(new admin_setting_configtext(
        'local_academic_wallet/api_key',
        'Wallet API Key',
        'API key for authenticating with the wallet',
        'moodle-api-key-2024'
    ));

    $ADMIN->add('localplugins', $settings);
}
