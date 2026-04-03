<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Metodo nao permitido.']);
}

$idToken = require_bearer_token();
$storeId = sanitize_segment((string) ($_POST['storeId'] ?? ''));
$certificatePassword = (string) ($_POST['certificatePassword'] ?? '');

if ($storeId === '') {
    json_response(422, ['ok' => false, 'error' => 'storeId obrigatorio.']);
}

$auth = authorize_store_upload($idToken, $storeId);

if (!isset($_FILES['certificate'])) {
    json_response(422, ['ok' => false, 'error' => 'Arquivo do certificado nao enviado.']);
}

$upload = $_FILES['certificate'];
if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_response(422, ['ok' => false, 'error' => 'Falha no upload do arquivo.']);
}

$originalName = (string) ($upload['name'] ?? 'certificado.pfx');
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
if (!in_array($extension, ['pfx', 'p12'], true)) {
    json_response(422, ['ok' => false, 'error' => 'Envie um certificado A1 em .pfx ou .p12.']);
}

$tmpPath = (string) $upload['tmp_name'];
$size = (int) ($upload['size'] ?? 0);
if ($size <= 0 || $size > 5 * 1024 * 1024) {
    json_response(422, ['ok' => false, 'error' => 'O certificado precisa ter no maximo 5 MB.']);
}

$content = file_get_contents($tmpPath);
if ($content === false || $content === '') {
    json_response(422, ['ok' => false, 'error' => 'Arquivo do certificado vazio ou invalido.']);
}

if ($certificatePassword === '') {
    json_response(422, ['ok' => false, 'error' => 'Informe a senha do certificado.']);
}

$certs = [];
if (!openssl_pkcs12_read($content, $certs, $certificatePassword)) {
    json_response(422, ['ok' => false, 'error' => 'Senha do certificado invalida ou arquivo corrompido.']);
}

$certInfo = openssl_x509_parse($certs['cert'] ?? '');
if (!$certInfo) {
    json_response(422, ['ok' => false, 'error' => 'Nao foi possivel ler os dados do certificado.']);
}

$validTo = (int) ($certInfo['validTo_time_t'] ?? 0);
if ($validTo > 0 && $validTo < time()) {
    json_response(422, ['ok' => false, 'error' => 'Certificado expirado em ' . date('d/m/Y', $validTo) . '.']);
}

$cnpj = '';
$subjectAltName = (string) ($certInfo['extensions']['subjectAltName'] ?? '');
if ($subjectAltName !== '' && preg_match('/\d{14}/', $subjectAltName, $matches)) {
    $cnpj = $matches[0];
}

$baseDir = storage_base_path();
$storeDir = $baseDir . '/' . $storeId;
if (!is_dir($storeDir) && !mkdir($storeDir, 0700, true) && !is_dir($storeDir)) {
    json_response(500, ['ok' => false, 'error' => 'Nao foi possivel criar a pasta segura da loja.']);
}

$filePath = $storeDir . '/certificado.' . $extension;
$metaPath = $storeDir . '/metadata.json';

if (!move_uploaded_file($tmpPath, $filePath)) {
    if (file_put_contents($filePath, $content, LOCK_EX) === false) {
        json_response(500, ['ok' => false, 'error' => 'Falha ao salvar o certificado no servidor.']);
    }
}
chmod($filePath, 0600);

$encryptedPassword = encrypt_secret($certificatePassword);
$metadata = [
    'storeId' => $storeId,
    'originalName' => $originalName,
    'extension' => $extension,
    'contentType' => (string) ($upload['type'] ?? 'application/x-pkcs12'),
    'size' => $size,
    'uploadedAt' => gmdate('c'),
    'uploadedBy' => [
        'uid' => $auth['uid'],
        'email' => $auth['email'],
        'displayName' => $auth['displayName'],
        'role' => $auth['role'],
    ],
    'validUntil' => $validTo > 0 ? gmdate('c', $validTo) : null,
    'cnpj' => $cnpj,
    'password' => $encryptedPassword,
];

if (file_put_contents($metaPath, json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) {
    json_response(500, ['ok' => false, 'error' => 'Falha ao salvar os metadados do certificado.']);
}
chmod($metaPath, 0600);

json_response(200, [
    'ok' => true,
    'provider' => 'hostinger',
    'storeId' => $storeId,
    'fileName' => $originalName,
    'contentType' => $metadata['contentType'],
    'size' => $size,
    'uploadedAt' => $metadata['uploadedAt'],
    'validUntil' => $metadata['validUntil'],
    'cnpj' => $cnpj,
    'storagePath' => 'private_storage/fiscal-certificados/' . $storeId . '/certificado.' . $extension,
]);
