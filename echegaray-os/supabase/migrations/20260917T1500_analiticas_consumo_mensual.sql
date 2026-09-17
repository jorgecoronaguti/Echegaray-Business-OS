-- ANALÍTICAS: EL CONSUMO DE CADA OBRA, MES POR MES (17/09/2026).
--
-- El dueño (17/09/2026) pidió el módulo en clave «presupuestado contra consumido», y eso incluye A QUÉ
-- RITMO se consume. `costo_de_obras_a_la_fecha` devuelve el total a la fecha: con eso se sabe cuánto
-- se gastó, no si se está gastando más rápido o más lento.
--
-- ═══ UNA SOLA CONSULTA AGREGADA, NUNCA UNA POR OBRA NI UNA POR MES ═══
--
-- La base está justa (tres caídas el 13/09). Pedir el costo con rango doce veces —una por mes— haría
-- recorrer las quincenas doce veces. Acá se recorren UNA vez y se agrupan por obra y mes.
--
-- ═══ NO ES UNA SEGUNDA DEFINICIÓN DEL COSTO ═══
--
-- Lee las MISMAS dos fuentes que `costo_de_obras_a_la_fecha(text[], date, date)`, con la misma regla
-- para entrar a un mes que esa función usa para entrar a un rango:
--   · compras (`costo_de_obra_filas`): por la fecha del comprobante, su `a_la_fecha`.
--   · mano de obra (`costo_mo_de_obras`): por el mes en que EMPIEZA la quincena; `falta_dato` no suma.
-- Así, la suma de los meses de una obra es su total a la fecha. Un comprobante sin fecha no tiene mes:
-- sale con `mes` null, para que la pantalla lo diga en vez de perderlo.
--
-- ═══ EL PERMISO ═══
--
-- Misma puerta que `analiticas_costos`: `null` a quien no ve economía.
CREATE OR REPLACE FUNCTION public.analiticas_consumo_mensual(p_obras text[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  ids as (
    select coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)) as obras
  ),
  compras as (
    select f.obra_id, date_trunc('month', f.fecha)::date as mes,
           sum(f.a_la_fecha) filter (where not f.es_subcontrato) as materiales,
           sum(f.a_la_fecha) filter (where f.es_subcontrato)     as subcontratos
      from ids cross join lateral public.costo_de_obra_filas(ids.obras) f
     group by 1, 2
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id, date_trunc('month', m.quincena_desde)::date as mes,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada
      from ids cross join lateral public.costo_mo_de_obras(ids.obras, null::date, null::date) m
     group by 1, 2
  )
  select case
    when not coalesce((select public.ve_economia()), false) then null::jsonb
    else (select coalesce(jsonb_agg(jsonb_build_object(
                   'obra_id', coalesce(c.obra_id, h.obra_id), 'mes', coalesce(c.mes, h.mes),
                   'materiales', c.materiales, 'subcontratos', c.subcontratos,
                   'mano_obra', h.mano_obra, 'mano_obra_estimada', h.mano_obra_estimada)
                 order by coalesce(c.obra_id, h.obra_id), coalesce(c.mes, h.mes)), '[]'::jsonb)
            from compras c
            full join mano_obra h on h.obra_id = c.obra_id and h.mes = c.mes)
  end
$function$;

revoke all on function public.analiticas_consumo_mensual(text[]) from public, anon;
grant execute on function public.analiticas_consumo_mensual(text[]) to authenticated, service_role;
