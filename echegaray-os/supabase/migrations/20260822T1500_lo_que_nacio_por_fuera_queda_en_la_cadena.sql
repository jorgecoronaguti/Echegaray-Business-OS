-- ═══ LO QUE NACIÓ POR FUERA QUEDA EN LA CADENA (22/08/2026) ═══
--
-- La reconstrucción desde base virgen (hardening de reproducibilidad) encontró exactamente cuatro
-- tablas y una columna que existen en producción sin que ninguna migración las cree: las crean
-- scripts del orquestador en runtime con `create table if not exists` (os-endpoint.mjs,
-- respetar-ediciones.mjs, el importador del banco y el catálogo de chequeras). Una base nueva las
-- tendría recién cuando cada script corriera por primera vez — y mientras tanto el esquema "vivo"
-- y el reproducible serían dos cosas distintas.
--
-- Este archivo es la constancia: el DDL EXACTO que hoy tiene producción (columnas, defaults,
-- checks, RLS, policies y grants leídos del catálogo el 22/08/2026). Sobre producción es un no-op;
-- sobre una base virgen deja el esquema completo sin esperar a ningún servicio. Los creadores de
-- runtime siguen siendo inofensivos: su if-not-exists ya encuentra la tabla hecha.
--
-- Nada de esto cambia semántica: ni una columna distinta, ni un permiso más ni menos que producción.

-- ── 1. El saldo que el banco declara (importador del extracto) ─────────────────────────────────
create table if not exists public.banco_saldo_declarado (
  cuenta       text not null default '179-091383/6',
  fecha        date not null,
  saldo        numeric not null,
  origen       text not null,
  importado_en timestamptz not null default now(),
  primary key (cuenta, fecha)
);
alter table public.banco_saldo_declarado enable row level security;
drop policy if exists banco_saldo_declarado_lectura on public.banco_saldo_declarado;
create policy banco_saldo_declarado_lectura on public.banco_saldo_declarado
  for select using (auth.role() = 'authenticated');
drop policy if exists banco_saldo_declarado_escritura on public.banco_saldo_declarado;
create policy banco_saldo_declarado_escritura on public.banco_saldo_declarado
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 2. Las chequeras (catálogo de cheques emitidos) ────────────────────────────────────────────
create table if not exists public.chequeras (
  id                bigserial primary key,
  identificador     text not null,
  banco             text,
  cuenta            text not null default '179-091383/6',
  cuit_librador     text not null default '30716304643',
  tipo              text not null check (tipo = any (array['COMUN'::text, 'CPD'::text])),
  numero_desde      integer,
  numero_hasta      integer,
  rango_confianza   text not null default 'DESCONOCIDO'
    check (rango_confianza = any (array['REAL'::text, 'INFERIDO'::text, 'DESCONOCIDO'::text])),
  numeros_conocidos integer[] not null default '{}',
  estado            text not null default 'DESCONOCIDO'
    check (estado = any (array['ACTIVA'::text, 'SIN_USAR'::text, 'AGOTADA'::text, 'ANULADA'::text, 'DESCONOCIDO'::text])),
  observacion       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chequeras_rango_coherente
    check (numero_desde is null or numero_hasta is null or numero_desde <= numero_hasta)
);
create unique index if not exists chequeras_unica on public.chequeras (identificador, cuenta);
alter table public.chequeras enable row level security;
drop policy if exists chequeras_lectura on public.chequeras;
create policy chequeras_lectura on public.chequeras
  for select using (auth.role() = 'authenticated');
drop policy if exists chequeras_escritura on public.chequeras;
create policy chequeras_escritura on public.chequeras
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 3. El estado del runtime del OS (os-endpoint.mjs) ──────────────────────────────────────────
create table if not exists public.os_runtime (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.os_runtime enable row level security;
drop policy if exists os_runtime_public_read on public.os_runtime;
create policy os_runtime_public_read on public.os_runtime for select using (true);
grant select on public.os_runtime to anon, authenticated;

-- ── 4. Los rótulos que la Regla 0 protege en el Sheet (respetar-ediciones.mjs) ─────────────────
-- Sin RLS a propósito: así está en producción — la escribe sólo el orquestador conectado como
-- postgres, y ningún cliente PostgREST la lee.
create table if not exists public.sheet_rotulos (
  file_id    text not null,
  pestana    text not null,
  rotulo     text not null,
  reemplazo  text,
  escrito_en timestamptz not null default now(),
  primary key (file_id, pestana, rotulo)
);

-- ── 5. La columna que la allowlist ganó por fuera ──────────────────────────────────────────────
alter table public.usuarios_os add column if not exists access_key text;

-- ── 6. El ledger de migraciones recibe la trazabilidad que las demás tablas ya tienen ──────────
-- En una base reconstruida, `migracion_aplicada` existe desde el arranque y la migración de
-- trazabilidad (20260709121504) le agrega estas columnas como a toda tabla de public. En
-- producción nació después (21/08) y quedó sin ellas. Esto converge los dos mundos.
do $$
begin
  if to_regclass('public.migracion_aplicada') is not null then
    alter table public.migracion_aplicada
      add column if not exists creado_por uuid references perfiles(id) default auth.uid(),
      add column if not exists actualizado_por uuid references perfiles(id),
      add column if not exists actualizado_en timestamptz not null default now();
    drop trigger if exists trg_actualizado_en on public.migracion_aplicada;
    create trigger trg_actualizado_en before update on public.migracion_aplicada
      for each row execute function set_actualizado_en();
  end if;
end $$;
