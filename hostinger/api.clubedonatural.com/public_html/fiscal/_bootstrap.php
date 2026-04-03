<?php
declare(strict_types=1);

 $allowedOrigins = [
    'https://clubedonatural.com',
    'https://www.clubedonatural.com',
    'https://clube-do-natural.web.app',
 ];
 $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
 if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
 } else {
    header('Access-Control-Allow-Origin: https://clubedonatural.com');
 }
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function require_bearer_token(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('getallheaders')) {
        $headers = getallheaders();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (!preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
        json_response(401, ['ok' => false, 'error' => 'Token Firebase ausente.']);
    }
    return trim($matches[1]);
}

function firebase_config(): array
{
    return [
        'apiKey' => 'AIzaSyBjZEQHSbckyxyNWZp-g3OMGHpR2M1fS1M',
        'projectId' => 'clube-do-natural',
    ];
}

function validate_id_token(string $idToken): array
{
    $config = firebase_config();
    $url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . rawurlencode($config['apiKey']);
    $payload = json_encode(['idToken' => $idToken], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        json_response(502, ['ok' => false, 'error' => 'Falha ao validar token Firebase.']);
    }

    $data = json_decode((string) $response, true);
    if ($httpCode >= 400 || empty($data['users'][0]['localId'])) {
        json_response(401, ['ok' => false, 'error' => 'Token Firebase invalido ou expirado.']);
    }

    return [
        'uid' => (string) $data['users'][0]['localId'],
        'email' => (string) ($data['users'][0]['email'] ?? ''),
    ];
}

function firestore_get_document(string $path, string $idToken): ?array
{
    $config = firebase_config();
    $url = sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/%s?key=%s',
        rawurlencode($config['projectId']),
        str_replace('%2F', '/', rawurlencode($path)),
        rawurlencode($config['apiKey'])
    );

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $idToken],
    ]);
    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 400 || !$response) {
        return null;
    }

    $document = json_decode($response, true);
    return isset($document['fields']) ? firestore_fields_to_array($document['fields']) : null;
}

function firestore_fields_to_array(array $fields): array
{
    $result = [];
    foreach ($fields as $key => $field) {
        $result[$key] = firestore_value_to_native($field);
    }
    return $result;
}

function firestore_value_to_native(array $field)
{
    if (isset($field['stringValue'])) return (string) $field['stringValue'];
    if (isset($field['integerValue'])) return (int) $field['integerValue'];
    if (isset($field['doubleValue'])) return (float) $field['doubleValue'];
    if (isset($field['booleanValue'])) return (bool) $field['booleanValue'];
    if (isset($field['nullValue'])) return null;
    if (isset($field['timestampValue'])) return (string) $field['timestampValue'];
    if (isset($field['mapValue']['fields'])) return firestore_fields_to_array($field['mapValue']['fields']);
    if (isset($field['arrayValue']['values'])) {
        return array_map('firestore_value_to_native', $field['arrayValue']['values']);
    }
    return null;
}

function authorize_store_upload(string $idToken, string $storeId): array
{
    $tokenData = validate_id_token($idToken);
    $userDoc = firestore_get_document('users/' . $tokenData['uid'], $idToken);

    if (!$userDoc) {
        json_response(403, ['ok' => false, 'error' => 'Nao foi possivel carregar as permissoes do usuario.']);
    }

    $role = (string) ($userDoc['role'] ?? '');
    $approved = (bool) ($userDoc['approved'] ?? false);
    $userStoreId = (string) ($userDoc['storeId'] ?? '');

    if (!$approved) {
        json_response(403, ['ok' => false, 'error' => 'Usuario ainda nao aprovado para operar no painel.']);
    }

    $canManage = $role === 'dono' || ($role === 'gerente' && $userStoreId === $storeId);
    if (!$canManage) {
        json_response(403, ['ok' => false, 'error' => 'Usuario sem permissao para enviar certificado desta loja.']);
    }

    return [
        'uid' => $tokenData['uid'],
        'email' => $tokenData['email'],
        'role' => $role,
        'storeId' => $userStoreId,
        'displayName' => (string) ($userDoc['displayName'] ?? $tokenData['email']),
    ];
}

function get_authenticated_user(string $idToken): array
{
    $tokenData = validate_id_token($idToken);
    $userDoc = firestore_get_document('users/' . $tokenData['uid'], $idToken);

    if (!$userDoc) {
        json_response(403, ['ok' => false, 'error' => 'Nao foi possivel carregar as permissoes do usuario.']);
    }

    $role = (string) ($userDoc['role'] ?? '');
    $approved = (bool) ($userDoc['approved'] ?? false);
    $userStoreId = (string) ($userDoc['storeId'] ?? '');

    if (!$approved) {
        json_response(403, ['ok' => false, 'error' => 'Usuario ainda nao aprovado para operar no painel.']);
    }

    return [
        'uid' => $tokenData['uid'],
        'email' => $tokenData['email'],
        'role' => $role,
        'storeId' => $userStoreId,
        'displayName' => (string) ($userDoc['displayName'] ?? $tokenData['email']),
    ];
}

function authorize_backup_scope(string $idToken, string $scope, ?string $storeId = null): array
{
    $auth = get_authenticated_user($idToken);

    if ($scope === 'global') {
        if ($auth['role'] !== 'dono') {
            json_response(403, ['ok' => false, 'error' => 'Apenas o admin geral pode espelhar dados globais.']);
        }
        return $auth;
    }

    if ($scope === 'store') {
        if (!$storeId) {
            json_response(422, ['ok' => false, 'error' => 'storeId obrigatorio para backup por loja.']);
        }
        $canManage = $auth['role'] === 'dono' || ($auth['role'] === 'gerente' && $auth['storeId'] === $storeId);
        if (!$canManage) {
            json_response(403, ['ok' => false, 'error' => 'Usuario sem permissao para espelhar dados desta loja.']);
        }
        return $auth;
    }

    json_response(422, ['ok' => false, 'error' => 'Escopo de backup invalido.']);
}

function storage_base_path(): string
{
    $base = dirname(__DIR__, 2) . '/private_storage/fiscal-certificados';
    if (!is_dir($base) && !mkdir($base, 0700, true) && !is_dir($base)) {
        json_response(500, ['ok' => false, 'error' => 'Nao foi possivel criar a area privada dos certificados.']);
    }
    return $base;
}

function secret_key_path(): string
{
    $dir = dirname(__DIR__, 2) . '/private_storage/fiscal-secrets';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        json_response(500, ['ok' => false, 'error' => 'Nao foi possivel criar a area segura do servidor.']);
    }
    return $dir . '/app.key';
}

function encryption_key(): string
{
    $path = secret_key_path();
    if (!file_exists($path)) {
        $key = base64_encode(random_bytes(32));
        file_put_contents($path, $key, LOCK_EX);
        chmod($path, 0600);
    }
    return base64_decode(trim((string) file_get_contents($path)), true) ?: random_bytes(32);
}

function encrypt_secret(string $plain): array
{
    $iv = random_bytes(16);
    $cipher = openssl_encrypt($plain, 'AES-256-CBC', encryption_key(), OPENSSL_RAW_DATA, $iv);
    if ($cipher === false) {
        json_response(500, ['ok' => false, 'error' => 'Falha ao criptografar a senha do certificado.']);
    }
    return [
        'cipher' => base64_encode($cipher),
        'iv' => base64_encode($iv),
    ];
}

function sanitize_segment(string $value): string
{
    $clean = preg_replace('/[^a-zA-Z0-9._-]+/', '-', $value);
    $clean = trim((string) $clean, '-');
    return $clean !== '' ? $clean : 'arquivo';
}
