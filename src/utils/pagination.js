const pageResponse = (rows, total, page, size) => ({
  content: rows,
  page: Number(page),
  size: Number(size),
  totalElements: Number(total),
  totalPages: Math.ceil(total / size),
});

const parsePagination = (q) => ({
  page: Math.max(0, parseInt(q.page) || 0),
  size: Math.min(100, parseInt(q.size) || 20),
});

module.exports = { pageResponse, parsePagination };