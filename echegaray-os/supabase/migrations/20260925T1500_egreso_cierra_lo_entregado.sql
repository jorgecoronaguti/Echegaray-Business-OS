-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · QUIEN SE VA DE LA EMPRESA YA NO «TIENE» EPP NI ROPA: SE CIERRA COMO «EGRESÓ · NO DEVUELTO»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 25/09/2026: «hay operarios que están inactivos, entonces no me muestres como que la ropa o el
-- EPP lo tiene él».
--
-- REGLA (no carga manual): cuando una persona deja de estar en la empresa (`en_la_empresa` pasa a false,
-- o se le carga una `fecha_egreso` que ya llegó), lo que tenía en su lugar se CIERRA:
--   · sale de `activo_existencia` (ya no figura en su poder, ni en «Entregado a personas», ni en ningún
--     total de lo que está en manos de alguien);
--   · queda un `activo_ajuste` con motivo 'egreso' («egresó · no devuelto») fechado el día de egreso (sin
--     fecha de egreso cargada: el momento en que se cerró, y el detalle lo dice);
--   · NO vuelve al Taller: nadie lo devolvió;
--   · el historial de entregas y las constancias firmadas quedan como estaban.
-- Si la persona vuelve a la empresa no revive nada: lo cerrado queda cerrado y lo nuevo se entrega de nuevo.
-- Mientras no esté en la empresa, `_validar_destino` ya no deja entregarle nada (20260925T1100).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

alter table public.activo_ajuste drop constraint activo_ajuste_motivo_check;
alter table public.activo_ajuste add constraint activo_ajuste_motivo_check
  check (motivo in ('recuento', 'robada', 'perdida', 'descartada', 'vendida', 'egreso'));
comment on column public.activo_ajuste.motivo is
  'recuento · baja parcial (robada, perdida, descartada, vendida) · egreso: la persona se fue de la empresa sin devolver lo que tenía.';

create function public._cerrar_entregas_de_persona(p_persona uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_ubic uuid; v_egreso date; v_en boolean; v_cuando timestamptz; v_detalle text; r record; v_n int := 0;
begin
  select en_la_empresa, fecha_egreso into v_en, v_egreso from personas where id = p_persona;
  select id into v_ubic from ubicacion where persona_id = p_persona;
  if v_ubic is null then return 0; end if;
  v_cuando := case when v_egreso is not null then (v_egreso::text || ' 12:00:00-03')::timestamptz else now() end;
  v_detalle := case when v_egreso is not null then 'egresó el ' || to_char(v_egreso, 'DD/MM/YYYY') || ' · no devuelto'
                    else 'egresó (sin fecha de baja en el legajo) · no devuelto' end;
  for r in select e.activo_id, e.cantidad from activo_existencia e where e.ubicacion_id = v_ubic for update loop
    insert into activo_ajuste (activo_id, ubicacion_id, antes, despues, motivo, detalle, usuario_id, creado_en)
    values (r.activo_id, v_ubic, r.cantidad, 0, 'egreso', v_detalle, auth.uid(), v_cuando);
    delete from activo_existencia where activo_id = r.activo_id and ubicacion_id = v_ubic;
    perform public._activo_recalcular(r.activo_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public._cerrar_entregas_de_persona(uuid) from public, anon, authenticated;

create function public._egreso_cierra_lo_entregado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.en_la_empresa is false and old.en_la_empresa is distinct from false)
     or (new.fecha_egreso is not null and new.fecha_egreso <= current_date and old.fecha_egreso is distinct from new.fecha_egreso) then
    perform public._cerrar_entregas_de_persona(new.id);
  end if;
  return new;
end $$;
revoke all on function public._egreso_cierra_lo_entregado() from public, anon, authenticated;

create trigger personas_egreso_cierra_lo_entregado
  after update of en_la_empresa, fecha_egreso on public.personas
  for each row execute function public._egreso_cierra_lo_entregado();

-- ── LOS QUE YA SE FUERON: se cierra hoy lo que figura en su poder ───────────────────────────────
do $$
declare r record; v_n int := 0; v_p int := 0;
begin
  for r in select distinct p.id from personas p join ubicacion u on u.persona_id = p.id
            join activo_existencia e on e.ubicacion_id = u.id
           where p.en_la_empresa is false or (p.fecha_egreso is not null and p.fecha_egreso <= current_date) loop
    v_n := v_n + public._cerrar_entregas_de_persona(r.id);
    v_p := v_p + 1;
  end loop;
  if exists (select 1 from activo_existencia e join ubicacion u on u.id = e.ubicacion_id join personas p on p.id = u.persona_id
              where p.en_la_empresa is false) then
    raise exception 'quedó EPP o ropa en poder de alguien que no está en la empresa';
  end if;
  raise notice 'egreso: % personas, % ítems cerrados como «egresó · no devuelto»', v_p, v_n;
end $$;
