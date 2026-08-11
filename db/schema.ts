import { sql } from "drizzle-orm";
import { integer, pgTable, varchar, timestamp, boolean, serial } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  barcode: varchar("barcode", { length: 100 }).unique(),
  stock: integer("stock").notNull().default(0),
  cost: integer("cost").notNull(),
  price: integer("price").notNull(),
  minStock: integer("min_stock").notNull().default(300),
  unit: varchar("unit", { length: 50 }).notNull().default("unidad"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const movements = pgTable("movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  type: varchar("type", { length: 50 }).$type<"initial" | "entry" | "output">().notNull(),
  quantity: integer("quantity").notNull(),
  delta: integer("delta").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  lot: varchar("lot", { length: 100 }),
  expirationDate: varchar("expiration_date", { length: 50 }),
  note: varchar("note", { length: 500 }),
  source: varchar("source", { length: 50 }).$type<"manual" | "scanner">().notNull().default("manual"),
  reference: varchar("reference", { length: 100 }).unique(),
  userId: varchar("user_id", { length: 100 }).notNull(),
  userName: varchar("user_name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appUsers = pgTable("app_users_v2", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  username: varchar("username", { length: 255 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  passwordSalt: varchar("password_salt", { length: 255 }),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  role: varchar("role", { length: 50 }).$type<"owner" | "admin" | "warehouse" | "dispatch" | "viewer">().notNull(),
  canViewCost: boolean("can_view_cost").notNull().default(false),
  canManageUsers: boolean("can_manage_users").notNull().default(false),
  active: boolean("active").notNull().default(false),
  systemAccount: boolean("system_account").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appSessions = pgTable("app_sessions_v2", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
