-- Migration 0005: Re-assign legacy duplicate categories (1-24) to canonical categories (121-144)
UPDATE "products" p
SET "category_id" = p."category_id" + 120, "updated_at" = NOW()
WHERE p."category_id" BETWEEN 1 AND 24
  AND EXISTS (SELECT 1 FROM "categories" c WHERE c."id" = p."category_id" + 120);

UPDATE "categories"
SET "is_active" = false
WHERE "id" BETWEEN 1 AND 24
  AND EXISTS (SELECT 1 FROM "categories" c WHERE c."id" = "categories"."id" + 120);

UPDATE "categories"
SET "icon_emoji" = '5472335930549347896'
WHERE "id" = 14114;
