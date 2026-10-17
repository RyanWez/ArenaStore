DROP INDEX "idx_referral_rewards_order_id";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_referral_rewards_order_id_reward_type" ON "referral_rewards" USING btree ("order_id","reward_type");