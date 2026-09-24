-- LA FIRMA TAMBIÉN SE AVISA EN EL CANAL EFECTIVO (dueño, 24/09/2026: «cuando se hace la firma del recibo tiene
-- que mandar mensaje al canal efectivo»). Se suma al aviso directo al dueño (23/09), no lo reemplaza.
-- SIN MONTO en el canal: lo ve todo el grupo que rinde, y cuánta plata recibió cada uno es de esa persona
-- (regla del módulo desde el 22/09). El drenador le antepone la mención de quien firmó: «@emiliano firmó…».
set local lock_timeout = '5s';

create or replace function public._efectivo_avisos_por_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_quien uuid;
begin
  select nombre_completo into v_nombre from personas where id = new.persona_id;
  v_quien := coalesce(new.anulada_por, new.entregada_por);
  if new.anulada_en is not null and old.anulada_en is null then
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'anulacion', 'persona',
      'Se anuló la entrega de efectivo **' || new.codigo || '** (' || public._efectivo_pesos(new.monto) || ')'
      || case when nullif(trim(coalesce(new.anulada_motivo, '')), '') is not null then ': ' || trim(new.anulada_motivo) else '.' end
      || E'\nNo mandes tickets contra esa entrega. Si te corresponde otra, Administración la registra de nuevo.',
      v_quien);
  end if;
  if new.conformidad_en is not null and old.conformidad_en is null then
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'firmada', 'dueno',
      '**' || new.codigo || '** firmada: ' || coalesce(v_nombre, 'la persona') || ' recibió '
      || public._efectivo_pesos(new.monto) || ' el ' || to_char(new.conformidad_en at time zone 'America/Argentina/San_Juan', 'DD/MM HH24:MI') || '.',
      v_quien);
    insert into efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
    values (new.id, 'firmada', 'canal',
      '✓ firmó la conformidad de **' || new.codigo || '** (' || coalesce(v_nombre, 'la persona') || ') el '
      || to_char(new.conformidad_en at time zone 'America/Argentina/San_Juan', 'DD/MM HH24:MI') || '.',
      v_quien);
  end if;
  return new;
end $$;
