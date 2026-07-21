const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/appError');

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function createImageUploader(subfolder) {
    const destDir = path.join(process.cwd(), 'uploads', subfolder);
    fs.mkdirSync(destDir, { recursive: true });

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, destDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const stamp = Date.now();
            const rand = crypto.randomBytes(8).toString('hex');
            cb(null, `${stamp}-${rand}${ext}`);
        },
    });

    return multer({
        storage,
        limits: { fileSize: MAX_IMAGE_BYTES },
        fileFilter: (req, file, cb) => {
            if (ALLOWED_IMAGE_MIME.includes(file.mimetype)) return cb(null, true);
            return cb(new AppError(
                `Unsupported file type: ${file.mimetype}. Allowed: ${ALLOWED_IMAGE_MIME.join(', ')}`,
                400,
                'INVALID_FILE_TYPE'
            ));
        },
    });
}

const gymLogoUpload = createImageUploader('gym/logos');
const gymCoverUpload = createImageUploader('gym/covers');

function buildPublicUrl(req, relativePath) {
    if (!relativePath) return null;
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const normalized = relativePath.replace(/\\/g, '/');
    const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `${base}${withSlash}`;
}

function safeUnlink(absolutePath) {
    if (!absolutePath) return;
    fs.unlink(absolutePath, () => { /* ignore — best effort */ });
}

function relativePathFromMulterFile(file) {
    if (!file) return null;
    const cwd = process.cwd();
    const rel = path.relative(cwd, file.path).replace(/\\/g, '/');
    return rel.startsWith('/') ? rel : `/${rel}`;
}

function absolutePathFromRelative(relativePath) {
    if (!relativePath) return null;
    const trimmed = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return path.join(process.cwd(), trimmed);
}

module.exports = {
    gymLogoUpload,
    gymCoverUpload,
    buildPublicUrl,
    safeUnlink,
    relativePathFromMulterFile,
    absolutePathFromRelative,
};
