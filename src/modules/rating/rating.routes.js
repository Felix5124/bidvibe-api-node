const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./rating.controller');

router.post('/', authenticate, ctrl.createRating);

module.exports = router;