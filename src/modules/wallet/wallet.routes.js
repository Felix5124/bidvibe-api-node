const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./wallet.controller');

// Tất cả wallet routes đều cần login
router.use(authenticate);

router.get('/', ctrl.getWallet);
router.post('/deposit', ctrl.createDeposit);
router.post('/withdraw', ctrl.createWithdraw);
router.get('/transactions', ctrl.getTransactions);

module.exports = router;