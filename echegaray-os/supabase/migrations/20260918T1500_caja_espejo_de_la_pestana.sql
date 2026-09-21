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
--   · `caja_egreso_percibido` — lo PAGADO de Compras, cada pago en su fecha (criterio percibido), para
--     el marcado obra / estructura / sin destino filtrable por fecha. No redefine el área: la toma de
--     `costos_obra.area`, la misma que usa `egreso_por_area`. Ver el bloque de la vista.
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

-- SIN `begin/commit` PROPIOS: los envuelve `orquestador/scripts/aplicar-migracion.mjs`, que corre la
-- migración entera en UNA transacción y la deshace cuando es ensayo. Un `commit` acá adentro cerraba
-- la transacción del script y el ensayo dejaba de ser ensayo: se aplicaba de verdad (21/09/2026).

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

-- ═══ LO PAGADO, EN LA FECHA EN QUE SE PAGÓ (auditoría 18/09/2026) ═══
--
-- La primera versión publicaba el TOTAL de la factura en su «Fecha de caja»: agosto daba $82,1 M contra
-- $68,0 M pagados (+20,6 %), una parcial entera caía en el mes del primer pago y una compra «Pagado» con
-- Monto Pagado 0 sumaba $5,1 M que nadie afirmó haber pagado. Eso es devengado con otro nombre.
--
-- Lo que Compras AFIRMA que se pagó son dos celdas: «Monto Pagado» en la «Fecha de caja» (el primer
-- pago) y «Monto Parcial 2» en «Fecha prevista de pago 2» (el segundo). Cada una es una fila `pago`.
-- Una compra «Pagado» sin ninguna de las dos cargadas NO se asume pagada por su total: sale como
-- `sin_desglose`, con su total, para que la pantalla la liste y alguien la complete en Compras.
-- Lo que falta pagar (estado ≠ Pagado, «Saldo pendiente») sale como `pendiente` a su fecha prevista:
-- es deuda del período, no salida. «Monto Parcial 1» no se lee: es fórmula (pagado − total).
--
-- El monto se publica como está en la celda, también cuando supera el total (combustible cargado con
-- el pago bruto): es lo que la persona afirmó haber pagado, y corregirlo acá sería inventar.
create or replace view public.caja_egreso_percibido with (security_invoker = true) as
  with base as (
    select cs.fila, coalesce(c.area, 'sin_clasificar') as area, c.total, c.proveedor, c.obra_texto, cs.estado,
           cs.fecha_caja, cs.fecha_prevista_2, cs.monto_pagado, cs.monto_parcial_2, cs.saldo_pendiente
      from public.costos_obra c
      join public.compra_sheet cs on c.referencia_externa = coalesce(cs.sheet_id, cs.fila)::text
     where c.origen = 'compras_sheet'
       and not coalesce(cs.anulada, false)
  ),
  filas as (
    select fila, 'pago'::text as naturaleza, fecha_caja as fecha_pago, monto_pagado as monto from base
     where coalesce(monto_pagado, 0) <> 0
    union all
    select fila, 'pago', fecha_prevista_2, monto_parcial_2 from base
     where coalesce(monto_parcial_2, 0) <> 0
    union all
    select fila, 'sin_desglose', fecha_caja, total from base
     where estado = 'Pagado' and coalesce(monto_pagado, 0) = 0 and coalesce(monto_parcial_2, 0) = 0
    union all
    select fila, 'pendiente', fecha_caja, saldo_pendiente from base
     where estado <> 'Pagado' and coalesce(saldo_pendiente, 0) <> 0
  )
  select b.area, f.fecha_pago, f.monto, f.naturaleza, b.estado, b.proveedor, b.obra_texto, b.fila, b.total
    from filas f
    join base b using (fila)
   where (select public.ve_economia());

comment on view public.caja_egreso_percibido is
  'Lo PAGADO según Compras, en la fecha en que se pagó (percibido): naturaleza=pago (Monto Pagado en '
  'Fecha de caja + Monto Parcial 2 en Fecha prevista 2), sin_desglose (Pagado sin monto cargado: se '
  'lista, no se suma), pendiente (Saldo pendiente a su fecha prevista: deuda). Área = costos_obra.area. '
  'Dirección y Administración.';

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
