const repo = require('./session.repository');
const { ErrorCode } = require('../../constants/errorCodes');

const getSessions = (q) => repo.findAll(q);

const getSession = async (id) => {
  const session = await repo.findById(id);
  if (!session) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Phiên đấu giá không tồn tại.' };
  return session;
};

const getSessionAuctions = async (sessionId) => {
  await getSession(sessionId);
  return repo.findAuctions(sessionId);
};

module.exports = { getSessions, getSession, getSessionAuctions };