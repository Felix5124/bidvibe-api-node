const service = require('./analytics.service');
const { ok }  = require('../../utils/apiResponse');

const getPriceHistory = async (req, res, next) => {
  try { ok(res, await service.getPriceHistory(req.params.id)); }
  catch (e) { next(e); }
};

module.exports = { getPriceHistory };