-- Migration: 0002_unique_wallet_user_id
-- Deduplicates orphan/duplicate wallets and enforces a unique constraint on wallets(user_id)

-- 1. Reassign any orphaned ledger entries from duplicate wallets to the primary wallet
UPDATE wallet_ledger wl
SET wallet_id = primary_w.id
FROM (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM wallets
  ORDER BY user_id, (balance_mmk > 0) DESC, id ASC
) primary_w
JOIN wallets w ON w.user_id = primary_w.user_id AND w.id != primary_w.id
WHERE wl.wallet_id = w.id;

--> statement-breakpoint
-- 2. Consolidate any balances if duplicate wallets had funds
UPDATE wallets pw
SET 
  balance_mmk = pw.balance_mmk + COALESCE(dup.sum_bal, 0),
  total_deposited_mmk = pw.total_deposited_mmk + COALESCE(dup.sum_dep, 0),
  total_spent_mmk = pw.total_spent_mmk + COALESCE(dup.sum_spent, 0)
FROM (
  SELECT 
    user_id,
    sum(balance_mmk) as sum_bal,
    sum(total_deposited_mmk) as sum_dep,
    sum(total_spent_mmk) as sum_spent
  FROM wallets
  WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM wallets
    ORDER BY user_id, (balance_mmk > 0) DESC, id ASC
  )
  GROUP BY user_id
) dup
WHERE pw.id IN (
  SELECT DISTINCT ON (user_id) id
  FROM wallets
  ORDER BY user_id, (balance_mmk > 0) DESC, id ASC
) AND pw.user_id = dup.user_id;

--> statement-breakpoint
-- 3. Delete duplicate wallet rows
DELETE FROM wallets
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM wallets
  ORDER BY user_id, (balance_mmk > 0) DESC, id ASC
);

--> statement-breakpoint
-- 4. Apply permanent UNIQUE constraint on wallets(user_id)
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id");
