-- ASIGNAR A UNA OBRA EN UNA SOLA TRANSACCIÓN, SIN BORRAR NUNCA (auditoría, 14/09/2026).
--
-- La app escribía `obra_asignacion` con llamadas sueltas de PostgREST: cerrar la anterior, borrar un
-- pase futuro, abrir la nueva. Si el alta rebotaba, lo cerrado o borrado ya estaba escrito, y un alta
-- con fecha pasada podía borrar tres filas cargadas por personas sin dejar rastro.
--
-- Esta función hace todo o nada:
--   · `p_cerrar`   [{id, hasta}]  pone `hasta`;
--   · `p_anular`   [{id}]         marca «ANULADA por cronología» en `notas` (la lectura la ignora);
--   · `p_recortar` [{id, desde}]  corre `desde`;
--   · `p_altas`    [{obra_id, rol, desde, hasta, cuadrilla_id, actividad_id, notas}] inserta.
-- Toda fila tocada recibe `p_nota` («ajustada por <usuario> al asignar …»). No hay `delete`.
--
-- SECURITY INVOKER: corre con los permisos de quien llama, así que la RLS de `obra_asignacion` sigue
-- decidiendo quién toca qué. Cada fila tiene que ser de `p_persona` y afectar exactamente una: si la
-- policy la esconde o alguien la cambió, se aborta con excepción y no queda nada escrito.
--
-- Quién decide QUÉ se cierra, anula o recorta es `orquestador/lib/cronologia-asignaciones.mjs` en la
-- app; lo que no es un cierre automático sólo llega acá después de que una persona confirmó.

create or replace function public.asignar_obra_con_cronologia(
  p_persona uuid,
  p_cerrar jsonb,
  p_anular jsonb,
  p_recortar jsonb,
  p_altas jsonb,
  p_nota text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $fn$
declare
  x jsonb;
  n int;
  nuevo uuid;
  ids uuid[] := '{}';
begin
  if p_persona is null then
    raise exception 'asignar_obra_con_cronologia: falta la persona' using errcode = '22023';
  end if;
  if p_nota is null or btrim(p_nota) = '' then
    raise exception 'asignar_obra_con_cronologia: toda fila tocada lleva nota' using errcode = '22023';
  end if;

  for x in select value from jsonb_array_elements(coalesce(p_cerrar, '[]'::jsonb)) loop
    update obra_asignacion
       set hasta = (x->>'hasta')::date,
           notas = case when coalesce(notas, '') = '' then p_nota else notas || ' · ' || p_nota end
     where id = (x->>'id')::uuid and persona_id = p_persona;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'no pude cerrar la asignación % (% filas): no se escribió nada', x->>'id', n using errcode = 'P0002';
    end if;
  end loop;

  for x in select value from jsonb_array_elements(coalesce(p_anular, '[]'::jsonb)) loop
    update obra_asignacion
       set notas = case when coalesce(notas, '') = '' then '' else notas || ' · ' end
                   || 'ANULADA por cronología: ' || p_nota
     where id = (x->>'id')::uuid and persona_id = p_persona;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'no pude anular la asignación % (% filas): no se escribió nada', x->>'id', n using errcode = 'P0002';
    end if;
  end loop;

  for x in select value from jsonb_array_elements(coalesce(p_recortar, '[]'::jsonb)) loop
    update obra_asignacion
       set desde = (x->>'desde')::date,
           notas = case when coalesce(notas, '') = '' then p_nota else notas || ' · ' || p_nota end
     where id = (x->>'id')::uuid and persona_id = p_persona
       and (hasta is null or hasta >= (x->>'desde')::date);
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'no pude recortar la asignación % (% filas): no se escribió nada', x->>'id', n using errcode = 'P0002';
    end if;
  end loop;

  for x in select value from jsonb_array_elements(coalesce(p_altas, '[]'::jsonb)) loop
    insert into obra_asignacion (obra_id, persona_id, rol, cuadrilla_id, actividad_id, desde, hasta, notas)
    values (
      x->>'obra_id', p_persona, coalesce(nullif(x->>'rol', ''), 'integrante'),
      nullif(x->>'cuadrilla_id', '')::uuid, nullif(x->>'actividad_id', '')::uuid,
      (x->>'desde')::date, nullif(x->>'hasta', '')::date, nullif(x->>'notas', '')
    )
    returning id into nuevo;
    ids := ids || nuevo;
  end loop;

  return jsonb_build_object('altas', to_jsonb(ids));
end
$fn$;

comment on function public.asignar_obra_con_cronologia(uuid, jsonb, jsonb, jsonb, jsonb, text) is
  'Asigna a una persona a una obra respetando su cronología: cierra, anula (marca en notas), recorta y '
  'da de alta en una sola transacción. Nunca borra. SECURITY INVOKER: manda la RLS de obra_asignacion.';

revoke all on function public.asignar_obra_con_cronologia(uuid, jsonb, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.asignar_obra_con_cronologia(uuid, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
