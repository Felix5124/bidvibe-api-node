const service = require('./notification.service');
const { ok } = require('../../utils/apiResponse');

const getNotifications = async (req, res, next) => {
  try { ok(res, await service.getNotifications(req.user.id, req.query)); }
  catch (e) { next(e); }
};

const markRead = async (req, res, next) => {
  try { ok(res, await service.markRead(req.params.id, req.user.id)); }
  catch (e) { next(e); }
};

const markAllRead = async (req, res, next) => {
  try {
    await service.markAllRead(req.user.id);
    ok(res, null, 'Đã đánh dấu tất cả đã đọc.');
  }
  catch (e) { next(e); }
};

const countUnread = async (req, res, next) => {
  try { ok(res, { count: await service.countUnread(req.user.id) }); }
  catch (e) { next(e); }
};

module.exports = { getNotifications, markRead, markAllRead, countUnread };