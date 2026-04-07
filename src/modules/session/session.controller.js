const service = require('./session.service');
const { ok } = require('../../utils/apiResponse');

const getSessions = async (req, res, next) => {
  try { ok(res, await service.getSessions(req.query)); }
  catch (e) { next(e); }
};

const getSession = async (req, res, next) => {
  try { ok(res, await service.getSession(req.params.id)); }
  catch (e) { next(e); }
};

const getSessionAuctions = async (req, res, next) => {
  try { ok(res, await service.getSessionAuctions(req.params.id)); }
  catch (e) { next(e); }
};

module.exports = { getSessions, getSession, getSessionAuctions };