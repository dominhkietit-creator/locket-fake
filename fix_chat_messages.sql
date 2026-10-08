-- ==============================================================================
-- SỬA LỖI LỊCH SỬ TIN NHẮN VÀ CẤP QUYỀN REALTIME CHO BẢNG MESSAGES
-- Chạy đoạn SQL này trong Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Cho phép receiver_id nhận giá trị NULL (hỗ trợ phòng chat chung Locket Lounge)
ALTER TABLE public.messages ALTER COLUMN receiver_id DROP NOT NULL;

-- 2. Đảm bảo Row Level Security (RLS) cho phép đọc và gửi tin nhắn
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Messages are viewable by everyone" ON public.messages;
CREATE POLICY "Messages are viewable by everyone" ON public.messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 3. Đảm bảo bật Realtime cho bảng messages
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
