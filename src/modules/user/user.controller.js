const service = require('./user.service');
const { ok } = require('../../utils/apiResponse');

const getMe = async (req, res, next) => {
  try { ok(res, await service.getMe(req.user.id)); }
  catch (e) { next(e); }
};

const updateMe = async (req, res, next) => {
  try { ok(res, await service.updateMe(req.user.id, req.body)); }
  catch (e) { next(e); }
};

const getPublicProfile = async (req, res, next) => {
  try { ok(res, await service.getPublicProfile(req.params.id)); }
  catch (e) { next(e); }
};

const getUserRatings = async (req, res, next) => {
  try { ok(res, await service.getUserRatings(req.params.id, req.query)); }
  catch (e) { next(e); }
};

const getWatchlist = async (req, res, next) => {
  try { ok(res, await service.getWatchlist(req.user.id, req.query)); }
  catch (e) { next(e); }
};

const addToWatchlist = async (req, res, next) => {
  try { ok(res, await service.addToWatchlist(req.user.id, req.body.itemId)); }
  catch (e) { next(e); }
};

const removeFromWatchlist = async (req, res, next) => {
  try { ok(res, await service.removeFromWatchlist(req.user.id, req.params.itemId)); }
  catch (e) { next(e); }
};

module.exports = {
  getMe, updateMe, getPublicProfile,
  getUserRatings, getWatchlist, addToWatchlist, removeFromWatchlist,
};