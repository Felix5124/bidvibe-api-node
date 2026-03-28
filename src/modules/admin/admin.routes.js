const router = require('express').Router();
const { authenticate }  = require('../../middlewares/auth.middleware');
const { requireAdmin }  = require('../../middlewares/adminAuth.middleware');
const ctrl = require('./admin.controller');

// Tất cả admin routes đều cần login + role ADMIN
router.use(authenticate, requireAdmin);

// Items
router.get('/items',                    ctrl.getItems);
router.get('/items/:id',                ctrl.getItem);
router.post('/items/:id/approve',       ctrl.approveItem);
router.post('/items/:id/reject',        ctrl.rejectItem);

// Sessions
router.post('/sessions',                          ctrl.createSession);
router.post('/sessions/:id/auctions',             ctrl.addAuction);
router.delete('/sessions/:id/auctions/:auctionId', ctrl.removeAuction);
router.post('/sessions/:id/start',                ctrl.startSession);
router.post('/sessions/:id/pause',                ctrl.pauseSession);
router.post('/sessions/:id/resume',               ctrl.resumeSession);
router.post('/sessions/:id/stop',                 ctrl.stopSession);
router.post('/sessions/:id/auctions/:auctionId/reset-timer', ctrl.resetTimer);
router.delete('/auctions/:auctionId/bids/:bidId', ctrl.deleteBid);

module.exports = router;