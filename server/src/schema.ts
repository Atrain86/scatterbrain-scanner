import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const receipts = sqliteTable('receipts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeName: text('store_name').notNull(),
  receiptDate: text('receipt_date').notNull(), // YYYY-MM-DD
  subtotal: real('subtotal').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  total: real('total').notNull().default(0),
  category: text('category').notNull().default('Other'),
  clientName: text('client_name').default(''),
  lineItems: text('line_items'),        // JSON: saved (selected) items
  rawLineItems: text('raw_line_items'), // JSON: full original scan — never trimmed
  taxLines: text('tax_lines'),          // JSON: [{label, amount}]
  imagePath: text('image_path'),
  imageUrl: text('image_url'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;

export const scanLogs = sqliteTable('scan_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scannedAt: text('scanned_at').default(sql`(datetime('now'))`),
  promptTokens: integer('prompt_tokens').default(0),
  completionTokens: integer('completion_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  model: text('model').default(''),
  success: integer('success').default(1),
});
