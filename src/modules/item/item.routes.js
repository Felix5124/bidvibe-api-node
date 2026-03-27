const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./item.controller');

// Chú ý: /me/inventory phải đứng TRƯỚC /:id
router.get('/me/inventory', authenticate, ctrl.getInventory);
router.post('/', authenticate, ctrl.createItem);
router.get('/:id', ctrl.getItem);
router.patch('/:id/confirm-receipt', authenticate, ctrl.confirmReceipt);

module.exports = router;
