const service = require('./admin.service');
const { ok, created } = require('../../utils/apiResponse');

// ── ITEMS ──────────────────────────────────────────────────
const getItems    = async (req, res, next) => { try { ok(res, await service.getItems(req.query)); } catch (e) { next(e); } };
const getItem     = async (req, res, next) => { try { ok(res, await service.getItem(req.params.id)); } catch (e) { next(e); } };
const approveItem = async (req, res, next) => { try { ok(res, await service.approveItem(req.params.id, req.body)); } catch (e) { next(e); } };
const rejectItem  = async (req, res, next) => { try { ok(res, await service.rejectItem(req.params.id, req.body.reason)); } catch (e) { next(e); } };

// ── SESSIONS ───────────────────────────────────────────────
const createSession  = async (req, res, next) => { try { created(res, await service.createSession(req.body)); } catch (e) { next(e); } };
const addAuction     = async (req, res, next) => { try { created(res, await service.addAuction(req.params.id, req.body)); } catch (e) { next(e); } };
const removeAuction  = async (req, res, next) => { try { ok(res, await service.removeAuction(req.params.auctionId)); } catch (e) { next(e); } };
const startSession   = async (req, res, next) => { try { ok(res, await service.startSession(req.params.id)); } catch (e) { next(e); } };
const pauseSession   = async (req, res, next) => { try { ok(res, await service.pauseSession(req.params.id)); } catch (e) { next(e); } };
const resumeSession  = async (req, res, next) => { try { ok(res, await service.resumeSession(req.params.id)); } catch (e) { next(e); } };
const stopSession    = async (req, res, next) => { try { ok(res, await service.stopSession(req.params.id)); } catch (e) { next(e); } };
const resetTimer     = async (req, res, next) => { try { ok(res, await service.resetTimer(req.params.auctionId)); } catch (e) { next(e); } };
const deleteBid      = async (req, res, next) => { try { ok(res, await service.deleteBid(req.params.bidId)); } catch (e) { next(e); } };

module.exports = {
  getItems, getItem, approveItem, rejectItem,
  createSession, addAuction, removeAuction,
  startSession, pauseSession, resumeSession, stopSession,
  resetTimer, deleteBid,
};