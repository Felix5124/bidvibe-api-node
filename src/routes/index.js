const router = require('express').Router();

router.use('/users', require('./users'));
router.use('/wallet', require('./wallet'));
router.use('/items', require('./items'));
router.use('/sessions', require('./sessions'));
router.use('/auctions', require('./auctions'));
router.use('/market', require('./market'));
router.use('/notifications', require('./notifications'));
router.use('/ratings', require('./ratings'));
router.use('/analytics', require('./analytics'));
router.use('/admin', require('./admin'));

module.exports = router;
