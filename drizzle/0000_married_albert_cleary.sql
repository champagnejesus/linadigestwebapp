CREATE TABLE "app_sessions_v2" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"username" varchar(255),
	"password_hash" varchar(255),
	"password_salt" varchar(255),
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"role" varchar(50) NOT NULL,
	"can_view_cost" boolean DEFAULT false NOT NULL,
	"can_manage_users" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"system_account" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "app_users_v2_email_unique" UNIQUE("email"),
	CONSTRAINT "app_users_v2_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"quantity" integer NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(255) NOT NULL,
	"lot" varchar(100),
	"expiration_date" varchar(50),
	"note" varchar(500),
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"reference" varchar(100),
	"user_id" varchar(100) NOT NULL,
	"user_name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "movements_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(100) NOT NULL,
	"barcode" varchar(100),
	"stock" integer DEFAULT 0 NOT NULL,
	"cost" integer NOT NULL,
	"price" integer NOT NULL,
	"min_stock" integer DEFAULT 300 NOT NULL,
	"unit" varchar(50) DEFAULT 'unidad' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_barcode_unique" UNIQUE("barcode")
);
