const service = require('./market.service');
const { ok, created } = require('../../utils/apiResponse');

const getListings   = async (req, res, next) => { try { ok(res, await service.getListings(req.query)); } catch (e) { next(e); } };
const getListing    = async (req, res, next) => { try { ok(res, await service.getListing(req.params.id)); } catch (e) { next(e); } };
const createListing = async (req, res, next) => { try { created(res, await service.createListing(req.user.id, req.body)); } catch (e) { next(e); } };
const cancelListing = async (req, res, next) => { try { ok(res, await service.cancelListing(req.params.id, req.user.id)); } catch (e) { next(e); } };
const buyListing    = async (req, res, next) => { try { ok(res, await service.buyListing(req.params.id, req.user.id)); } catch (e) { next(e); } };
const getMessages   = async (req, res, next) => { try { ok(res, await service.getMessages(req.params.id, req.user.id)); } catch (e) { next(e); } };
const sendMessage   = async (req, res, next) => { try { created(res, await service.sendMessage(req.params.id, req.user.id, req.body.content)); } catch (e) { next(e); } };

module.exports = { getListings, getListing, createListing, cancelListing, buyListing, getMessages, sendMessage };