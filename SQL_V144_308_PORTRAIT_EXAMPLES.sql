-- Run once in Supabase SQL Editor after deploying v144.308.
-- Replace only the two requested examples; other formats/settings are unchanged.
BEGIN;
UPDATE public.content_format_library
SET image_url = '/content-format-examples/v308/product.png',
    image_storage_path = NULL, updated_at = now()
WHERE content_type_id = 'website_item';
UPDATE public.content_format_library
SET image_url = '/content-format-examples/v308/ad.png',
    image_storage_path = NULL, updated_at = now()
WHERE content_type_id = 'website_item_text_ad';
COMMIT;
SELECT content_type_id, image_url FROM public.content_format_library
WHERE content_type_id IN ('website_item','website_item_text_ad');
