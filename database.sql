-- ==========================================
-- REUNIFICAR
-- Base de Datos v1.0
-- ==========================================

create extension if not exists "pgcrypto";

----------------------------------------------------
-- TABLA PRINCIPAL
----------------------------------------------------

create table if not exists casos (

id uuid primary key default gen_random_uuid(),

codigo text unique,

tipo text not null,

nombre text,

edad text,

sexo text,

descripcion text,

estado_salud text,

lugar_rescate text,

ubicacion_actual text,

fecha_rescate date,

foto_url text,

nombre_reportante text,

telefono_reportante text,

created_at timestamp default now()

);

----------------------------------------------------
-- QUIEN TIENE ACTUALMENTE AL MENOR
----------------------------------------------------

create table if not exists custodias (

id uuid primary key default gen_random_uuid(),

caso_id uuid references casos(id) on delete cascade,

nombre_responsable text,

foto_responsable text,

telefono text,

institucion text,

cargo text,

observaciones text,

created_at timestamp default now()

);