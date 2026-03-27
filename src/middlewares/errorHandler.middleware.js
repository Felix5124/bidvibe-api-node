const { ErrorCode } = require('../constants/errorCodes');

const errorHandler = (err, req, res, next) => {
  console.error('[GlobalError]', err);

  if (err.errorCode) {
    return res.status(err.status || 400).json({
      success: false,
      data: null,
      message: err.message || 'Đã xảy ra lỗi.',
      errorCode: err.errorCode,
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      data: null,
      message: 'Dữ liệu đã tồn tại.',
      errorCode: ErrorCode.CONFLICT,
    });
  }

  return res.status(500).json({
    success: false,
    data: null,
    message: 'Lỗi máy chủ nội bộ.',
    errorCode: ErrorCode.INTERNAL_ERROR,
  });
};

module.exports = { errorHandler };