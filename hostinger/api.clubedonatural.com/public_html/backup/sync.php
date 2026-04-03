<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/fiscal/_bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Metodo nao permitido.']);
}

$idToken = require_bearer_token();
$raw = file_get_contents('php://input');
$payload = json_decode((string) $raw, true);

if (!is_array($payload)) {
    json_response(422, ['ok' => false, 'error' => 'Payload JSON invalido.']);
}

$scope = (string) ($payload['scope'] ?? '');
$collection = sanitize_segment((string) ($payload['collection'] ?? ''));
$docId = sanitize_segment((string) ($payload['docId'] ?? ''));
$operation = (string) ($payload['operation'] ?? 'upsert');
$storeId = isset($payload['storeId']) ? sanitize_segment((string) $payload['storeId']) : null;
$data = $payload['data'] ?? null;

if ($collection === '' || $docId === '') {
    json_response(422, ['ok' => false, 'error' => 'collection e docId sao obrigatorios.']);
}

if (!in_array($operation, ['upsert', 'delete'], true)) {
    json_response(422, ['ok' => false, 'error' => 'Operacao de backup invalida.']);
}

$auth = authorize_backup_scope($idToken, $scope, $storeId);

function backup_storage_base(): string
{
    $base = dirname(__DIR__, 2) . '/private_storage/db-backups';
    if (!is_dir($base) && !mkdir($base, 0700, true) && !is_dir($base)) {
        json_response(500, ['ok' => false, 'error' => 'Nao foi possivel criar a area privada do backup.']);
    }
    return $base;
}

function ensure_dir(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
        json_response(500, ['ok' => false, 'error' => 'Falha ao criar diretoria privada de backup.']);
    }
}

$base = backup_storage_base();
$scopeDir = $scope === 'global'
    ? $base . '/global/' . $collection . '/' . $docId
    : $base . '/stores/' . $storeId . '/' . $collection . '/' . $docId;
$versionsDir = $scopeDir . '/versions';

ensure_dir($scopeDir);
ensure_dir($versionsDir);

$now = gmdate('c');
$versionFile = $versionsDir . '/' . gmdate('Ymd_His') . '_' . substr(bin2hex(random_bytes(3)), 0, 6) . '.json';
$latestFile = $scopeDir . '/latest.json';
$auditFile = $base . '/backup-audit.ndjson';

$record = [
    'scope' => $scope,
    'collection' => $collection,
    'docId' => $docId,
    'storeId' => $storeId,
    'operation' => $operation,
    'serverReceivedAt' => $now,
    'receivedFrom' => [
        'uid' => $auth['uid'],
        'email' => $auth['email'],
        'displayName' => $auth['displayName'],
        'role' => $auth['role'],
        'storeId' => $auth['storeId'],
    ],
    'data' => $operation === 'delete' ? null : $data,
];

$json = json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    json_response(500, ['ok' => false, 'error' => 'Falha ao serializar o backup.']);
}

if (file_put_contents($versionFile, $json, LOCK_EX) === false) {
    json_response(500, ['ok' => false, 'error' => 'Falha ao salvar a versao do backup.']);
}
chmod($versionFile, 0600);

if (file_put_contents($latestFile, $json, LOCK_EX) === false) {
    json_response(500, ['ok' => false, 'error' => 'Falha ao atualizar o backup principal.']);
}
chmod($latestFile, 0600);

$auditLine = json_encode([
    'scope' => $scope,
    'collection' => $collection,
    'docId' => $docId,
    'storeId' => $storeId,
    'operation' => $operation,
    'serverReceivedAt' => $now,
    'uid' => $auth['uid'],
    'role' => $auth['role'],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
file_put_contents($auditFile, $auditLine, FILE_APPEND | LOCK_EX);
@chmod($auditFile, 0600);

json_response(200, [
    'ok' => true,
    'scope' => $scope,
    'collection' => $collection,
    'docId' => $docId,
    'storeId' => $storeId,
    'operation' => $operation,
    'serverReceivedAt' => $now,
    'latestPath' => str_replace(dirname(__DIR__, 2) . '/', '', $latestFile),
    'versionPath' => str_replace(dirname(__DIR__, 2) . '/', '', $versionFile),
]);
