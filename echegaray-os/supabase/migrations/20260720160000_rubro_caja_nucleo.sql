-- LA REGLA DE CAJA, EN EL NÚCLEO.
--
-- ⚠ GENERADO por orquestador/scripts/generar-migracion-caja.mjs — NO editar a mano.
-- Hay un test (orquestador/lib/migracion-caja.test.mjs) que compara este archivo contra el
-- generador: si alguien lo edita acá, o agrega un rubro y no regenera, el test rompe.
--
-- POR QUÉ EXISTE (20/07). La regla que dice qué es cada gasto y cuánto se va a gastar vivía SOLO en
-- las fórmulas del Sheet. Medido: el calendario de caja de la web mostraba $4.121.169 de egresos
-- futuros contra $352M+ en la planilla. No era un bug de la web — era que la definición no estaba
-- en el núcleo, así que la web y el chat miraban un universo distinto al de la planilla.

create or replace function public.rubro_caja(
  proveedor text, unidad_negocio text, obra_texto text, concepto text
) returns text language sql immutable as $fn$
  select
    case
      when lower(coalesce(proveedor, '')) = 'sac' then 'Nómina · SAC'
      when lower(coalesce(concepto, '')) ~ 'deuda previcional|deuda previsional|plan f931' then 'Deuda previsional (planes de pago)'
      when lower(coalesce(obra_texto, '')) = 'f931' then 'Nómina · Cargas sociales'
      when (lower(coalesce(proveedor, '')) ~ '^(sindicatos|uocra|fcl|ieric|fodeco)$' or lower(coalesce(obra_texto, '')) ~ '^(uocra|fcl|ieric|fodeco)$') then 'Nómina · Gremiales'
      when (lower(coalesce(proveedor, '')) = 'sueldos' and lower(coalesce(obra_texto, '')) ~ '^(obras|san francisco|la estrella|messinas|arcor|javier sanchez|imotor)$') then 'Nómina · Jornales de obra'
      when lower(coalesce(proveedor, '')) = 'sueldos' then 'Nómina · Sueldos administración'
      when (lower(coalesce(unidad_negocio, '')) = 'impuestos' or lower(coalesce(proveedor, '')) = 'arca' or lower(coalesce(obra_texto, '')) = 'plan de pago') then 'Impuestos'
      when (lower(coalesce(unidad_negocio, '')) = 'financiero' or lower(coalesce(obra_texto, '')) = 'credito prendario' or lower(coalesce(proveedor, '')) = 'banco') then 'Financiero'
      when lower(coalesce(proveedor, '')) ~ '^(robles jose maria|movistar|meglioli facundo fabian|sanitarios od s\.a\.s\.|ruviño matias esteban|rsv)$' then 'Servicios recurrentes'
      when lower(coalesce(unidad_negocio, '')) = 'civil' then 'Materiales Civil'
      when lower(coalesce(unidad_negocio, '')) = 'mantenimiento' then 'Materiales Mantenimiento'
      when lower(coalesce(unidad_negocio, '')) = 'estructura' then 'Estructura'
      else 'SIN CLASIFICAR'
    end
$fn$;
comment on function public.rubro_caja is
  'A qué línea del cash flow pertenece un gasto. Generado desde orquestador/lib/rubro-caja.mjs: es la misma regla que la columna AC de Compras, no una copia.';

-- El REAL por rubro y mes. La fecha es la de PAGO: una factura de enero pagada en junio es caja de
-- junio, y para un flujo de fondos esa distinción no es un detalle, es el dato.
create or replace view public.egreso_rubro_mes as
  select public.rubro_caja(o.proveedor, o.unidad_negocio, o.obra_texto, o.concepto) as rubro,
         date_trunc('month', coalesce(o.fecha_pago, o.fecha))::date                 as mes,
         sum(o.total)                                                               as monto,
         count(*)::int                                                              as filas
    from public.costos_obra o
   where coalesce(o.fecha_pago, o.fecha) is not null
     and o.origen = 'compras_sheet'
   group by 1, 2;
comment on view public.egreso_rubro_mes is
  'Egresos REALES por rubro de caja y mes de pago. Es el equivalente en el núcleo del cuadro del Cash Flow Mensual.';

-- LA PROYECCIÓN. Misma regla que el Sheet:
--   · el promedio de los ÚLTIMOS 3 MESES CERRADOS, no el del año. Los rubros de esta empresa
--     crecen: las cargas sociales pasaron de $3,8M en enero a $11,9M en junio. El promedio de 12
--     meses las proyecta en $5.674.843 y el de 3 meses en $7.700.251 — la diferencia es real y el
--     de 12 meses subestima la caja que hace falta justo en los meses que vienen. Es además la
--     regla que ya usa el Cash Flow del Sheet, y tienen que dar lo mismo o hay dos verdades;
--   · el GUARD cuenta los meses con gasto sobre el AÑO ENTERO, no sobre la ventana de 3: un rubro
--     que apareció en 4 meses salteados no es una tendencia aunque los últimos 3 tengan plata;
--   · GUARD DE 4 MESES — un rubro que apareció en menos de 4 meses no es un ritmo, es un pago
--     suelto. Sin este guard el SAC (se paga en junio y en diciembre) se proyectaba todos los meses:
--     $18.777.459 de aguinaldo inventado contra $7.368.710 reales;
--   · × inflación, con el factor NORMALIZADO al mes actual. public.factor_ajuste acumula desde el
--     primer período guardado y el Sheet usa base = mes de hoy = 1. Dividir por el factor del mes
--     corriente los deja hablando del mismo número.
create or replace view public.proyeccion_egreso as
with cerrado as (
  select rubro, mes, monto
    from public.egreso_rubro_mes
   where mes < date_trunc('month', current_date)::date
     and monto <> 0
), ritmo as (
  select rubro,
         sum(monto) filter (
           where mes >= date_trunc('month', current_date)::date - interval '3 months'
         ) / 3                       as promedio,
         count(*)::int               as meses_con_gasto
    from cerrado
   group by 1
), futuro as (
  select generate_series(
           date_trunc('month', current_date)::date + interval '1 month',
           date_trunc('year', current_date)::date + interval '1 year' - interval '1 month',
           interval '1 month')::date as mes
), base as (
  select coalesce(max(factor_acumulado), 1) as f
    from public.factor_ajuste
   where indice = 'ipc' and periodo = to_char(current_date, 'YYYY-MM')
)
select r.rubro,
       f.mes,
       round(r.promedio * coalesce(fa.factor_acumulado, b.f) / nullif(b.f, 0))::numeric as monto,
       r.meses_con_gasto,
       round(r.promedio)::numeric                                                       as promedio_mensual,
       round(coalesce(fa.factor_acumulado, b.f) / nullif(b.f, 0), 4)                    as factor
  from ritmo r
 cross join futuro f
 cross join base b
  left join public.factor_ajuste fa
         on fa.indice = 'ipc' and fa.periodo = to_char(f.mes, 'YYYY-MM')
 where r.meses_con_gasto >= 4
   -- Estos rubros ya tienen sus cuotas futuras CARGADAS (quincenas de jornales, planes de pago,
   -- prendario). Proyectarlos encima inventaría plata que nadie va a pagar: un plan de pago tiene un
   -- número de cuotas fijo, no un ritmo.
   and r.rubro not in ('Nómina · Jornales de obra', 'Deuda previsional (planes de pago)', 'Financiero')
   -- Si el mes futuro ya tiene un pago REAL igual o mayor que la proyección, manda el hecho.
   and not exists (
     select 1 from public.egreso_rubro_mes e
      where e.rubro = r.rubro and e.mes = f.mes and e.monto >= r.promedio
   );
comment on view public.proyeccion_egreso is
  'Egresos ESPERADOS por rubro y mes futuro. SUPUESTO declarado, no dato: promedio de los últimos 3 meses cerrados (con al menos 4 meses con gasto en el año) ajustado por IPC. Misma regla que el Cash Flow del Sheet.';

-- El calendario que lee la web, ahora con el futuro adentro y DICIENDO que es proyección.
--
-- SE DROPEA ANTES DE CREAR porque `create or replace view` no admite insertar una columna en el
-- medio: Postgres contesta "cannot change name of view column fecha to clase". Se verificó que
-- ninguna otra vista dependa de ésta antes de dropearla — si mañana alguna depende, este drop tiene
-- que fallar en vez de llevársela puesta, y por eso NO lleva cascade.
drop view if exists public.calendario_caja;
-- La columna clase separa el hecho de la estimación: sin ella un promedio se lee como un
-- comprobante, y alguien decide sobre plata que nadie prometió.
create or replace view public.calendario_caja as
  select 'cobro'::text                                  as tipo,
         'real'::text                                   as clase,
         coalesce(c.fecha_cobro, c.fecha_vencimiento)   as fecha,
         c.cliente_texto                                as contraparte,
         c.concepto,
         c.total                                        as monto,
         (c.fecha_cobro is not null)                    as confirmado
    from public.cobranza c
   where coalesce(c.fecha_cobro, c.fecha_vencimiento) is not null
  union all
  select 'pago', 'real',
         coalesce(o.fecha_pago, o.fecha),
         o.proveedor,
         coalesce(nullif(o.concepto, ''), o.obra_texto),
         -o.total,
         (o.fecha_pago is not null)
    from public.costos_obra o
   where coalesce(o.fecha_pago, o.fecha) is not null
  union all
  -- Fechadas el 15: repartirlas por día sería inventar precisión sobre CUÁNDO, cuando lo único que
  -- se sabe es CUÁNTO en el mes. El 15 no distorsiona el mes y no amontona todo en el día 1.
  select 'pago', 'proyeccion',
         (p.mes + interval '14 days')::date,
         p.rubro,
         'Proyección · ritmo de ' || p.meses_con_gasto || ' meses cerrados × inflación ' || p.factor,
         -p.monto,
         false
    from public.proyeccion_egreso p;
comment on view public.calendario_caja is
  'Movimientos de caja pasados y futuros. clase = real (hay un comprobante) o proyeccion (es un supuesto). Nunca mostrar las dos con el mismo color.';
