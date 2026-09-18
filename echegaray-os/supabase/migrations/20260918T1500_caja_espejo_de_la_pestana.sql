-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA PESTAÑA CAJA, ESPEJADA EN POSTGRES — y lo que salió, por fecha de pago
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño (18/09/2026), textual: «la sección caja que muestra analíticas en app.ecsas.com.ar tiene
-- que ser un reflejo fiel de lo que muestra la pestaña caja de sheet flujo de fondos, manda todo a
-- supabase en tiempo real para que se lea de ahí, me gusta lo de marcar lo que se está gastando, pero
-- quiero filtro de fechas para determinar lo que quiero ver».
--
-- ═══ LO QUE HABÍA ═══
--
-- Nada de CAJA llegaba bien a la base. `cuentas_financieras` la escribía `sync-caja.mjs` leyendo
-- `Caja!A5:D200` por POSICIÓN, con el layout de julio: su última corrida (27/07) dejó cuentas llamadas
-- «$1.725.000», «—» y «17/07/2026». La vista Caja de Analíticas no leía CAJA: calculaba «a dónde fue
-- la plata» desde las compras, por fecha de FACTURA y contando lo impago como salido.
--
-- ═══ LO QUE ESTO CREA ═══
--
--   · `caja_sheet_foto` — una fila por CONTENIDO distinto de la pestaña: portada (las tarjetas),
--     secciones (cuentas, escalera, alertas, acciones), los gráficos con sus series y la grilla cruda.
--     Cada celda guarda el TEXTO que se ve y el número detrás; la app dibuja el texto. La escribe SÓLO
--     `orquestador/scripts/sync-caja-espejo.mjs` (conexión directa, dueño de la tabla), disparado por
--     la sonda de versión de Drive (1 min) y por su timer de red (10 min). Una foto igual a la vigente
--     no se reinserta: se confirma (`verificada_en`). Se podan las de más de 14 días.
--   · `caja_sheet_sync` — UNA fila: el último intento y su error, para que la app diga «el espejo no
--     pudo leer CAJA a las 14:05: …» en vez de mostrar una foto vieja con cara de actual.
--   · `caja_sheet_vigente` — la última foto verificada.
--   · `caja_egreso_percibido` — lo PAGADO de Compras con su área y su FECHA DE CAJA (criterio
--     percibido), para el marcado obra / estructura / sin destino filtrable por fecha. No redefine el
--     área: la toma de `costos_obra.area`, la misma que usa `egreso_por_area`.
--
-- ═══ QUIÉN LEE ═══
--
--   LEER      Dirección · Administración (`ve_economia()`). La caja es plata de la empresa: el jefe de
--             obra no la ve (tampoco ve la página: `veEconomia` la cierra en el servidor).
--   ESCRIBIR  nadie con sesión. Sólo el sync. RLS NO ES GRANT: se revocan los dos.
--
-- ═══ ORDEN DE DESPLIEGUE ═══
--
-- La base no va adelante del código: esta migración se aplica DESPUÉS de mergear la rama. El código
-- nuevo sin la migración muestra «el espejo de CAJA todavía no está publicado» (no rompe), y el sync
-- sin la migración no escribe y lo dice.

begin;

create table if not exists public.caja_sheet_foto (
  id             bigint generated always as identity primary key,
  huella         text        not null,
  archivo        text        not null,
  pestana        text        not null default 'CAJA',
  version_drive  text,
  leida_en       timestamptz not null default now(),
  verificada_en  timestamptz not null default now(),
  portada        jsonb       not null,
  secciones      jsonb       not null,
  graficos       jsonb       not null default '[]'::jsonb,
  tipo_cambio_usd numeric,
  grilla         jsonb       not null
);
create index if not exists caja_sheet_foto_verificada_idx on public.caja_sheet_foto (verificada_en desc);

comment on table public.caja_sheet_foto is
  'Espejo de la pestaña CAJA del Flujo de Caja: una fila por contenido distinto. Texto visible + número '
  'de cada celda. Fuente: el Sheet (sync-caja-espejo.mjs). Nunca se escribe desde la app.';
comment on column public.caja_sheet_foto.leida_en is 'Primera vez que el sync vio este contenido en CAJA.';
comment on column public.caja_sheet_foto.verificada_en is 'Última vez que CAJA seguía mostrando exactamente esto.';

create table if not exists public.caja_sheet_sync (
  id              smallint primary key default 1 check (id = 1),
  intento_en      timestamptz not null,
  ok              boolean     not null,
  error           text,
  version_drive   text
);
comment on table public.caja_sheet_sync is 'El último intento del espejo de CAJA (una sola fila). Si falló, la app lo dice.';

create or replace view public.caja_sheet_vigente with (security_invoker = true) as
  select f.*, s.intento_en as ultimo_intento_en, s.ok as ultimo_intento_ok, s.error as ultimo_error
    from (select * from public.caja_sheet_foto order by verificada_en desc, id desc limit 1) f
    left join public.caja_sheet_sync s on s.id = 1;

create or replace view public.caja_egreso_percibido with (security_invoker = true) as
  select coalesce(c.area, 'sin_clasificar') as area,
         cs.fecha_caja                      as fecha_pago,
         c.total,
         cs.estado,
         c.proveedor,
         c.obra_texto
    from public.costos_obra c
    join public.compra_sheet cs on c.referencia_externa = coalesce(cs.sheet_id, cs.fila)::text
   where c.origen = 'compras_sheet'
     and not coalesce(cs.anulada, false)
     and ((select public.ve_economia()) or (select auth.uid()) is null);

comment on view public.caja_egreso_percibido is
  'Lo que salió según Compras, por FECHA DE CAJA (percibido). estado=Pagado es lo salido; Pendiente es '
  'deuda, no salida. Área = costos_obra.area (la misma de egreso_por_area). Dirección y Administración.';

alter table public.caja_sheet_foto enable row level security;
alter table public.caja_sheet_sync enable row level security;

drop policy if exists caja_sheet_foto_select on public.caja_sheet_foto;
create policy caja_sheet_foto_select on public.caja_sheet_foto for select to authenticated
  using ((select public.ve_economia()));
drop policy if exists caja_sheet_sync_select on public.caja_sheet_sync;
create policy caja_sheet_sync_select on public.caja_sheet_sync for select to authenticated
  using ((select public.ve_economia()));

revoke all on public.caja_sheet_foto, public.caja_sheet_sync, public.caja_sheet_vigente, public.caja_egreso_percibido from anon, authenticated;
grant select on public.caja_sheet_foto, public.caja_sheet_sync, public.caja_sheet_vigente, public.caja_egreso_percibido to authenticated;

commit;
