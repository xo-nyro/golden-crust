// Constants and defaults shared by storage, seed data and the UI.

export const APP_ID = 'golden-crust';
export const SCHEMA_VERSION = 1;

export const KEYS = {
  products: 'gc_products_v1',
  transactions: 'gc_transactions_v1',
  inventory: 'gc_inventory_v1',
  expenses: 'gc_expenses_v1',
  settings: 'gc_settings_v1',
  audit: 'gc_audit_v1',
};
// UI-only preferences (sidebar state). Not business data, so not part of backups.
export const UI_KEY = 'gc_ui_v1';
export const CART_KEY = 'gc_cart_session_v1';

export const PRODUCT_CATEGORIES = ['Bread', 'Pastries', 'Doughnuts', 'Cakes', 'Cookies', 'Drinks'];

export const PAYMENT_METHODS = {
  cash: { label: 'Cash', icon: 'cash' },
  transfer: { label: 'Bank Transfer', icon: 'bank' },
  card: { label: 'Card / POS Terminal', icon: 'card' },
};

export const EXPENSE_CATEGORIES = ['Ingredients', 'Packaging', 'Electricity', 'Gas', 'Staff', 'Delivery', 'Maintenance', 'Rent', 'Other'];
export const EXPENSE_PAYMENT_METHODS = { cash: 'Cash', transfer: 'Bank Transfer', card: 'Card', other: 'Other' };

export const TX_STATUS = {
  completed: { label: 'Completed', tone: 'success' },
  partially_refunded: { label: 'Part refunded', tone: 'warning' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const MOVEMENT_TYPES = {
  initial: { label: 'Opening stock', tone: 'neutral' },
  sale: { label: 'Sale', tone: 'neutral' },
  restock: { label: 'Restock', tone: 'success' },
  adjustment: { label: 'Adjustment', tone: 'info' },
  waste: { label: 'Waste / damage', tone: 'danger' },
  return: { label: 'Returned to stock', tone: 'warning' },
};

export const STOCK_STATUS = {
  in: { label: 'In Stock', tone: 'success' },
  low: { label: 'Low Stock', tone: 'warning' },
  out: { label: 'Out of Stock', tone: 'danger' },
  untracked: { label: 'Not Tracked', tone: 'neutral' },
};

export const CURRENCIES = [['NGN', 'NGN — Nigerian naira (₦)'], ['GHS', 'GHS — Ghanaian cedi'], ['USD', 'USD — US dollar'], ['GBP', 'GBP — British pound'], ['EUR', 'EUR — Euro']];
export const LOCALES = [['en-NG', 'English (Nigeria)'], ['en-GB', 'English (United Kingdom)'], ['en-US', 'English (United States)']];
export const DATE_FORMATS = [['dmy', 'DD/MM/YYYY'], ['mdy', 'MM/DD/YYYY'], ['long', '28 Oct 2026'], ['iso', 'YYYY-MM-DD']];
export const TIME_FORMATS = [['12h', '12-hour (2:30 PM)'], ['24h', '24-hour (14:30)']];

export function defaultSettings() {
  return {
    business: {
      name: 'Golden Crust',
      tagline: 'Freshly baked. Beautifully managed.',
      phone: '+234 803 000 0000',
      email: 'hello@goldencrust.example',
      address: '12 Admiralty Way, Lekki Phase 1, Lagos',
      logoUrl: '',
      receiptFooter: 'Thank you for choosing Golden Crust. See you again soon!',
    },
    regional: { currency: 'NGN', locale: 'en-NG', dateFormat: 'dmy', timeFormat: '12h' },
    pos: {
      defaultPaymentMethod: 'cash',
      receiptMode: 'ask',          // 'ask' = offer to print after each sale, 'auto' = open print dialog
      allowDiscounts: true,
      maxDiscountPercent: 20,
      defaultLowStockThreshold: 10,
    },
  };
}
