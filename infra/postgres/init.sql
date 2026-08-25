-- Initialize pgvector extension and create keycloak DB
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Keycloak database
CREATE DATABASE keycloak;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO micropro;
