DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    last_login_at TIMESTAMP
);

CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    class_code VARCHAR(50) NOT NULL,
    course_code VARCHAR(50),
    course_name VARCHAR(255),
    semester VARCHAR(20),
    department VARCHAR(255),
    class_type VARCHAR(20),
    instructor VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_classes_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- -- Unique index khi semester có giá trị
-- CREATE UNIQUE INDEX idx_classes_unique_with_semester
--     ON classes (user_id, class_code, semester)
--     WHERE semester IS NOT NULL;

-- -- Unique index khi semester null
-- CREATE UNIQUE INDEX idx_classes_unique_without_semester
--     ON classes (user_id, class_code)
--     WHERE semester IS NULL;

CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL,
    mssv VARCHAR(50) NOT NULL,
    import_order INT NOT NULL DEFAULT 0,
    full_name VARCHAR(255),
    photo_status photo_status_enum NOT NULL DEFAULT 'pending',
    UNIQUE (class_id, mssv),

    CONSTRAINT fk_students_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE CASCADE
);

CREATE TABLE import_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL,
    user_id UUID NOT NULL,
    action import_action_enum NOT NULL DEFAULT 'created',
    duplicate_detected BOOLEAN NOT NULL DEFAULT FALSE,
    source_type source_type_enum NOT NULL,
    source_name VARCHAR(500) NOT NULL,
    total_count INT NOT NULL,
    column_mapping JSONB,
    changes_summary JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_import_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_import_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_import_history_user_created_at
    ON import_history (user_id, created_at DESC);

CREATE INDEX idx_import_history_class_created_at
    ON import_history (class_id, created_at DESC);

CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL UNIQUE,
    token VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_share_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE CASCADE
);

CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    status attendance_status_enum NOT NULL DEFAULT 'absent',
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (class_id, student_id)
);

CREATE INDEX idx_attendance_class_id
    ON attendance (class_id);

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';
