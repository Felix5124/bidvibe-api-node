const ok = (res, data, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({ success: true, data, message });

const created = (res, data, message = 'Created') =>
  res.status(201).json({ success: true, data, message });

const error = (res, message, errorCode, statusCode = 400) =>
  res.status(statusCode).json({ success: false, data: null, message, errorCode });

module.exports = { ok, created, error };