const repo = require('./user.repository');
const { ErrorCode } = require('../../constants/errorCodes');

const getMe = async (userId) => {
  const user = await repo.findById(userId);
  if (!user) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'User không tồn tại.' };
  return user;
};

const updateMe = (userId, body) => repo.update(userId, body);

const getPublicProfile = async (userId) => {
  const user = await repo.findPublicById(userId);
  if (!user) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'User không tồn tại.' };
  return user;
};

const getUserRatings      = (userId, q) => repo.findRatings(userId, q);
const getWatchlist        = (userId, q) => repo.findWatchlist(userId, q);
const addToWatchlist      = (userId, itemId) => repo.addWatchlist(userId, itemId);
const removeFromWatchlist = (userId, itemId) => repo.removeWatchlist(userId, itemId);

module.exports = {
  getMe, updateMe, getPublicProfile,
  getUserRatings, getWatchlist, addToWatchlist, removeFromWatchlist,
};