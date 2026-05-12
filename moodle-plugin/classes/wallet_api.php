<?php
/**
 * Wallet API client — calls the Academic Wallet REST endpoints
 *
 * @package    local_academic_wallet
 */

namespace local_academic_wallet;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/filelib.php');

class wallet_api {

    /** @var string Wallet base URL */
    private $baseurl;

    /** @var string API key */
    private $apikey;

    public function __construct() {
        $this->baseurl = rtrim(get_config('local_academic_wallet', 'wallet_url') ?: 'http://host.docker.internal:4000', '/');
        $this->apikey  = get_config('local_academic_wallet', 'api_key') ?: 'moodle-api-key-2024';
    }

    /**
     * Make a GET request to the wallet API
     */
    private function get(string $endpoint, array $params = []): ?array {
        $url = $this->baseurl . $endpoint;
        if (!empty($params)) {
            $url .= '?' . http_build_query($params);
        }

        $curl = new \curl(['ignoresecurity' => true]);
        $curl->setHeader(['X-API-Key: ' . $this->apikey, 'Accept: application/json']);
        $response = $curl->get($url);
        $httpcode = $curl->get_info()['http_code'] ?? 0;

        if ($httpcode >= 200 && $httpcode < 300) {
            return json_decode($response, true);
        }

        debugging("Wallet API GET $endpoint returned HTTP $httpcode: $response", DEBUG_DEVELOPER);
        return null;
    }

    /**
     * Make a POST request to the wallet API
     */
    private function post(string $endpoint, array $data = []): ?array {
        $url = $this->baseurl . $endpoint;

        $curl = new \curl(['ignoresecurity' => true]);
        $curl->setHeader([
            'X-API-Key: ' . $this->apikey,
            'Content-Type: application/json',
            'Accept: application/json',
        ]);
        $response = $curl->post($url, json_encode($data));
        $httpcode = $curl->get_info()['http_code'] ?? 0;

        if ($httpcode >= 200 && $httpcode < 300) {
            return json_decode($response, true);
        }

        // Return structured error for callers to handle (e.g. 409 duplicate request)
        $decoded = json_decode($response, true);
        if ($decoded && is_array($decoded)) {
            $decoded['_http_code'] = $httpcode;
            return $decoded;
        }

        debugging("Wallet API POST $endpoint returned HTTP $httpcode: $response", DEBUG_DEVELOPER);
        return null;
    }

    /**
     * Make a GET request using a Bearer access token (from Flow 1 grant)
     */
    private function get_with_token(string $endpoint, string $token): ?array {
        $url = $this->baseurl . $endpoint;

        $curl = new \curl(['ignoresecurity' => true]);
        $curl->setHeader(['Authorization: Bearer ' . $token, 'Accept: application/json']);
        $response = $curl->get($url);
        $httpcode = $curl->get_info()['http_code'] ?? 0;

        if ($httpcode >= 200 && $httpcode < 300) {
            return json_decode($response, true);
        }

        debugging("Wallet API Bearer GET $endpoint returned HTTP $httpcode: $response", DEBUG_DEVELOPER);
        return null;
    }

    /**
     * Search students by name/email/ID
     */
    public function search_students(string $query): array {
        $result = $this->get('/api/students/search', ['q' => $query]);
        return $result['students'] ?? [];
    }

    /**
     * Get student profile + credential list
     */
    public function get_student(int $walletid): ?array {
        return $this->get("/api/students/$walletid");
    }

    /**
     * Get student's full OB 3.0 credentials via standard endpoint
     */
    public function get_student_credentials_by_email(string $email): array {
        $result = $this->get('/ims/ob/v3p0/credentials', ['student_email' => $email]);
        return $result['credentials'] ?? [];
    }

    /**
     * Get credentials using an access token (Flow 1 - after student grants access)
     */
    public function get_credentials_with_token(string $token): array {
        $result = $this->get_with_token('/ims/ob/v3p0/credentials', $token);
        return $result['credentials'] ?? [];
    }

    /**
     * Request access to a student's credentials (Flow 1 Step 1)
     */
    public function request_access(string $studentemail, string $credentialtype = '', string $message = ''): ?array {
        $data = ['student_email' => $studentemail];
        if (!empty($credentialtype)) {
            $data['credential_type'] = $credentialtype;
        }
        if (!empty($message)) {
            $data['message'] = $message;
        }
        return $this->post('/wallet/access/request', $data);
    }

    /**
     * Check the status of an access request (Flow 1 — get token when approved)
     */
    public function get_request_status(string $requestid): ?array {
        return $this->get('/wallet/access/status/' . urlencode($requestid));
    }

    /**
     * List all access requests for a student email
     */
    public function get_access_requests(string $studentemail = ''): array {
        $params = [];
        if (!empty($studentemail)) {
            $params['student_email'] = $studentemail;
        }
        $result = $this->get('/wallet/access/requests', $params);
        return $result['requests'] ?? [];
    }

    /**
     * Announce a certificate to all wallet students (creates an announcement)
     */
    public function announce_certificate(string $name, string $description = '', string $type = '', string $courseid = '', string $criteria = '', string $issuername = ''): ?array {
        $data = ['achievement_name' => $name];
        if (!empty($description)) {
            $data['achievement_description'] = $description;
        }
        if (!empty($type)) {
            $data['achievement_type'] = $type;
        }
        if (!empty($courseid)) {
            $data['course_id'] = $courseid;
        }
        if (!empty($criteria)) {
            $data['criteria'] = $criteria;
        }
        if (!empty($issuername)) {
            $data['issuer_name'] = $issuername;
        }
        return $this->post('/api/announce-certificate', $data);
    }

    /**
     * Get active announcements
     */
    public function get_announcements(): array {
        $result = $this->get('/api/announcements');
        return $result['announcements'] ?? [];
    }

    /**
     * Check wallet API health
     */
    public function health(): ?array {
        return $this->get('/api/health');
    }
}
