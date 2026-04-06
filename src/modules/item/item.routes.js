const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./item.controller');

// Chú ý: /me/inventory phải đứng TRƯỚC /:id
router.get('/me/inventory', authenticate, ctrl.getInventory);
router.post('/', authenticate, ctrl.createItem);
router.post('/list-on-market', authenticate, ctrl.listOnMarket);
router.get('/:id', ctrl.getItem);
router.patch('/:id/confirm-receipt', authenticate, ctrl.confirmReceipt);
router.delete('/:id', authenticate, ctrl.deleteItem);

module.exports = router;
