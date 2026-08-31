-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA VALIDACIÓN DEL CONGELADO ES DE SÓLO LECTURA, Y LA CADENA SE PUEDE NAVEGAR ENTERA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ POR QUÉ ESTO NO TOCA `cot_gate_congelado` ═══
--
-- Este archivo NO modifica ningún objeto existente. Es aditivo puro, y la razón está medida:
-- `casos-reales.pg.test.mjs:240` afirma `soloSql === []`, o sea que el gate de SQL NUNCA puede
-- bloquear por un tipo que el motor de JS no vea. Cualquier bloqueo nuevo del lado de la base rompe
-- ese test mientras no se agregue el gemelo en `atencion.mjs`. Los dos archivos son de otro frente.
--
-- Así que lo que falta se entrega como una validación SEPARADA que nadie más llama todavía, con los
-- tres puntos ciegos MEDIDOS y nombrados. Quien integre decide cuándo se mudan al gate y con qué
-- cambio del lado del motor. Endurecer el gate a escondidas y dejar dos tests rojos de otro frente
-- no es cerrar el trabajo: es mudarlo.
--
-- ═══ LOS TRES PUNTOS CIEGOS, MEDIDOS SOBRE UN BORRADOR VÁLIDO (31/08/2026) ═══
--
-- Sobre una cotización que el gate aprueba (`ready = true`, costo conocido $2.768.750):
--
--  1 · SIN_PRECIO_VIGENTE — se marca `vigente = false` en la ÚNICA observación de precio del
--      hormigón. `recurso_costo` hace LEFT JOIN `ON p.vigente`, así que `costo_base` queda NULL, y
--      `analisis_costo.costo_directo` es un `sum()` — que IGNORA los NULL. El costo directo cae de
--      $2.768.750 a $800.000: **el 71 % del presupuesto desaparece en silencio** y el gate sigue
--      diciendo `ready = true`. Es el defecto de `sumable()` una capa más abajo. `analisis_costo` ya
--      cuenta esas líneas en `n_lineas_sin_precio`: el dato existía y nadie lo miraba.
--
--  2 · SIN_POLITICA_COMERCIAL — se borra `cotizacion_politica_ref` y se anulan los `pct_*`.
--      `cotizacion_cascada` hace `COALESCE(c.pct_beneficio, 0)` y sus siete hermanos, así que
--      `venta_sin_iva` pasa a ser EXACTAMENTE el costo directo: $2.768.750 vendidos a $2.768.750.
--      El gate lo aprueba porque su única regla de precio es `venta > 0`. NULL de política no es 0 %
--      de beneficio: es «nadie decidió con qué margen se vende esto».
--
--  3 · SIN_ORIGEN_DOCUMENTAL — se borra la fila de `computo` que respalda la cantidad. El gate no la
--      mira, y `cotizacion_cascada.n_sin_computo` TAMPOCO: esa columna cuenta
--      `v.cantidad IS NULL`, o sea partidas sin cantidad, no partidas sin cómputo. Medido: borrada
--      la fila de `computo`, `n_sin_computo` sigue en 0. El rótulo miente, y un auditor que lo lea
--      concluye que las cantidades tienen origen documental cuando ninguna lo tiene.
--
-- ═══ POR QUÉ `stable` Y NO `volatile` ═══
--
-- La validación tiene que ser ESTRICTAMENTE de sólo lectura, y una promesa en un comentario no lo
-- es. `stable` lo hace cumplir el motor: PostgreSQL levanta excepción si una función no volátil
-- intenta INSERT/UPDATE/DELETE, en tiempo de EJECUCIÓN. No se puede escribir desde acá aunque
-- alguien lo intente en el futuro — y el test lo prueba corriendo una función `stable` que escribe.

-- ── 1 · EL HASH DEL ESTADO ────────────────────────────────────────────────────────────────────
-- Existe para que la afirmación «la validación no escribió nada» se pueda VERIFICAR desde afuera, y
-- no dependa de que la validación lo diga de sí misma. Por eso NO lo devuelve `xsas_freeze_validacion`:
-- un control no se valida contra la misma información que produce. Lo toma el llamador, antes y
-- después, y compara.
create or replace function public.xsas_freeze_hash_estado(p_cotizacion_id uuid)
returns text language sql stable security invoker set search_path to 'public' as $$
  select coalesce(md5(string_agg(t, '|' order by t)), 'VACIO')
  from (
    select 'COT:' || c.id || ':' || coalesce(c.congelada_en::text, '-') || ':' || coalesce(c.estado, '-')
           || ':' || coalesce(c.pct_beneficio::text, '-') || ':' || coalesce(c.pct_iva::text, '-') as t
      from public.cotizaciones c where c.id = p_cotizacion_id
    union all
    select 'PAR:' || p.id || ':' || coalesce(p.cantidad::text, '-') || ':' || coalesce(p.analisis_id::text, '-')
           || ':' || coalesce(p.costo_unitario::text, '-') || ':' || p.subcontratada
      from public.cotizacion_partida p where p.cotizacion_id = p_cotizacion_id
    union all
    select 'CMP:' || x.id || ':' || coalesce(x.recurso_codigo, '-') || ':' || x.cantidad
           || ':' || coalesce(x.costo_unitario::text, '-')
      from public.cotizacion_partida_composicion x
      join public.cotizacion_partida p on p.id = x.partida_id
     where p.cotizacion_id = p_cotizacion_id
    union all
    select 'LIN:' || l.id || ':' || l.cantidad || ':' || l.recurso_id
      from public.analisis_linea l
     where l.analisis_id in (select analisis_id from public.cotizacion_partida
                              where cotizacion_id = p_cotizacion_id and analisis_id is not null)
    union all
    select 'PRE:' || rp.id || ':' || rp.costo || ':' || coalesce(rp.fecha_precio::text, '-') || ':' || rp.vigente
      from public.recurso_precio rp
     where rp.recurso_id in (
       select l.recurso_id from public.analisis_linea l
        where l.analisis_id in (select analisis_id from public.cotizacion_partida
                                 where cotizacion_id = p_cotizacion_id and analisis_id is not null))
    union all
    select 'KOM:' || k.id || ':' || k.cantidad || ':' || coalesce(k.documento_drive_id, '-') || ':' || coalesce(k.elemento, '-')
      from public.computo k
      join public.cotizacion_partida p on p.id = k.cotizacion_partida_id
     where p.cotizacion_id = p_cotizacion_id
    union all
    select 'ALC:' || a.id || ':' || a.patron || ':' || a.estado
      from public.cotizacion_alcance a where a.cotizacion_id = p_cotizacion_id
    union all
    select 'HUE:' || h.id || ':' || h.sha256 from public.cotizacion_huella h where h.cotizacion_id = p_cotizacion_id
  ) s
$$;

comment on function public.xsas_freeze_hash_estado(uuid) is
  'Huella md5 de TODO lo que el congelado de una cotizacion puede tocar: la cotizacion, sus '
  'partidas, la composicion congelada, las lineas de analisis, las observaciones de precio, los '
  'computos, el alcance y la huella. Se toma ANTES y DESPUES de validar: si difiere, la validacion '
  'escribio. NO lo devuelve xsas_freeze_validacion a proposito - un control no se valida contra la '
  'misma informacion que produce.';

-- ── 2 · LA VALIDACIÓN ESTRICTA, DE SÓLO LECTURA ───────────────────────────────────────────────
create or replace function public.xsas_freeze_validacion(p_cotizacion_id uuid)
returns jsonb language plpgsql stable security invoker set search_path to 'public' as $$
declare
  v_gate   jsonb;
  v_ciegos jsonb := '[]'::jsonb;
  r        record;
begin
  if not exists (select 1 from public.cotizaciones where id = p_cotizacion_id) then
    return jsonb_build_object('existe', false, 'ready_gate', false, 'ready_estricto', false,
      'gate', null, 'ciegos', jsonb_build_array(jsonb_build_object(
        'tipo', 'NO_EXISTE', 'entidad', p_cotizacion_id, 'detalle', 'la cotizacion no existe')));
  end if;

  v_gate := public.cot_gate_congelado(p_cotizacion_id);

  -- CIEGO 1 · el recurso de la composicion sin observacion VIGENTE. `sum()` lo ignora y el costo
  -- directo sale mas barato sin avisar. Se reporta el recurso Y la partida que lo pide, porque el
  -- costo perdido no se puede calcular: justamente no hay precio con que calcularlo.
  for r in
    select coalesce(p.codigo, p.descripcion) as partida, rc.codigo, rc.nombre, l.cantidad
      from public.cotizacion_partida p
      join public.analisis_linea l on l.analisis_id = p.analisis_id
      join public.recurso_costo rc on rc.recurso_id = l.recurso_id
     where p.cotizacion_id = p_cotizacion_id and not p.subcontratada and rc.costo_base is null
     order by 1, 2
  loop
    v_ciegos := v_ciegos || jsonb_build_object(
      'tipo', 'SIN_PRECIO_VIGENTE', 'entidad', public.rc_entidad(r.codigo, r.nombre),
      'detalle', 'la composicion de ' || r.partida || ' lo pide ' || r.cantidad ||
                 ' por unidad y no tiene observacion de precio VIGENTE: analisis_costo suma con '
                 'sum(), que ignora los NULL, asi que este renglon desaparece del costo directo sin '
                 'que nada lo diga. NO vale cero: no se sabe cuanto vale',
      'accion', 'set_resource_price');
  end loop;

  -- CIEGO 2 · sin politica comercial. `cotizacion_cascada` hace COALESCE(pct, 0) en los ocho
  -- porcentajes: sin politica, la venta es EXACTAMENTE el costo. Se vende al costo y el gate aprueba.
  -- ═══ EL ALIAS NO PUEDE LLAMARSE `r` ═══
  -- Se llamaba `r`, igual que la variable `record r` del bucle de arriba, y plpgsql resuelve
  -- `r.cotizacion_id` contra la VARIABLE antes que contra la tabla: la funcion reventaba en tiempo
  -- de ejecucion con «record "r" has no field "cotizacion_id"». El ensayo de la migracion la dio por
  -- buena —los identificadores de un cuerpo plpgsql no se resuelven hasta que corre—, asi que esto
  -- solo aparece EJECUTANDOLA. Por eso los alias de aca abajo son `pr` y `co`.
  if not exists (select 1 from public.cotizacion_politica_ref pr where pr.cotizacion_id = p_cotizacion_id)
     and exists (select 1 from public.cotizaciones co where co.id = p_cotizacion_id and co.pct_beneficio is null)
  then
    v_ciegos := v_ciegos || jsonb_build_object(
      'tipo', 'SIN_POLITICA_COMERCIAL', 'entidad', 'cotizacion',
      'detalle', 'no referencia ninguna version de politica comercial y no tiene pct_beneficio '
                 'cargado. La vista coalesce los ocho porcentajes a 0, asi que venta_sin_iva queda '
                 'igual al costo directo: se estaria congelando una oferta que se vende AL COSTO. '
                 'NULL de politica no es 0% de beneficio, es que nadie decidio con que margen se vende',
      'accion', 'set_global_policy');
  end if;

  -- CIEGO 3 · la partida sin origen documental. `cotizacion_cascada.n_sin_computo` NO mira la tabla
  -- `computo`: cuenta `v.cantidad IS NULL`. Medido: borrada la fila de computo, sigue en 0.
  for r in
    select coalesce(p.codigo, p.descripcion) as entidad, p.cantidad, p.unidad
      from public.cotizacion_partida p
     where p.cotizacion_id = p_cotizacion_id
       and not exists (select 1 from public.computo k where k.cotizacion_partida_id = p.id)
     order by 1
  loop
    v_ciegos := v_ciegos || jsonb_build_object(
      'tipo', 'SIN_ORIGEN_DOCUMENTAL', 'entidad', r.entidad,
      'detalle', 'sus ' || coalesce(r.cantidad::text, '?') || ' ' || coalesce(r.unidad, '?') ||
                 ' no tienen ninguna fila en computo: no se puede volver al documento del que '
                 'salieron. cotizacion_cascada.n_sin_computo no lo detecta porque cuenta partidas '
                 'sin cantidad, no partidas sin computo',
      'accion', null);
  end loop;

  return jsonb_build_object(
    'existe', true,
    'gate', v_gate,
    'ready_gate', (v_gate->>'ready')::boolean,
    'ciegos', v_ciegos,
    'ready_estricto', (v_gate->>'ready')::boolean and jsonb_array_length(v_ciegos) = 0);
end $$;

comment on function public.xsas_freeze_validacion(uuid) is
  'La validacion ESTRICTA del congelado: el veredicto de cot_gate_congelado mas los tres puntos '
  'ciegos que ese gate no ve (recurso sin precio VIGENTE, cotizacion sin politica comercial, '
  'partida sin origen documental). Es `stable`: PostgreSQL impide que escriba, no es una promesa de '
  'un comentario. NO modifica el gate de produccion porque casos-reales.pg.test.mjs:240 exige que '
  'SQL nunca bloquee por un tipo que el motor de JS no vea, y el motor es de otro frente.';

-- ── 3 · LA CADENA, NAVEGABLE ENTERA Y EN LOS DOS SENTIDOS ─────────────────────────────────────
-- Los once eslabones que un auditor tiene que poder recorrer sin preguntarle nada a nadie:
-- DOCUMENTO, ELEMENTO, COMPUTO, PARTIDA, COMPOSICION, RECURSO, PRICE_OBSERVATION, COSTO,
-- QUOTE_VERSION, WORK_ACTIVITY, ACTUAL. Un eslabon vacio sale DECLARADO como hueco, no omitido:
-- omitirlo haria ver completa una cadena cortada, que es exactamente lo que hay que poder detectar.
create or replace function public.xsas_genealogia_cadena(p_partida_id uuid)
returns jsonb language sql stable security invoker set search_path to 'public' as $$
  select jsonb_build_object(
    'partida_id', p.id,
    'DOCUMENTO', coalesce((select jsonb_agg(distinct jsonb_build_object(
        'drive_id', k.documento_drive_id, 'nombre', k.documento_nombre, 'revision', k.revision))
      from public.computo k where k.cotizacion_partida_id = p.id), '[]'::jsonb),
    'ELEMENTO', coalesce((select jsonb_agg(jsonb_build_object(
        'elemento', k.elemento, 'sector', k.sector) order by k.elemento)
      from public.computo k where k.cotizacion_partida_id = p.id), '[]'::jsonb),
    'COMPUTO', coalesce((select jsonb_agg(jsonb_build_object(
        'cantidad', k.cantidad, 'unidad', k.unidad, 'origen', k.origen, 'criterio', k.criterio) order by k.elemento)
      from public.computo k where k.cotizacion_partida_id = p.id), '[]'::jsonb),
    'PARTIDA', jsonb_build_object('codigo', p.codigo, 'descripcion', p.descripcion,
        'cantidad', p.cantidad, 'unidad', p.unidad, 'analisis_id', p.analisis_id,
        'subcontratada', p.subcontratada, 'costo_unitario', p.costo_unitario),
    'COMPOSICION', coalesce((select jsonb_agg(jsonb_build_object(
        'recurso_codigo', x.recurso_codigo, 'recurso_nombre', x.recurso_nombre, 'tipo', x.tipo,
        'cantidad', x.cantidad, 'costo_unitario', x.costo_unitario, 'fecha_precio', x.fecha_precio,
        'congelada_en', x.congelada_en) order by x.orden, x.recurso_codigo)
      from public.cotizacion_partida_composicion x where x.partida_id = p.id), '[]'::jsonb),
    'RECURSO', coalesce((select jsonb_agg(distinct jsonb_build_object(
        'id', rc.id, 'codigo', rc.codigo, 'nombre', rc.nombre, 'unidad', rc.unidad, 'tipo', rc.tipo))
      from public.cotizacion_partida_composicion x
      join public.recurso rc on rc.codigo = x.recurso_codigo where x.partida_id = p.id), '[]'::jsonb),
    'PRICE_OBSERVATION', coalesce((select jsonb_agg(jsonb_build_object(
        'recurso_codigo', rc.codigo, 'costo', rp.costo, 'moneda', rp.moneda, 'fecha_precio', rp.fecha_precio,
        'fuente', rp.fuente, 'proveedor', rp.proveedor, 'vigente', rp.vigente) order by rc.codigo, rp.fecha_precio desc)
      from public.cotizacion_partida_composicion x
      join public.recurso rc on rc.codigo = x.recurso_codigo
      join public.recurso_precio rp on rp.recurso_id = rc.id where x.partida_id = p.id), '[]'::jsonb),
    'COSTO', jsonb_build_object(
      'costo_unitario_congelado', (select sum(x.cantidad * x.costo_unitario)
         from public.cotizacion_partida_composicion x where x.partida_id = p.id),
      'costo_partida', (select sum(x.cantidad * x.costo_unitario) * p.cantidad
         from public.cotizacion_partida_composicion x where x.partida_id = p.id),
      'subtotal_vista', (select v.subtotal from public.cotizacion_partida_valorizada v where v.partida_id = p.id)),
    'QUOTE_VERSION', (select jsonb_build_object('id', c.id, 'numero', c.numero, 'version', c.version,
        'estado', c.estado, 'congelada_en', c.congelada_en, 'congelada_por', c.congelada_por,
        'huella_sha256', (select h.sha256 from public.cotizacion_huella h
                           where h.cotizacion_id = c.id and h.version = c.version))
      from public.cotizaciones c where c.id = p.cotizacion_id),
    'WORK_ACTIVITY', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'obra_id', a.obra_id, 'nombre', a.nombre, 'estado', a.estado, 'pct', a.pct,
        'cantidad_objetivo', a.cantidad_objetivo, 'hh_plan', a.hh_plan,
        'cantidad_plan', (select pl.cantidad_plan from public.obra_partida_plan pl where pl.actividad_id = a.id)) order by a.orden)
      from public.obra_actividad a where a.cotizacion_partida_id = p.id), '[]'::jsonb),
    'ACTUAL', jsonb_build_object(
      'ejecuciones', coalesce((select jsonb_agg(jsonb_build_object(
          'id', e.id, 'fecha', e.fecha, 'cantidad', e.cantidad, 'avance_pct', e.avance_pct,
          'metodo', e.metodo, 'fuente', e.fuente) order by e.fecha)
        from public.obra_ejecucion e
        join public.obra_actividad a on a.id = e.actividad_id where a.cotizacion_partida_id = p.id), '[]'::jsonb),
      'costo_real', coalesce((select jsonb_agg(jsonb_build_object(
          'tipo', cr.tipo, 'recurso_nombre', cr.recurso_nombre, 'monto', cr.monto, 'fecha', cr.fecha,
          'proveedor', cr.proveedor, 'comprobante', cr.comprobante) order by cr.fecha)
        from public.obra_partida_costo_real cr where cr.cotizacion_partida_id = p.id), '[]'::jsonb))
  )
  from public.cotizacion_partida p where p.id = p_partida_id
$$;

comment on function public.xsas_genealogia_cadena(uuid) is
  'Los once eslabones de una cantidad, de la evidencia al dato real: DOCUMENTO, ELEMENTO, COMPUTO, '
  'PARTIDA, COMPOSICION, RECURSO, PRICE_OBSERVATION, COSTO, QUOTE_VERSION, WORK_ACTIVITY, ACTUAL. '
  'Un eslabon vacio sale como [] y no omitido: un hueco tiene que verse como hueco. `stable`: '
  'reconstruir una cadena jamas puede modificar lo que reconstruye.';

-- ── 4 · LA VUELTA: DEL DATO REAL A LA EVIDENCIA ───────────────────────────────────────────────
-- «En ambos sentidos» no es un adorno. Cuando el real no da contra el plan, la pregunta no nace en
-- el plano: nace en un parte de obra. Sin este sentido, el auditor tiene que adivinar de que partida
-- vino la ejecucion que esta mirando.
create or replace function public.xsas_genealogia_desde_ejecucion(p_ejecucion_id uuid)
returns jsonb language sql stable security invoker set search_path to 'public' as $$
  select jsonb_build_object(
    'ejecucion_id', e.id,
    'obra_id', e.obra_id,
    'fecha', e.fecha,
    'cantidad_real', e.cantidad,
    'actividad', jsonb_build_object('id', a.id, 'nombre', a.nombre, 'estado', a.estado),
    'cotizacion_partida_id', a.cotizacion_partida_id,
    'cadena', case when a.cotizacion_partida_id is null then null
                   else public.xsas_genealogia_cadena(a.cotizacion_partida_id) end,
    'porQue', case when a.cotizacion_partida_id is null
                   then 'la actividad no nacio de una partida de cotizacion: la vuelta se corta aca y '
                        'el real de esta actividad no se puede comparar contra ningun plan costeado'
                   else 'la vuelta esta completa: desde el parte de obra se llega al documento' end)
  from public.obra_ejecucion e
  join public.obra_actividad a on a.id = e.actividad_id
 where e.id = p_ejecucion_id
$$;

comment on function public.xsas_genealogia_desde_ejecucion(uuid) is
  'La cadena al reves: de un parte de obra al plano. Si la actividad no nacio de una partida, lo '
  'DICE en vez de devolver una cadena vacia - un corte declarado es informacion, un vacio silencioso no.';

grant execute on function public.xsas_freeze_hash_estado(uuid)          to authenticated;
grant execute on function public.xsas_freeze_validacion(uuid)           to authenticated;
grant execute on function public.xsas_genealogia_cadena(uuid)           to authenticated;
grant execute on function public.xsas_genealogia_desde_ejecucion(uuid)  to authenticated;
