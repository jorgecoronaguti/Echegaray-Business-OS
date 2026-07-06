-- PRP-001 / Fase 0: Fundación de datos
-- Entidades: clientes, obras, cuentas_financieras, proveedores
-- Ver .claude/PRPs/PRP-001-fundacion-flujo-de-caja.md para contexto de negocio.

create extension if not exists "pgcrypto";

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists obras (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  nombre text not null,
  estado text not null default 'activa' check (estado in ('activa', 'pausada', 'cerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists obras_cliente_id_idx on obras(cliente_id);

create table if not exists cuentas_financieras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('banco', 'caja')),
  saldo_inicial numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: sistema interno de una sola empresa, sin roles definidos todavía
-- (echegaray-os/CLAUDE.md: "no hay roles/usuarios internos definidos todavía").
-- Acceso completo para cualquier usuario autenticado, sin particionar por user_id
-- porque no es un producto multi-tenant. Revisar cuando existan roles internos.
alter table clientes enable row level security;
alter table obras enable row level security;
alter table cuentas_financieras enable row level security;
alter table proveedores enable row level security;

create policy "authenticated_full_access" on clientes
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on obras
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on cuentas_financieras
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on proveedores
  for all to authenticated using (true) with check (true);

-- updated_at automático
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clientes_set_updated_at before update on clientes
  for each row execute function set_updated_at();
create trigger obras_set_updated_at before update on obras
  for each row execute function set_updated_at();
create trigger cuentas_financieras_set_updated_at before update on cuentas_financieras
  for each row execute function set_updated_at();
create trigger proveedores_set_updated_at before update on proveedores
  for each row execute function set_updated_at();
