-- Migration 0005: Re-assign legacy duplicate categories (1-24) to canonical categories (121-144)
UPDATE "products"
SET "category_id" = "category_id" + 120, "updated_at" = NOW()
WHERE "category_id" BETWEEN 1 AND 24;

UPDATE "categories"
SET "is_active" = false
WHERE "id" BETWEEN 1 AND 24;

UPDATE "categories"
SET "icon_emoji" = '5472335930549347896'
WHERE "id" = 14114;
