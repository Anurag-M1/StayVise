-- StayVise PostgreSQL init script
-- Runs once when the container is first created

-- Enable pgvector extension (for future ML/embedding features)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Set default timezone
SET timezone = 'Asia/Kolkata';
