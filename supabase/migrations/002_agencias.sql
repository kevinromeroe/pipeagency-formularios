-- Nivel agencia: Felipe Agency entra con un solo enlace y elige a cuál de sus clientes
-- (form_cuentas: LCI Bogotá, Alimentos Polar…) pertenece cada publicación.

create table if not exists public.form_agencias (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  nombre       text not null,
  logo         text,
  codigo_hash  text not null,                      -- sha256 del código de acceso de la agencia
  activa       boolean not null default true,
  creado_en    timestamptz not null default now()
);

alter table public.form_cuentas add column if not exists agencia_id uuid references public.form_agencias(id) on delete cascade;
alter table public.form_cuentas alter column codigo_hash drop not null;   -- el acceso ahora es por agencia

alter table public.form_agencias enable row level security;
revoke all on public.form_agencias from anon, authenticated;
