const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const {
  getConversations,
  getMessages,
  sendMessage,
  deleteMessage
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

router.get('/conversations', protect, getConversations);
router.post('/send', protect, sendMessage);
router.delete('/:messageId', protect, deleteMessage);
// ✅ Get single message — for fetching full image after Pusher notification
router.get('/single/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId)
    .populate('sender', 'name avatar');
    if (!message) return res.status(404).json({ message: 'Not found' });
    const conversation = await require('../models/Conversation').findOne({
      _id: message.conversationId,
      participants: req.user._id,
    });
    if (!conversation) return res.status(403).json({ message: 'Access denied' });
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get('/:conversationId', protect, getMessages);

module.exports = router;