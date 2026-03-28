const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const { bidLimiter }   = require('../../middlewares/rateLimiter.middleware');
const ctrl = require('./auction.controller');

router.get('/:id',             ctrl.getAuction);
router.get('/:id/bids',        ctrl.getBids);
router.get('/:id/messages',    ctrl.getMessages);
router.post('/:id/bids',       authenticate, bidLimiter, ctrl.placeBid);
router.post('/:id/proxy-bid',  authenticate, ctrl.setProxyBid);
router.delete('/:id/proxy-bid', authenticate, ctrl.cancelProxyBid);
router.post('/:id/messages',   authenticate, ctrl.sendMessage);
router.post('/:id/buy',        authenticate, ctrl.buyDutch);
router.post('/:id/sealed-bid', authenticate, ctrl.placeSealedBid);

module.exports = router;