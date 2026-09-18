-- `costo_mo_quincena`: SIN SESIÓN TAMBIÉN CONTESTA (18/09/2026).
--
-- La puerta era `liquida_sueldos() or ve_economia()`. Las dos son false sin `auth.uid()`: el chat
-- (orquestador, rol postgres) y cualquier script de verificación leían CERO quincenas de mano de obra
-- aunque hubiera 77 filas de horas en Quattropani, y el cuadro económico decía «sin quincenas
-- valorizadas (DESCONOCIDO)» al lado de $ 30 M de materiales. Es la misma trampa que 20260918T0905
-- arregló un nivel más arriba en `costo_de_obras_por_rubro`, y la misma regla que ya usa
-- `obra_economia_cartera`: `… or auth.uid() is null`.
--
-- QUIÉN ENTRA POR ESA PUERTA: sólo quien no tiene sesión y PUEDE ejecutar la función —postgres y
-- service_role—. `anon` no tiene EXECUTE sobre costo_mo_quincena ni sobre costo_mo_de_obras
-- (verificado en pg_proc.proacl), así que un pedido sin login sigue sin ver un jornal.
-- Un usuario con sesión y sin economía ni liquidación sigue viendo nada.
set local lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.costo_mo_quincena(p_desde date, p_obras text[] DEFAULT NULL::text[])
 RETURNS TABLE(quincena_desde date, quincena_hasta date, obra_canonica_id text, persona_id uuid, horas numeric, costo_blanco numeric, costo_negro numeric, costo_total numeric, estado text, origen text, destino text, sellado_en timestamp with time zone, reabierta boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with foto as (
    -- LA FOTO SÓLO VALE MIENTRAS LA QUINCENA SIGA CERRADA: reabierta, se calcula en vivo y se marca.
    select exists (select 1 from public.costo_obra_quincena s where s.quincena_desde = p_desde) as hay,
           not exists (select 1 from public.liquidacion_quincena lq
                        where lq.desde = p_desde and lq.estado <> 'cerrada') as sigue_cerrada
  ),
  puerta as (
    select (select public.liquida_sueldos() or public.ve_economia()) or (select auth.uid()) is null as pasa
  )
  select s.quincena_desde, s.quincena_hasta, s.obra_canonica_id, s.persona_id, s.horas, s.costo_blanco,
         s.costo_negro, s.costo_total, s.estado, s.origen, s.destino, s.sellado_en, false as reabierta
    from foto f, puerta g, public.costo_obra_quincena s
   where f.hay and f.sigue_cerrada and s.quincena_desde = p_desde
     and g.pasa
     and (p_obras is null or s.obra_canonica_id = any (p_obras))
  union all
  select c.quincena_desde, c.quincena_hasta, c.obra_canonica_id, c.persona_id, c.horas, c.costo_blanco,
         c.costo_negro, c.costo_total, c.estado, c.origen, c.destino, null::timestamptz, f.hay as reabierta
    from foto f, puerta g, public.costo_mo_quincena_calculo(p_desde, p_obras) c
   where not (f.hay and f.sigue_cerrada)
     and g.pasa
$function$;
