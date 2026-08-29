-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PERMISO DEL COTIZADOR VIVE EN LA BASE, Y EL GATE VA ANTES DE CONGELAR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL AGUJERO QUE ESTA MIGRACIÓN CIERRA ═══
--
-- `orquestador/lib/cotizador/contrato.mjs` distingue seis permisos —READ, WRITE, COMMERCIAL_WRITE,
-- FREEZE, APPROVE, GLOBAL_POLICY_WRITE— y los hace cumplir en JavaScript. La base sigue teniendo un
-- solo portero: `ve_economia()`. O sea que hoy cualquiera con `ve_economia()` puede, con un PATCH
-- directo de PostgREST, saltear la distinción entera: escribir un evento de `commercial_override`
-- sin tener COMMERCIAL_WRITE, o firmarlo con el nombre de otro.
--
-- Es exactamente el patrón que este repo ya pagó: «el único freno vivía en los botones de la
-- pantalla — la puerta, no la cerradura» (migración 20260821T4400).
--
-- ═══ QUÉ NO SE AFLOJA ═══
--
-- La LECTURA de las cuatro tablas sigue exigiendo `ve_economia()`, igual que antes. Los permisos
-- nuevos sólo AGREGAN restricciones sobre la escritura. Ninguna policy de otro módulo se toca.
--
-- ═══ EL RIESGO QUE ESTA MIGRACIÓN CREA, Y CÓMO SE CONTIENE ═══
--
-- El mapa acción → permiso existe ahora en DOS lugares: `ACCION` en `contrato.mjs` y
-- `cot_permiso_de_accion()` acá. Dos definiciones del mismo concepto es justo lo que la Realidad
-- Única prohíbe. La contención es un test que lee las dos y falla si difieren
-- (`pg-rbac.pg.test.mjs`). Se eligió duplicar y vigilar en vez de que la base consulte al código,
-- porque una policy no puede llamar a JavaScript y la alternativa —no validar en la base— es
-- justamente el agujero que se está cerrando.

-- ── 1 · LOS SEIS PERMISOS, DERIVADOS DEL ROL ──────────────────────────────────────────────────
-- Mismo mapa que `PERMISOS_DE_ROL` en `contrato.mjs`. `direccion` es DUENO, `administracion` es
-- ADMINISTRACION, `jefe_obra` es JEFE_DE_OBRA y `campo` es LECTOR.
create or replace function public.cot_permiso(p_permiso text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case public.current_rol()
    when 'direccion'      then p_permiso in ('READ','WRITE','COMMERCIAL_WRITE','FREEZE','APPROVE','GLOBAL_POLICY_WRITE')
    when 'administracion' then p_permiso in ('READ','WRITE','COMMERCIAL_WRITE','FREEZE')
    when 'jefe_obra'      then p_permiso in ('READ','WRITE')
    when 'campo'          then p_permiso in ('READ')
    else false
  end
$$;

comment on function public.cot_permiso(text) is
  'Los seis permisos del cotizador, derivados del rol del perfil. Gemelo de PERMISOS_DE_ROL en '
  'orquestador/lib/cotizador/contrato.mjs, y hay un test que falla si los dos mapas divergen.';

-- ── 2 · QUÉ PERMISO EXIGE CADA ACCIÓN ─────────────────────────────────────────────────────────
-- Gemelo de `ACCION` en `contrato.mjs`. Una acción que no está en esta lista devuelve NULL, y la
-- policy la rechaza: la lista es CERRADA, igual que del lado del código.
create or replace function public.cot_permiso_de_accion(p_accion text)
returns text language sql immutable set search_path to 'public' as $$
  select case p_accion
    when 'update_quantity'     then 'WRITE'
    when 'exclude_scope'       then 'WRITE'
    when 'include_scope'       then 'WRITE'
    when 'set_subcontract'     then 'WRITE'
    when 'set_resource_price'  then 'WRITE'
    when 'commercial_override' then 'COMMERCIAL_WRITE'
    when 'set_global_policy'   then 'GLOBAL_POLICY_WRITE'
    when 'freeze'              then 'FREEZE'
    when 'approve'             then 'APPROVE'
    when 'undo'                then 'WRITE'
    when 'evidence_query'      then 'READ'
    when 'blockers_query'      then 'READ'
    when 'cost_query'          then 'READ'
    when 'commercial_query'    then 'COMMERCIAL_WRITE'
    else null
  end
$$;

comment on function public.cot_permiso_de_accion(text) is
  'commercial_query NO muta y aun así exige COMMERCIAL_WRITE: el jefe de obra no ve lo comercial '
  'por ningún canal, y una consulta es un canal.';

-- ── 3 · LAS POLICIES POR ACCIÓN ───────────────────────────────────────────────────────────────
-- ALCANCE: leer sigue siendo ve_economia(); escribir exige WRITE.
drop policy if exists cotizacion_alcance_economia on public.cotizacion_alcance;
drop policy if exists cotizacion_alcance_lectura on public.cotizacion_alcance;
drop policy if exists cotizacion_alcance_escritura on public.cotizacion_alcance;
create policy cotizacion_alcance_lectura on public.cotizacion_alcance for select to authenticated
  using ((select public.ve_economia()));
create policy cotizacion_alcance_escritura on public.cotizacion_alcance for all to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('WRITE')))
  with check ((select public.ve_economia()) and (select public.cot_permiso('WRITE')));

-- EVENTOS: la policy valida el permiso DE LA ACCIÓN de la fila que se inserta, y que el actor sea
-- quien está escribiendo. Sin la segunda condición, alguien con WRITE podía firmar un evento con el
-- uuid de otro y la historia quedaba con un autor falso — que es peor que no tener historia.
drop policy if exists cotizacion_evento_alta on public.cotizacion_evento;
create policy cotizacion_evento_alta on public.cotizacion_evento for insert to authenticated
  with check (
    (select public.ve_economia())
    and public.cot_permiso_de_accion(accion) is not null
    and public.cot_permiso(public.cot_permiso_de_accion(accion))
    and actor = (select auth.uid())
  );

-- HUELLA: se escribe al congelar, así que exige FREEZE. Un jefe de obra con WRITE no puede fabricar
-- la huella de una versión que no congeló.
drop policy if exists cotizacion_huella_alta on public.cotizacion_huella;
create policy cotizacion_huella_alta on public.cotizacion_huella for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('FREEZE')));

-- INDIRECTOS: son la estructura de costos de la EMPRESA, no de una cotización. Cambiarlos es
-- política global (§17: una conversación no cambia la política global sin acción explícita).
drop policy if exists indirecto_concepto_economia on public.indirecto_concepto;
drop policy if exists indirecto_concepto_lectura on public.indirecto_concepto;
drop policy if exists indirecto_concepto_escritura on public.indirecto_concepto;
create policy indirecto_concepto_lectura on public.indirecto_concepto for select to authenticated
  using ((select public.ve_economia()));
create policy indirecto_concepto_escritura on public.indirecto_concepto for all to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')))
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));

-- ── 4 · EL GATE, EN LA BASE Y ANTES DE MUTAR ──────────────────────────────────────────────────
-- `congelar_presupuesto` informa `n_sin_analisis` y `n_subcontratadas_sin_precio` DESPUÉS de haber
-- congelado, y congelar es irreversible por diseño: los triggers `*_congelada_solo_lectura`
-- impiden editar después. Un presupuesto con tres paquetes sin precio queda congelado sin precio.
--
-- Esta función NO reemplaza a `congelar_presupuesto` —la ENVUELVE—, así que nada de lo que hoy la
-- llama cambia de comportamiento.
create or replace function public.cot_gate_congelado(p_cotizacion_id uuid)
returns jsonb language plpgsql stable security invoker set search_path to 'public' as $$
declare
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos   jsonb := '[]'::jsonb;
  v_conocido numeric;
  v_umbral   numeric := 0.02;   -- 2 % del costo conocido. Mismo umbral que UMBRAL_MATERIALIDAD.
  r          record;
begin
  if not exists (select 1 from public.cotizaciones where id = p_cotizacion_id) then
    return jsonb_build_object('ready', false, 'blocking_issues',
      jsonb_build_array(jsonb_build_object('tipo','NO_EXISTE','entidad',p_cotizacion_id,'detalle','la cotización no existe')),
      'warnings', '[]'::jsonb);
  end if;

  -- El costo CONOCIDO es la suma de lo que sí tiene subtotal. No es el costo directo —eso es lo que
  -- no se puede afirmar— y se usa sólo como escala para decidir qué es material.
  select coalesce(sum(v.subtotal), 0) into v_conocido
    from public.cotizacion_partida_valorizada v where v.cotizacion_id = p_cotizacion_id;

  -- 4.1 · subcontrato sin precio. Bloquea SIEMPRE: un paquete sin cotizar no vale $0 y no hay
  --       forma de estimar cuánto pesa, así que no se puede declarar chico.
  for r in
    select v.codigo, v.descripcion from public.cotizacion_partida_valorizada v
     where v.cotizacion_id = p_cotizacion_id and v.sin_precio_de_subcontrato
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SUBCONTRATO_SIN_PRECIO','entidad',coalesce(r.codigo, r.descripcion),
      'detalle','declarado subcontratado y sin precio: NO vale $0, vale lo que va a costar',
      'impacto', null, 'accion','set_subcontract');
  end loop;

  -- 4.2 · partida sin costo (sin análisis, o con cantidad nula). Bloquea si es material o si no se
  --       puede medir cuánto pesa.
  for r in
    select v.codigo, v.descripcion, v.cantidad, v.costo_unitario, v.sin_analisis
      from public.cotizacion_partida_valorizada v
     where v.cotizacion_id = p_cotizacion_id
       and not v.sin_precio_de_subcontrato
       and (v.subtotal is null or v.cantidad is null or v.sin_analisis)
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo', case when r.cantidad is null then 'CANTIDAD_CRITICA_AUSENTE' else 'SIN_COMPOSICION' end,
      'entidad', coalesce(r.codigo, r.descripcion),
      'detalle', case when r.cantidad is null then 'no tiene cantidad computada'
                      else 'no tiene análisis vigente: no se sabe de qué está hecha' end,
      'impacto', null,
      'accion', case when r.cantidad is null then 'update_quantity' else null end);
  end loop;

  -- 4.3 · conflicto de alcance: dos entradas que tocan la misma partida y dicen cosas opuestas.
  --       No se resuelve con plata, así que bloquea aunque sea barato.
  for r in
    select p.codigo, p.descripcion,
           string_agg(distinct a.patron || '→' || a.estado || ' (' || a.fuente || ')', ' vs ') as detalle
      from public.cotizacion_partida p
      join public.cotizacion_alcance a
        on a.cotizacion_id = p.cotizacion_id
       and (lower(coalesce(p.descripcion,'')) like '%' || lower(a.patron) || '%'
            or lower(coalesce(p.codigo,''))  like '%' || lower(a.patron) || '%'
            or lower(coalesce(p.rubro,''))   like '%' || lower(a.patron) || '%')
     where p.cotizacion_id = p_cotizacion_id
     group by p.id, p.codigo, p.descripcion
    having count(distinct a.estado) > 1
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','CONFLICTO','entidad',coalesce(r.codigo, r.descripcion),
      'detalle','el alcance dice dos cosas distintas sobre esta partida: ' || r.detalle,
      'impacto', null, 'accion','include_scope');
  end loop;

  -- 4.4 · sin precio calculable. Es aparte de la cola porque puede pasar sin que haya un solo
  --       bloqueo por partida: una cotización con cero partidas tiene la cola vacía y no tiene
  --       número que fijar.
  if v_conocido <= 0 then
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SIN_PRECIO_CALCULABLE','entidad','cotización',
      'detalle','no hay costo directo calculable: congelar es fijar un número y no hay número que fijar',
      'impacto', null, 'accion', null);
  end if;

  -- 4.5 · las advertencias: precios viejos. NO bloquean si no son materiales.
  for r in
    select v.codigo, v.descripcion, v.subtotal, max(cc.fecha_precio) as ultima
      from public.cotizacion_partida_valorizada v
      join public.analisis_linea al on al.analisis_id = v.analisis_id
      join public.recurso_precio cc on cc.recurso_id = al.recurso_id and cc.vigente
     where v.cotizacion_id = p_cotizacion_id and v.subtotal is not null
     group by v.codigo, v.descripcion, v.subtotal
    having max(cc.fecha_precio) < current_date - 180
  loop
    if v_conocido > 0 and r.subtotal / v_conocido >= v_umbral then
      v_bloqueos := v_bloqueos || jsonb_build_object(
        'tipo','PRECIO_DESACTUALIZADO','entidad',coalesce(r.codigo, r.descripcion),
        'detalle','el precio más nuevo de esta partida es del ' || r.ultima,
        'impacto', r.subtotal, 'accion','set_resource_price');
    else
      v_avisos := v_avisos || jsonb_build_object(
        'tipo','PRECIO_DESACTUALIZADO','entidad',coalesce(r.codigo, r.descripcion),
        'detalle','precio del ' || r.ultima, 'impacto', r.subtotal);
    end if;
  end loop;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_bloqueos) = 0,
    'blocking_issues', v_bloqueos,
    'warnings', v_avisos,
    'costo_conocido', v_conocido);
end $$;

comment on function public.cot_gate_congelado(uuid) is
  'El gate determinístico ANTES de congelar: {ready, blocking_issues, warnings}. No muta nada, así '
  'que la pantalla puede mostrarlo EN VIVO mientras se arma el presupuesto en vez de enterarse al '
  'final. security invoker: lo que el gate ve es lo que ve quien pregunta.';

-- ── 5 · CONGELAR CON GATE, ATÓMICO ────────────────────────────────────────────────────────────
create or replace function public.cot_congelar_con_gate(
  p_cotizacion_id uuid, p_sha256 text, p_partes jsonb, p_resumen text default null)
returns jsonb language plpgsql security invoker set search_path to 'public' as $$
declare v_gate jsonb; v_res jsonb; v_version int;
begin
  if not public.cot_permiso('FREEZE') then
    raise exception 'congelar exige el permiso FREEZE';
  end if;

  v_gate := public.cot_gate_congelado(p_cotizacion_id);
  if not (v_gate->>'ready')::boolean then
    -- SE LEVANTA EXCEPCIÓN Y NO SE DEVUELVE UN VALOR. Un valor de retorno se puede ignorar, y
    -- congelar sin gate es irreversible: es el defecto que esta función existe para impedir.
    raise exception 'no se puede congelar: % bloqueo(s). %',
      jsonb_array_length(v_gate->'blocking_issues'), v_gate->'blocking_issues';
  end if;

  select version into v_version from public.cotizaciones where id = p_cotizacion_id;
  v_res := public.congelar_presupuesto(p_cotizacion_id);

  insert into public.cotizacion_huella (cotizacion_id, version, sha256, partes, resumen)
  values (p_cotizacion_id, v_version, p_sha256, p_partes, p_resumen)
  on conflict (cotizacion_id, version) do nothing;

  return jsonb_build_object('congelado', v_res, 'gate', v_gate, 'version', v_version, 'huella', p_sha256);
end $$;

comment on function public.cot_congelar_con_gate(uuid, text, jsonb, text) is
  'Corre el gate, y SÓLO si pasa llama a congelar_presupuesto y guarda la huella de entradas — todo '
  'en una transacción. No reemplaza a congelar_presupuesto: la envuelve, así que nada de lo que hoy '
  'la llama cambia de comportamiento.';

grant execute on function public.cot_permiso(text)            to authenticated;
grant execute on function public.cot_permiso_de_accion(text)  to authenticated;
grant execute on function public.cot_gate_congelado(uuid)     to authenticated;
grant execute on function public.cot_congelar_con_gate(uuid, text, jsonb, text) to authenticated;

-- ── 6 · LA VIGENCIA DE UN PRECIO, CONSULTABLE POR SQL ─────────────────────────────────────────
-- Hoy `recurso_precio.vigente` es un BOOLEANO que dice «ésta es la fila que se usa», no «este
-- precio todavía sirve». El corte de 180 días vive en `DIAS_VIGENCIA` de `precios.mjs`, así que
-- PRECIO_DESACTUALIZADO se podía calcular en memoria y no consultar desde SQL.
--
-- SE ELIGIÓ COLUMNA NULLABLE + VISTA, y no sólo vista, por dos razones:
--   · hay recursos cuya vigencia NO es 180 días (un acuerdo de precio con un proveedor puede tener
--     validez contractual propia), y una vista con una constante no puede representarlos;
--   · la columna es `null` por defecto y NADIE la lee todavía salvo el adaptador nuevo, así que no
--     hay backfill que hacer: `null` significa «vale el default», y eso está declarado en
--     `vigenciaDe()` y en el comentario de la columna.
-- La única vista que consume `recurso_precio` es `recurso_costo`, y selecciona columnas EXPLÍCITAS:
-- agregar una no la altera.
alter table public.recurso_precio add column if not exists vigencia_dias int
  check (vigencia_dias is null or vigencia_dias > 0);

comment on column public.recurso_precio.vigencia_dias is
  'Cuántos días vale esta observación de precio. NULL = el default del motor (180 días), y NULL no '
  'es «no vence»: es «no se declaró, vale el default». Existe porque un acuerdo con un proveedor '
  'puede tener validez contractual propia y una constante no puede representarla.';

create or replace view public.recurso_precio_vigencia with (security_invoker = true) as
select rp.id, rp.recurso_id, r.codigo, r.nombre, rp.costo, rp.moneda, rp.fuente, rp.proveedor,
       rp.fecha_precio, rp.vigente,
       coalesce(rp.vigencia_dias, 180)                                   as vigencia_dias,
       (current_date - rp.fecha_precio)::int                             as antiguedad_dias,
       case
         when rp.costo is null                                              then 'FALTA_DATO'
         when rp.fecha_precio is null                                       then 'FALTA_DATO'
         when rp.fecha_precio > current_date                                then 'ERROR'
         when (current_date - rp.fecha_precio) > coalesce(rp.vigencia_dias, 180) then 'HISTORICO'
         else 'EXTRAIDO'
       end                                                               as estado
  from public.recurso_precio rp
  join public.recurso r on r.id = rp.recurso_id;

comment on view public.recurso_precio_vigencia is
  'El estado de cada observación de precio, con la misma taxonomía que estadoDeObservacion() en '
  'precios.mjs. HISTORICO no es FALTA_DATO: el precio existe, tiene número, y no cierra un '
  'presupuesto sin que alguien lo confirme. Un precio fechado en el futuro es ERROR, no fresco.';

grant select on public.recurso_precio_vigencia to authenticated;
grant select on public.recurso_precio_vigencia to service_role;
