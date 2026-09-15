-- EL DETALLE DE CADA CELDA DE COSTO DEL CRM, Y «A LA FECHA» SIN LAS CUOTAS POR VENCER.
--
-- ═══ EL PEDIDO (dueño, 15/09/2026) ═══
--
-- «A la derecha, cada vez que haga click en Materiales, HH, Mano de obra o Subcontratos, que me salga
-- en ese menú discriminado lo que está considerando.» Y el mismo día, sobre OB-0011 PISOS
-- INDUSTRIALES: «has inventado costos». Subcontratos decía $20.084.000 y en Compras está claro qué
-- está pagado y qué por vencer: Pedro Tello tiene la 806 pagada, la 880 pagada, las 881–883 pendientes
-- con pago parcial y vencimiento 18/09, 25/09 y 02/10, y seis cuotas 956–961 sin un peso pagado.
--
-- ═══ LA REGLA «A LA FECHA», POR COMPROBANTE ═══
--
--   · Pagado (estado de Compras)                          → el total. Aunque el pago haya sido parcial:
--                                                            lo que Compras marca pagado, se debe entero.
--   · vencimiento previsto posterior a hoy, o fecha futura → sólo lo pagado (`monto_pagado`, acotado al
--                                                            total). El resto es POR VENCER.
--   · lo demás (vencido, o sin fecha prevista)             → el total.
--
-- Para OB-0011 hoy: a la fecha 7.220.000 (4.200.000 + 1.800.000 + 538.181,82 + 340.909,09 +
-- 340.909,09) y por vencer 12.864.000; la suma sigue siendo 20.084.000. `comprometido_futuro` pasa a
-- ser la suma de lo por vencer: la regla vieja «fecha del comprobante > hoy» queda adentro como caso
-- particular.
--
-- ═══ UNA SOLA REGLA DE FILAS ═══
--
-- Hasta hoy `costo_de_obras_a_la_fecha` y `compras_sin_obra_de_clientes` repetían, línea por línea, qué
-- comprobante entra y cuál es subcontrato. `costo_de_obra_filas` es ahora la única definición —una fila
-- por comprobante— y las dos RPC de la ficha y las dos de detalle la consumen. Lo mismo con la mano de
-- obra: `costo_mo_de_obras` es la lista de quincenas desde la primera hora hasta hoy, y el detalle y la
-- celda salen de las mismas filas de `costo_mo_quincena` (20260915T0800).
--
-- Trae además el arreglo del filtro muerto de `destino`: el CHECK de `compra_sheet.destino` guarda
-- 'obra' / 'estructura_admin' / 'estructura_taller', y la lista vieja ('ES-ADM', 'ES-TAL', 'IMP', 'FIN')
-- no excluía nada. La rama fix/obra-costo-por-obra-id (T2300) corrige esa misma línea: si se aplica
-- después de ésta, hay que volver a aplicar ésta.
--
-- ═══ RLS Y GRANTS ═══
-- Todo `security invoker`: la RLS de `costos_obra`, `compra_sheet`, `registros_hh` y `personas` es la de
-- quien consulta. Las dos RPC de detalle devuelven `null` a quien no es Administración, como `hh_de_obra`.
-- Firmas y grants de `costo_de_obras_a_la_fecha(text[])` y `compras_sin_obra_de_clientes(uuid[])`, iguales.

-- ─── 1 · LAS FILAS: un comprobante por fila, con su a-la-fecha y su por-vencer ───────────────────────
--
-- `p_obras` trae los comprobantes asignados a esas obras; `p_clientes`, los «sin obra» de esos clientes
-- (los que Compras imputa al cliente sin nombrar una de sus obras). Se pueden pedir juntos.

create or replace function public.costo_de_obra_filas(p_obras text[], p_clientes uuid[] default null)
 returns table (
   obra_id text, cliente_id uuid, referencia text, sheet_id integer, fila integer,
   fecha date, fecha_prevista date, estado text, proveedor text, comprobante text, concepto text,
   detalle_obra text, total numeric, monto_pagado numeric, a_la_fecha numeric, por_vencer numeric,
   es_subcontrato boolean, motivo_subcontrato text)
 language sql
 stable
 set search_path to 'public'
as $function$
  select a.obra_id, cl.cliente_id, c.referencia_externa, s.sheet_id, s.fila,
         c.fecha, coalesce(s.fecha_prevista, c.fecha_pago), s.estado,
         coalesce(s.proveedor, c.proveedor), coalesce(s.comprobante, c.comprobante), coalesce(s.concepto, c.concepto),
         s.detalle_obra, c.total, s.monto_pagado, k.a_la_fecha, c.total - k.a_la_fecha,
         sub.motivo is not null, sub.motivo
    from public.costos_obra c
    -- EL PUENTE ES LA ASIGNACIÓN, NO EL TEXTO DE LA COLUMNA J.
    join public.compra_obra_asignada a on a.referencia = c.referencia_externa
    left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
    -- EL CLIENTE CANÓNICO DE LA ASIGNACIÓN → su ficha. Lateral con `limit 1`: un segundo alias OS del
    -- mismo canónico no puede duplicar el comprobante.
    left join lateral (
      select cp.cliente_id
        from public.cliente_alias ca
        join public.cliente_panel cp on cp.slug = ca.rotulo
       where ca.fuente = 'OS' and ca.cliente_canonico = a.cliente
       limit 1
    ) cl on true
    cross join lateral (
      -- REGLA A LA FECHA ▼
      select case
        when c.total < 0 then c.total
        when upper(btrim(coalesce(s.estado, ''))) = 'PAGADO' then c.total
        when coalesce(s.fecha_prevista, c.fecha_pago) > current_date or c.fecha > current_date
          then least(greatest(coalesce(s.monto_pagado, 0), 0), c.total)
        else c.total
      end as a_la_fecha
      -- REGLA A LA FECHA ▲
    ) k
    cross join lateral (
      -- REGLA SUBCONTRATO ▼
      select case
        when exists (
          select 1 from public.proveedores p
           where p.rubro = 'Subcontratista' and coalesce(p.es_prueba, false) = false
             and ((public.normalizar_cuit(p.cuit) is not null
                   and public.normalizar_cuit(p.cuit) = public.normalizar_cuit(s.cuit))
               or public.normalizar_nombre_proveedor(p.nombre) = public.normalizar_nombre_proveedor(coalesce(s.proveedor, c.proveedor))
               or public.normalizar_nombre_proveedor(p.razon_social) = public.normalizar_nombre_proveedor(coalesce(s.proveedor, c.proveedor))
               or exists (select 1 from public.proveedor_alias pa
                           where pa.proveedor_id = p.id and pa.estado = 'vinculado'
                             and pa.nombre_norm = public.normalizar_nombre_proveedor(coalesce(s.proveedor, c.proveedor)))))
          then 'proveedor'
      end as motivo
      -- REGLA SUBCONTRATO ▲
    ) sub
   where c.origen = 'compras_sheet'
     and ((p_obras is not null and a.obra_id = any (p_obras))
       or (p_clientes is not null and a.obra_id is null and a.via = 'sin_obra' and cl.cliente_id = any (p_clientes)))
     -- NÓMINA, CARGAS, ARCA Y FINANCIERO NO SON COSTO DE OBRA.
     and c.area is distinct from 'personas'
     and c.area is distinct from 'contabilidad_legales'
     and c.area is distinct from 'administracion_finanzas'
     and coalesce(s.anulada, false) = false
     and upper(btrim(coalesce(s.estado, ''))) <> 'ELIMINADO'
     -- REGLA ESTRUCTURA ▼  (Administración, Taller, Impuestos y Financiero salen de toda obra)
     and upper(btrim(coalesce(c.unidad_negocio, ''))) not in ('ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO')
     and coalesce(s.destino, c.destino, '') not in ('estructura_admin', 'estructura_taller', 'ES-ADM', 'ES-TAL', 'IMP', 'FIN')
     -- REGLA ESTRUCTURA ▲
$function$;

revoke all on function public.costo_de_obra_filas(text[], uuid[]) from public, anon;
grant execute on function public.costo_de_obra_filas(text[], uuid[]) to authenticated, service_role;

comment on function public.costo_de_obra_filas(text[], uuid[]) is
  'LA ÚNICA DEFINICIÓN de qué comprobante de Compras es costo de una obra (p_obras) o gasto sin obra de un '
  'cliente (p_clientes), con a_la_fecha (Pagado → total; por vencer → sólo lo pagado) y por_vencer. '
  'La consumen costo_de_obras_a_la_fecha, compras_sin_obra_de_clientes y las RPC de detalle (20260915T2320).';

-- ─── 2 · LA MANO DE OBRA DE UNAS OBRAS, QUINCENA POR QUINCENA, DESDE LA PRIMERA HORA HASTA HOY ─────

create or replace function public.costo_mo_de_obras(p_obras text[])
 returns table (quincena_desde date, quincena_hasta date, obra_canonica_id text, persona_id uuid,
                horas numeric, costo_blanco numeric, costo_negro numeric, costo_total numeric,
                estado text, origen text, destino text, sellado_en timestamptz, reabierta boolean)
 language sql
 stable
 set search_path to 'public'
as $function$
  with quincenas as (
    select g::date as desde
      from (select min(r.fecha) as primera from public.hh_que_cuentan_en_obra r
             where r.obra_canonica_id = any (p_obras) and r.fecha <= current_date) m
      cross join lateral generate_series(date_trunc('month', m.primera), current_date::timestamp, interval '1 day') g
     where m.primera is not null and extract(day from g) in (1, 16)
  )
  select x.quincena_desde, x.quincena_hasta, x.obra_canonica_id, x.persona_id, x.horas, x.costo_blanco,
         x.costo_negro, x.costo_total, x.estado, x.origen, x.destino, x.sellado_en, x.reabierta
    from quincenas qq
    cross join lateral public.costo_mo_quincena(qq.desde, p_obras) x
   where x.obra_canonica_id is not null
$function$;

revoke all on function public.costo_mo_de_obras(text[]) from public, anon;
grant execute on function public.costo_mo_de_obras(text[]) to authenticated, service_role;

comment on function public.costo_mo_de_obras(text[]) is
  'Las filas de costo_mo_quincena (persona × quincena) de unas obras, de la primera hora cargada hasta hoy. '
  'La celda Mano de obra del CRM y su detalle salen de estas mismas filas (20260915T2320).';

-- ─── 3 · LA CELDA: la misma RPC, sobre las filas ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  materiales as (
    select f.obra_id,
           sum(f.a_la_fecha) filter (where not f.es_subcontrato)              as materiales,
           sum(f.a_la_fecha) filter (where f.es_subcontrato)                  as subcontratos,
           count(*)          filter (where not f.es_subcontrato)::int         as n_comprobantes,
           count(*)          filter (where f.es_subcontrato)::int             as n_subcontratos,
           max(f.fecha)      filter (where not f.es_subcontrato)              as ultimo_comprobante,
           -- LO POR VENCER NO ES COSTO A LA FECHA: viaja aparte, por columna y en total.
           nullif(sum(f.por_vencer) filter (where not f.es_subcontrato), 0)   as materiales_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.es_subcontrato), 0)       as subcontratos_por_vencer,
           nullif(sum(f.por_vencer), 0)                                       as comprometido_futuro,
           -- QUÉ COMPONE LA COLUMNA: proveedor y comprobante, del mayor al menor.
           jsonb_agg(jsonb_build_object(
                       'proveedor', f.proveedor, 'comprobante', f.comprobante, 'fecha', f.fecha,
                       'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer,
                       'motivo', f.motivo_subcontrato)
                     order by f.a_la_fecha desc)
             filter (where f.es_subcontrato)                                  as subcontratos_detalle
      from public.costo_de_obra_filas(p_obras) f
     group by f.obra_id
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'real')        as mano_obra_real,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada,
           sum(m.horas)       filter (where m.estado <> 'falta_dato') as horas_valorizadas,
           sum(m.horas)       filter (where m.estado = 'falta_dato')  as horas_sin_tarifa,
           count(distinct m.persona_id) filter (where m.estado = 'falta_dato')::int as personas_sin_tarifa,
           jsonb_agg(jsonb_build_object('persona_id', m.persona_id, 'nombre', pe.nombre_completo,
                                        'quincena', m.quincena_desde, 'horas', m.horas, 'origen', m.origen)
                     order by m.quincena_desde, pe.nombre_completo)
             filter (where m.estado = 'falta_dato') as falta_dato,
           max(m.quincena_hasta) filter (where m.sellado_en is not null) as sellado_hasta
      from public.costo_mo_de_obras(p_obras) m
      left join public.personas pe on pe.id = m.persona_id
     group by m.obra_canonica_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos,
           'n_comprobantes', k.n_comprobantes, 'n_subcontratos', coalesce(k.n_subcontratos, 0),
           'subcontratos_detalle', coalesce(k.subcontratos_detalle, '[]'::jsonb),
           'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'materiales_por_vencer', k.materiales_por_vencer, 'subcontratos_por_vencer', k.subcontratos_por_vencer,
           'mano_obra', h.mano_obra, 'mano_obra_real', h.mano_obra_real,
           'mano_obra_estimada', h.mano_obra_estimada, 'horas_valorizadas', h.horas_valorizadas,
           'horas_sin_tarifa', h.horas_sin_tarifa, 'personas_sin_tarifa', coalesce(h.personas_sin_tarifa, 0),
           'falta_dato', coalesce(h.falta_dato, '[]'::jsonb), 'sellado_hasta', h.sellado_hasta,
           'puede_ver_tarifas', public.liquida_sueldos(),
           'corte', current_date)), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   where k.obra_id is not null or h.obra_id is not null
$function$;

revoke all on function public.costo_de_obras_a_la_fecha(text[]) from public;
grant execute on function public.costo_de_obras_a_la_fecha(text[]) to authenticated, service_role;

-- ─── 4 · LA FILA «SIN OBRA ASIGNADA» DEL CLIENTE, sobre las mismas filas ────────────────────────────

CREATE OR REPLACE FUNCTION public.compras_sin_obra_de_clientes(p_clientes uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with filas as (
    select f.* from public.costo_de_obra_filas(null, p_clientes) f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', t.cliente_id,
           'materiales', t.materiales, 'subcontratos', t.subcontratos,
           'n_comprobantes', t.n_comprobantes, 'n_subcontratos', t.n_subcontratos,
           'comprometido_futuro', t.comprometido_futuro,
           'materiales_por_vencer', t.materiales_por_vencer, 'subcontratos_por_vencer', t.subcontratos_por_vencer,
           -- LOS CINCO DETALLES MÁS GRANDES: es lo que el `title` nombra para que se pueda cargar el
           -- alias que falta, no un listado.
           'detalles', (
             select coalesce(jsonb_agg(jsonb_build_object('detalle', d.detalle, 'total', d.total)
                                       order by d.total desc), '[]'::jsonb)
               from (select coalesce(nullif(trim(f.detalle_obra), ''), '(columna K vacía)') as detalle,
                            sum(f.a_la_fecha) as total
                       from filas f
                      where f.cliente_id = t.cliente_id
                      group by 1 order by 2 desc limit 5) d),
           'subcontratos_detalle', (
             select coalesce(jsonb_agg(jsonb_build_object('proveedor', f.proveedor, 'comprobante', f.comprobante,
                                                          'fecha', f.fecha, 'total', f.total, 'a_la_fecha', f.a_la_fecha,
                                                          'por_vencer', f.por_vencer, 'motivo', f.motivo_subcontrato)
                                       order by f.a_la_fecha desc), '[]'::jsonb)
               from filas f
              where f.cliente_id = t.cliente_id and f.es_subcontrato),
           'corte', current_date)), '[]'::jsonb)
    from (
      select f.cliente_id,
             sum(f.a_la_fecha) filter (where not f.es_subcontrato)              as materiales,
             sum(f.a_la_fecha) filter (where f.es_subcontrato)                  as subcontratos,
             count(*)::int                                                      as n_comprobantes,
             count(*)          filter (where f.es_subcontrato)::int             as n_subcontratos,
             nullif(sum(f.por_vencer), 0)                                       as comprometido_futuro,
             nullif(sum(f.por_vencer) filter (where not f.es_subcontrato), 0)   as materiales_por_vencer,
             nullif(sum(f.por_vencer) filter (where f.es_subcontrato), 0)       as subcontratos_por_vencer
        from filas f
       group by f.cliente_id) t
$function$;

revoke all on function public.compras_sin_obra_de_clientes(uuid[]) from public;
grant execute on function public.compras_sin_obra_de_clientes(uuid[]) to authenticated, service_role;

-- ─── 5 · EL DETALLE DE UNA CELDA DE UNA OBRA ─────────────────────────────────────────────────────────
--
-- `p_rubro`: materiales · subcontratos (comprobante por comprobante) · mano_obra (persona × quincena) ·
-- hh (persona, desde `hh_de_obra`). `total` y `n` son los de la celda: el panel cierra al centavo o hay
-- un defecto. `null` = no es Administración, o el rubro no existe.

create or replace function public.detalle_costo_de_obra(p_obra text, p_rubro text)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    when not public.es_administracion() then null::jsonb
    when p_rubro in ('materiales', 'subcontratos') then (
      select jsonb_build_object(
               'obra_id', p_obra, 'rubro', p_rubro, 'corte', current_date,
               'total', coalesce(sum(f.a_la_fecha), 0), 'por_vencer', coalesce(sum(f.por_vencer), 0),
               'n', count(*),
               'filas', coalesce(jsonb_agg(jsonb_build_object(
                          'referencia', f.referencia, 'sheet_id', f.sheet_id, 'fila', f.fila,
                          'fecha', f.fecha, 'fecha_prevista', f.fecha_prevista, 'estado', f.estado,
                          'proveedor', f.proveedor, 'comprobante', f.comprobante, 'concepto', f.concepto,
                          'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer)
                        order by f.fecha desc nulls last, f.fila desc nulls last), '[]'::jsonb))
        from public.costo_de_obra_filas(array[p_obra]) f
       where f.es_subcontrato = (p_rubro = 'subcontratos'))
    when p_rubro = 'mano_obra' then (
      select jsonb_build_object(
               'obra_id', p_obra, 'rubro', 'mano_obra', 'corte', current_date,
               'total', sum(m.costo_total) filter (where m.estado <> 'falta_dato'),
               'n', count(*),
               'horas', sum(m.horas) filter (where m.estado <> 'falta_dato'),
               'horas_sin_tarifa', sum(m.horas) filter (where m.estado = 'falta_dato'),
               'puede_ver_tarifas', public.liquida_sueldos(),
               'filas', coalesce(jsonb_agg(jsonb_build_object(
                          'persona_id', m.persona_id, 'nombre', pe.nombre_completo,
                          'quincena_desde', m.quincena_desde, 'quincena_hasta', m.quincena_hasta,
                          'horas', m.horas, 'blanco', m.costo_blanco, 'negro', m.costo_negro, 'total', m.costo_total,
                          'estado', m.estado, 'origen', m.origen, 'sellado', m.sellado_en is not null)
                        order by m.quincena_desde, pe.nombre_completo nulls last), '[]'::jsonb))
        from public.costo_mo_de_obras(array[p_obra]) m
        left join public.personas pe on pe.id = m.persona_id)
    when p_rubro = 'hh' then (
      -- LAS HORAS POR PERSONA SON LAS DE `hh_de_obra` (la pantalla completa `?hh=`): ninguna suma nueva.
      select case when t.j is null then null::jsonb else jsonb_build_object(
               'obra_id', p_obra, 'rubro', 'hh', 'corte', current_date,
               'total', (select sum((x ->> 'hh')::numeric) from jsonb_array_elements(coalesce(t.j -> 'por_persona', '[]'::jsonb)) x),
               'n', jsonb_array_length(coalesce(t.j -> 'por_persona', '[]'::jsonb)),
               'desde', t.j -> 'desde', 'hasta', t.j -> 'hasta',
               'filas', coalesce(t.j -> 'por_persona', '[]'::jsonb)) end
        from (select public.hh_de_obra(p_obra, null) as j) t)
    else null::jsonb
  end
$function$;

revoke all on function public.detalle_costo_de_obra(text, text) from public, anon;
grant execute on function public.detalle_costo_de_obra(text, text) to authenticated, service_role;

comment on function public.detalle_costo_de_obra(text, text) is
  'Lo que compone una celda de costo del CRM (materiales | subcontratos | mano_obra | hh) de una obra, con '
  'el mismo cálculo que la celda: total y n cierran contra costo_de_obras_a_la_fecha. null = sin permiso.';

-- ─── 6 · EL DETALLE DE LA FILA «GASTOS DEL CLIENTE SIN OBRA ASIGNADA» ─────────────────────────────────

create or replace function public.detalle_costo_sin_obra(p_cliente text, p_rubro text)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    when not public.es_administracion() then null::jsonb
    when p_rubro not in ('materiales', 'subcontratos') then null::jsonb
    else (
      select jsonb_build_object(
               'cliente', p_cliente, 'rubro', p_rubro, 'corte', current_date,
               'total', coalesce(sum(f.a_la_fecha), 0), 'por_vencer', coalesce(sum(f.por_vencer), 0),
               'n', count(*),
               'filas', coalesce(jsonb_agg(jsonb_build_object(
                          'referencia', f.referencia, 'sheet_id', f.sheet_id, 'fila', f.fila,
                          'fecha', f.fecha, 'fecha_prevista', f.fecha_prevista, 'estado', f.estado,
                          'proveedor', f.proveedor, 'comprobante', f.comprobante,
                          -- LA COLUMNA K, que es lo que hay que corregir para que el gasto encuentre su obra.
                          'concepto', coalesce(nullif(btrim(f.detalle_obra), ''), f.concepto),
                          'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer)
                        order by f.fecha desc nulls last, f.fila desc nulls last), '[]'::jsonb))
        from public.cliente_panel cp
        cross join lateral public.costo_de_obra_filas(null, array[cp.cliente_id]) f
       where cp.slug = p_cliente
         and f.es_subcontrato = (p_rubro = 'subcontratos'))
  end
$function$;

revoke all on function public.detalle_costo_sin_obra(text, text) from public, anon;
grant execute on function public.detalle_costo_sin_obra(text, text) to authenticated, service_role;

comment on function public.detalle_costo_sin_obra(text, text) is
  'Lo que compone la fila «Gastos del cliente sin obra asignada» del CRM (materiales | subcontratos), con el '
  'mismo cálculo que compras_sin_obra_de_clientes. p_cliente es el slug de cliente_panel. null = sin permiso.';

notify pgrst, 'reload schema';
