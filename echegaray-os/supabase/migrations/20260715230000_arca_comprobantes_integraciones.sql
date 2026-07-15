-- ============================================================================
-- PLAN 1 — Integraciones: registro (F0) + ARCA comprobantes cableados al OS (F1)
-- ----------------------------------------------------------------------------
-- 1) Registro de integraciones: catálogo único con fuente de verdad, método, salud.
-- 2) Comprobantes ARCA (ex-AFIP): Libro IVA Ventas (E) y Compras (R) ya extraídos por
--    AfipSDK. Se ingieren acá para que el OS arme el Libro IVA y cruce con compras/caja
--    sin carga manual. Idempotente por (tipo, cae).
-- ============================================================================

-- ---- Registro de integraciones (F0) ----
create table if not exists public.integraciones (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,           -- 'arca', 'google_drive', 'banco_santander'
  nombre       text not null,
  dato         text,                            -- qué información entra/sale
  direccion    text,                            -- 'lee' | 'escribe' | 'ambas'
  fuente_verdad text,                           -- 'os' | 'externo'
  metodo       text,                            -- 'manual' | 'batch' | 'api' | 'webhook'
  frecuencia   text,
  estado       text not null default 'planeado',-- 'vivo' | 'en_curso' | 'planeado' | 'bloqueado'
  politica     text default 'lectura_auto',     -- 'lectura_auto' | 'aprobacion'
  ultimo_sync  timestamptz,
  salud        text default 'desconocida',      -- 'ok' | 'degradada' | 'sin_datos'
  notas        text,
  updated_at   timestamptz not null default now()
);

insert into public.integraciones (slug, nombre, dato, direccion, fuente_verdad, metodo, frecuencia, estado, politica, notas) values
  ('google_workspace','Google Workspace','Drive/Sheets/Docs/Gmail/Calendar','ambas','externo','api','tiempo real','vivo','aprobacion','OAuth por usuario; escritura con aprobación'),
  ('supabase','Supabase','Datos del OS','ambas','os','api','tiempo real','vivo','lectura_auto','Base del OS'),
  ('arca','ARCA (ex-AFIP)','Comprobantes emitidos/recibidos, IVA, F931','lee','externo','api','mensual','en_curso','aprobacion','IVA junio extraído por AfipSDK; cliente WSAA oficial construido, falta autorizar certificado'),
  ('banco_santander','Banco Santander','Movimientos de cuenta','lee','externo','batch','diaria','planeado','lectura_auto','Sin API abierta en AR; vía import del extracto'),
  ('dgr_san_juan','DGR San Juan','Ingresos brutos, vencimientos','lee','externo','api','mensual','planeado','lectura_auto',null)
on conflict (slug) do update set nombre=excluded.nombre, estado=excluded.estado, notas=excluded.notas, updated_at=now();

-- ---- Comprobantes ARCA (F1) ----
create table if not exists public.comprobantes_arca (
  id             uuid primary key default gen_random_uuid(),
  tipo_libro     text not null,                 -- 'R' recibidos (compras) | 'E' emitidos (ventas)
  fecha_emision  date,
  tipo_comprobante text,                        -- código ARCA (1=Fact A, 6=Fact B, 11=Fact C…)
  punto_venta    text,
  numero         text,
  cae            text,                          -- Cód. Autorización (único por comprobante)
  emisor_cuit    text,
  emisor_nombre  text,
  receptor_cuit  text,
  moneda         text default '$',
  neto_gravado   numeric default 0,
  neto_no_gravado numeric default 0,
  exento         numeric default 0,
  total_iva      numeric default 0,
  otros_tributos numeric default 0,
  imp_total      numeric default 0,
  iva_por_alicuota jsonb,                        -- {"21": {neto, iva}, "10.5": {...}}
  periodo        text,                           -- 'YYYY-MM'
  origen         text default 'afipsdk',
  created_at     timestamptz not null default now(),
  unique (tipo_libro, cae, numero)
);

create index if not exists comprobantes_arca_periodo on public.comprobantes_arca (periodo, tipo_libro);
create index if not exists comprobantes_arca_fecha on public.comprobantes_arca (fecha_emision desc);
create index if not exists comprobantes_arca_emisor on public.comprobantes_arca (emisor_cuit);
