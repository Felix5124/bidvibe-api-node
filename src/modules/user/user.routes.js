const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./user.controller');

router.get('/me', authenticate, ctrl.getMe);
router.put('/me', authenticate, ctrl.updateMe);
router.get('/me/watchlist', authenticate, ctrl.getWatchlist);
router.post('/me/watchlist', authenticate, ctrl.addToWatchlist);
router.delete('/me/watchlist/:itemId', authenticate, ctrl.removeFromWatchlist);
router.get('/:id', ctrl.getPublicProfile);
router.get('/:id/ratings', ctrl.getUserRatings);

module.exports = router;