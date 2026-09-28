const express = require('express');
const crypto = require('crypto');
const Media = require('../models/Media');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Keep under MongoDB's 16MB document limit.
const MAX_BYTES = 15 * 1024 * 1024;

// Types that are safe to render inline from the API origin. Everything else
// (HTML, SVG, scripts…) is served as a download so it can never execute here.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|heic|heif)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;

// @POST /api/media — raw body upload, headers: Content-Type, X-File-Name
router.post(
  '/',
  protect,
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
      let name = '';
      try {
        name = decodeURIComponent(String(req.headers['x-file-name'] || '')).slice(0, 200);
      } catch {
        name = '';
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
      res.status(500).json({ message: error.message });
    }
  }
);

// @GET /api/media/:key — supports HTTP Range so audio/video can seek (required by iOS Safari)
router.get('/:key', async (req, res) => {
  try {
    const media = await Media.findOne({ key: req.params.key }).lean();
    if (!media) return res.status(404).json({ message: 'Not found' });

    const bytes = media.data.buffer || media.data;
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const total = buffer.length;
    const inline = INLINE_TYPES.test(media.mimeType);
    const safeName = encodeURIComponent(media.name || 'file');

    res.set({
      'Content-Type': inline ? media.mimeType : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000, immutable',
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
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
