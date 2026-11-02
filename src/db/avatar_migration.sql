-- Run once on existing databases to allow storing profile image URLs.
ALTER TABLE users ALTER COLUMN avatar TYPE TEXT;
