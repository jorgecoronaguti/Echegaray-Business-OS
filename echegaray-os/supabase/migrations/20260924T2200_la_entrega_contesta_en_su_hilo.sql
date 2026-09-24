-- LO QUE PASA CON UNA ENTREGA SE CONTESTA EN EL HILO DEL CANAL EFECTIVO DONDE SE REGISTRÓ (dueño, 24/09/2026)
--
-- «La persona firmó el recibo y no me emitió notificación ni de ida (cuando se le envió) ni de que ya estaba
-- firmado. Te pido que todo esto pase en el canal efectivo directamente, y más fácil en el hilo de cada
-- escritura en lenguaje natural que se haga, referenciando eso».
--
-- Medido: ER-0020 se firmó 16:23:26 y el directo al dueño salió 16:23:30 — salió, y se perdió entre los demás
-- avisos de su DM con el bot. El aviso existía; el lugar estaba mal.
--
-- 1. La entrega RECUERDA el post del canal que la originó (`origen_post_id`, la raíz del hilo). La escribe el
--    especialista del chat al registrarla, y la rellena el drenador desde la respuesta «Registrado: **ER-…**»
--    del outbox. Una entrega hecha en la web no tiene post: queda null y sus avisos van sueltos al canal.
-- 2. La ida (pedido de firma), la firma y la anulación se publican en ESE hilo. Sin monto: el canal lo ve
--    todo el grupo que rinde (regla del módulo desde el 22/09).
-- 3. El directo al DUEÑO por la firma se RETIRA: es el que se perdió. El directo a la PERSONA (anulación y
--    pedido de firma) se queda: sin él no le llega el enlace ni el motivo.
--
-- `{persona}` en el texto lo reemplaza el drenador por la mención (@usuario de Mattermost) o, si no tiene,
-- por el nombre del padrón. La base no conoce los usuarios de Mattermost.
set local lock_timeout = '5s';

alter table public.efectivo_entrega add column if not exists origen_post_id text;
comment on column public.efectivo_entrega.origen_post_id is
  'Raíz del hilo del canal Efectivo donde se registró la entrega por chat. Los avisos de la entrega (pedido de '
  'firma, firma, anulación, reclamo) se contestan en ese hilo. Null = se registró en la web: avisos sueltos.';
-- Lectura: `authenticated` tiene SELECT de TABLA sobre efectivo_entrega, que alcanza a la columna nueva.
-- Escritura: sólo el orquestador (service), igual que avisada_en / aviso_post_id.

alter table public.efectivo_aviso drop constraint if exists efectivo_aviso_tipo_check;
alter table public.efectivo_aviso add constraint efectivo_aviso_tipo_check
  check (tipo in ('reclamo', 'pedido_de_dato', 'anulacion', 'firmada', 'pedido_firma'));

create or replace function public._efectivo_avisos_por_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien uuid; v_hora text;
begin
  v_quien := coalesce(new.anulada_por, new.entregada_por);
  if new.anulada_en is not null and old.anulada_en is null then
    -- A la persona, por directo, con el monto: es su plata.
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'anulacion', 'persona',
      'Se anuló la entrega de efectivo **' || new.codigo || '** (' || public._efectivo_pesos(new.monto) || ')'
      || case when nullif(trim(coalesce(new.anulada_motivo, '')), '') is not null then ': ' || trim(new.anulada_motivo) else '.' end
      || E'\nNo mandes tickets contra esa entrega. Si te corresponde otra, Administración la registra de nuevo.',
      v_quien);
    -- Al hilo del canal, sin monto. Un motivo sin letras ni números («-») no es un motivo.
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'anulacion', 'canal',
      '✕ **' || new.codigo || '** de {persona} anulada'
      || case when coalesce(new.anulada_motivo, '') ~ '[[:alnum:]]' then ': ' || trim(new.anulada_motivo) else '.' end
      || E'\nNo se rinden tickets contra esa entrega.',
      v_quien);
  end if;
  if new.conformidad_en is not null and old.conformidad_en is null then
    -- La hora sola si se firmó el mismo día que se entregó; si no, con la fecha.
    v_hora := to_char(new.conformidad_en at time zone 'America/Argentina/San_Juan',
      case when (new.conformidad_en at time zone 'America/Argentina/San_Juan')::date
                = (new.creada_en at time zone 'America/Argentina/San_Juan')::date
           then 'HH24:MI' else 'DD/MM HH24:MI' end);
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'firmada', 'canal',
      '✓ {persona} firmó la conformidad de **' || new.codigo || '** · ' || v_hora,
      v_quien);
  end if;
  return new;
end $$;
