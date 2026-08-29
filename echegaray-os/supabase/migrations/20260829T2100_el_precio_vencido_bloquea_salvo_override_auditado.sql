-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UN PRECIO VENCIDO BLOQUEA EL CONGELADO, SALVO OVERRIDE COMERCIAL AUDITADO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ POR QUÉ CAMBIA, Y POR QUÉ EN LAS TRES CAPAS A LA VEZ ═══
--
-- La auditoría adversarial encontró que HISTORICO terminaba sellado VALIDADO: el motor lo traducía
-- a EXTRAIDO para poder sumarlo, `contrato.cierra()` —que declara que HISTORICO no cierra— no lo
-- llamaba nadie, y este gate lo trataba por materialidad. Tres capas, tres semánticas distintas
-- para la misma pregunta.
--
-- §42 dice HISTORICO ≠ VALIDADO y no admite lectura por materialidad: un precio vencido de $900
-- tampoco vuelve válida una oferta, sólo la vuelve barata de arreglar. Ahora las tres dicen lo
-- mismo: BLOQUEA, y lo destraba un override con QUIÉN lo autoriza — fila auditable, no un flag.
--
-- ═══ LO QUE ESTE GATE NO PUEDE VER, DECLARADO ═══
--
-- El gate de la base es ESTRUCTURALMENTE MÁS CIEGO que el del motor, y no es un defecto que se
-- pueda arreglar acá: hay fuentes que no están en Postgres.
--   · CONFLICTO y FALTA_DATO heredados del corpus documental (biblioteca.json)
--   · AMBIGUO de exclusión candidata: sale de leer las frases del contrato
--   · FUGA_ENTRE_CLIENTES: el barrido corre sobre el texto que produce el motor
--   · UNIDAD_INCOMPATIBLE: la unidad se valida contra el catálogo del motor
-- Por eso el vigilante compara CONJUNTOS con esa lista como diferencia esperada, y falla si
-- aparece un tipo fuera de ella.

create table if not exists public.cotizacion_override_precio (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references public.cotizaciones (id) on delete cascade,
  recurso_codigo text not null,
  autorizado_por uuid not null default auth.uid(),
  motivo         text,
  creado_en      timestamptz not null default now(),
  constraint cotizacion_override_precio_unico unique (cotizacion_id, recurso_codigo)
);

comment on table public.cotizacion_override_precio is
  'Quien asumio un precio vencido y por que. NO es un flag: autorizado_por es NOT NULL con default '
  'auth.uid(), asi que un override sin firma no se puede insertar. Es la unica forma de destrabar '
  'un PRECIO_DESACTUALIZADO.';

alter table public.cotizacion_override_precio enable row level security;
drop policy if exists cotizacion_override_precio_lectura on public.cotizacion_override_precio;
drop policy if exists cotizacion_override_precio_alta on public.cotizacion_override_precio;
create policy cotizacion_override_precio_lectura on public.cotizacion_override_precio for select to authenticated
  using ((select public.ve_economia()));
-- Asumir un precio vencido mueve el precio de venta: es COMMERCIAL_WRITE, no WRITE.
create policy cotizacion_override_precio_alta on public.cotizacion_override_precio for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('COMMERCIAL_WRITE'))
              and autorizado_por = (select auth.uid()));

grant select, insert on public.cotizacion_override_precio to authenticated;
grant all on public.cotizacion_override_precio to service_role;

create or replace function public.cot_gate_congelado(p_cotizacion_id uuid)
returns jsonb language plpgsql stable security invoker set search_path to 'public' as $$
declare
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos   jsonb := '[]'::jsonb;
  v_conocido numeric;
  r          record;
begin
  if not exists (select 1 from public.cotizaciones where id = p_cotizacion_id) then
    return jsonb_build_object('ready', false, 'blocking_issues',
      jsonb_build_array(jsonb_build_object('tipo','NO_EXISTE','entidad',p_cotizacion_id,'detalle','la cotizacion no existe')),
      'warnings', '[]'::jsonb);
  end if;

  select coalesce(sum(v.subtotal), 0) into v_conocido
    from public.cotizacion_partida_valorizada v where v.cotizacion_id = p_cotizacion_id;

  for r in
    select v.codigo, v.descripcion from public.cotizacion_partida_valorizada v
     where v.cotizacion_id = p_cotizacion_id and v.sin_precio_de_subcontrato
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SUBCONTRATO_SIN_PRECIO','entidad',coalesce(r.codigo, r.descripcion),
      'detalle','declarado subcontratado y sin precio: NO vale 0, vale lo que va a costar',
      'impacto', null, 'accion','set_subcontract');
  end loop;

  for r in
    select v.codigo, v.descripcion, v.cantidad, v.sin_analisis
      from public.cotizacion_partida_valorizada v
     where v.cotizacion_id = p_cotizacion_id
       and not v.sin_precio_de_subcontrato
       and (v.subtotal is null or v.cantidad is null or v.sin_analisis)
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo', case when r.cantidad is null then 'CANTIDAD_CRITICA_AUSENTE' else 'SIN_COMPOSICION' end,
      'entidad', coalesce(r.codigo, r.descripcion),
      'detalle', case when r.cantidad is null then 'no tiene cantidad computada'
                      else 'no tiene analisis vigente: no se sabe de que esta hecha' end,
      'impacto', null,
      'accion', case when r.cantidad is null then 'update_quantity' else null end);
  end loop;

  for r in
    select rc.codigo, rc.nombre,
           string_agg(distinct coalesce(p.codigo, p.descripcion), ', ') as partidas
      from public.cotizacion_partida p
      join public.analisis_linea al on al.analisis_id = p.analisis_id
      join public.recurso rc on rc.id = al.recurso_id
     where p.cotizacion_id = p_cotizacion_id
       and not p.subcontratada
       and not exists (select 1 from public.recurso_precio rp
                        where rp.recurso_id = rc.id and rp.costo is not null and rp.fecha_precio is not null)
     group by rc.codigo, rc.nombre
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SIN_PRECIO','entidad', public.rc_entidad(r.codigo, r.nombre),
      'detalle','no hay ninguna observacion de precio para este recurso - lo pide: ' || coalesce(r.partidas,'?'),
      'impacto', null, 'accion','set_resource_price');
  end loop;

  -- LA LINEA DE COMPOSICION SIN CANTIDAD. Mismo defecto que el motor tenia: analisis_linea.cantidad
  -- en NULL multiplicaba por cero y borraba el renglon del costo sin decir nada.
  for r in
    select rc.codigo, rc.nombre, coalesce(p.codigo, p.descripcion) as partida
      from public.cotizacion_partida p
      join public.analisis_linea al on al.analisis_id = p.analisis_id
      join public.recurso rc on rc.id = al.recurso_id
     where p.cotizacion_id = p_cotizacion_id and not p.subcontratada and al.cantidad is null
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','FALTA_DATO','entidad', public.rc_entidad(r.codigo, r.nombre),
      'detalle','la composicion no dice cuanto lleva por unidad en ' || r.partida || '. NO es cero',
      'impacto', null, 'accion', null);
  end loop;

  for r in
    select p.codigo, p.descripcion,
           string_agg(distinct a.patron || '->' || a.estado || ' (' || a.fuente || ')', ' vs ') as detalle
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

  if v_conocido <= 0
     or exists (select 1 from public.cotizacion_partida p
                  join public.analisis_linea al on al.analisis_id = p.analisis_id
                  join public.recurso rc on rc.id = al.recurso_id
                 where p.cotizacion_id = p_cotizacion_id and not p.subcontratada
                   and (al.cantidad is null
                        or not exists (select 1 from public.recurso_precio rp
                                        where rp.recurso_id = rc.id and rp.costo is not null and rp.fecha_precio is not null)))
     or exists (select 1 from public.cotizacion_partida_valorizada v
                 where v.cotizacion_id = p_cotizacion_id and v.sin_precio_de_subcontrato)
  then
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SIN_PRECIO_CALCULABLE','entidad','cotizacion',
      'detalle','el costo directo no se pudo afirmar, asi que el precio tampoco. NO es cero: es desconocido',
      'impacto', null, 'accion', null);
  end if;

  -- PRECIO VENCIDO: BLOQUEA SALVO OVERRIDE AUDITADO. Ya no por materialidad. Es la misma regla que
  -- atencion.BLOQUEAN_SALVO_OVERRIDE en el motor.
  for r in
    select rc.codigo, rc.nombre, max(rp.fecha_precio) as ultima,
           exists (select 1 from public.cotizacion_override_precio o
                    where o.cotizacion_id = p_cotizacion_id and o.recurso_codigo = rc.codigo) as asumido
      from public.cotizacion_partida p
      join public.analisis_linea al on al.analisis_id = p.analisis_id
      join public.recurso rc on rc.id = al.recurso_id
      join public.recurso_precio rp on rp.recurso_id = rc.id and rp.costo is not null and rp.fecha_precio is not null
     where p.cotizacion_id = p_cotizacion_id and not p.subcontratada
     group by rc.codigo, rc.nombre
    having max(rp.fecha_precio) < current_date - coalesce(max(rp.vigencia_dias), 180)
  loop
    if r.asumido then
      v_avisos := v_avisos || jsonb_build_object(
        'tipo','PRECIO_DESACTUALIZADO','entidad', public.rc_entidad(r.codigo, r.nombre),
        'detalle','precio del ' || r.ultima || ' asumido por quien firmo el override');
    else
      v_bloqueos := v_bloqueos || jsonb_build_object(
        'tipo','PRECIO_DESACTUALIZADO','entidad', public.rc_entidad(r.codigo, r.nombre),
        'detalle','el precio mas nuevo es del ' || r.ultima || ': un precio vencido NO cierra un presupuesto (HISTORICO distinto de VALIDADO). Lo destraba un override comercial con quien lo autoriza',
        'impacto', null, 'accion','set_resource_price');
    end if;
  end loop;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_bloqueos) = 0,
    'blocking_issues', v_bloqueos,
    'warnings', v_avisos,
    'costo_conocido', v_conocido);
end $$;

comment on function public.cot_gate_congelado(uuid) is
  'El gate deterministico ANTES de congelar. Baja hasta analisis_linea, recurso y recurso_precio: '
  'un recurso sin precio, una linea sin cantidad o un precio VENCIDO bloquean. El vencido lo '
  'destraba un override auditado en cotizacion_override_precio, nunca la materialidad. '
  'ES ESTRUCTURALMENTE MAS CIEGO que el gate del motor: no puede ver CONFLICTO ni FALTA_DATO '
  'heredados del corpus documental, ni AMBIGUO de exclusion candidata, ni FUGA_ENTRE_CLIENTES, ni '
  'UNIDAD_INCOMPATIBLE, porque esas fuentes no estan en Postgres. El test que compara los dos gates '
  'lleva esa lista como diferencia esperada y falla si aparece un tipo fuera de ella.';

-- LA FRASE FALSA DE 20260829T1800: afirmaba que este gate «hace cumplir el congelado desde
-- PostgREST». Era FALSO cuando se escribio (grep: solo lo llamaban dos tests). El FRONT lo esta
-- cableando en actions.ts; hasta que este mergeado y desplegado, lo correcto es decir que el gate
-- EXISTE y esta probado, no que este haciendo cumplir nada en produccion.
comment on function public.cot_congelar_con_gate(uuid, text, jsonb, text) is
  'Corre el gate y SOLO si pasa llama a congelar_presupuesto y guarda la huella. Envuelve a '
  'congelar_presupuesto en vez de editarla. AL 29/08/2026 SUS UNICOS LLAMADORES SON TESTS: el '
  'cableado de la aplicacion esta en la rama del frente y no mergeado.';
