-- Formulario de publicaciones (pipeagency.datalitica.com.co)
-- Tablas con prefijo form_ para convivir con las tablas anteriores del proyecto.
-- RLS activo y sin políticas: el navegador no puede leer ni escribir directo.
-- Todo pasa por la Edge Function `formulario`, que usa la clave secreta.

create table if not exists public.form_cuentas (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,               -- lci, polar (va en la URL)
  nombre        text not null,                      -- LCI Bogotá
  campana       text,                               -- Campaña de influencers · octubre 2026
  logo          text,                               -- ruta del logo en el sitio (assets/…)
  presupuesto_cop bigint,
  codigo_hash   text not null,                      -- sha256 del código de acceso
  activa        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create table if not exists public.form_talentos (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.form_cuentas(id) on delete cascade,
  nombre        text not null,
  salidas       int  not null default 1,
  valor_cop     bigint,                             -- valor para la marca (todas las salidas)
  alcance       bigint,                             -- metas comprometidas (totales)
  impresiones   bigint,
  engagement    bigint,
  orden         int  not null default 0,
  activo        boolean not null default true,
  unique (cuenta_id, nombre)
);

create table if not exists public.form_envios (
  id               uuid primary key default gen_random_uuid(),
  cuenta_id        uuid not null references public.form_cuentas(id) on delete cascade,
  talento_id       uuid not null references public.form_talentos(id),
  link             text not null,                   -- como lo pegó el cliente
  link_clave       text not null,                   -- normalizado: detecta duplicados
  red              text not null check (red in ('ig','tt','yt')),
  formato          text not null,
  salida_nueva     boolean not null default true,   -- false = réplica o bonificada
  valor_pagado_cop bigint check (valor_pagado_cop is null or valor_pagado_cop >= 0),
  estado           text not null default 'en_cola' check (estado in ('en_cola','medida','quitada')),
  ip_hash          text,                            -- para limitar envíos, sin guardar la IP
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

-- Un link solo puede estar una vez por cuenta (salvo que se haya quitado)
create unique index if not exists form_envios_link_unico
  on public.form_envios (cuenta_id, link_clave) where estado <> 'quitada';
create index if not exists form_envios_cuenta on public.form_envios (cuenta_id, creado_en desc);
create index if not exists form_envios_ip on public.form_envios (ip_hash, creado_en desc);

alter table public.form_cuentas  enable row level security;
alter table public.form_talentos enable row level security;
alter table public.form_envios   enable row level security;
revoke all on public.form_cuentas, public.form_talentos, public.form_envios from anon, authenticated;
