INSERT INTO products (
  title, brand, price, stock, sku, category, description,
  top_notes, heart_notes, base_notes, ingredients, image_url
) VALUES
  (
    'Rose No. 04', 'Maya Collection', 89.00, 18, 'MAYA-001', 'Floral · Powdery',
    'A soft, modern rose with a bright peppered opening and a close, musky finish. A familiar flower seen through a quieter, more personal lens.',
    ARRAY['Pink pepper'], ARRAY['Damask rose'], ARRAY['Soft musk'],
    ARRAY['Alcohol Denat.', 'Aqua', 'Parfum', 'Limonene'],
    '/images/rose-noir.jpg'
  ),
  (
    'Oud Étoile', 'Maya Collection', 112.00, 8, 'MAYA-002', 'Woody · Amber',
    'Dark oud and luminous saffron meet warm cedar. Deep without feeling heavy, this is a fragrance that leaves a measured, lasting impression.',
    ARRAY['Saffron'], ARRAY['Black oud'], ARRAY['Warm cedar'],
    ARRAY['Alcohol Denat.', 'Aqua', 'Parfum', 'Linalool'],
    '/images/oud-supreme.jpg'
  ),
  (
    'Belle Éclat', 'Maya Collection', 94.00, 20, 'MAYA-003', 'Citrus · Floral',
    'A clear, bright opening of bergamot settles into orange blossom and white tea. A light-filled composition made for the first hours of the day.',
    ARRAY['Bergamot'], ARRAY['Orange blossom'], ARRAY['White tea'],
    ARRAY['Alcohol Denat.', 'Aqua', 'Parfum', 'Citral'],
    '/images/belle-eclat.jpg'
  ),
  (
    'Lumière', 'Maya Collection', 86.00, 14, 'MAYA-004', 'Fresh · Musk',
    'Neroli and the impression of clean linen soften into skin musk. Quiet, airy and easy to return to, like a familiar ritual.',
    ARRAY['Neroli'], ARRAY['Clean linen'], ARRAY['Skin musk'],
    ARRAY['Alcohol Denat.', 'Aqua', 'Parfum', 'Geraniol'],
    '/images/lumiere.jpg'
  ),
  (
    'Éternel Blanc', 'Maya Collection', 98.00, 12, 'MAYA-005', 'Soft · Gourmand',
    'Vanilla orchid and almond bring a gentle sweetness, balanced by cashmere wood. Softly enveloping, with a warmth that stays close.',
    ARRAY['Almond'], ARRAY['Vanilla orchid'], ARRAY['Cashmere wood'],
    ARRAY['Alcohol Denat.', 'Aqua', 'Parfum', 'Coumarin'],
    '/images/eternel-blanc.jpg'
  ),
  (
    'Jardin Secret', 'Maya Collection', 92.00, 7, 'MAYA-006', 'Green · Floral',
    'A green fig-leaf opening unfolds into jasmine and wild gardenia. The feeling of a hidden garden just after the morning light arrives.',
    ARRAY['Fig leaf'], ARRAY['Jasmine'], ARRAY['Wild gardenia'],
    ARRAY['Alcohol Denat.', 'Aqua', 'Parfum', 'Benzyl Salicylate'],
    '/images/story-bottle.jpg'
  )
ON CONFLICT (sku) DO NOTHING;
