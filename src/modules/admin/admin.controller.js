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

// ── USERS ──────────────────────────────────────────────────
const getUsers   = async (req, res, next) => { try { ok(res, await service.getUsers(req.query)); } catch (e) { next(e); } };
const getUser    = async (req, res, next) => { try { ok(res, await service.getUser(req.params.id)); } catch (e) { next(e); } };
const updateRole = async (req, res, next) => { try { ok(res, await service.updateRole(req.params.id, req.body.role)); } catch (e) { next(e); } };
const muteUser   = async (req, res, next) => { try { ok(res, await service.muteUser(req.params.id)); } catch (e) { next(e); } };
const unmuteUser = async (req, res, next) => { try { ok(res, await service.unmuteUser(req.params.id)); } catch (e) { next(e); } };
const banUser    = async (req, res, next) => { try { ok(res, await service.banUser(req.params.id, req.body.reason)); } catch (e) { next(e); } };
const unbanUser  = async (req, res, next) => { try { ok(res, await service.unbanUser(req.params.id)); } catch (e) { next(e); } };
const kickUser   = async (req, res, next) => { try { ok(res, await service.kickUser(req.params.id, req.body.auctionId)); } catch (e) { next(e); } };

// ── FINANCE ────────────────────────────────────────────────
const getAdminTransactions  = async (req, res, next) => { try { ok(res, await service.getAdminTransactions(req.query)); } catch (e) { next(e); } };
const approveTransaction    = async (req, res, next) => { try { ok(res, await service.approveTransaction(req.params.id)); } catch (e) { next(e); } };
const rejectTransaction     = async (req, res, next) => { try { ok(res, await service.rejectTransaction(req.params.id)); } catch (e) { next(e); } };
const getP2pMessages        = async (req, res, next) => { try { ok(res, await service.getP2pMessages(req.params.id)); } catch (e) { next(e); } };
// ── ANALYTICS ─────────────────────────────────────────────
const getOverview     = async (req, res, next) => { try { ok(res, await service.getOverview()); } catch (e) { next(e); } };
const getRevenue      = async (req, res, next) => { try { ok(res, await service.getRevenue(req.query)); } catch (e) { next(e); } };
const getAuctionStats = async (req, res, next) => { try { ok(res, await service.getAuctionStats()); } catch (e) { next(e); } };
const getMarketStats  = async (req, res, next) => { try { ok(res, await service.getMarketStats()); } catch (e) { next(e); } };

module.exports = {
  getItems, getItem, approveItem, rejectItem,
  createSession, addAuction, removeAuction,
  startSession, pauseSession, resumeSession, stopSession,
  resetTimer, deleteBid,
  getUsers, getUser, updateRole,
  muteUser, unmuteUser, banUser, unbanUser, kickUser,
  getAdminTransactions, approveTransaction, rejectTransaction,
  getP2pMessages,
  getOverview, getRevenue, getAuctionStats, getMarketStats,
};