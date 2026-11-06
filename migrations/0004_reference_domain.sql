ALTER TABLE sites ADD COLUMN reference_domain TEXT;
UPDATE sites SET reference_domain = 'rapsona.online';
