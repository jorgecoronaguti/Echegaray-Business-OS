-- ═══ EL RESPALDO DEL CONGELADO TAMBIÉN ES EL CONTRATO (22/08/2026) ═══
--
-- Quinta puerta, hallada por el auditor de cierre en la re-verificación (aud-congelado3.mjs):
-- con el precio ya blindado, todavía se podía borrar el RESPALDO (las 11 líneas de
-- cotizacion_partida_composicion) e inventar líneas nuevas — el precio no se movía, y eso era
-- exactamente lo incómodo: el número seguía diciendo lo mismo y ya no se podía explicar. La
-- memoria de cálculo es lo que permite discutir el precio con el cliente y auditar el margen.
--
-- La composición nace DURANTE congelar_presupuesto, cuando congelada_en todavía es null — por eso
-- este trigger no estorba el congelado legítimo: sella recién después, junto con la cabecera.

create or replace function public.composicion_congelada_es_de_solo_lectura()
returns trigger language plpgsql as $$
declare v_congelada timestamptz;
begin
  select c.congelada_en into v_congelada
    from public.cotizacion_partida p
    join public.cotizaciones c on c.id = p.cotizacion_id
   where p.id = coalesce(new.partida_id, old.partida_id);
  if v_congelada is not null then
    raise exception
      'el respaldo de una oferta congelada no se toca: la memoria de cálculo es parte del contrato';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists composicion_congelada_solo_lectura_t on public.cotizacion_partida_composicion;
create trigger composicion_congelada_solo_lectura_t
  before insert or update or delete on public.cotizacion_partida_composicion
  for each row execute function public.composicion_congelada_es_de_solo_lectura();
