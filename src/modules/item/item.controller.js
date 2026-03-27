const service = require('./item.service');
const { ok, created } = require('../../utils/apiResponse');

const createItem = async (req, res, next) => {
  try { created(res, await service.createItem(req.user.id, req.body)); }
  catch (e) { next(e); }
};

const getItem = async (req, res, next) => {
  try { ok(res, await service.getItem(req.params.id)); }
  catch (e) { next(e); }
};

const getInventory = async (req, res, next) => {
  try { ok(res, await service.getInventory(req.user.id, req.query)); }
  catch (e) { next(e); }
};

const confirmReceipt = async (req, res, next) => {
  try { ok(res, await service.confirmReceipt(req.params.id, req.user.id)); }
  catch (e) { next(e); }
};

module.exports = { createItem, getItem, getInventory, confirmReceipt };