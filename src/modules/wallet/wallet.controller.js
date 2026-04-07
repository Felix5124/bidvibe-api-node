const service = require('./wallet.service');
const { ok, created } = require('../../utils/apiResponse');

const getWallet = async (req, res, next) => {
  try { ok(res, await service.getWallet(req.user.id)); }
  catch (e) { next(e); }
};

const createDeposit = async (req, res, next) => {
  try { created(res, await service.createDeposit(req.user.id, req.body.amount)); }
  catch (e) { next(e); }
};

const createWithdraw = async (req, res, next) => {
  try { created(res, await service.createWithdraw(req.user.id, req.body)); }
  catch (e) { next(e); }
};

const getTransactions = async (req, res, next) => {
  try { ok(res, await service.getTransactions(req.user.id, req.query)); }
  catch (e) { next(e); }
};

module.exports = { getWallet, createDeposit, createWithdraw, getTransactions };