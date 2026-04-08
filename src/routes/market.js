const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/market');

router.get('/listings',              ctrl.getListings);
router.get('/listings/me/active',    authenticate, ctrl.getMyActiveListings);
router.get('/listings/:id',          ctrl.getListing);
router.post('/listings',             authenticate, ctrl.createListing);
router.delete('/listings/:id',       authenticate, ctrl.cancelListing);
router.post('/listings/:id/buy',     authenticate, ctrl.buyListing);
router.get('/listings/:id/messages', authenticate, ctrl.getMessages);
router.post('/listings/:id/messages', authenticate, ctrl.sendMessage);

module.exports = router;