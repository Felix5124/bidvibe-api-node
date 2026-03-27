const router = require('express').Router();
const ctrl = require('./session.controller');

// Tất cả public — không cần auth
router.get('/',                  ctrl.getSessions);
router.get('/:id',               ctrl.getSession);
router.get('/:id/auctions',      ctrl.getSessionAuctions);

module.exports = router;