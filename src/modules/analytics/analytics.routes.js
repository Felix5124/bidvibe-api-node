const router = require('express').Router();
const ctrl   = require('./analytics.controller');

// Public — không cần auth
router.get('/items/:id/price-history', ctrl.getPriceHistory);

module.exports = router;