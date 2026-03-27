const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const pusher = require('../config/pusher');

const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id
    })
      .populate('participants', '-password')
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
    }).populate('sender', 'name avatar');

    // Mark as seen
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
    const { receiverId, text, image, messageType } = req.body;

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
      messageType: messageType || 'text',
      seen: [req.user._id]
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      updatedAt: new Date()
    });

    const populatedMessage = await message.populate('sender', 'name avatar');

    // ✅ Check if avatar is base64 — if so don't send through Pusher
    const senderAvatarIsBase64 = (req.user.avatar || '').startsWith('data:');

    // ✅ Pusher payload — STRICT 10KB limit
    // Never include: image data, base64 avatars, large text
    const pusherPayload = {
      messageId:      populatedMessage._id.toString(),
      conversationId: conversation._id.toString(),
      text:           (text || '').slice(0, 500), // max 500 chars
      hasImage:       !!(image),
      messageType:    messageType || 'text',
      createdAt:      populatedMessage.createdAt,
      seen:           populatedMessage.seen,
      sender: {
        _id:    req.user._id.toString(),
        name:   (req.user.name || '').slice(0, 50),
        // ✅ Only send avatar if it's a URL not base64
        avatar: senderAvatarIsBase64 ? '' : (req.user.avatar || '')
      }
    };
    const payloadSize = JSON.stringify(pusherPayload).length;
    console.log('Pusher payload size:', payloadSize, 'bytes');

    // ✅ Trigger receiver
    try {
      await pusher.trigger(`user-${receiverId}`, 'new-message', pusherPayload);
    } catch (pusherErr) {
      console.error('Pusher trigger receiver error:', pusherErr.message);
      // Don't fail the whole request if Pusher fails
    }

    // ✅ Trigger sender sidebar
    try {
      await pusher.trigger(`user-${req.user._id}`, 'message-sent', pusherPayload);
    } catch (pusherErr) {
      console.error('Pusher trigger sender error:', pusherErr.message);
    }

    // ✅ Always return full message to sender (includes image data)
    res.status(201).json({
      message: populatedMessage,
      conversationId: conversation._id
    });

  } catch (error) {
    console.error('sendMessage error:', error);
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