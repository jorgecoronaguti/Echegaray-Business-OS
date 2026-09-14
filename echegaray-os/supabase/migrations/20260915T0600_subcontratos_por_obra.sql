-- LOS SUBCONTRATOS SE DISCRIMINAN: una columna propia en el costo directo de cada obra.
--
-- «tenes q considerar a los subcontratos q aparecen en pestaña compras q se le imputa como gasto directo
-- de materiales o mano de obra quiero columna subcontrato en crm admin clientes y q lo discrimine, tengo
-- mucho de eso» (dueño, 14/09/2026).
--
-- ═══ EL DIAGNÓSTICO (solo lectura, 14/09/2026, compras 2026) ═══
--
-- Hasta acá un subcontrato se reconocía SÓLO por `compra_sheet.familia_material = 'Subcontratos y mano de
-- obra'`, que es un regex sobre el concepto (`orquestador/lib/familia-material.mjs`): 6 filas, $2,06 M;
-- 5 sin obra y 1 en Quattropani ($47.462, cal y tanza de Corralón Progreso: FALSO POSITIVO por la nota
-- a mano «Replanteo»). Lo grueso estaba en Materiales: los proveedores con `proveedores.rubro =
-- 'Subcontratista'` declarado —Pedro Tello, Pedro Fredes, Gerson Castro— tienen sus filas en familias de
-- material (Hormigón, Hierro, Plomería): Pisos Industriales ≈ $19 M, Quattropani $5,2 M.
--
-- ═══ LA REGLA (propuesta, un único bloque «REGLA SUBCONTRATO» en las dos funciones) ═══
--
--   subcontrato ⇔ proveedor con rubro DECLARADO 'Subcontratista' (no de prueba; por CUIT, nombre, razón
--                 social o alias vinculado)  OR  familia_material = 'Subcontratos y mano de obra'.
--
-- No reclasifican `rubro_deducido`, el texto del concepto ni una cuenta de prueba: los dudosos se
-- marcan en la ficha del proveedor. Espejo JS y tests: `orquestador/lib/subcontrato-de-compra.mjs`.
--
-- ═══ ESTRUCTURA NUNCA ES COSTO DE OBRA (dueño, 14/09/2026) ═══
--
-- «tenemos q considerar la unidad de negocio estructura taller admin, al momento de asignar un gasto». El
-- bloque «REGLA ESTRUCTURA» saca de toda obra y de la fila sin obra lo que Compras marca como unidad de
-- negocio Estructura (Administración, Taller), Impuestos o Financiero. Medido el 14/09: una sola fila entraba
-- a una obra —Leandro Rojas, $350.000, unidad Estructura, en LE - OFICINA Y FÁBRICA DE PALITOS—. La columna
-- `destino` (ES-ADM · ES-TAL · IMP · FIN) de feat/obra-por-fila se lee con `to_jsonb(fila) ->> 'destino'`:
-- funciona antes y después de que esa migración agregue la columna.
--
-- ═══ LA INVARIANTE ═══
--
-- Reclasificar NO cambia materiales + subcontratos de ninguna obra: el importe cambia de columna. La
-- mano de obra propia no se toca acá (20260915T0500) y un subcontrato de mano de obra no entra en ella.
--
-- Build sobre 20260915T0500 (no aplicada todavía) y sobre la definición viva de
-- `compras_sin_obra_de_clientes`. NO se borra `ficha_cliente_cache`: se invalidan a mano los clientes
-- afectados (ver el informe).

CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  -- ── MATERIALES Y SUBCONTRATOS: LAS COMPRAS ASIGNADAS A LA OBRA, A LA FECHA ──────────────────────
  materiales as (
    select a.obra_id,
           sum(c.total) filter (where sub.motivo is null and not x.futuro)           as materiales,
           sum(c.total) filter (where sub.motivo is not null and not x.futuro)       as subcontratos,
           count(*)     filter (where sub.motivo is null and not x.futuro)::int      as n_comprobantes,
           count(*)     filter (where sub.motivo is not null and not x.futuro)::int  as n_subcontratos,
           max(c.fecha) filter (where sub.motivo is null and not x.futuro)           as ultimo_comprobante,
           -- LO COMPRADO CON FECHA FUTURA NO ES COSTO A LA FECHA: viaja aparte y el `title` lo dice.
           sum(c.total) filter (where x.futuro)                                      as comprometido_futuro,
           -- QUÉ COMPONE LA COLUMNA: proveedor y comprobante, del mayor al menor.
           jsonb_agg(jsonb_build_object(
                       'proveedor', coalesce(s.proveedor, c.proveedor),
                       'comprobante', coalesce(s.comprobante, c.comprobante),
                       'fecha', c.fecha, 'total', c.total, 'motivo', sub.motivo)
                     order by c.total desc)
             filter (where sub.motivo is not null and not x.futuro)                  as subcontratos_detalle
      from public.costos_obra c
      -- EL PUENTE ES LA ASIGNACIÓN, NO EL TEXTO DE LA COLUMNA J.
      join public.compra_obra_asignada a on a.referencia = c.referencia_externa
      left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
      cross join lateral (select coalesce(c.fecha > current_date, false) as futuro) x
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
          when coalesce(s.familia_material, '') = 'Subcontratos y mano de obra' then 'familia'
        end as motivo
        -- REGLA SUBCONTRATO ▲
      ) sub
     where c.origen = 'compras_sheet'
       and a.obra_id = any (p_obras)
       and c.area is distinct from 'personas'
       and c.area is distinct from 'contabilidad_legales'
       and c.area is distinct from 'administracion_finanzas'
       and coalesce(s.anulada, false) = false
       and upper(trim(coalesce(s.estado, ''))) <> 'ELIMINADO'
       -- REGLA ESTRUCTURA ▼
       and upper(btrim(coalesce(c.unidad_negocio, ''))) not in ('ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO')
       and coalesce(to_jsonb(s) ->> 'destino', to_jsonb(c) ->> 'destino', '') not in ('ES-ADM', 'ES-TAL', 'IMP', 'FIN')
       -- REGLA ESTRUCTURA ▲
     group by a.obra_id
  ),
  -- ── MANO DE OBRA: LA DEFINICIÓN ÚNICA (20260915T0500), QUINCENA POR QUINCENA ────────────────────
  quincenas as (
    select g::date as desde
      from (select min(r.fecha) as primera from public.hh_que_cuentan_en_obra r
             where r.obra_canonica_id = any (p_obras) and r.fecha <= current_date) m
      cross join lateral generate_series(date_trunc('month', m.primera), current_date::timestamp, interval '1 day') g
     where m.primera is not null and extract(day from g) in (1, 16)
  ),
  mo as (
    select x.* from quincenas qq cross join lateral public.costo_mo_quincena(qq.desde, p_obras) x
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
      from mo m
      left join public.personas pe on pe.id = m.persona_id
     where m.obra_canonica_id is not null
     group by m.obra_canonica_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos,
           'n_comprobantes', k.n_comprobantes, 'n_subcontratos', coalesce(k.n_subcontratos, 0),
           'subcontratos_detalle', coalesce(k.subcontratos_detalle, '[]'::jsonb),
           'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LOS GASTOS DEL CLIENTE SIN OBRA: la MISMA regla (build sobre la definición viva del 14/09/2026)
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compras_sin_obra_de_clientes(p_clientes uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with filas as (
    select cp.cliente_id, c.total, s.detalle_obra, a.porque, c.fecha,
           coalesce(s.proveedor, c.proveedor) as proveedor, coalesce(s.comprobante, c.comprobante) as comprobante,
           sub.motivo, sub.motivo is not null as es_subcontrato,
           coalesce(c.fecha > current_date, false) as futuro
      from public.costos_obra c
      join public.compra_obra_asignada a on a.referencia = c.referencia_externa
      join public.cliente_alias ca on ca.fuente = 'OS' and ca.cliente_canonico = a.cliente
      join public.cliente_panel cp on cp.slug = ca.rotulo
      left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
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
          when coalesce(s.familia_material, '') = 'Subcontratos y mano de obra' then 'familia'
        end as motivo
        -- REGLA SUBCONTRATO ▲
      ) sub
     where c.origen = 'compras_sheet'
       and a.obra_id is null
       and a.via = 'sin_obra'
       and cp.cliente_id = any (p_clientes)
       and c.area is distinct from 'personas'
       and c.area is distinct from 'contabilidad_legales'
       and c.area is distinct from 'administracion_finanzas'
       and coalesce(s.anulada, false) = false
       and upper(trim(coalesce(s.estado, ''))) <> 'ELIMINADO'
       -- REGLA ESTRUCTURA ▼
       and upper(btrim(coalesce(c.unidad_negocio, ''))) not in ('ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO')
       and coalesce(to_jsonb(s) ->> 'destino', to_jsonb(c) ->> 'destino', '') not in ('ES-ADM', 'ES-TAL', 'IMP', 'FIN')
       -- REGLA ESTRUCTURA ▲
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', t.cliente_id,
           'materiales', t.materiales, 'subcontratos', t.subcontratos,
           'n_comprobantes', t.n_comprobantes, 'n_subcontratos', t.n_subcontratos,
           'comprometido_futuro', t.comprometido_futuro,
           -- LOS CINCO DETALLES MÁS GRANDES: es lo que el `title` nombra para que se pueda cargar el
           -- alias que falta, no un listado.
           'detalles', (
             select coalesce(jsonb_agg(jsonb_build_object('detalle', d.detalle, 'total', d.total)
                                       order by d.total desc), '[]'::jsonb)
               from (select coalesce(nullif(trim(f.detalle_obra), ''), '(columna K vacía)') as detalle,
                            sum(f.total) as total
                       from filas f
                      where f.cliente_id = t.cliente_id and not f.futuro
                      group by 1 order by 2 desc limit 5) d),
           'subcontratos_detalle', (
             select coalesce(jsonb_agg(jsonb_build_object('proveedor', f.proveedor, 'comprobante', f.comprobante,
                                                          'fecha', f.fecha, 'total', f.total, 'motivo', f.motivo)
                                       order by f.total desc), '[]'::jsonb)
               from filas f
              where f.cliente_id = t.cliente_id and f.es_subcontrato and not f.futuro),
           'corte', current_date)), '[]'::jsonb)
    from (
      select f.cliente_id,
             sum(f.total) filter (where not f.es_subcontrato and not f.futuro)      as materiales,
             sum(f.total) filter (where f.es_subcontrato and not f.futuro)          as subcontratos,
             count(*)     filter (where not f.futuro)::int                          as n_comprobantes,
             count(*)     filter (where f.es_subcontrato and not f.futuro)::int     as n_subcontratos,
             sum(f.total) filter (where f.futuro)                                   as comprometido_futuro
        from filas f
       group by f.cliente_id) t
$function$;

revoke all on function public.compras_sin_obra_de_clientes(uuid[]) from public;
grant execute on function public.compras_sin_obra_de_clientes(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
