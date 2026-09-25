-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EDITAR Y BORRAR EL PARTE DIARIO (manual o dictado), Y CORREGIRLO POR VOZ
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 25/09/2026: «vas a tener que dar la posibilidad de editar o borrar el parte diario por voz,
-- para usuarios y para admin; si no, es un desastre». Y: «usá Supabase con las mismas tablas, que no
-- se crucen datos ni se cargue dos veces nada».
--
-- NO HAY TABLA NUEVA DE PARTES. Editar y borrar pasan por las mismas puertas que el parte tipeado
-- (registros_hh + asistencia_dia por guardarJornada/quitarPresencia, obra_ejecucion por
-- guardarParteDiario/borrarParte, obra_actividad_nota, pedidos_materiales por pedir/borrar_pedido).
-- Lo que agrega esta migración es chico:
--
--   1. `parte_dictado.es_correccion`: el audio de «Dictar corrección» es un dictado más, que se aplica
--      como CAMBIO sobre el parte que ya existe (se actualiza, no se crea otro).
--   2. el estado `anulado`: el parte del día se borró; el dictado que lo había cargado queda como
--      evidencia (el audio no se borra), pero ya no cuenta.
--   3. `registrar_cambio_parte()`: la bitácora del OS (`entidad_cambio`) con quién cambió qué del
--      parte, entidad 'parte_diario' e id '<obra>/<fecha>'. SECURITY DEFINER porque la tabla no
--      tiene insert para la web; la función exige jefe/Administración y que vea la obra.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── 1 y 2. EL DICTADO ───────────────────────────────────────────────────────────────────────────
alter table public.parte_dictado add column if not exists es_correccion boolean not null default false;
comment on column public.parte_dictado.es_correccion is
  'Dictar corrección: lo dictado se aplica como cambio sobre el parte que ya existe de esa obra y día.';

alter table public.parte_dictado drop constraint if exists parte_dictado_estado_check;
alter table public.parte_dictado add constraint parte_dictado_estado_check
  check (estado in ('pendiente', 'transcribiendo', 'listo', 'error', 'guardado', 'descartado', 'anulado'));

alter table public.parte_dictado drop constraint if exists parte_dictado_cierre_coherente;
alter table public.parte_dictado add constraint parte_dictado_cierre_coherente
  check ((estado in ('guardado', 'descartado', 'anulado')) = (cerrado_en is not null));

create or replace function public.parte_dictado_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if new.estado = old.estado then
    raise exception 'un dictado sólo se guarda, se descarta o se anula' using errcode = '42501';
  end if;
  if not (
       (old.estado = 'listo' and new.estado = 'guardado')
    or (old.estado in ('pendiente', 'transcribiendo', 'listo', 'error') and new.estado = 'descartado')
    -- Borrar el parte del día anula lo que ese dictado cargó. El audio queda.
    or (old.estado = 'guardado' and new.estado = 'anulado')
  ) then
    raise exception 'un dictado % no puede pasar a %', old.estado, new.estado using errcode = '42501';
  end if;
  new.cerrado_en := now();
  new.cerrado_por := auth.uid();
  return new;
end;
$$;

grant insert (es_correccion) on public.parte_dictado to authenticated;

-- ── 3. LA BITÁCORA ──────────────────────────────────────────────────────────────────────────────
create or replace function public.registrar_cambio_parte(
  p_obra text, p_fecha date, p_campo text, p_antes text, p_despues text
) returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.es_administracion() or not public.ve_obra(p_obra) then
    raise exception 'el parte de esa obra lo cambia el jefe o Administración' using errcode = '42501';
  end if;
  if p_campo is null or p_campo not in ('editado', 'corregido por voz', 'borrado') then
    raise exception 'campo de bitácora desconocido: %', p_campo using errcode = 'P0001';
  end if;
  insert into public.entidad_cambio (entidad, entidad_id, campo, antes, despues, autor)
  values ('parte_diario', p_obra || '/' || to_char(p_fecha, 'YYYY-MM-DD'), p_campo,
          left(p_antes, 4000), left(p_despues, 4000), auth.uid());
end;
$$;

revoke all on function public.registrar_cambio_parte(text, date, text, text, text) from public, anon;
grant execute on function public.registrar_cambio_parte(text, date, text, text, text) to authenticated;
