-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PRESUPUESTO SE PUEDE LEER — Y SÓLO LO LEE QUIEN VE PRECIO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Tres defectos míos que encontró quien construyó las pantallas, y los tres se arreglan acá.
--
-- ═══ 1 · RLS NO ES GRANT ═══
--
-- `public.cotizaciones` tiene policies desde julio y **nunca tuvo GRANT**. Medido con el usuario de
-- Dirección real: `GET cotizaciones → 403 (42501)`, y con él caen `cotizacion_cascada` y
-- `cotizacion_partida_valorizada`, que son `security_invoker` y leen la tabla por debajo. El módulo
-- entero era inalcanzable para todos. Yo extendí la tabla con doce columnas y no miré si se podía
-- leer: la policy decía que sí y la base contestaba «permission denied».
--
-- ═══ 2 · Y LA POLICY DE LECTURA DECÍA `using (true)` ═══
--
-- Conceder el GRANT sin tocar eso habría abierto `monto_venta`, `margen_pct` y `costo_estimado` de
-- la cabecera a **cualquier autenticado, incluido el jefe de obra**, por PostgREST directo. Lo
-- verificaron con el token de un jefe: la RLS de `cotizacion_partida` sí lo frena, la cabecera no.
-- Un presupuesto ES precio: entero es económico. La pantalla ya lo cerraba con `veEconomia()`, pero
-- eso es la puerta, no la cerradura — y el contrato dice que la seguridad se hace cumplir en la
-- base, no ocultando UI.
--
-- ═══ 3 · UNA PARTIDA SUBCONTRATADA NO APORTABA SU PRECIO ═══
--
-- `cotizacion_partida_valorizada` valorizaba sólo por el análisis. Medido: una partida con
-- `precio_subcontrato = 5.000.000` dejaba `costo_directo = 0`, `precio_venta = 0` y
-- `n_sin_analisis = 0` — el presupuesto se veía COMPLETO y le faltaba un paquete entero. Es el peor
-- modo de fallar: no grita, y el número que sale por la puerta es el precio que se oferta.
--
-- Una partida subcontratada tampoco consume HH propias, y eso es un HECHO, no una ausencia: sus
-- HH valen 0, no NULL. La distinción importa porque «sin cargar» pide que alguien cargue algo y
-- acá no hay nada que cargar.

-- ── 1 · que se pueda leer ─────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.cotizaciones to authenticated;

-- ── 2 · y que sólo lo lea quien ve precio ─────────────────────────────────────────────────────
drop policy if exists cotizaciones_select on public.cotizaciones;
create policy cotizaciones_select on public.cotizaciones for select to authenticated
  using (public.ve_economia());

comment on table public.cotizaciones is
  'El presupuesto de venta. En la pantalla se llama «Presupuesto»; acá conserva este nombre porque '
  'hay código del orquestador leyéndola. ES PRECIO: la lectura exige ve_economia(), no porque la '
  'pantalla lo esconda sino porque la fila no sale de la base para quien no lo tiene.';

-- ── 3 · la partida subcontratada vale lo que se contrató ──────────────────────────────────────
create or replace view public.cotizacion_partida_valorizada with (security_invoker = true) as
select p.id                as partida_id,
       p.cotizacion_id, p.orden, p.rubro, p.codigo, p.descripcion, p.cantidad, p.unidad,
       p.tarea_tipo_id, p.analisis_id, p.metodo_medicion, p.subcontratada, p.precio_subcontrato,
       c.congelada_en is not null                              as congelada,
       case
         when p.subcontratada then p.precio_subcontrato / nullif(p.cantidad, 0)
         else coalesce(p.costo_unitario, ac.costo_directo)
       end                                                     as costo_unitario,
       -- Una partida subcontratada NO consume horas propias. Cero es el dato, no un hueco.
       case when p.subcontratada then 0
            else coalesce(p.hs_unitarias, ac.hs_unitarias) end as hs_unitarias,
       case
         when p.subcontratada then p.precio_subcontrato
         else p.cantidad * coalesce(p.costo_unitario, ac.costo_directo)
       end                                                     as subtotal,
       case when p.subcontratada then 0
            else p.cantidad * coalesce(p.hs_unitarias, ac.hs_unitarias) end as hh,
       (p.analisis_id is null and not p.subcontratada)         as sin_analisis,
       (p.subcontratada and p.precio_subcontrato is null)      as sin_precio_de_subcontrato
  from public.cotizacion_partida p
  join public.cotizaciones c on c.id = p.cotizacion_id
  left join public.analisis_costo ac on ac.analisis_id = p.analisis_id;

comment on view public.cotizacion_partida_valorizada is
  'El costo de la partida: el precio contratado si es subcontrato, el congelado si el presupuesto '
  'salió, y si no el vivo de la base maestra. sin_precio_de_subcontrato marca el paquete que se '
  'declaró subcontratado y todavía no tiene precio — antes ese caso valía 0 y el presupuesto se '
  'veía completo.';

grant select on public.cotizacion_partida_valorizada to authenticated;
grant select on public.cotizacion_partida_valorizada to service_role;

-- ── 4 · la cascada avisa del paquete sin precio ───────────────────────────────────────────────
create or replace view public.cotizacion_cascada with (security_invoker = true) as
with base as (
  select c.id, c.numero, c.version, c.vigente, c.estado, c.cliente, c.cliente_id, c.obra_nombre,
         c.obra_canonica_id, c.fecha_cotizacion, c.congelada_en, c.convertida_obra_id,
         c.pct_indirectos, c.pct_gastos_generales, c.pct_margen, c.pct_financiero, c.pct_impuestos,
         coalesce(sum(v.subtotal), 0)                          as costo_directo,
         coalesce(sum(v.hh), 0)                                as hh_previstas,
         count(v.partida_id)::int                              as n_partidas,
         count(*) filter (where v.sin_analisis)::int            as n_sin_analisis,
         count(*) filter (where v.cantidad is null)::int        as n_sin_computo
    from public.cotizaciones c
    left join public.cotizacion_partida_valorizada v on v.cotizacion_id = c.id
   group by c.id, c.numero, c.version, c.vigente, c.estado, c.cliente, c.cliente_id, c.obra_nombre,
            c.obra_canonica_id, c.fecha_cotizacion, c.congelada_en, c.convertida_obra_id,
            c.pct_indirectos, c.pct_gastos_generales, c.pct_margen, c.pct_financiero, c.pct_impuestos
), escalones as (
  select b.*,
         b.costo_directo * b.pct_indirectos                                    as indirectos,
         b.costo_directo * b.pct_gastos_generales                              as gastos_generales
    from base b
), conmargen as (
  select e.*,
         (e.costo_directo + e.indirectos + e.gastos_generales)                 as costo_total,
         (e.costo_directo + e.indirectos + e.gastos_generales) * e.pct_margen  as margen,
         (e.costo_directo + e.indirectos + e.gastos_generales) * e.pct_financiero as financiero
    from escalones e
)
select m.*,
       (m.costo_total + m.margen + m.financiero)                               as subtotal_antes_impuestos,
       (m.costo_total + m.margen + m.financiero) * m.pct_impuestos             as impuestos,
       (m.costo_total + m.margen + m.financiero) * (1 + m.pct_impuestos)       as precio_venta,
       case when m.costo_directo > 0
            then round(m.margen / nullif(m.costo_total + m.margen + m.financiero, 0) * 100, 2)
       end                                                                     as margen_sobre_precio_pct,
       -- Va al final y no dentro del CTE a propósito: `create or replace view` no puede REORDENAR
       -- columnas, sólo agregarlas. Meterla arriba renombraba `indirectos` y la migración abortaba.
       (select count(*) filter (where v2.sin_precio_de_subcontrato)::int
          from public.cotizacion_partida_valorizada v2 where v2.cotizacion_id = m.id)
                                                                                as n_sin_precio_subcontrato
  from conmargen m;

grant select on public.cotizacion_cascada to authenticated;
grant select on public.cotizacion_cascada to service_role;

-- ── 5 · crear una versión nueva es UNA operación, no tres ─────────────────────────────────────
-- PostgREST no da transacción: la pantalla insertaba la nueva apagada, apagaba la vieja y encendía
-- la nueva. Nunca deja dos vigentes, pero puede dejar CERO — un presupuesto que desaparece de la
-- cartera hasta que alguien lo note. Acá es atómico.
create or replace function public.nueva_version_de_presupuesto(p_cotizacion_id uuid, p_motivo text default null)
returns uuid language plpgsql security invoker as $$
declare v_nueva uuid; v_vieja record;
begin
  if not public.ve_economia() then
    raise exception 'crear una versión de un presupuesto exige permiso económico';
  end if;
  select * into v_vieja from public.cotizaciones where id = p_cotizacion_id;
  if not found then raise exception 'el presupuesto % no existe', p_cotizacion_id; end if;

  update public.cotizaciones set vigente = false where id = p_cotizacion_id;

  insert into public.cotizaciones
      (cliente, obra_nombre, obra_canonica_id, monto_venta, costo_estimado, margen_pct,
       fecha_cotizacion, estado, notas, origen, numero, version, vigente, cliente_id,
       pct_indirectos, pct_gastos_generales, pct_margen, pct_financiero, pct_impuestos)
  values (v_vieja.cliente, v_vieja.obra_nombre, v_vieja.obra_canonica_id, v_vieja.monto_venta,
          v_vieja.costo_estimado, v_vieja.margen_pct, current_date, 'borrador',
          coalesce(p_motivo, v_vieja.notas), v_vieja.origen, v_vieja.numero, v_vieja.version + 1,
          true, v_vieja.cliente_id, v_vieja.pct_indirectos, v_vieja.pct_gastos_generales,
          v_vieja.pct_margen, v_vieja.pct_financiero, v_vieja.pct_impuestos)
  returning id into v_nueva;

  insert into public.cotizacion_partida
      (cotizacion_id, orden, rubro, codigo, descripcion, cantidad, unidad, tarea_tipo_id,
       analisis_id, metodo_medicion, subcontratada, precio_subcontrato, nota)
  select v_nueva, orden, rubro, codigo, descripcion, cantidad, unidad, tarea_tipo_id,
         analisis_id, metodo_medicion, subcontratada, precio_subcontrato, nota
    from public.cotizacion_partida where cotizacion_id = p_cotizacion_id;

  return v_nueva;
end $$;

comment on function public.nueva_version_de_presupuesto(uuid, text) is
  'Apaga la versión vigente, crea la siguiente en borrador y le copia las partidas — todo en una '
  'transacción. NO copia el costo congelado: la versión nueva se valoriza viva contra la base '
  'maestra de hoy, que es exactamente para lo que se hace una versión nueva.';

grant execute on function public.nueva_version_de_presupuesto(uuid, text) to authenticated;
