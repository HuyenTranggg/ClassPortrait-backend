DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE photo_status_enum AS ENUM (
    'pending',
    'loaded',
    'not_found'
);

CREATE TYPE source_type_enum AS ENUM (
    'excel',
    'google_sheet',
    'onedrive'
);

CREATE TYPE import_action_enum AS ENUM (
    'created',
    'updated'
);

CREATE TYPE attendance_status_enum AS ENUM (
    'present',
    'absent'
);

-- Users table (unchanged)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    last_login_at TIMESTAMP
);

-- Classes table (Exam Sessions) - UPDATED
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    class_exam_code VARCHAR(50) NULL,
    exam_date DATE NULL,
    exam_room VARCHAR(50) NULL,
    exam_time VARCHAR(20) NULL,
    exam_shift VARCHAR(20) NULL,
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    semester VARCHAR(20) NOT NULL,
    course_code VARCHAR(50) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    instructor VARCHAR(255) NOT NULL,
    import_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_classes_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Indexes for classes
CREATE INDEX idx_classes_user_semester_course ON classes (user_id, semester, course_code);
CREATE INDEX idx_classes_exam_date_room_time ON classes (exam_date, exam_room, exam_time);

-- Students table (Exam Session Students) - UPDATED
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL,
    mssv VARCHAR(50) NOT NULL,
    import_order INT NOT NULL DEFAULT 0,
    full_name VARCHAR(255) NOT NULL,
    photo_status photo_status_enum NOT NULL DEFAULT 'pending',
    class_code VARCHAR(50) NOT NULL,
    class_name VARCHAR(255) NULL,
    gender VARCHAR(10) NULL,
    dob DATE NULL,
    email VARCHAR(255) NULL,
    notes TEXT NULL,

    CONSTRAINT fk_students_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE CASCADE
);

-- Unique constraint for students
CREATE UNIQUE INDEX idx_students_unique_class_mssv_code ON students (class_id, mssv, class_code);
CREATE INDEX idx_students_mssv ON students (mssv);
CREATE INDEX idx_students_class_code ON students (class_code);
CREATE INDEX idx_students_class_name ON students (class_name);

-- Import history table - UPDATED
CREATE TABLE import_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    action import_action_enum NOT NULL DEFAULT 'created',
    duplicate_detected BOOLEAN NOT NULL DEFAULT FALSE,
    source_type source_type_enum NOT NULL,
    source_name VARCHAR(500) NOT NULL,
    total_count INT NOT NULL,
    column_mapping JSONB,
    changes_summary JSONB,
    class_ids JSONB, -- Array of UUIDs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_import_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_import_history_user_created_at ON import_history (user_id, created_at DESC);

-- Junction table: import_history_classes - NEW
CREATE TABLE import_history_classes (
    import_history_id UUID NOT NULL,
    class_id UUID NOT NULL,
    import_order_in_file INT NOT NULL,

    CONSTRAINT fk_ihc_import_history
        FOREIGN KEY (import_history_id)
        REFERENCES import_history(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ihc_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE CASCADE,

    PRIMARY KEY (import_history_id, class_id)
);

CREATE INDEX idx_ihc_class_id ON import_history_classes (class_id);

-- Share links table (unchanged)
CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL UNIQUE,
    token VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    require_login BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_share_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE CASCADE
);

-- Attendance table (unchanged, but class_id now references exam sessions)
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    status attendance_status_enum NOT NULL DEFAULT 'absent',
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (class_id, student_id)
);

CREATE INDEX idx_attendance_class_id ON attendance (class_id);

-- Verification query
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
