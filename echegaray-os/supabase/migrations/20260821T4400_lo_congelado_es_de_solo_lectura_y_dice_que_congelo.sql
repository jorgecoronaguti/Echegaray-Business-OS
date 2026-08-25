-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO CONGELADO ES DE SOLO LECTURA — y el congelado dice qué congeló
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- «Un presupuesto congelado no se edita: se crea una versión nueva.» Estaba escrito en la migración,
-- en el comentario de la vista y en `cascada.ts`. Y **no lo hacía cumplir nadie**: la RLS de
-- `cotizacion_partida` sólo pregunta por `ve_economia()`, así que un PATCH de PostgREST cambiaba la
-- cantidad de una partida de una oferta ya emitida, o borraba la partida entera, sin un solo aviso.
-- El único freno vivía en los botones de la pantalla — la puerta, no la cerradura.
--
-- Tres cosas más que el congelado no hacía:
--
--   · **no anotaba QUÉ VERSIÓN del análisis se cotizó**. Guardaba `analisis_id`, que apunta a una
--     versión concreta, pero el número no quedaba a mano para leerlo al lado de la partida. Ahora
--     que existe `nueva_version_de_analisis`, la base maestra va a evolucionar de verdad y la
--     pregunta «¿con qué estándar se cotizó esto?» se hace sola.
--
--   · **una partida SUBCONTRATADA quedaba fuera del snapshot**. El INSERT hace `join analisis_linea`
--     y una partida subcontratada no tiene análisis: no copiaba nada. Peor: la función marcaba
--     `congelada_en` igual, así que una cotización 100 % subcontratada quedaba «congelada» con CERO
--     líneas de respaldo, y el único aviso era un texto de pantalla que decía «ninguna partida tiene
--     análisis» — que además era falso, porque no le faltaba análisis: era un paquete.
--
--   · **devolvía un entero** que la pantalla interpretaba como «líneas copiadas», y cero líneas
--     significaba tres cosas distintas sin poder distinguirlas.
--
-- Se conserva intacta la corrección de 20260821T3300: se congela CON EL MISMO `coalesce` que usa la
-- vista valorizada, así el override tipeado sobrevive. Hay un test que lo mide.

-- ── 1 · qué versión del análisis se cotizó ────────────────────────────────────────────────────
alter table public.cotizacion_partida add column if not exists analisis_version int;

comment on column public.cotizacion_partida.analisis_version is
  'El número de versión del análisis con el que se congeló esta partida. Redundante con analisis_id '
  'a propósito: es el dato que se lee en pantalla al lado de la partida sin tener que resolver un '
  'uuid, y el que permite decir «se cotizó con la v3 y hoy va la v5» sin una consulta más.';

-- ── 2 · congelar, con lo que faltaba ──────────────────────────────────────────────────────────
-- El tipo de retorno cambia de int a jsonb: `create or replace function` no puede cambiarlo.
drop function if exists public.congelar_presupuesto(uuid);

create function public.congelar_presupuesto(p_cotizacion_id uuid)
returns jsonb language plpgsql security invoker as $$
declare
  v_lineas    int;
  v_paquetes  int;
  v_resumen   record;
begin
  if not public.ve_economia() then
    raise exception 'congelar un presupuesto exige permiso económico';
  end if;
  if exists (select 1 from public.cotizaciones where id = p_cotizacion_id and congelada_en is not null) then
    raise exception 'el presupuesto ya está congelado: para cambiarlo se crea una versión nueva';
  end if;

  -- 2.1 · la composición de las partidas con análisis
  insert into public.cotizacion_partida_composicion
      (partida_id, orden, recurso_codigo, recurso_nombre, unidad, tipo, cantidad, costo_unitario,
       desperdicio, fecha_precio, moneda, costo_origen, tc_aplicado)
  select p.id, l.orden, rc.codigo, rc.nombre, rc.unidad, rc.tipo, l.cantidad,
         rc.costo_con_desperdicio, rc.desperdicio, rc.fecha_precio,
         rc.moneda, rc.costo_origen, rc.tc_aplicado
    from public.cotizacion_partida p
    join public.analisis_linea l on l.analisis_id = p.analisis_id
    join public.recurso_costo rc on rc.recurso_id = l.recurso_id
   where p.cotizacion_id = p_cotizacion_id
     and not p.subcontratada;
  get diagnostics v_lineas = row_count;

  -- 2.2 · el snapshot mínimo del paquete subcontratado. No tiene composición porque no la hacemos
  --       nosotros: lo que se congela es el precio contratado y con qué alcance. Sin esta fila, una
  --       cotización 100 % subcontratada quedaba congelada sin una sola línea que respaldara su
  --       precio, y después de (3) ya no se puede editar para arreglarlo.
  insert into public.cotizacion_partida_composicion
      (partida_id, orden, recurso_codigo, recurso_nombre, unidad, tipo, cantidad, costo_unitario,
       desperdicio, moneda, costo_origen)
  select p.id, 0, 'SUBCONTRATO', p.descripcion, p.unidad, 'subcontrato',
         coalesce(p.cantidad, 1),
         p.precio_subcontrato / nullif(coalesce(p.cantidad, 1), 0),
         0, 'ARS', p.precio_subcontrato
    from public.cotizacion_partida p
   where p.cotizacion_id = p_cotizacion_id
     and p.subcontratada
     and p.precio_subcontrato is not null;
  get diagnostics v_paquetes = row_count;

  -- 2.3 · el MISMO coalesce que `cotizacion_partida_valorizada`: se congela lo que se mostraba.
  update public.cotizacion_partida p
     set costo_unitario   = coalesce(p.costo_unitario, ac.costo_directo),
         hs_unitarias     = coalesce(p.hs_unitarias,   ac.hs_unitarias),
         analisis_version = a.version
    from public.analisis_costo ac
    join public.analisis a on a.id = ac.analisis_id
   where ac.analisis_id = p.analisis_id
     and p.cotizacion_id = p_cotizacion_id
     and not p.subcontratada;

  -- 2.4 · el paquete congela su precio unitario. Las HH propias son CERO y eso es un hecho, no un
  --       hueco: la partida no la ejecuta nuestra gente.
  update public.cotizacion_partida p
     set costo_unitario = p.precio_subcontrato / nullif(coalesce(p.cantidad, 1), 0),
         hs_unitarias   = 0
   where p.cotizacion_id = p_cotizacion_id
     and p.subcontratada
     and p.precio_subcontrato is not null;

  update public.cotizaciones
     set congelada_en = now(), congelada_por = auth.uid()
   where id = p_cotizacion_id;

  select count(*)::int                                                                as n_partidas,
         count(*) filter (where subcontratada)::int                                   as n_subcontratadas,
         count(*) filter (where not subcontratada and analisis_id is null)::int       as n_sin_analisis,
         count(*) filter (where subcontratada and precio_subcontrato is null)::int    as n_sin_precio,
         count(*) filter (where (not subcontratada and analisis_id is not null)
                             or (subcontratada and precio_subcontrato is not null))::int as n_congeladas
    into v_resumen
    from public.cotizacion_partida where cotizacion_id = p_cotizacion_id;

  return jsonb_build_object(
    'lineas_composicion',      v_lineas + v_paquetes,
    'n_partidas',              v_resumen.n_partidas,
    'n_partidas_congeladas',   v_resumen.n_congeladas,
    'n_subcontratadas',        v_resumen.n_subcontratadas,
    'n_sin_analisis',          v_resumen.n_sin_analisis,
    'n_subcontratadas_sin_precio', v_resumen.n_sin_precio);
end $$;

comment on function public.congelar_presupuesto(uuid) is
  'Copia la composición viva de cada partida y fija costo y rendimiento CON EL MISMO coalesce que la '
  'vista valorizada: el override tipeado sobrevive. Las partidas subcontratadas congelan su propio '
  'snapshot —no tienen composición porque no la hacemos nosotros— y el retorno dice cuántas partidas '
  'quedaron congeladas, cuántas son paquetes y cuántas quedaron sin respaldo. Se corre una sola vez: '
  'después, cambiar el presupuesto es crear una versión nueva.';

grant execute on function public.congelar_presupuesto(uuid) to authenticated;

-- ── 3 · lo congelado no se edita, y la base lo hace cumplir ───────────────────────────────────
create or replace function public.cotizacion_congelada_solo_lectura()
returns trigger language plpgsql as $$
begin
  if old.congelada_en is null then return new; end if;
  if new.pct_gastos_generales   is distinct from old.pct_gastos_generales
     or new.pct_beneficio       is distinct from old.pct_beneficio
     or new.pct_financiero      is distinct from old.pct_financiero
     or new.factor_financiero   is distinct from old.factor_financiero
     or new.pct_iibb            is distinct from old.pct_iibb
     or new.pct_ganancias       is distinct from old.pct_ganancias
     or new.pct_cheque          is distinct from old.pct_cheque
     or new.pct_iva             is distinct from old.pct_iva
     or new.parametro_comercial_id is distinct from old.parametro_comercial_id then
    raise exception 'el presupuesto % ya salió: los porcentajes de la cascada no se editan. Para cambiarlos se crea una versión nueva (nueva_version_de_presupuesto)', old.id;
  end if;
  return new;
end $$;

drop trigger if exists cotizacion_congelada_solo_lectura_t on public.cotizaciones;
create trigger cotizacion_congelada_solo_lectura_t
  before update on public.cotizaciones
  for each row execute function public.cotizacion_congelada_solo_lectura();

-- El estado SÍ se puede cambiar en un congelado (enviada → adjudicada → perdida) y la conversión
-- escribe `convertida_obra_id`: son hechos posteriores a la oferta, no ediciones de la oferta.
create or replace function public.partida_congelada_solo_lectura()
returns trigger language plpgsql as $$
declare v_congelada timestamptz;
begin
  -- En UPDATE y en DELETE la cotización es la misma: `old` la trae en los dos casos.
  select congelada_en into v_congelada from public.cotizaciones where id = old.cotizacion_id;
  if v_congelada is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'la partida % pertenece a un presupuesto congelado: no se borra. Para sacarla se crea una versión nueva', old.id;
  end if;

  if new.cantidad           is distinct from old.cantidad
     or new.analisis_id     is distinct from old.analisis_id
     or new.subcontratada   is distinct from old.subcontratada
     or new.precio_subcontrato is distinct from old.precio_subcontrato then
    raise exception 'la partida % pertenece a un presupuesto congelado: cómputo, análisis y precio de subcontrato no se editan. Para cambiarlos se crea una versión nueva', old.id;
  end if;
  return new;
end $$;

drop trigger if exists partida_congelada_solo_lectura_t on public.cotizacion_partida;
create trigger partida_congelada_solo_lectura_t
  before update or delete on public.cotizacion_partida
  for each row execute function public.partida_congelada_solo_lectura();

comment on function public.partida_congelada_solo_lectura() is
  'El freno que estaba escrito en tres comentarios y en ningún lado más. La RLS de cotizacion_partida '
  'sólo pregunta por ve_economia(), así que un PATCH de PostgREST cambiaba la cantidad de una oferta '
  'ya emitida. Bloquea lo que define el PRECIO —cómputo, análisis, subcontrato— y deja pasar lo que '
  'es descripción (rubro, nota, orden): editar una nota no reescribe lo que se ofertó.';
