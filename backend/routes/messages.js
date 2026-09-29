const express = require('express');
const router = express.Router();
const {
  getConversations,
  getUnreadCount,
  getMessages,
  getSharedMedia,
  sendMessage,
  markConversationRead,
  editMessage,
  deleteMessage,
  reactToMessage,
  getSingleMessage,
  getMessageInfo,
  clearConversation,
  togglePin,
  toggleMute,
  toggleArchive,
  getCallHistory
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const { rateLimit, LIMITS } = require('../utils/rateLimit');

router.use(protect);

// Static paths first so they are not captured by the /:conversationId routes.
router.get('/conversations', getConversations);
router.get('/unread-count', getUnreadCount);
router.get('/calls/history', getCallHistory);
router.post('/send', rateLimit(LIMITS.send), sendMessage);
router.get('/single/:messageId', getSingleMessage);

router.post('/conversation/:conversationId/clear', clearConversation);
router.post('/conversation/:conversationId/pin', togglePin);
router.post('/conversation/:conversationId/mute', toggleMute);
router.post('/conversation/:conversationId/archive', toggleArchive);

router.patch('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);
router.post('/:messageId/react', reactToMessage);
router.get('/:messageId/info', getMessageInfo);

router.get('/:conversationId/media', getSharedMedia);
router.post('/:conversationId/read', markConversationRead);
router.get('/:conversationId', getMessages);

module.exports = router;
