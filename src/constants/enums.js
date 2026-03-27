const UserRole = Object.freeze({ USER: 'USER', ADMIN: 'ADMIN' });

const ItemStatus = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  IN_AUCTION: 'IN_AUCTION',
  IN_INVENTORY: 'IN_INVENTORY',
  SHIPPED: 'SHIPPED',
  REJECTED: 'REJECTED',
});

const ItemRarity = Object.freeze({
  COMMON: 'COMMON',
  RARE: 'RARE',
  LEGENDARY: 'LEGENDARY',
});

const SessionType = Object.freeze({
  ENGLISH: 'ENGLISH',
  DUTCH: 'DUTCH',
  SEALED: 'SEALED',
});

const SessionStatus = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

const AuctionStatus = Object.freeze({
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
});

const ListingStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  SOLD: 'SOLD',
  CANCELLED: 'CANCELLED',
});

const TransactionType = Object.freeze({
  DEPOSIT: 'DEPOSIT',
  WITHDRAW: 'WITHDRAW',
  BID_LOCK: 'BID_LOCK',
  BID_UNLOCK: 'BID_UNLOCK',
  FINAL_PAYMENT: 'FINAL_PAYMENT',
  PLATFORM_FEE: 'PLATFORM_FEE',
});

const TransactionStatus = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const NotificationType = Object.freeze({
  OUTBID: 'OUTBID',
  AUCTION_WON: 'AUCTION_WON',
  WATCHLIST_ALERT: 'WATCHLIST_ALERT',
  FINANCE: 'FINANCE',
  MODERATION: 'MODERATION',
  ITEM_REJECTED: 'ITEM_REJECTED',
});

module.exports = {
  UserRole, ItemStatus, ItemRarity,
  SessionType, SessionStatus, AuctionStatus,
  ListingStatus, TransactionType, TransactionStatus,
  NotificationType,
};