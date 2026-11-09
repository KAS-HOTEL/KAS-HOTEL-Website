ALTER TABLE site_image_slot
    ADD COLUMN current_reference text;

COMMENT ON COLUMN site_image_slot.current_reference IS
    'Admin-selected public URL or same-origin path; NULL uses default_reference.';

-- Preserve the 47 image references currently selected in the legacy CMS.
-- The legacy upload files and override file remain in place as a rollback source.

UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1559640932-dfb3a77c90c9?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.03';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1621094305060-081171d1c171?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.heroExtra2';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1697850084120-4896a446a04d?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.01';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1785740508398-df8fb4054584?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.04';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1685584280839-a51ba5a1908d?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.02';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1738627760098-51b0df6f2ac9?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.05';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1776813191005-b46e34d722bf?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.06';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1651146220117-edce81331ad6?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.07';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1786760756331-09ccdd718b95?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.hero.08';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1586004551686-d9c4fab26471?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.heroExtra1';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1730714103959-5d5a30acf547?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.heroExtra3';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1514864151880-d1bef4892f29?auto=format&fit=crop&w=2560&q=95' WHERE slot_key = 'home.heroExtra4';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1698996608527-0e8efb30062b?auto=format&fit=crop&q=90&w=2400' WHERE slot_key = 'home.neighborhood.city';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/25566888/pexels-photo-25566888.jpeg' WHERE slot_key = 'guidebook.entry.ben-thanh-market';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1675111066042-9baa4c343157?q=100&w=4000&auto=format&fit=crop' WHERE slot_key = 'page.hero.experiences';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/17067683/pexels-photo-17067683.jpeg' WHERE slot_key = 'guidebook.entry.tao-dan-park';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1742888827024-6d85caf1d09b?q=90&w=2000&auto=format&fit=crop' WHERE slot_key = 'guidebook.entry.independence-palace';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/13600319/pexels-photo-13600319.jpeg' WHERE slot_key = 'guidebook.entry.war-remnants-museum';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_central-post-office-1791106865434-15044cf0.jpg' WHERE slot_key = 'guidebook.entry.central-post-office';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/5659452/pexels-photo-5659452.jpeg' WHERE slot_key = 'guidebook.entry.notre-dame-cathedral';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/31256134/pexels-photo-31256134.jpeg' WHERE slot_key = 'guidebook.entry.saigon-opera-house';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/38674874/pexels-photo-38674874.jpeg' WHERE slot_key = 'guidebook.entry.nguyen-hue';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/27399542/pexels-photo-27399542.jpeg' WHERE slot_key = 'guidebook.entry.bitexco';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/32371915/pexels-photo-32371915.jpeg' WHERE slot_key = 'guidebook.entry.ben-thanh-street-food';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/25566888/pexels-photo-25566888.jpeg' WHERE slot_key = 'guidebook.entry.ben-thanh-market-walk';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/18976506/pexels-photo-18976506.jpeg' WHERE slot_key = 'guidebook.entry.bui-vien';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_pham-ngu-lao-1791107557882-ec01f66c.png' WHERE slot_key = 'guidebook.entry.pham-ngu-lao';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/32601126/pexels-photo-32601126.jpeg' WHERE slot_key = 'guidebook.entry.fine-arts-museum';
UPDATE site_image_slot SET current_reference = 'https://plus.unsplash.com/premium_photo-1719955783083-6a0bd66c5f75?q=100&w=4000&auto=format&fit=crop' WHERE slot_key = 'page.hero.offers';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1503539680555-732099a55a56?q=100&w=4000&auto=format&fit=crop' WHERE slot_key = 'page.hero.my-kas';
UPDATE site_image_slot SET current_reference = 'https://plus.unsplash.com/premium_photo-1692731798026-19776d12132a?q=100&w=4000&auto=format&fit=crop' WHERE slot_key = 'page.hero.about';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1570559120097-e6c3388329e6?q=100&w=4000&auto=format&fit=crop' WHERE slot_key = 'page.hero.support';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1745210361904-853ad10cfb03?auto=format&fit=crop&q=100&w=3000' WHERE slot_key = 'home.neighborhood.taste';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1678089498025-1aa6235917e3?q=100&w=2400&auto=format&fit=crop' WHERE slot_key = 'home.neighborhood.slow';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1693282814784-649be45a459b?auto=format&fit=crop&q=90&w=2000' WHERE slot_key = 'home.neighborhood.night';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_pham-ngu-lao-night-1791279518365-a218b9d5.png' WHERE slot_key = 'guidebook.entry.pham-ngu-lao-night';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_saigon-square-1791279728892-2eac19c5.png' WHERE slot_key = 'guidebook.entry.saigon-square';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_nguyen-trai-street-1791279926459-e39a3e22.png' WHERE slot_key = 'guidebook.entry.nguyen-trai-street';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_saigon-centre-1791280013779-22c2aa06.png' WHERE slot_key = 'guidebook.entry.saigon-centre';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_saigon-eco-craft-1791280140123-0c61bd07.png' WHERE slot_key = 'guidebook.entry.saigon-eco-craft';
UPDATE site_image_slot SET current_reference = 'https://images.unsplash.com/photo-1736665813752-f15663994b6f?auto=format&fit=crop&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=90&w=2048' WHERE slot_key = 'guidebook.entry.saigon-street-food';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_ben-thanh-market-food-1791280306622-dce5f07f.jpg' WHERE slot_key = 'guidebook.entry.ben-thanh-market-food';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_vietnamese-coffee-1791280340663-82b6a304.png' WHERE slot_key = 'guidebook.entry.vietnamese-coffee';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/31256134/pexels-photo-31256134.jpeg' WHERE slot_key = 'guidebook.entry.saigon-opera-house-walk';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_central-post-office-walk-1791280670015-6c49dfaa.jpg' WHERE slot_key = 'guidebook.entry.central-post-office-walk';
UPDATE site_image_slot SET current_reference = 'https://images.pexels.com/photos/5659452/pexels-photo-5659452.jpeg' WHERE slot_key = 'guidebook.entry.notre-dame-cathedral-walk';
UPDATE site_image_slot SET current_reference = '/uploads/site/site-guidebook_entry_le-thanh-ton-1791280817263-95aeaae9.png' WHERE slot_key = 'guidebook.entry.le-thanh-ton';
