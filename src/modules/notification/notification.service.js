const repo = require('./notification.repository');
const { pushNotification } = require('../../websocket/publishers/notificationPublisher');

const getNotifications = (userId, q) => repo.findByUser(userId, q);

const markRead = async (id, userId) => {
  const notif = await repo.markRead(id, userId);
  if (!notif) throw { errorCode: 'NOT_FOUND', status: 404, message: 'Thông báo không tồn tại.' };
  return notif;
};

const markAllRead = (userId) => repo.markAllRead(userId);

const countUnread = (userId) => repo.countUnread(userId);

/**
 * Dùng chung toàn app — tạo notification DB + push WS
 */
const send = async (userId, type, title, content, referenceId = null) => {
  const notif = await repo.create({ userId, type, title, content });
  
  const payload = {
    event: 'notification',
    notificationId: notif.id,
    userId: userId,
    type: type,
    title: title,
    content: content,
    createdAt: notif.created_at,
    referenceId: referenceId
  };

  pushNotification(userId, payload);
  return notif;
};

module.exports = { getNotifications, markRead, markAllRead, countUnread, send };