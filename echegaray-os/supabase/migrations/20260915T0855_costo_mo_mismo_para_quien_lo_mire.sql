-- EL COSTO DE MANO DE OBRA ES EL MISMO PARA QUIEN LO MIRE, Y NO TARDA 8 SEGUNDOS (15/09/2026).
--
-- Con 0800 + 0850, `costo_mo_quincena` corría con la RLS de quien consulta sobre liquidación, recibos y
-- tarifas: la cartera del CRM tardaba 8 s como dirección (0,16 s como postgres) y un rol sin
-- `liquida_sueldos()` habría visto OTRO costo (auditoría del 15/09).
--
-- Ahora: SECURITY DEFINER con search_path fijo y la MISMA puerta que la política de
-- `costo_obra_quincena`: `liquida_sueldos() or ve_economia()`. Quien no la pasa recibe cero filas.
-- `costo_mo_quincena_calculo` (costo por persona) deja de ser ejecutable por authenticated: sólo lo
-- llaman `costo_mo_quincena` y `sellar_costo_obra_quincena`, las dos del lado del dueño de la función.

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
  )
  select s.quincena_desde, s.quincena_hasta, s.obra_canonica_id, s.persona_id, s.horas, s.costo_blanco,
         s.costo_negro, s.costo_total, s.estado, s.origen, s.destino, s.sellado_en, false as reabierta
    from foto f, public.costo_obra_quincena s
   where f.hay and f.sigue_cerrada and s.quincena_desde = p_desde
     and (select public.liquida_sueldos() or public.ve_economia())
     and (p_obras is null or s.obra_canonica_id = any (p_obras))
  union all
  select c.quincena_desde, c.quincena_hasta, c.obra_canonica_id, c.persona_id, c.horas, c.costo_blanco,
         c.costo_negro, c.costo_total, c.estado, c.origen, c.destino, null::timestamptz, f.hay as reabierta
    from foto f, public.costo_mo_quincena_calculo(p_desde, p_obras) c
   where not (f.hay and f.sigue_cerrada)
     and (select public.liquida_sueldos() or public.ve_economia())
$function$;

revoke execute on function public.costo_mo_quincena_calculo(date, text[]) from public, anon, authenticated;
revoke execute on function public.costo_mo_quincena(date, text[]) from public, anon;
grant execute on function public.costo_mo_quincena(date, text[]) to authenticated, service_role;

-- EL SELLADO NO PUEDE DEPENDER DE UN JWT (auditoría 15/09): `sellar_costo_obra_quincena` corre como
-- service_role sin claims, y la guarda `es_administracion()` de 0850 dejaba `persona_para_costo` en cero
-- filas → se sellaban 0 filas. La puerta pasa a ser el permiso de EJECUCIÓN: authenticated ya no la llama
-- (llega por `costo_mo_quincena`, que tiene su propia puerta); sólo el dueño de las funciones y service_role.
create or replace function public.persona_para_costo()
returns table (id uuid, cuil text, convenio_colectivo text, categoria text, fecha_ingreso date,
               fecha_egreso date, puesto text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.cuil::text, p.convenio_colectivo::text, p.categoria::text, p.fecha_ingreso::date,
         p.fecha_egreso::date, p.puesto::text
    from public.personas p
   where coalesce(p.es_prueba, false) = false
$$;
revoke all on function public.persona_para_costo() from public, anon, authenticated;
grant execute on function public.persona_para_costo() to service_role;
