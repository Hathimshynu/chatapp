const express = require('express');
const { protect } = require('../middleware/auth');
const { rateLimit, LIMITS } = require('../utils/rateLimit');
const friends = require('../controllers/friendController');

const router = express.Router();

router.get('/', protect, friends.listFriends);
router.get('/requests', protect, friends.listRequests);
router.get('/suggestions', protect, rateLimit(LIMITS.search), friends.suggestions);
router.post('/requests', protect, rateLimit(LIMITS.friendRequest), friends.sendRequest);
router.post('/requests/:id/accept', protect, friends.acceptRequest);
router.post('/requests/:id/decline', protect, friends.declineRequest);
router.delete('/requests/:id', protect, friends.cancelRequest);
router.delete('/:userId', protect, friends.unfriend);

module.exports = router;
