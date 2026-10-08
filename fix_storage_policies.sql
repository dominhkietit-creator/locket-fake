-- ==============================================================================
-- FIX QUYỀN UPLOAD SUPABASE STORAGE CHO BUCKET 'locket-images'
-- Chạy đoạn mã này trong Supabase Dashboard -> SQL Editor để sửa dứt điểm lỗi:
-- "new row violates row-level security policy" khi upload ảnh.
-- ==============================================================================

-- 1. Đảm bảo bucket 'locket-images' ở chế độ công khai (Public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('locket-images', 'locket-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Xóa các policy cũ có thể gây xung đột
DROP POLICY IF EXISTS "Public Access for locket-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users Can Upload to locket-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow All Uploads to locket-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow All Updates to locket-images" ON storage.objects;
DROP POLICY IF EXISTS "Users Can Update Their Own Images in locket-images" ON storage.objects;
DROP POLICY IF EXISTS "locket_images_all_policy" ON storage.objects;

-- 3. Cấp toàn quyền (Đọc, Ghi, Cập nhật) cho bucket 'locket-images'
CREATE POLICY "locket_images_all_policy"
ON storage.objects FOR ALL
TO public
USING (bucket_id = 'locket-images')
WITH CHECK (bucket_id = 'locket-images');
