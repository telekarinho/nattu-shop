<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/fiscal/_bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Metodo nao permitido.']);
}

$idToken = require_bearer_token();
$storeId = trim((string) ($_POST['storeId'] ?? ''));
$productId = trim((string) ($_POST['productId'] ?? ''));

if ($storeId === '' || $productId === '') {
    json_response(422, ['ok' => false, 'error' => 'storeId e productId sao obrigatorios.']);
}

if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
    json_response(422, ['ok' => false, 'error' => 'Arquivo de imagem nao enviado.']);
}

$image = $_FILES['image'];
if (($image['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_response(422, ['ok' => false, 'error' => 'Falha no upload da imagem.']);
}

$auth = authorize_store_upload($idToken, $storeId);

$tmpPath = (string) ($image['tmp_name'] ?? '');
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    json_response(422, ['ok' => false, 'error' => 'Upload temporario invalido.']);
}

$allowedMimeTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = $finfo ? (string) finfo_file($finfo, $tmpPath) : '';
if ($finfo) {
    finfo_close($finfo);
}

if (!isset($allowedMimeTypes[$mimeType])) {
    json_response(422, ['ok' => false, 'error' => 'Formato de imagem nao permitido. Use JPG, PNG ou WEBP.']);
}

$maxBytes = 8 * 1024 * 1024;
$fileSize = (int) ($image['size'] ?? 0);
if ($fileSize <= 0 || $fileSize > $maxBytes) {
    json_response(422, ['ok' => false, 'error' => 'A imagem deve ter ate 8 MB.']);
}

$safeProductId = preg_replace('/[^a-zA-Z0-9_-]+/', '-', $productId) ?: 'produto';
$safeOriginal = sanitize_file_name((string) ($image['name'] ?? ('imagem.' . $allowedMimeTypes[$mimeType])));
$extension = $allowedMimeTypes[$mimeType];
$fileName = time() . '-' . $safeProductId . '-' . $safeOriginal;
if (!str_ends_with(strtolower($fileName), '.' . $extension)) {
    $fileName .= '.' . $extension;
}

$baseDir = dirname(__DIR__) . '/uploads/produtos/' . $storeId . '/' . $safeProductId;
if (!is_dir($baseDir) && !mkdir($baseDir, 0755, true) && !is_dir($baseDir)) {
    json_response(500, ['ok' => false, 'error' => 'Nao foi possivel criar a pasta de imagens.']);
}

$destination = $baseDir . '/' . $fileName;
if (!move_uploaded_file($tmpPath, $destination)) {
    json_response(500, ['ok' => false, 'error' => 'Nao foi possivel salvar a imagem no servidor.']);
}

$publicPath = '/uploads/produtos/' . rawurlencode($storeId) . '/' . rawurlencode($safeProductId) . '/' . rawurlencode($fileName);
$downloadURL = 'https://nattu.shop' . $publicPath;

json_response(200, [
    'ok' => true,
    'storeId' => $storeId,
    'productId' => $productId,
    'fileName' => $fileName,
    'originalName' => (string) ($image['name'] ?? $fileName),
    'contentType' => $mimeType,
    'size' => $fileSize,
    'storagePath' => ltrim($publicPath, '/'),
    'downloadURL' => $downloadURL,
    'uploadedAt' => gmdate('c'),
    'uploadedBy' => $auth['displayName'],
    'uploadedById' => $auth['uid'],
    'storageProvider' => 'hostinger',
]);

function sanitize_file_name(string $name): string
{
    $normalized = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
    $normalized = $normalized !== false ? $normalized : $name;
    $normalized = preg_replace('/[^a-zA-Z0-9._-]+/', '-', $normalized) ?: 'arquivo';
    $normalized = trim($normalized, '-.');
    return $normalized !== '' ? substr($normalized, 0, 120) : 'arquivo';
}
