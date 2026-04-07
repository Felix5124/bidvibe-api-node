const service = require('./auction.service');
const { ok, created } = require('../../utils/apiResponse');

const getAuction     = async (req, res, next) => { try { ok(res, await service.getAuction(req.params.id)); } catch (e) { next(e); } };
const getBids        = async (req, res, next) => { try { ok(res, await service.getBids(req.params.id, req.query)); } catch (e) { next(e); } };
const getMessages    = async (req, res, next) => { try { ok(res, await service.getMessages(req.params.id, req.query)); } catch (e) { next(e); } };
const placeBid       = async (req, res, next) => { try { created(res, await service.placeBid(req.params.id, req.user.id, req.body.amount)); } catch (e) { next(e); } };
const setProxyBid    = async (req, res, next) => { try { ok(res, await service.setProxyBid(req.params.id, req.user.id, req.body.maxAmount)); } catch (e) { next(e); } };
const cancelProxyBid = async (req, res, next) => { try { ok(res, await service.cancelProxyBid(req.params.id, req.user.id)); } catch (e) { next(e); } };
const sendMessage    = async (req, res, next) => { try { created(res, await service.sendMessage(req.params.id, req.user.id, req.body.content)); } catch (e) { next(e); } };
const buyDutch       = async (req, res, next) => { try { ok(res, await service.buyDutch(req.params.id, req.user.id)); } catch (e) { next(e); } };
const placeSealedBid = async (req, res, next) => { try { created(res, await service.placeSealedBid(req.params.id, req.user.id, req.body.amount)); } catch (e) { next(e); } };

module.exports = { getAuction, getBids, getMessages, placeBid, setProxyBid, cancelProxyBid, sendMessage, buyDutch, placeSealedBid };