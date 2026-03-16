const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const pusher = require('../config/pusher');

const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id
    })
      .populate('participants', '-password')  // ✅ includes avatar
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name avatar' }
      })
      .sort({ updatedAt: -1 });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({
      conversationId: req.params.conversationId
    }).populate('sender', 'name avatar');  // ✅ includes avatar

    // Mark as seen + trigger seen event
    const unseenMessages = await Message.find({
      conversationId: req.params.conversationId,
      sender: { $ne: req.user._id },
      seen: { $ne: req.user._id }
    });

    if (unseenMessages.length > 0) {
      await Message.updateMany(
        {
          conversationId: req.params.conversationId,
          sender: { $ne: req.user._id },
          seen: { $ne: req.user._id }
        },
        { $push: { seen: req.user._id } }
      );

      const senderId = unseenMessages[0].sender.toString();
      pusher.trigger(`user-${senderId}`, 'messages-seen', {
        conversationId: req.params.conversationId,
        seenBy: req.user._id
      });
    }

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, text, image, messageType } = req.body;  // ✅ include messageType

    if (!receiverId) {
      return res.status(400).json({ message: 'Receiver is required' });
    }

    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [req.user._id, receiverId], $size: 2 }
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, receiverId],
        isGroup: false
      });
    }

    const message = await Message.create({
      conversationId: conversation._id,
      sender: req.user._id,
      text: text || '',
      image: image || '',
      messageType: messageType || 'text',  // ✅ save messageType
      seen: [req.user._id]
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      updatedAt: new Date()
    });

    const populatedMessage = await message.populate('sender', 'name avatar');

    // ✅ Pusher — send to receiver
    pusher.trigger(`user-${receiverId}`, 'new-message', {
      message: populatedMessage,
      conversationId: conversation._id.toString(),
      sender: {
        _id: req.user._id,
        name: req.user.name,
        avatar: req.user.avatar  // ✅ include avatar
      }
    });

    // ✅ Pusher — update sender sidebar
    pusher.trigger(`user-${req.user._id}`, 'message-sent', {
      message: populatedMessage,
      conversationId: conversation._id.toString()
    });

    res.status(201).json({
      message: populatedMessage,
      conversationId: conversation._id
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Not found' });
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    message.deleted = true;
    message.text = 'This message was deleted';
    message.image = '';
    await message.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getConversations, getMessages, sendMessage, deleteMessage };