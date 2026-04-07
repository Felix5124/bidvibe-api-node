const router = require("express").Router();
const { authenticate } = require("../../middlewares/auth.middleware");
const { requireAdmin } = require("../../middlewares/adminAuth.middleware");
const ctrl = require("./admin.controller");

// Tất cả admin routes đều cần login + role ADMIN
router.use(authenticate, requireAdmin);

// Items
router.get("/items", ctrl.getItems);
router.get("/items/:id", ctrl.getItem);
router.post("/items/:id/approve", ctrl.approveItem);
router.post("/items/:id/reject", ctrl.rejectItem);

// Sessions
router.get("/sessions", ctrl.getSessions);
router.get("/sessions/:id", ctrl.getSession);
router.get("/sessions/:id/auctions", ctrl.getSessionAuctions);
router.post("/sessions", ctrl.createSession);
router.post("/sessions/:id/auctions", ctrl.addAuction);
router.delete("/sessions/:id/auctions/:auctionId", ctrl.removeAuction);
router.post("/sessions/:id/start", ctrl.startSession);
router.post("/sessions/:id/pause", ctrl.pauseSession);
router.post("/sessions/:id/resume", ctrl.resumeSession);
router.post("/sessions/:id/stop", ctrl.stopSession);
router.post("/sessions/:id/auctions/:auctionId/reset-timer", ctrl.resetTimer);
router.delete("/auctions/:auctionId/bids/:bidId", ctrl.deleteBid);

// Users
router.get("/users", ctrl.getUsers);
router.get("/users/:id", ctrl.getUser);
router.patch("/users/:id/role", ctrl.updateRole);
router.post("/users/:id/mute", ctrl.muteUser);
router.post("/users/:id/unmute", ctrl.unmuteUser);
router.post("/users/:id/ban", ctrl.banUser);
router.post("/users/:id/unban", ctrl.unbanUser);
router.post("/users/:id/kick", ctrl.kickUser);

// Finance
router.get("/transactions", ctrl.getAdminTransactions);
router.get("/transactions/pending", ctrl.getPendingTransactions);
router.post("/transactions/:id/approve-deposit", ctrl.approveDeposit);
router.post("/transactions/:id/reject-deposit", ctrl.rejectDeposit);
router.post("/transactions/:id/approve-withdraw", ctrl.approveWithdraw);
router.post("/transactions/:id/reject-withdraw", ctrl.rejectWithdraw);
router.post("/transactions/:id/approve", ctrl.approveTransaction);
router.post("/transactions/:id/reject", ctrl.rejectTransaction);
router.get("/market/listings/:id/messages", ctrl.getP2pMessages);
router.get("/shipping-requests", ctrl.getShippingRequests);
router.post("/shipping-requests/:id/approve", ctrl.approveShippingRequest);
router.post("/shipping-requests/:id/reject", ctrl.rejectShippingRequest);

// Analytics
router.get("/analytics/overview", ctrl.getOverview);
router.get("/analytics/revenue", ctrl.getRevenue);
router.get("/analytics/auctions", ctrl.getAuctionStats);
router.get("/analytics/market", ctrl.getMarketStats);

module.exports = router;
