-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UN COSTO EN DÓLARES DICE CON QUÉ TIPO DE CAMBIO — o no dice nada
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- LA MONEDA NO EXISTE EN EL MODELO. Ni en `recurso`, ni en `recurso_precio`, ni en `analisis_linea`,
-- ni en la composición congelada. Y sin embargo hay precios en dólares cargados: **10 recursos con
-- «DOLAR» en el nombre cuyo costo está EN USD** —«0.1 OFICIAL ESPECIALIZADO - EN DOLARES», costo
-- 4,5— y el tipo de cambio es OTRO RECURSO, `330 · DOLAR BCO NACION - VENTA` a $1.500 con fecha
-- octubre 2025, que se mete como una línea multiplicadora en 7 análisis.
--
-- Ese hack **funciona y da el número correcto**: la paridad del costo directo contra el XLSM es de
-- 186 sobre 199 análisis al centavo, y depende de esas líneas. Por eso acá NO SE TOCA UN SOLO DATO.
-- Lo que se agrega es la infraestructura que faltaba y la VISIBILIDAD de lo que hoy está escondido:
--
--   · `tipo_cambio` — la cotización con fecha y fuente. **Sin seed**: un tipo de cambio no se
--     inventa, se carga con su fuente el día que alguien lo mira. Cero filas es el estado honesto.
--   · `recurso_precio.moneda` — 'ARS' por defecto, porque es lo que son los 389 precios cargados.
--   · `recurso_costo` deja de mentir por omisión: publica la moneda, el costo EN SU MONEDA
--     (`costo_origen`), el TC que aplicó, y el costo en pesos. **Si el precio es USD y no hay TC
--     cargado, el costo en pesos es NULL — jamás una conversión silenciosa a 1:1 ni a un valor de
--     memoria.** Un NULL se ve; un peso mal convertido se propaga hasta la oferta.
--   · `sospecha_usd` marca el hack legacy: precio declarado en ARS con «dolar/usd» en el nombre del
--     recurso. No lo corrige —corregirlo rompería la paridad con el libro— pero lo pone a la vista.
--
-- ═══ EL TC SE CONGELA CON LA COTIZACIÓN ═══
--
-- Una oferta valorizada con dólar a 1.500 y releída cuando el dólar está a 2.100 no es un dato
-- histórico: es un dato falso. Por eso la composición congelada guarda la moneda, el costo de
-- origen y el TC aplicado, igual que ya guarda el precio y el desperdicio.

-- ── 1 · el tipo de cambio, con fecha y fuente ─────────────────────────────────────────────────
create table if not exists public.tipo_cambio (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  tc         numeric not null check (tc > 0),
  fuente     text not null,
  creado_en  timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  constraint tipo_cambio_fecha_unica unique (fecha)
);

comment on table public.tipo_cambio is
  'La cotización del dólar por fecha, con su fuente declarada. NACE VACÍA a propósito: un tipo de '
  'cambio no se siembra con un valor de memoria. Mientras no haya ninguno cargado, todo precio en '
  'USD se publica sin costo en pesos y con sin_tc = true — que es la verdad, no una falla.';
comment on column public.tipo_cambio.fuente is
  'De dónde salió: «BNA venta», «extracto Santander», «pizarra del proveedor». Obligatorio: un '
  'número de tipo de cambio sin fuente no se puede auditar ni reproducir.';

-- ── 2 · el precio declara su moneda ───────────────────────────────────────────────────────────
alter table public.recurso_precio add column if not exists moneda text not null default 'ARS';
alter table public.recurso_precio drop constraint if exists recurso_precio_moneda_check;
alter table public.recurso_precio add constraint recurso_precio_moneda_check
  check (moneda in ('ARS', 'USD'));

comment on column public.recurso_precio.moneda is
  'ARS por defecto porque es lo que son los 389 precios cargados. Los 10 recursos con «DOLAR» en el '
  'nombre siguen declarados en ARS: cambiarlos rompería la paridad del costo directo con el libro, '
  'que hoy da 186/199 al centavo. Quedan marcados en recurso_costo.sospecha_usd.';

-- ── 3 · el costo, en su moneda y en pesos, sin conversiones inventadas ────────────────────────
-- El orden y el nombre de las 14 primeras columnas NO se tocan: `create or replace view` sólo puede
-- AGREGAR columnas al final. Lo que cambia es la cuenta de `costo_base`.
create or replace view public.recurso_costo with (security_invoker = true) as
with tc_vigente as (
  select t.tc, t.fecha
    from public.tipo_cambio t
   where t.fecha <= current_date
   order by t.fecha desc
   limit 1
)
select r.id as recurso_id, r.codigo, r.nombre, r.unidad, r.tipo, r.familia, r.division,
       r.desperdicio, r.activo,
       -- EN PESOS. NULL cuando el precio es USD y no hay TC: no se convierte a ciegas.
       case
         when p.costo is null                          then null
         when coalesce(p.moneda, 'ARS') = 'ARS'        then p.costo
         when (select tc from tc_vigente) is null      then null
         else p.costo * (select tc from tc_vigente)
       end                                       as costo_base,
       case
         when p.costo is null                          then null
         when coalesce(p.moneda, 'ARS') = 'ARS'        then round(p.costo * (1 + r.desperdicio), 4)
         when (select tc from tc_vigente) is null      then null
         else round(p.costo * (select tc from tc_vigente) * (1 + r.desperdicio), 4)
       end                                       as costo_con_desperdicio,
       p.fecha_precio, p.fuente, p.proveedor,
       coalesce(p.moneda, 'ARS')                 as moneda,
       p.costo                                   as costo_origen,
       case when coalesce(p.moneda, 'ARS') = 'USD' then (select tc from tc_vigente) end as tc_aplicado,
       (coalesce(p.moneda, 'ARS') = 'USD' and (select tc from tc_vigente) is null) as sin_tc,
       (coalesce(p.moneda, 'ARS') = 'ARS' and r.nombre ~* '(dolar|dólar|usd)')     as sospecha_usd
  from public.recurso r
  left join public.recurso_precio p on p.recurso_id = r.id and p.vigente;

comment on view public.recurso_costo is
  'El costo con desperdicio aplicado —el `J = D*(1+I)` del Excel—, hecho una sola vez y en un solo '
  'lugar, y ahora EN PESOS. costo_origen es el número tal como se cargó, en su moneda; tc_aplicado '
  'es el tipo de cambio de la fecha máxima cargada que no supera hoy. Un precio en USD sin TC da '
  'costo NULL y sin_tc = true: convertirlo a ciegas metería un error de tres órdenes en la oferta '
  'sin un solo mensaje. sospecha_usd marca el hack legacy —recurso con «dolar» en el nombre y '
  'precio declarado en ARS— que se deja funcionando porque de él depende la paridad con el libro.';

-- ── 4 · la deuda de TC se cuenta al lado de la deuda de precio ────────────────────────────────
create or replace view public.analisis_costo with (security_invoker = true) as
select a.id                                     as analisis_id,
       a.tarea_tipo_id, a.version, a.vigente,
       t.codigo, t.nombre, t.unidad, t.division,
       count(l.id)::int                                                        as n_lineas,
       count(*) filter (where rc.costo_base is null and l.id is not null)::int as n_lineas_sin_precio,
       sum(l.cantidad * rc.costo_con_desperdicio)                              as costo_directo,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'mano_obra')     as costo_mano_obra,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'carga_social')  as costo_cargas_sociales,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'material')      as costo_materiales,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'equipo')        as costo_equipos,
       sum(l.cantidad) filter (where rc.tipo = 'mano_obra')                    as hs_unitarias,
       min(rc.fecha_precio)                                                    as precio_mas_viejo,
       bool_or(rc.tipo = 'mano_obra')                                          as tiene_mano_obra,
       bool_or(rc.tipo = 'carga_social')                                       as tiene_cargas_sociales,
       count(*) filter (where rc.sin_tc)::int                                  as n_lineas_sin_tc
  from public.analisis a
  join public.tarea_tipo t on t.id = a.tarea_tipo_id
  left join public.analisis_linea l on l.analisis_id = a.id
  left join public.recurso_costo rc on rc.recurso_id = l.recurso_id
 group by a.id, a.tarea_tipo_id, a.version, a.vigente, t.codigo, t.nombre, t.unidad, t.division;

comment on view public.analisis_costo is
  'El costo unitario y su desglose, calculados desde las líneas. n_lineas_sin_tc son las líneas que '
  'no tienen costo en pesos PORQUE FALTA EL TIPO DE CAMBIO, no porque falte el precio: son dos '
  'deudas distintas y se arreglan en dos lugares distintos. Las líneas sin TC ya venían contadas '
  'dentro de n_lineas_sin_precio —costo_base es NULL en ambos casos— y ahora se pueden separar.';

-- ── 5 · la composición congelada guarda con qué moneda y con qué TC se valorizó ───────────────
alter table public.cotizacion_partida_composicion add column if not exists moneda       text;
alter table public.cotizacion_partida_composicion add column if not exists costo_origen numeric;
alter table public.cotizacion_partida_composicion add column if not exists tc_aplicado  numeric;

comment on column public.cotizacion_partida_composicion.tc_aplicado is
  'El tipo de cambio con el que se valorizó ESTA oferta. Se congela con ella: releer una oferta de '
  'febrero con el dólar de agosto no la actualiza, la falsea.';

create or replace function public.congelar_presupuesto(p_cotizacion_id uuid)
returns int language plpgsql security invoker as $$
declare n int;
begin
  if not public.ve_economia() then
    raise exception 'congelar un presupuesto exige permiso económico';
  end if;
  if exists (select 1 from public.cotizaciones where id = p_cotizacion_id and congelada_en is not null) then
    raise exception 'el presupuesto ya está congelado: para cambiarlo se crea una versión nueva';
  end if;

  insert into public.cotizacion_partida_composicion
      (partida_id, orden, recurso_codigo, recurso_nombre, unidad, tipo, cantidad, costo_unitario,
       desperdicio, fecha_precio, moneda, costo_origen, tc_aplicado)
  select p.id, l.orden, rc.codigo, rc.nombre, rc.unidad, rc.tipo, l.cantidad,
         rc.costo_con_desperdicio, rc.desperdicio, rc.fecha_precio,
         rc.moneda, rc.costo_origen, rc.tc_aplicado
    from public.cotizacion_partida p
    join public.analisis_linea l on l.analisis_id = p.analisis_id
    join public.recurso_costo rc on rc.recurso_id = l.recurso_id
   where p.cotizacion_id = p_cotizacion_id;
  get diagnostics n = row_count;

  -- El MISMO coalesce que `cotizacion_partida_valorizada`: se congela lo que se mostraba.
  update public.cotizacion_partida p
     set costo_unitario = coalesce(p.costo_unitario, ac.costo_directo),
         hs_unitarias   = coalesce(p.hs_unitarias,   ac.hs_unitarias)
    from public.analisis_costo ac
   where ac.analisis_id = p.analisis_id
     and p.cotizacion_id = p_cotizacion_id;

  update public.cotizaciones
     set congelada_en = now(), congelada_por = auth.uid()
   where id = p_cotizacion_id;

  return n;
end $$;

-- ── 6 · permisos ──────────────────────────────────────────────────────────────────────────────
-- El tipo de cambio es ECONÓMICO: convierte plata en plata. Mismo portero que recurso_precio.
alter table public.tipo_cambio enable row level security;

drop policy if exists tipo_cambio_economia on public.tipo_cambio;
create policy tipo_cambio_economia on public.tipo_cambio for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

grant select, insert, update, delete on public.tipo_cambio to authenticated;
grant all on public.tipo_cambio to service_role;
