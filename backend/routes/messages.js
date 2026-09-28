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
  clearConversation,
  togglePin,
  toggleMute,
  getCallHistory
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Static paths first so they are not captured by the /:conversationId routes.
router.get('/conversations', getConversations);
router.get('/unread-count', getUnreadCount);
router.get('/calls/history', getCallHistory);
router.post('/send', sendMessage);
router.get('/single/:messageId', getSingleMessage);

router.post('/conversation/:conversationId/clear', clearConversation);
router.post('/conversation/:conversationId/pin', togglePin);
router.post('/conversation/:conversationId/mute', toggleMute);

router.patch('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);
router.post('/:messageId/react', reactToMessage);

router.get('/:conversationId/media', getSharedMedia);
router.post('/:conversationId/read', markConversationRead);
router.get('/:conversationId', getMessages);

module.exports = router;
