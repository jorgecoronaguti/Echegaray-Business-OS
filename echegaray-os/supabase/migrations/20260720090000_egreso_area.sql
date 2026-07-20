-- ÁREA DEL EGRESO — que la réplica de Compras en Supabase sepa a qué área pertenece cada peso.
--
-- Estado previo: public.costos_obra ya espeja la pestaña Compras (origen='compras_sheet', 731
-- filas, $578M) pero clasifica por `unidad_negocio`, que es la lista del Sheet
-- (Civil/Estructura/Impuestos/Financiero/Mantenimiento). Esa lista mezcla DOS preguntas:
--   · línea de negocio  → Civil · Estructura · Mantenimiento
--   · tipo de gasto     → Impuestos · Financiero
-- Medido: "Impuestos" es 92% nómina ($110,8M de cargas sociales contra $9,8M de impuestos reales)
-- y la nómina está repartida entre Civil ($65,2M), Estructura ($144,2M) e Impuestos ($110,8M).
-- Por eso no se puede responder "cuánto cuesta la mano de obra" desde la base.
--
-- Esto agrega la dimensión que faltaba SIN tocar la pestaña Compras y SIN pisar unidad_negocio:
-- las dos conviven, cada una responde su pregunta.
--
-- NO DUPLICAR LÓGICA: estas reglas son el espejo exacto de areaDeEgreso() en
-- orquestador/lib/egresos-por-area.mjs. Si cambia una, cambia la otra — hay un test que compara
-- los totales de las dos. La de JS audita el Sheet en vivo; ésta clasifica la réplica.

create or replace function public.area_de_egreso(
  proveedor text, cliente text, unidad text, concepto text
) returns text
language sql
stable
as $$
  select case
    -- NÓMINA. El proveedor manda: los sueldos se cargan SIN concepto, con el nombre en Proveedor.
    -- Fue lo que hizo que la nómina fuera invisible durante toda la auditoría anterior.
    when lower(trim(coalesce(proveedor,''))) in ('sueldos','sac','sindicatos','uocra','fcl','ieric','fodeco')
      or lower(trim(coalesce(cliente,'')))   in ('f931','uocra','fcl','ieric','fodeco')
      or coalesce(concepto,'') ~* '(sueldo|jornal|aguinaldo|liquidacion)'
      then 'personas'
    -- F931 va arriba a propósito: son cargas sociales, NO impuestos.
    when lower(trim(coalesce(unidad,''))) = 'impuestos'
      or lower(trim(coalesce(proveedor,''))) = 'arca'
      or lower(trim(coalesce(cliente,''))) = 'plan de pago'
      then 'contabilidad_legales'
    when lower(trim(coalesce(unidad,''))) = 'financiero'
      or lower(trim(coalesce(cliente,''))) = 'credito prendario'
      or lower(trim(coalesce(proveedor,''))) = 'banco'
      then 'administracion_finanzas'
    when coalesce(concepto,'') ~* '(\yford\y|\ytoyota\y|\ymoto\y|chevrolet|hilux|amarok|patente)'
      then 'compras'
    -- La obra se resuelve por el EJE canónico (obra_alias), nunca comparando texto suelto.
    when exists (select 1 from public.obra_alias a
                  where a.alias = public.norm_obra(cliente) and a.obra_id is not null)
      then 'obras'
    when exists (select 1 from public.obra_alias a
                  where a.alias = public.norm_obra(cliente) and a.clasificacion = 'indirecto')
      then 'compras'
    -- NULL = no clasificable con la evidencia disponible. No se adivina.
    else null
  end;
$$;

comment on function public.area_de_egreso(text,text,text,text) is
  'Área canónica de un egreso. Espejo EXACTO de areaDeEgreso() en egresos-por-area.mjs: si cambia una, cambia la otra.';

-- ── La columna. No reemplaza a unidad_negocio: responde otra pregunta ──
alter table public.costos_obra add column if not exists area text references public.area_canonica(clave);
comment on column public.costos_obra.area is
  'Área canónica dueña del gasto (qué clase de plata es). unidad_negocio sigue respondiendo de qué línea es. NULL = sin clasificar.';

update public.costos_obra
   set area = public.area_de_egreso(proveedor, obra_texto, unidad_negocio, concepto)
 where area is distinct from public.area_de_egreso(proveedor, obra_texto, unidad_negocio, concepto);

create index if not exists costos_obra_area_idx on public.costos_obra (area);

-- ── La vista que consumen web, chat y las pestañas del Sheet. UN solo cálculo, tres caras ──
create or replace view public.egreso_por_area as
  select
    coalesce(c.area, 'sin_clasificar')                as area,
    a.nombre                                          as area_nombre,
    c.unidad_negocio,
    -- El corte fino dentro del área: es lo que define cada sub-pestaña del Sheet.
    case
      when c.area = 'personas' and lower(trim(coalesce(c.proveedor,''))) = 'sueldos' then 'Sueldo neto'
      when c.area = 'personas' and lower(trim(coalesce(c.proveedor,''))) = 'sac'     then 'SAC / aguinaldo'
      when c.area = 'personas' and lower(trim(coalesce(c.obra_texto,''))) = 'f931'   then 'F931 — cargas sociales'
      when c.area = 'personas' and lower(trim(coalesce(c.proveedor,''))) = 'sindicatos' then 'Sindicatos'
      when c.area = 'personas' and lower(trim(coalesce(c.obra_texto,''))) = 'fcl'    then 'Fondo de cese'
      when c.area = 'personas'                then 'Otros de nómina'
      when c.area = 'obras'                   then 'Compra imputada a obra'
      when c.area = 'administracion_finanzas' then 'Bancario y financiero'
      when c.area = 'contabilidad_legales'    then 'Impuestos y planes'
      when c.area = 'compras' and coalesce(c.concepto,'') ~* '(\yford\y|\ytoyota\y|\ymoto\y|chevrolet|hilux|amarok|patente)'
        then 'Flota y equipos'
      when c.area = 'compras'                 then 'Estructura / indirecto'
      else 'Sin clasificar'
    end                                               as grupo,
    c.proveedor,
    c.obra_texto,
    c.concepto,
    c.total,
    c.fecha,
    c.mes,
    c.origen
  from public.costos_obra c
  left join public.area_canonica a on a.clave = c.area;

comment on view public.egreso_por_area is
  'Los egresos de Compras clasificados por área canónica y por grupo. Fuente única para web, chat y las pestañas derivadas del Sheet.';
