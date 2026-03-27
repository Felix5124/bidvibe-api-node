const generateTransferCode = () => {
  const prefix = process.env.TRANSFER_CODE_PREFIX || 'BV';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}${date}${rand}`;
};

module.exports = { generateTransferCode };