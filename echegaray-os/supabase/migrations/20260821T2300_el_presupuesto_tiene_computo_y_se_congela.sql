-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PRESUPUESTO TIENE CÓMPUTO, CASCADA Y SE CONGELA AL SALIR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hoy conviven dos cosas que se llaman parecido y hacen distinto:
--
--   `presupuestos`  (2 filas)  la línea base ECONÓMICA de una obra ya contratada. FK a `obras`,
--                              la leen `obra_resumen_economico` y `obra_plan_vs_real`. Se queda
--                              como está: tiene consumidores y hace bien su trabajo.
--   `cotizaciones`  (0 filas)  la oferta de venta. La usa el orquestador (`lib/cotizaciones.mjs`,
--                              `recotizacion-arcor.mjs`) y NO exige que la obra exista, que es
--                              justo lo que hace falta para una cartera de presupuestos.
--
-- La cartera del contrato («14 · Presupuestos Cartera») es la SEGUNDA. No se crea una tercera tabla
-- para el mismo concepto: se le agrega a `cotizaciones` lo que le falta para ser un presupuesto de
-- verdad — cómputo, cascada y versiones. En la pantalla se llama «Presupuesto», que es como se dice
-- en obra; en la base sigue siendo `cotizaciones` porque ahí ya hay código vivo leyéndola.
--
-- ═══ POR QUÉ EL COSTO SE CONGELA Y NO SE REFERENCIA ═══
--
-- «Una cotización histórica no debe cambiar porque mañana cambió la base maestra.» Apuntar a
-- `analisis_id` no alcanza: el análisis es inmutable por versión, pero su COSTO no —cuelga de
-- `recurso_precio`, y el precio del cemento cambia el mes que viene—. Una oferta adjudicada en
-- febrero valorizada a precios de agosto no es un dato histórico: es un dato falso.
--
-- Entonces: mientras el presupuesto está en borrador, el costo se lee VIVO de la base maestra (que
-- es lo que uno quiere mientras cotiza). Al salir —enviada o adjudicada— se copia la composición
-- entera, línea por línea y con su precio, a `cotizacion_partida_composicion`. La copia sobrevive
-- incluso si mañana se borra el recurso, y es lo que permite abrir una oferta de hace dos años y
-- ver de qué estaba hecha.
--
-- La trazabilidad NO se pierde por congelar: la partida sigue guardando `tarea_tipo_id` y
-- `analisis_id`, así que siempre se puede comparar lo cotizado contra la base maestra de hoy — que
-- es exactamente lo que pide la pantalla «16 · Análisis de partida» con su bloque «Contra el
-- histórico».

-- ── 1 · la cabecera del presupuesto ───────────────────────────────────────────────────────────
alter table public.cotizaciones add column if not exists numero               text;
alter table public.cotizaciones add column if not exists version              int  not null default 1;
alter table public.cotizaciones add column if not exists vigente              boolean not null default true;
alter table public.cotizaciones add column if not exists cliente_id           uuid references public.clientes (id);
alter table public.cotizaciones add column if not exists pct_indirectos       numeric not null default 0 check (pct_indirectos >= 0);
alter table public.cotizaciones add column if not exists pct_gastos_generales numeric not null default 0 check (pct_gastos_generales >= 0);
alter table public.cotizaciones add column if not exists pct_margen           numeric not null default 0 check (pct_margen >= 0);
alter table public.cotizaciones add column if not exists pct_financiero       numeric not null default 0 check (pct_financiero >= 0);
alter table public.cotizaciones add column if not exists pct_impuestos        numeric not null default 0 check (pct_impuestos >= 0);
alter table public.cotizaciones add column if not exists congelada_en         timestamptz;
alter table public.cotizaciones add column if not exists congelada_por        uuid;
alter table public.cotizaciones add column if not exists convertida_obra_id   text references public.obra_canonica (id);

create unique index if not exists cotizaciones_numero_version on public.cotizaciones (numero, version) where numero is not null;
create unique index if not exists cotizaciones_una_vigente    on public.cotizaciones (numero) where vigente and numero is not null;

alter table public.cotizaciones drop constraint if exists cotizaciones_estado_check;
alter table public.cotizaciones add constraint cotizaciones_estado_check
  check (estado in ('borrador', 'enviada', 'adjudicada', 'perdida', 'anulada'));

comment on table public.cotizaciones is
  'El presupuesto de venta. En la pantalla se llama «Presupuesto» («14 · Cartera», «15 · Edición»); '
  'acá conserva el nombre `cotizaciones` porque ya hay código del orquestador leyéndola. NO se '
  'confunde con `presupuestos`, que es la línea base económica de una obra ya contratada.';
comment on column public.cotizaciones.congelada_en is
  'Cuándo se copió la composición de cada partida a cotizacion_partida_composicion. Mientras es '
  'NULL, el presupuesto se valoriza VIVO contra la base maestra. Después, contra su propia copia.';

-- ── 2 · las partidas, con cómputo ─────────────────────────────────────────────────────────────
create table if not exists public.cotizacion_partida (
  id                 uuid primary key default gen_random_uuid(),
  cotizacion_id      uuid not null references public.cotizaciones (id) on delete cascade,
  orden              int  not null default 0,
  rubro              text,
  codigo             text,
  descripcion        text not null,
  cantidad           numeric check (cantidad is null or cantidad >= 0),
  unidad             text,
  tarea_tipo_id      uuid references public.tarea_tipo (id) on delete set null,
  analisis_id        uuid references public.analisis (id) on delete set null,
  metodo_medicion    text check (metodo_medicion in ('cantidad', 'pasos', 'manual')),
  subcontratada      boolean not null default false,
  precio_subcontrato numeric check (precio_subcontrato is null or precio_subcontrato >= 0),
  costo_unitario     numeric,
  hs_unitarias       numeric,
  nota               text,
  creado_en          timestamptz not null default now()
);

create index if not exists cotizacion_partida_cotizacion_idx on public.cotizacion_partida (cotizacion_id, orden);

comment on column public.cotizacion_partida.cantidad is
  'El cómputo. Puede ser NULL y eso es «sin cargar», nunca cero: una partida sin cantidad no vale $0, '
  'vale lo que todavía no se midió.';
comment on column public.cotizacion_partida.costo_unitario is
  'El costo unitario CONGELADO. NULL mientras el presupuesto está en borrador: ahí se lee vivo de '
  'analisis_costo. Se llena al congelar, junto con la composición.';

-- ── 3 · la copia que hace histórico al histórico ──────────────────────────────────────────────
create table if not exists public.cotizacion_partida_composicion (
  id               uuid primary key default gen_random_uuid(),
  partida_id       uuid not null references public.cotizacion_partida (id) on delete cascade,
  orden            int  not null default 0,
  recurso_codigo   text,
  recurso_nombre   text not null,
  unidad           text,
  tipo             text,
  cantidad         numeric not null,
  costo_unitario   numeric,
  desperdicio      numeric,
  fecha_precio     date,
  congelada_en     timestamptz not null default now()
);

create index if not exists cotizacion_composicion_partida_idx on public.cotizacion_partida_composicion (partida_id, orden);

comment on table public.cotizacion_partida_composicion is
  'La composición de la partida tal como estaba el día que el presupuesto salió. Guarda el NOMBRE y '
  'el CÓDIGO del recurso, no su id: si mañana el recurso se da de baja, la oferta de ayer se sigue '
  'pudiendo leer entera. Es una copia a propósito, no una desnormalización por descuido.';

-- ── 4 · lo valorizado, congelado o vivo ───────────────────────────────────────────────────────
create or replace view public.cotizacion_partida_valorizada with (security_invoker = true) as
select p.id                as partida_id,
       p.cotizacion_id, p.orden, p.rubro, p.codigo, p.descripcion, p.cantidad, p.unidad,
       p.tarea_tipo_id, p.analisis_id, p.metodo_medicion, p.subcontratada, p.precio_subcontrato,
       c.congelada_en is not null                              as congelada,
       coalesce(p.costo_unitario, ac.costo_directo)            as costo_unitario,
       coalesce(p.hs_unitarias,  ac.hs_unitarias)              as hs_unitarias,
       p.cantidad * coalesce(p.costo_unitario, ac.costo_directo)  as subtotal,
       p.cantidad * coalesce(p.hs_unitarias,  ac.hs_unitarias)    as hh,
       (p.analisis_id is null and not p.subcontratada)         as sin_analisis
  from public.cotizacion_partida p
  join public.cotizaciones c on c.id = p.cotizacion_id
  left join public.analisis_costo ac on ac.analisis_id = p.analisis_id;

comment on view public.cotizacion_partida_valorizada is
  'El costo de la partida: el congelado si existe, y si no el vivo de la base maestra. '
  'sin_analisis marca la deuda de carga que la pantalla muestra en warn — la partida se cotiza '
  'igual, pero nunca vale 0 por no tener análisis.';

-- ── 5 · la cascada hasta el precio de venta ───────────────────────────────────────────────────
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
       end                                                                     as margen_sobre_precio_pct
  from conmargen m;

comment on view public.cotizacion_cascada is
  'Costo directo → indirectos → gastos generales → margen → financiero → impuestos → precio de '
  'venta. En el Excel esta cascada estaba DOS VECES y no coincidían: Presupuesto!H89 daba 2,0352 y '
  'GG!D85 daba 1,7977, un 13% de diferencia, y encima el coeficiente que multiplicaba era uno '
  'tipeado a mano al lado del calculado. Acá hay una sola, sus porcentajes son datos del '
  'presupuesto, y ninguno se tipea dos veces.';

-- ── 6 · quién ve qué ──────────────────────────────────────────────────────────────────────────
-- El presupuesto ES precio: entero es económico. Ni siquiera el cómputo se abre al jefe de obra
-- desde acá — lo que él necesita para planificar le llega convertido en actividades, con HH y sin
-- plata, que es exactamente el corte que pide el contrato.
alter table public.cotizacion_partida             enable row level security;
alter table public.cotizacion_partida_composicion enable row level security;

drop policy if exists cotizacion_partida_economia on public.cotizacion_partida;
create policy cotizacion_partida_economia on public.cotizacion_partida for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

drop policy if exists cotizacion_composicion_economia on public.cotizacion_partida_composicion;
create policy cotizacion_composicion_economia on public.cotizacion_partida_composicion for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

grant select, insert, update, delete on public.cotizacion_partida to authenticated;
grant select, insert, update, delete on public.cotizacion_partida_composicion to authenticated;
grant all on public.cotizacion_partida, public.cotizacion_partida_composicion to service_role;
grant select on public.cotizacion_partida_valorizada, public.cotizacion_cascada to authenticated;
grant select on public.cotizacion_partida_valorizada, public.cotizacion_cascada to service_role;

-- ── 7 · congelar es una operación, no un UPDATE suelto ────────────────────────────────────────
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
      (partida_id, orden, recurso_codigo, recurso_nombre, unidad, tipo, cantidad, costo_unitario, desperdicio, fecha_precio)
  select p.id, l.orden, rc.codigo, rc.nombre, rc.unidad, rc.tipo, l.cantidad,
         rc.costo_con_desperdicio, rc.desperdicio, rc.fecha_precio
    from public.cotizacion_partida p
    join public.analisis_linea l on l.analisis_id = p.analisis_id
    join public.recurso_costo rc on rc.recurso_id = l.recurso_id
   where p.cotizacion_id = p_cotizacion_id;
  get diagnostics n = row_count;

  update public.cotizacion_partida p
     set costo_unitario = ac.costo_directo,
         hs_unitarias   = ac.hs_unitarias
    from public.analisis_costo ac
   where ac.analisis_id = p.analisis_id
     and p.cotizacion_id = p_cotizacion_id;

  update public.cotizaciones
     set congelada_en = now(), congelada_por = auth.uid()
   where id = p_cotizacion_id;

  return n;
end $$;

comment on function public.congelar_presupuesto(uuid) is
  'Copia la composición viva de cada partida y fija el costo unitario. Se corre una sola vez: '
  'después, cambiar el presupuesto es crear una versión nueva, no reescribir la que salió.';

grant execute on function public.congelar_presupuesto(uuid) to authenticated;
