CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    full_name VARCHAR(255),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Relación con el usuario que subió el archivo
    
    -- Metadatos del archivo
    file_name VARCHAR(255) UNIQUE NOT NULL,
    file_path VARCHAR(500) NOT NULL, -- Ruta local (ej: /uploads/factura.xml) o URL de S3
    
    -- Datos del negocio (Usando JSONB)
    normalized_data JSONB NOT NULL,  -- Aquí guardas el diccionario que extrajiste
    retentions_data JSONB,           -- Aquí se guardarán los cálculos matemáticos después
    
    -- Control de flujo
    status VARCHAR(50) DEFAULT 'PENDING_VALIDATION', -- Estados: PENDING_VALIDATION, CALCULATED, ERROR
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Llave Foránea
    CONSTRAINT fk_invoices_user
        FOREIGN KEY(user_id) 
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Opcional pero recomendado: Índice para búsquedas rápidas por usuario
CREATE INDEX idx_invoices_user_id ON invoices(user_id);


INSERT INTO users (
    email,
    password_hash,
    full_name
)
VALUES (
    'admin@test.com',
    '$2b$12$Vh6R3PmacjSl38efsYQq1O2iksDqevjqQi3TARpol1NTvI0uWwscS',
    'Administrator'
)
ON CONFLICT (email) DO NOTHING;