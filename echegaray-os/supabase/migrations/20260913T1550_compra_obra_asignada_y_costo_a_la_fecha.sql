-- A QUÉ OBRA VA CADA COMPRA, Y LO GASTADO A LA FECHA EN CADA OBRA — UNA SOLA DEFINICIÓN.
--
-- ═══ POR QUÉ (dueño, 13/09/2026) ═══
--
-- «Quiero que las columnas de Materiales y Mano de obra del módulo CRM admin muestren los costos hasta
-- el momento sumados de cada una de cada obra de cada cliente, no lo presupuestado; eso tiene que
-- estar dentro de cada obra».
--
-- Dos defectos, medidos contra producción el 13/09/2026:
--
--   1. LA ATRIBUCIÓN. `costo_obra` puenteaba `costos_obra.obra_texto` (la columna J, que dice el
--      CLIENTE) contra `obra_alias`: las 168 compras de San Francisco ($ 57,65 M) caían en la obra
--      madre cerrada, y SF - Pisos Industriales —$ 22,3 M a su nombre en la columna K— se dibujaba «—».
--   2. EL PRESUPUESTO EN EL CRM. La cartera `/clientes` rotulaba «Materiales» y «Mano de obra» lo que
--      el CONTRATO fija (`obra_contrato` vía `obra_economia_cartera`), no lo gastado.
--
-- ═══ QUÉ HACE ESTA MIGRACIÓN ═══
--
--   · `public.compra_obra_asignada`: la asignación fila por fila, escrita por
--     `orquestador/scripts/sync-compras.mjs` en la MISMA transacción que `costos_obra`. La regla vive
--     en `orquestador/lib/compras-obra-asignada.mjs` (cliente = J, obra = K con el resolutor de
--     JORNALES) y lo que no resuelve con evidencia queda con `obra_id` null. Nunca se reparte.
--   · `public.costo_de_obras_a_la_fecha(text[])`: materiales (Compras con fecha ≤ hoy) y mano de obra
--     (horas de la planilla a la fecha × tarifa × multiplicador). Es el cuerpo que vivía adentro de
--     `pantalla_cliente.costo_obra`, sacado a una función para que la ficha y la cartera lean la MISMA
--     cuenta. Lo comprado con fecha futura no entra: viaja aparte como `comprometido_futuro`.
--   · `public.compras_sin_obra_de_clientes(uuid[])`: lo del cliente que no tiene obra, con sus
--     detalles más grandes. Se publica en una fila propia al pie; la identidad
--     «Σ obras + sin obra = Compras del cliente» cierra porque cada fila de `costos_obra` tiene
--     exactamente una asignación.
--   · `pantalla_clientes()`: deja de transportar el desglose presupuestado (mano de obra y materiales
--     del contrato) y transporta el costo a la fecha. El PRECIO (`contrato_total`) se queda: la celda
--     Contratado lo sigue necesitando.
--
-- `pantalla_cliente` NO se toca acá: su cambio va en 20260913T1600, construido sobre la definición
-- viva después de 20260913T1500 (otra tarea edita la misma función).
--
-- ORDEN DE APLICACIÓN: esta migración ANTES del primer `sync-compras` con el código nuevo — sin la
-- tabla, el sync aborta con ROLLBACK y el espejo queda como estaba (no se pierde nada, pero no avanza).

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. LA ASIGNACIÓN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.compra_obra_asignada (
  -- La MISMA clave que `costos_obra.referencia_externa`: `sheet_id` y, sin id, la fila.
  referencia      text primary key,
  fila            integer not null,
  sheet_id        integer,
  -- El cliente canónico (`cliente_alias.cliente_canonico`). null = la columna J no es un cliente.
  cliente         text,
  obra_id         text references public.obra_canonica (id) on delete set null,
  via             text not null check (via in ('obra_por_alias', 'obra_por_nombre',
                                               'unica_obra_del_cliente', 'sin_obra', 'no_es_cliente')),
  -- Por qué quedó así, en una frase: es lo que la fila «sin obra asignada» muestra en su `title`.
  porque          text not null,
  sincronizado_en timestamptz not null default now(),
  -- UNA OBRA SIN VÍA QUE LA PRUEBE NO EXISTE, Y UNA VÍA DE OBRA SIN OBRA TAMPOCO.
  constraint compra_obra_asignada_via_coherente check (
    (obra_id is null) = (via in ('sin_obra', 'no_es_cliente'))
  ),
  constraint compra_obra_asignada_cliente_coherente check ((cliente is null) = (via = 'no_es_cliente'))
);

create index if not exists compra_obra_asignada_obra_idx on public.compra_obra_asignada (obra_id);
create index if not exists compra_obra_asignada_cliente_idx on public.compra_obra_asignada (cliente);

comment on table public.compra_obra_asignada is
  'A qué obra va cada fila de Compras que es costo de obra. Escribe sync-compras.mjs con la regla de '
  'lib/compras-obra-asignada.mjs (J = cliente, K = obra, resolutor de JORNALES). obra_id null = sin '
  'evidencia: se publica como gasto del cliente sin obra asignada, nunca repartido.';

-- La MISMA puerta que `compra_sheet`: quien lee Compras lee a qué obra fue cada compra.
alter table public.compra_obra_asignada enable row level security;
drop policy if exists compra_obra_asignada_select on public.compra_obra_asignada;
create policy compra_obra_asignada_select on public.compra_obra_asignada for select
  to authenticated using ((select public.es_administracion()));
grant select on public.compra_obra_asignada to authenticated;
grant select, insert, update, delete on public.compra_obra_asignada to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. LO GASTADO A LA FECHA EN CADA OBRA
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SECURITY INVOKER a propósito: `persona_tarifa` y `costo_hora_alicuota` tienen RLS por
-- `liquida_sueldos()` y `compra_obra_asignada` por `es_administracion()`. Con DEFINER la función
-- saltearía las dos puertas.
create or replace function public.costo_de_obras_a_la_fecha(p_obras text[])
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with
  -- EL MULTIPLICADOR, UNA VEZ POR TRAMO (ver 20260912T1300): exacto, no una aproximación.
  tramos_de_costo as (
    select d.desde, public.multiplicador_de_costo(d.desde, 1) as v
      from (select distinct a.desde from public.costo_hora_alicuota a) d
  ),
  -- EL DIVISOR DEL SUELDO MENSUAL (dueño, 13/09/2026): horas de la planilla del mes en TODAS sus obras.
  horas_del_mes as (
    select r.persona_id, date_trunc('month', r.fecha)::date as mes, sum(r.horas) as horas
      from public.registros_hh r
     where r.tipo_hora in ('normal', 'extra_50', 'extra_100')
       and r.fuente_legacy = 'sheet:jornales'
       and r.persona_id in (select p.persona_id from public.persona_tarifa p where p.neto_mensual is not null)
     group by 1, 2
  ),
  -- ── MATERIALES: LAS COMPRAS ASIGNADAS A LA OBRA, A LA FECHA ─────────────────────────────────────
  materiales as (
    select a.obra_id,
           sum(c.total) filter (where not x.es_subcontrato and not x.futuro)      as materiales,
           sum(c.total) filter (where x.es_subcontrato and not x.futuro)          as subcontratos,
           count(*)     filter (where not x.es_subcontrato and not x.futuro)::int as n_comprobantes,
           max(c.fecha) filter (where not x.es_subcontrato and not x.futuro)      as ultimo_comprobante,
           -- LO COMPRADO CON FECHA FUTURA NO ES COSTO A LA FECHA: viaja aparte y el `title` lo dice.
           sum(c.total) filter (where x.futuro)                                   as comprometido_futuro
      from public.costos_obra c
      -- EL PUENTE ES LA ASIGNACIÓN, NO EL TEXTO DE LA COLUMNA J.
      join public.compra_obra_asignada a on a.referencia = c.referencia_externa
      left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
      cross join lateral (
        select coalesce(s.familia_material, '') = 'Subcontratos y mano de obra' as es_subcontrato,
               coalesce(c.fecha > current_date, false)                          as futuro) x
     where c.origen = 'compras_sheet'
       and a.obra_id = any (p_obras)
       and c.area is distinct from 'personas'
       and c.area is distinct from 'contabilidad_legales'
       and c.area is distinct from 'administracion_finanzas'
       and coalesce(s.anulada, false) = false
       and upper(trim(coalesce(s.estado, ''))) <> 'ELIMINADO'
     group by a.obra_id
  ),
  -- ── MANO DE OBRA: LA REGLA DE «COSTO A LA OBRA», A LA FECHA DE CADA REGISTRO ───────────────────
  -- Idéntica a la de 20260913T1400 más UNA condición: `r.fecha <= current_date`. Medido el 13/09/2026:
  -- no hay ningún registro futuro de la planilla, así que hoy el número no se mueve.
  mano_obra as (
    select g.obra_id,
           sum(g.costo) as mano_obra,
           sum(g.h_ok)  as horas_valorizadas,
           sum(g.h_no)  as horas_sin_tarifa,
           count(distinct g.persona_id) filter (where g.sin_tarifa)::int as personas_sin_tarifa,
           jsonb_agg(jsonb_build_object(
                       'persona_id', g.persona_id, 'mes', g.mes,
                       'neto_mensual', g.neto_mensual, 'horas_mes', g.horas_mes,
                       'horas', g.h_ok) order by g.mes, g.persona_id)
             filter (where g.neto_mensual is not null and g.h_ok is not null) as implicito
      from (
        select r.obra_canonica_id as obra_id, r.persona_id, u.mes, u.neto_mensual, u.horas_mes,
               sum(u.bolsillo * m.v) filter (where u.bolsillo is not null and m.v is not null) as costo,
               sum(r.horas)          filter (where u.bolsillo is not null and m.v is not null) as h_ok,
               sum(r.horas)          filter (where u.bolsillo is null or m.v is null)         as h_no,
               bool_or(u.bolsillo is null)                                                    as sin_tarifa
          from public.registros_hh r
          left join lateral (
            select p.valor_hora from public.persona_tarifa p
             where p.persona_id = r.persona_id and p.desde <= r.fecha
             order by p.desde desc limit 1) t on true
          left join lateral (
            select p.neto_mensual from public.persona_tarifa p
             where t.valor_hora is null
               and p.persona_id = r.persona_id and p.desde <= date_trunc('month', r.fecha)::date
             order by p.desde desc limit 1) n on true
          left join horas_del_mes hm
            on hm.persona_id = r.persona_id and hm.mes = date_trunc('month', r.fecha)::date
          cross join lateral (
            select date_trunc('month', r.fecha)::date as mes,
                   case when t.valor_hora is null and hm.horas > 0 then n.neto_mensual end as neto_mensual,
                   case when t.valor_hora is null and n.neto_mensual is not null and hm.horas > 0
                        then hm.horas end as horas_mes,
                   case when t.valor_hora is not null then r.horas * t.valor_hora
                        when hm.horas > 0 then r.horas * n.neto_mensual / hm.horas end as bolsillo) u
          left join lateral (
            select x.v from tramos_de_costo x
             where x.desde <= r.fecha
             order by x.desde desc limit 1) m on true
         where r.obra_canonica_id = any (p_obras)
           and r.tipo_hora in ('normal', 'extra_50', 'extra_100')
           and r.fuente_legacy = 'sheet:jornales'
           and r.fecha <= current_date
         group by 1, 2, 3, 4, 5) g
     group by g.obra_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos,
           'n_comprobantes', k.n_comprobantes, 'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'mano_obra', h.mano_obra, 'horas_valorizadas', h.horas_valorizadas,
           'horas_sin_tarifa', h.horas_sin_tarifa, 'personas_sin_tarifa', h.personas_sin_tarifa,
           'multiplicador', public.multiplicador_de_costo(current_date),
           'puede_ver_tarifas', public.liquida_sueldos(),
           'implicito', coalesce(h.implicito, '[]'::jsonb),
           -- LA FECHA DE CORTE VIAJA CON EL DATO: el `title` dice «a la fecha dd/mm» con ésta.
           'corte', current_date)), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   -- Una obra sin compras y sin horas NO viaja: la pantalla dibuja «—» por ausencia de fila.
   where k.obra_id is not null or h.obra_id is not null
$function$;

revoke all on function public.costo_de_obras_a_la_fecha(text[]) from public;
grant execute on function public.costo_de_obras_a_la_fecha(text[]) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. LOS GASTOS DEL CLIENTE SIN OBRA ASIGNADA
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- El cliente de la asignación es el canónico («SAN FRANCISCO»); la ficha conoce el `cliente_id`. El
-- puente es `cliente_alias` fuente 'OS', cuyo rótulo es el slug — el mismo que ya usa el OS.
create or replace function public.compras_sin_obra_de_clientes(p_clientes uuid[])
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with filas as (
    select cp.cliente_id, c.total, s.detalle_obra, a.porque,
           coalesce(s.familia_material, '') = 'Subcontratos y mano de obra' as es_subcontrato,
           coalesce(c.fecha > current_date, false)                          as futuro
      from public.costos_obra c
      join public.compra_obra_asignada a on a.referencia = c.referencia_externa
      join public.cliente_alias ca on ca.fuente = 'OS' and ca.cliente_canonico = a.cliente
      join public.cliente_panel cp on cp.slug = ca.rotulo
      left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
     where c.origen = 'compras_sheet'
       and a.obra_id is null
       and a.via = 'sin_obra'
       and cp.cliente_id = any (p_clientes)
       and c.area is distinct from 'personas'
       and c.area is distinct from 'contabilidad_legales'
       and c.area is distinct from 'administracion_finanzas'
       and coalesce(s.anulada, false) = false
       and upper(trim(coalesce(s.estado, ''))) <> 'ELIMINADO'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', t.cliente_id,
           'materiales', t.materiales, 'subcontratos', t.subcontratos,
           'n_comprobantes', t.n_comprobantes, 'comprometido_futuro', t.comprometido_futuro,
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
           'corte', current_date)), '[]'::jsonb)
    from (
      select f.cliente_id,
             sum(f.total) filter (where not f.es_subcontrato and not f.futuro)      as materiales,
             sum(f.total) filter (where f.es_subcontrato and not f.futuro)          as subcontratos,
             count(*)     filter (where not f.futuro)::int                          as n_comprobantes,
             sum(f.total) filter (where f.futuro)                                   as comprometido_futuro
        from filas f
       group by f.cliente_id) t
$function$;

revoke all on function public.compras_sin_obra_de_clientes(uuid[]) from public;
grant execute on function public.compras_sin_obra_de_clientes(uuid[]) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. LA CARTERA: SIN DESGLOSE PRESUPUESTADO, CON EL COSTO A LA FECHA
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Definición viva leída con `pg_get_functiondef` el 13/09/2026 (main 002cc797). Cambian SÓLO:
--   · `economia_obras` pierde `contrato_mano_obra`, `contrato_mano_obra_usd`, `contrato_materiales` y
--     `contrato_materiales_usd` (el presupuesto sale del CRM; vive en la solapa Economía de la obra).
--   · se agregan `costo_obra` y `costo_sin_obra`, con la MISMA guarda de rol que la ficha: `null` =
--     no puedo decirlo; `[]` = nadie gastó nada.
create or replace function public.pantalla_clientes()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with obras as materialized (
    select o.obra_id, o.nombre, o.cliente_id, o.estado, o.avance_pct, o.jefe_obra, o.orden,
           o.obra_padre_id
      from public.obra_panel o
  )
  select jsonb_build_object(

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    'clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'cliente_id', c.cliente_id, 'slug', c.slug,
                 'nombre_comercial', c.nombre_comercial, 'razon_social', c.razon_social,
                 'cuit', c.cuit, 'direccion', c.direccion, 'telefono', c.telefono,
                 'email', c.email, 'responsable_id', c.responsable_id,
                 'responsable_nombre', c.responsable_nombre, 'drive_carpeta_id', c.drive_carpeta_id,
                 'activo', c.activo, 'notas', c.notas, 'n_obras', c.n_obras,
                 'n_obras_activas', c.n_obras_activas,
                 'restricciones_abiertas', c.restricciones_abiertas,
                 'avance_sincronizado_en', c.avance_sincronizado_en,
                 'n_contactos', c.n_contactos, 'n_documentos', c.n_documentos)
               order by c.n_obras_activas desc, c.nombre_comercial asc), '[]'::jsonb)
        from public.cliente_panel c
    ),

    'obras_activas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'avance_pct', o.avance_pct,
                                  'jefe_obra', o.jefe_obra,
                                  'obra_padre_id', o.obra_padre_id)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from obras o
       where o.estado = 'activa'
    ),

    'obras_todas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'estado', o.estado,
                                  'avance_pct', o.avance_pct,
                                  'obra_padre_id', o.obra_padre_id)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from obras o
    ),

    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
    ),

    'certificados', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', t.obra_canonica_id, 'numero', t.numero,
                                  'fecha_certificacion', t.fecha_certificacion,
                                  'fecha_facturacion', t.fecha_facturacion,
                                  'fecha_cobranza', t.fecha_cobranza)
               order by t.fecha_certificacion asc), '[]'::jsonb)
        from public.certificados t
    ),

    'papeles', (
      select coalesce(jsonb_agg(
               jsonb_build_object('id', r.id, 'cliente_id', r.cliente_id, 'obra_id', r.obra_id,
                                  'tipo', r.tipo, 'numero', r.numero, 'fecha', r.fecha,
                                  'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
                                  'nombre_archivo', r.nombre_archivo,
                                  'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.eliminado_en is null
    ),

    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'obra_padre_id', e.obra_padre_id,
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  -- EL DESGLOSE PRESUPUESTADO SIGUE VIAJANDO HASTA QUE LA CARTERA
                                  -- (`TablaClientes`) deje de dibujarlo: sacarlo antes dejaría sus dos
                                  -- columnas en «—». Se retira junto con ese cambio de pantalla.
                                  'contrato_mano_obra', e.contrato_mano_obra,
                                  'contrato_mano_obra_usd', e.contrato_mano_obra_usd,
                                  'contrato_materiales', e.contrato_materiales,
                                  'contrato_materiales_usd', e.contrato_materiales_usd,
                                  'contrato_total', e.contrato_total,
                                  'contrato_fuente', e.contrato_fuente,
                                  'contrato_fuente_drive_id', e.contrato_fuente_drive_id,
                                  'contrato_fuente_nombre', e.contrato_fuente_nombre,
                                  'contrato_cita', e.contrato_cita,
                                  'contrato_nota', e.contrato_nota)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    -- ═══ LO GASTADO A LA FECHA EN CADA TRABAJO EN CURSO (dueño, 13/09/2026) ═══
    'costo_obra', case
      when not (select public.es_administracion()) then null::jsonb
      else public.costo_de_obras_a_la_fecha(array(select o.obra_id from obras o where o.estado = 'activa'))
    end,

    'costo_sin_obra', case
      when not (select public.es_administracion()) then null::jsonb
      else public.compras_sin_obra_de_clientes(array(select c.cliente_id from public.cliente_panel c))
    end,

    'contratos', (
      select coalesce(jsonb_agg(distinct d.cliente_id), '[]'::jsonb)
        from public.cliente_documento d
       where d.rol = 'contrato'
    ),

    'economia_clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object('cliente_id', x.cliente_id, 'contratado', x.contratado,
                                  'contratado_en_curso', x.contratado_en_curso,
                                  'n_obras_en_curso', x.n_obras_en_curso,
                                  'n_obras_cerradas', x.n_obras_cerradas,
                                  'n_obras_con_precio', x.n_obras_con_precio,
                                  'n_obras_sin_precio', x.n_obras_sin_precio,
                                  'costo_real', x.costo_real, 'facturado_90d', x.facturado_90d,
                                  'cobrado_90d', x.cobrado_90d, 'cobrado_total', x.cobrado_total,
                                  'cobrado_neto_total', x.cobrado_neto_total, 'saldo', x.saldo,
                                  'vencido', x.vencido, 'por_vencer', x.por_vencer,
                                  'pendiente_contractual', x.pendiente_contractual)), '[]'::jsonb)
        from public.cliente_economia x
    )
  )
$function$;
