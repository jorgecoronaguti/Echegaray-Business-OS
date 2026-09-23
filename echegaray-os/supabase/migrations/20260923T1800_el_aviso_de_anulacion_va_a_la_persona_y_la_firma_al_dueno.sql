-- AVISOS DEL EFECTIVO: LA ANULACIÓN A LA PERSONA, LA FIRMA AL DUEÑO (dueño, 23/09/2026)
--
-- «Si anulo o hay error de carga en el módulo Efectivo que notifique XSAS a quien se le designó ese
-- efectivo, y XSAS me tiene que notificar a mí (Jorge) cuando se haya entregado efectivo y se haya
-- firmado». Los dos hechos nacen en la base (anulada_en, conformidad_en): acá se encolan como avisos con
-- DESTINO, y el drenador de la VM los manda por mensaje directo. La web no tiene el token del bot.

set local lock_timeout = '5s';

alter table public.efectivo_aviso drop constraint if exists efectivo_aviso_tipo_check;
alter table public.efectivo_aviso add constraint efectivo_aviso_tipo_check
  check (tipo in ('reclamo', 'pedido_de_dato', 'anulacion', 'firmada'));
alter table public.efectivo_aviso
  add column if not exists destino text not null default 'canal'
  check (destino in ('canal', 'persona', 'dueno'));
comment on column public.efectivo_aviso.destino is
  'canal = el canal Efectivo · persona = mensaje directo a quien recibió la plata · dueno = mensaje directo al dueño.';

create or replace function public._efectivo_avisos_por_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_quien uuid;
begin
  select nombre_completo into v_nombre from personas where id = new.persona_id;
  v_quien := coalesce(new.anulada_por, new.entregada_por);
  -- ANULADA (incluye «error de carga»): se le dice a quien tenía la plata, con el motivo.
  if new.anulada_en is not null and old.anulada_en is null then
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'anulacion', 'persona',
      'Se anuló la entrega de efectivo **' || new.codigo || '** (' || to_char(new.monto, 'FM999G999G999G990D00') || ')'
      || case when nullif(trim(coalesce(new.anulada_motivo, '')), '') is not null then ': ' || trim(new.anulada_motivo) else '.' end
      || E'\nNo mandes tickets contra esa entrega. Si te corresponde otra, Administración la registra de nuevo.',
      v_quien);
  end if;
  -- FIRMADA: al dueño, con quién y cuánto.
  if new.conformidad_en is not null and old.conformidad_en is null then
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'firmada', 'dueno',
      '**' || new.codigo || '** firmada: ' || coalesce(v_nombre, 'la persona') || ' recibió $ '
      || to_char(new.monto, 'FM999G999G999G990D00') || ' el ' || to_char(new.conformidad_en at time zone 'America/Argentina/San_Juan', 'DD/MM HH24:MI') || '.',
      v_quien);
  end if;
  return new;
end $$;

drop trigger if exists efectivo_entrega_avisos on public.efectivo_entrega;
create trigger efectivo_entrega_avisos after update of anulada_en, conformidad_en on public.efectivo_entrega
  for each row execute function public._efectivo_avisos_por_cambio();
