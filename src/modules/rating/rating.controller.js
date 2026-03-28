const service = require('./rating.service');
const { created } = require('../../utils/apiResponse');

const createRating = async (req, res, next) => {
  try { created(res, await service.createRating(req.user.id, req.body)); }
  catch (e) { next(e); }
};

module.exports = { createRating };