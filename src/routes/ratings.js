const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/ratings');

router.post('/', authenticate, ctrl.createRating);
router.get('/user/:userId', ctrl.getUserRatings);

module.exports = router;