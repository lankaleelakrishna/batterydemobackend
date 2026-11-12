import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialVoltenSchema1794481463315 implements MigrationInterface {
    name = 'InitialVoltenSchema1794481463315'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(100) NOT NULL, "full_name" character varying(120) NOT NULL, "phone" character varying(20), "role" character varying(16) NOT NULL DEFAULT 'customer', "is_active" boolean NOT NULL DEFAULT true, "token_version" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "addresses" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "user_id" integer NOT NULL, "full_name" character varying(120) NOT NULL, "phone" character varying(20) NOT NULL, "line1" character varying(200) NOT NULL, "line2" character varying(200), "city" character varying(100) NOT NULL, "state" character varying(100) NOT NULL, "pincode" character varying(10) NOT NULL, "is_default" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "addresses_user_idx" ON "addresses" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "brands" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(120) NOT NULL, "slug" character varying(140) NOT NULL, "description" text NOT NULL DEFAULT '', "logo_url" character varying(500), "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_b0c437120b624da1034a81fc561" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "brands_name_unique" ON "brands" ("name") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" ("slug") `);
        await queryRunner.query(`CREATE TABLE "categories" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(120) NOT NULL, "slug" character varying(140) NOT NULL, "description" text NOT NULL DEFAULT '', "parent_id" integer, "visual" character varying(40) NOT NULL DEFAULT 'battery', "image_url" character varying(500), "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" ("slug") `);
        await queryRunner.query(`CREATE TABLE "product_images" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "product_id" integer NOT NULL, "url" character varying(500) NOT NULL, "alt" character varying(200) NOT NULL DEFAULT '', "width" integer, "height" integer, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "product_images_product_idx" ON "product_images" ("product_id") `);
        await queryRunner.query(`CREATE TABLE "product_specs" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "product_id" integer NOT NULL, "label" character varying(120) NOT NULL, "value" character varying(300) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "product_specs_label_unique" UNIQUE ("product_id", "label"), CONSTRAINT "PK_d0cb5ab51b09cdbb6d3e6ce50f5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_combo_items" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "combo_product_id" integer NOT NULL, "component_product_id" integer NOT NULL, "quantity" integer NOT NULL DEFAULT '1', "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "combo_items_unique" UNIQUE ("combo_product_id", "component_product_id"), CONSTRAINT "combo_items_qty_positive" CHECK ("quantity" > 0), CONSTRAINT "combo_items_not_self" CHECK ("combo_product_id" <> "component_product_id"), CONSTRAINT "PK_6f72a7da582096c59940c4ad2ec" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "products" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "slug" character varying(180) NOT NULL, "sku" character varying(64), "kind" character varying(16) NOT NULL, "brand_id" integer NOT NULL, "category_id" integer NOT NULL, "model_number" character varying(80) NOT NULL, "name" character varying(200) NOT NULL, "tagline" character varying(240), "description" text NOT NULL DEFAULT '', "technology" character varying(24), "capacity_ah" integer, "rating_va" integer, "warranty_months" integer, "length_mm" integer, "width_mm" integer, "height_mm" integer, "weight_kg" numeric(7,2), "list_price_paise" integer NOT NULL, "sale_price_paise" integer, "sale_starts_at" TIMESTAMP WITH TIME ZONE, "sale_ends_at" TIMESTAMP WITH TIME ZONE, "stock_quantity" integer NOT NULL DEFAULT '0', "accepts_preorders" boolean NOT NULL DEFAULT false, "sold_count" integer NOT NULL DEFAULT '0', "is_featured" boolean NOT NULL DEFAULT false, "is_best_seller" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "version" integer NOT NULL DEFAULT '1', CONSTRAINT "products_kind_valid" CHECK ("kind" IN ('battery','inverter','combo')), CONSTRAINT "products_stock_non_negative" CHECK ("stock_quantity" >= 0), CONSTRAINT "products_sale_below_list" CHECK ("sale_price_paise" IS NULL OR ("sale_price_paise" > 0 AND "sale_price_paise" < "list_price_paise")), CONSTRAINT "products_price_positive" CHECK ("list_price_paise" > 0), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "products_slug_unique" ON "products" ("slug") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "products_sku_unique" ON "products" ("sku") WHERE "sku" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "products_brand_idx" ON "products" ("brand_id") `);
        await queryRunner.query(`CREATE INDEX "products_category_idx" ON "products" ("category_id") `);
        await queryRunner.query(`CREATE TABLE "reviews" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "product_id" integer NOT NULL, "user_id" integer NOT NULL, "rating" integer NOT NULL, "title" character varying(120) NOT NULL DEFAULT '', "body" text NOT NULL DEFAULT '', "status" character varying(16) NOT NULL DEFAULT 'pending', CONSTRAINT "reviews_user_product_unique" UNIQUE ("user_id", "product_id"), CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "reviews_product_status_idx" ON "reviews" ("product_id", "status") `);
        await queryRunner.query(`CREATE TABLE "testimonials" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "author" character varying(120) NOT NULL, "location" character varying(120), "rating" integer NOT NULL, "body" text NOT NULL, "product_id" integer, "is_published" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_63b03c608bd258f115a0a4a1060" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "newsletter_subscribers" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "email" character varying(255) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'subscribed', CONSTRAINT "PK_38f9333e9961b2fdb589128d19b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "newsletter_email_unique" ON "newsletter_subscribers" ("email") `);
        await queryRunner.query(`CREATE TABLE "wishlist_items" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "user_id" integer NOT NULL, "product_id" integer NOT NULL, CONSTRAINT "wishlist_user_product_unique" UNIQUE ("user_id", "product_id"), CONSTRAINT "PK_0bd52924a97cda208ed2a07bd69" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cart_items" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "user_id" integer NOT NULL, "product_id" integer NOT NULL, "quantity" integer NOT NULL DEFAULT '1', CONSTRAINT "cart_user_product_unique" UNIQUE ("user_id", "product_id"), CONSTRAINT "cart_quantity_range" CHECK ("quantity" BETWEEN 1 AND 10), CONSTRAINT "PK_6fccf5ec03c172d27a28a82928b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "inventory_movements" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "product_id" integer NOT NULL, "delta" integer NOT NULL, "reason" character varying(24) NOT NULL, "order_id" integer, "actor_user_id" integer, "note" character varying(300) NOT NULL DEFAULT '', CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "inventory_product_idx" ON "inventory_movements" ("product_id") `);
        await queryRunner.query(`CREATE TABLE "orders" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "order_number" character varying(32) NOT NULL, "user_id" integer NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'placed', "payment_method" character varying(16) NOT NULL, "payment_status" character varying(16) NOT NULL DEFAULT 'unpaid', "subtotal_paise" integer NOT NULL, "shipping_paise" integer NOT NULL, "tax_paise" integer NOT NULL, "total_paise" integer NOT NULL, "shipping_address" jsonb NOT NULL, "idempotency_key" character varying(100) NOT NULL, "request_hash" character varying(64) NOT NULL, "cancelled_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "orders_user_idempotency_unique" UNIQUE ("user_id", "idempotency_key"), CONSTRAINT "orders_total_non_negative" CHECK ("total_paise" >= 0), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "orders_number_unique" ON "orders" ("order_number") `);
        await queryRunner.query(`CREATE INDEX "orders_user_created_idx" ON "orders" ("user_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "order_items" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "order_id" integer NOT NULL, "product_id" integer NOT NULL, "product_name" character varying(200) NOT NULL, "brand_name" character varying(120) NOT NULL, "model_number" character varying(80) NOT NULL, "unit_price_paise" integer NOT NULL, "quantity" integer NOT NULL, "line_total_paise" integer NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "order_items_order_idx" ON "order_items" ("order_id") `);
        await queryRunner.query(`ALTER TABLE "addresses" ADD CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_images" ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_1530a6f15d3c79d1b70be98f2be" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "testimonials" ADD CONSTRAINT "FK_a47aece3aca0ae1c5486622c124" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_549f44d8b756e2690deb099f83b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_177397e044732e7e9c0215cd5b7" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_b7213c20c1ecdc6597abc8f1212" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_30e89257a105eab7648a35c7fce" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_5c3bec1682252c36fa161587738" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_5c3bec1682252c36fa161587738"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_30e89257a105eab7648a35c7fce"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_b7213c20c1ecdc6597abc8f1212"`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_177397e044732e7e9c0215cd5b7"`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_549f44d8b756e2690deb099f83b"`);
        await queryRunner.query(`ALTER TABLE "testimonials" DROP CONSTRAINT "FK_a47aece3aca0ae1c5486622c124"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_1530a6f15d3c79d1b70be98f2be"`);
        await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023"`);
        await queryRunner.query(`DROP INDEX "public"."order_items_order_idx"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`DROP INDEX "public"."orders_user_created_idx"`);
        await queryRunner.query(`DROP INDEX "public"."orders_number_unique"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP INDEX "public"."inventory_product_idx"`);
        await queryRunner.query(`DROP TABLE "inventory_movements"`);
        await queryRunner.query(`DROP TABLE "cart_items"`);
        await queryRunner.query(`DROP TABLE "wishlist_items"`);
        await queryRunner.query(`DROP INDEX "public"."newsletter_email_unique"`);
        await queryRunner.query(`DROP TABLE "newsletter_subscribers"`);
        await queryRunner.query(`DROP TABLE "testimonials"`);
        await queryRunner.query(`DROP INDEX "public"."reviews_product_status_idx"`);
        await queryRunner.query(`DROP TABLE "reviews"`);
        await queryRunner.query(`DROP INDEX "public"."products_category_idx"`);
        await queryRunner.query(`DROP INDEX "public"."products_brand_idx"`);
        await queryRunner.query(`DROP INDEX "public"."products_sku_unique"`);
        await queryRunner.query(`DROP INDEX "public"."products_slug_unique"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TABLE "product_combo_items"`);
        await queryRunner.query(`DROP TABLE "product_specs"`);
        await queryRunner.query(`DROP INDEX "public"."product_images_product_idx"`);
        await queryRunner.query(`DROP TABLE "product_images"`);
        await queryRunner.query(`DROP INDEX "public"."categories_slug_unique"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP INDEX "public"."brands_slug_unique"`);
        await queryRunner.query(`DROP INDEX "public"."brands_name_unique"`);
        await queryRunner.query(`DROP TABLE "brands"`);
        await queryRunner.query(`DROP INDEX "public"."addresses_user_idx"`);
        await queryRunner.query(`DROP TABLE "addresses"`);
        await queryRunner.query(`DROP INDEX "public"."users_email_unique"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
