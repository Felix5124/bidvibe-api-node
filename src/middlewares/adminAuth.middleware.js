const { error } = require('../utils/apiResponse');
const { ErrorCode } = require('../constants/errorCodes');

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return error(res, 'Không có quyền truy cập.', ErrorCode.FORBIDDEN, 403);
  }
  next();
};

module.exports = { requireAdmin };