const express = require('express');
const { serverError } = require('../utils/http');
const crypto = require('crypto');
const Media = require('../models/Media');
const { protect } = require('../middleware/auth');
const { rateLimit, LIMITS } = require('../utils/rateLimit');

const router = express.Router();

// Keep under MongoDB's 16MB document limit.
const MAX_BYTES = 15 * 1024 * 1024;

// Types that are safe to render inline from the API origin. Everything else
// (HTML, SVG, scripts…) is served as a download so it can never execute here.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|heic|heif)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;

// Executables and scripts are refused outright (by extension, MIME type and file signature).
const BLOCKED_EXTENSIONS = /\.(exe|dll|com|bat|cmd|msi|msp|scr|ps1|psm1|vbs|vbe|js|jse|mjs|wsf|wsh|sh|bash|csh|apk|app|deb|rpm|jar|reg|lnk|hta|cpl|pif|gadget)$/i;
const BLOCKED_TYPES = /^application\/(x-msdownload|x-msdos-program|x-executable|x-elf|x-sh|x-csh|x-bat|x-msi|vnd\.microsoft\.portable-executable|java-archive|vnd\.android\.package-archive|javascript|x-javascript)$|^text\/javascript$/i;
const looksExecutable = (data) =>
  (data[0] === 0x4d && data[1] === 0x5a) || // "MZ" — Windows PE
  (data[0] === 0x7f && data[1] === 0x45 && data[2] === 0x4c && data[3] === 0x46) || // ELF
  (data[0] === 0x23 && data[1] === 0x21); // "#!" script

// Keep only the base file name, without control characters or path separators.
const cleanName = (raw) => {
  let name = '';
  try { name = decodeURIComponent(String(raw || '')); } catch { name = ''; }
  return name.split(/[/\\]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
};

const KEY_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

// @POST /api/media — raw body upload, headers: Content-Type, X-File-Name
router.post(
  '/',
  protect,
  rateLimit(LIMITS.upload),
  express.raw({ type: () => true, limit: MAX_BYTES }),
  async (req, res) => {
    try {
      const data = req.body;
      if (!Buffer.isBuffer(data) || data.length === 0) {
        return res.status(400).json({ message: 'File is empty' });
      }
      const mimeType = String(req.headers['content-type'] || 'application/octet-stream')
        .split(';')[0]
        .trim()
        .toLowerCase()
        .slice(0, 100);
      const name = cleanName(req.headers['x-file-name']);
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) return res.status(400).json({ message: 'Invalid file type' });
      if (BLOCKED_EXTENSIONS.test(name) || BLOCKED_TYPES.test(mimeType) || looksExecutable(data)) {
        return res.status(415).json({ message: 'This file type is not allowed' });
      }

      const media = await Media.create({
        key: crypto.randomBytes(24).toString('base64url'),
        owner: req.user._id,
        mimeType,
        name,
        size: data.length,
        data
      });

      res.status(201).json({
        url: `/api/media/${media.key}`,
        mimeType,
        name,
        size: media.size
      });
    } catch (error) {
      serverError(res, error);
    }
  }
);

// @GET /api/media/:key — supports HTTP Range so audio/video can seek (required by iOS Safari)
router.get('/:key', async (req, res) => {
  try {
    if (!KEY_PATTERN.test(req.params.key)) return res.status(404).json({ message: 'Not found' });
    const media = await Media.findOne({ key: req.params.key }).lean();
    // Expired status media is gone immediately, even before MongoDB's TTL sweep.
    if (!media || (media.expiresAt && media.expiresAt <= new Date())) return res.status(404).json({ message: 'Not found' });

    const bytes = media.data.buffer || media.data;
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const total = buffer.length;
    const inline = INLINE_TYPES.test(media.mimeType);
    const safeName = encodeURIComponent(media.name || 'file');

    res.set({
      'Content-Type': inline ? media.mimeType : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': media.expiresAt
        ? `private, max-age=${Math.max(0, Math.floor((new Date(media.expiresAt) - Date.now()) / 1000))}`
        : 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });

    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      let start = range[1] === '' ? null : parseInt(range[1], 10);
      let end = range[2] === '' ? null : parseInt(range[2], 10);
      if (start === null) {
        start = Math.max(total - (end || 0), 0);
        end = total - 1;
      } else if (end === null || end >= total) {
        end = total - 1;
      }
      if (start > end || start >= total) {
        res.set('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': end - start + 1
      });
      return res.end(buffer.subarray(start, end + 1));
    }

    res.set('Content-Length', total);
    res.end(buffer);
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;
