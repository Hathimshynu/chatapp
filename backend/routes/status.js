const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/statusController');
const { rateLimit, LIMITS } = require('../utils/rateLimit');

const router = express.Router();
router.use(protect);

router.get('/feed', c.getFeed);
router.post('/', rateLimit(LIMITS.status), c.createStatus);
router.get('/:id', c.getStatus);
router.delete('/:id', c.deleteStatus);
router.post('/:id/view', c.viewStatus);
router.get('/:id/viewers', c.getViewers);
router.post('/:id/reply', c.replyToStatus);
router.post('/:id/react', c.reactToStatus);

module.exports = router;
