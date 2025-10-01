-- =====================================================
-- COMPLETE CONDOLEADS DATABASE SCHEMA EXPORT
-- =====================================================

-- 1. LIST ALL TABLES
SELECT 
    'TABLES IN DATABASE:' as section,
    table_name,
    obj_description(pgclass.oid, 'pg_class') as description
FROM information_schema.tables
LEFT JOIN pg_catalog.pg_class pgclass ON pgclass.relname = table_name
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. BUILDINGS TABLE STRUCTURE
SELECT 
    'BUILDINGS TABLE COLUMNS:' as section,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'buildings'
ORDER BY ordinal_position;

-- 3. MLS_LISTINGS TABLE STRUCTURE  
SELECT 
    'MLS_LISTINGS TABLE COLUMNS:' as section,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'mls_listings'
ORDER BY ordinal_position;

-- 4. MEDIA TABLE STRUCTURE
SELECT 
    'MEDIA TABLE COLUMNS:' as section,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'media'
ORDER BY ordinal_position;

-- 5. PROPERTY_ROOMS TABLE STRUCTURE
SELECT 
    'PROPERTY_ROOMS TABLE COLUMNS:' as section,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'property_rooms'
ORDER BY ordinal_position;

-- 6. AGENTS TABLE STRUCTURE
SELECT 
    'AGENTS TABLE COLUMNS:' as section,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'agents'
ORDER BY ordinal_position;

-- 7. CHECK INDEXES
SELECT 
    'INDEXES:' as section,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 8. CHECK FOREIGN KEY CONSTRAINTS
SELECT
    'FOREIGN KEY CONSTRAINTS:' as section,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';

-- 9. ROW COUNTS FOR EACH TABLE
SELECT 
    'ROW COUNTS:' as section,
    schemaname,
    tablename,
    n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- 10. GET COMPLETE DDL FOR ALL TABLES
SELECT 
    'CREATE TABLE STATEMENTS:' as section,
    table_name,
    'CREATE TABLE ' || table_name || ' (' || 
    string_agg(
        column_name || ' ' || 
        data_type || 
        CASE 
            WHEN character_maximum_length IS NOT NULL 
            THEN '(' || character_maximum_length || ')' 
            ELSE '' 
        END ||
        CASE 
            WHEN is_nullable = 'NO' 
            THEN ' NOT NULL' 
            ELSE '' 
        END ||
        CASE 
            WHEN column_default IS NOT NULL 
            THEN ' DEFAULT ' || column_default 
            ELSE '' 
        END,
        ', '
        ORDER BY ordinal_position
    ) || ');' as create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
