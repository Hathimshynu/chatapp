const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/groupController');
const { rateLimit, LIMITS } = require('../utils/rateLimit');

const router = express.Router();
router.use(protect);

// Invite routes first so "invite" is never parsed as a group id.
router.get('/invite/:code', c.previewInvite);
router.post('/invite/:code/join', rateLimit(LIMITS.groupMembers), c.joinByInvite);

router.post('/', rateLimit(LIMITS.groupCreate), c.createGroup);
router.get('/:id', c.getGroup);
router.patch('/:id', c.updateInfo);
router.delete('/:id', c.deleteGroup);
router.patch('/:id/settings', c.updateSettings);
router.post('/:id/members', rateLimit(LIMITS.groupMembers), c.addMembers);
router.delete('/:id/members/:userId', c.removeMember);
router.post('/:id/admins/:userId', c.promote);
router.delete('/:id/admins/:userId', c.demote);
router.post('/:id/leave', c.leaveGroup);
router.post('/:id/invite', rateLimit(LIMITS.groupInvite), c.resetInvite);
router.delete('/:id/invite', c.revokeInvite);

module.exports = router;
