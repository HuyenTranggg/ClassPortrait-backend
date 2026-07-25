-- Migration: Thêm cột instructor vào bảng students
-- Chạy lệnh này trên database classportrait

ALTER TABLE students ADD COLUMN IF NOT EXISTS instructor VARCHAR(255) NULL;

-- Verify
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'students' AND column_name = 'instructor';
