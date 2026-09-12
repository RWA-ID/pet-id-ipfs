-- The receipt email shows the pet, so the order has to remember it. Neither
-- column is required: an order placed before this migration, or without a
-- photo, still gets a receipt — just a plainer one.
ALTER TABLE orders ADD COLUMN pet_name TEXT;
ALTER TABLE orders ADD COLUMN photo_url TEXT;
