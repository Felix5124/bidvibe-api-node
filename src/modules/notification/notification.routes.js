const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./notification.controller');

router.use(authenticate);

router.get('/',             ctrl.getNotifications);
router.get('/unread-count', ctrl.countUnread);
router.post('/read-all',    ctrl.markAllRead);
router.patch('/:id/read',   ctrl.markRead);

module.exports = router;