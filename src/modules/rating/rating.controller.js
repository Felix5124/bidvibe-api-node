const service = require('./rating.service');
const { ok, created } = require('../../utils/apiResponse');

const createRating = async (req, res, next) => {
  try { created(res, await service.createRating(req.user.id, req.body)); }
  catch (e) { next(e); }
};

const getUserRatings = async (req, res, next) => {
  try { ok(res, await service.getUserRatings(req.params.userId)); }
  catch (e) { next(e); }
};

module.exports = { createRating, getUserRatings };