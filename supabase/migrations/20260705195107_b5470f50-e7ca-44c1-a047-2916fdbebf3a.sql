-- Backfill tipo_contato from the legacy tipo column.
-- tipo_contato is the column all filters, exports and the edit UI already
-- read; tipo predates it and is write-only from the app's perspective.
UPDATE public.contacts
SET tipo_contato = tipo
WHERE tipo_contato IS NULL AND tipo IS NOT NULL;
