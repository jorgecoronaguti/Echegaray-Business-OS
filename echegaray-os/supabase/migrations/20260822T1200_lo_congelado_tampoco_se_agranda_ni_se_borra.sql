-- ═══ LO CONGELADO TAMPOCO SE AGRANDA NI SE BORRA (22/08/2026) ═══
--
-- El auditor de cierre encontró las dos puertas que T4400 dejó abiertas, con ataque reproducido
-- como usuario authenticated real (scripts aud-congelado*.mjs del scratchpad de la sesión):
--
--   A1 · INSERT de una partida en una cotización congelada: el trigger de partida era
--        `before update or delete` — no miraba INSERT. Una oferta emitida de $10,1M pasó a
--        $1.025M sin versión nueva, sin rastro y sin un solo error, porque la cascada recalcula
--        siempre sobre las partidas vivas.
--   A2 · DELETE de la cotización congelada entera: el trigger de cabecera era `before update`,
--        y el ON DELETE CASCADE dispara el trigger de la partida cuando la cabecera YA no existe
--        → `select congelada_en ...` da NULL → dejaba pasar. El candado de la partida se evadía
--        borrando el padre.
--
-- La regla completa, ahora sí: una oferta congelada NO se edita, NO se agranda, NO se borra.
-- Se anula por estado o se versiona con `nueva_version_de_presupuesto`. Ésas son las únicas vías.

create or replace function public.cotizacion_partida_no_nace_en_congelada()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.cotizaciones c
     where c.id = new.cotizacion_id and c.congelada_en is not null
  ) then
    raise exception
      'la cotización está congelada: no se le agregan partidas — se crea una versión nueva';
  end if;
  return new;
end $$;

drop trigger if exists cotizacion_partida_no_nace_en_congelada_t on public.cotizacion_partida;
create trigger cotizacion_partida_no_nace_en_congelada_t
  before insert on public.cotizacion_partida
  for each row execute function public.cotizacion_partida_no_nace_en_congelada();

create or replace function public.cotizacion_congelada_no_se_borra()
returns trigger language plpgsql as $$
begin
  if old.congelada_en is not null then
    raise exception
      'una oferta congelada no se borra: se anula (estado) o se versiona — el snapshot es el contrato';
  end if;
  return old;
end $$;

drop trigger if exists cotizacion_congelada_no_se_borra_t on public.cotizaciones;
create trigger cotizacion_congelada_no_se_borra_t
  before delete on public.cotizaciones
  for each row execute function public.cotizacion_congelada_no_se_borra();

-- A4 · la partida congelada tampoco CAMBIA DE PADRE: re-parentarla a otra cotización la saca de la
-- oferta emitida (o mete una ajena adentro, evadiendo el trigger de INSERT — que sólo ve inserts).
create or replace function public.cotizacion_partida_no_cambia_de_padre()
returns trigger language plpgsql as $$
begin
  if new.cotizacion_id is distinct from old.cotizacion_id and exists (
    select 1 from public.cotizaciones c
     where c.id in (old.cotizacion_id, new.cotizacion_id) and c.congelada_en is not null
  ) then
    raise exception
      'la partida no se muda: su cotización de origen o destino está congelada — se versiona';
  end if;
  return new;
end $$;

drop trigger if exists cotizacion_partida_no_cambia_de_padre_t on public.cotizacion_partida;
create trigger cotizacion_partida_no_cambia_de_padre_t
  before update of cotizacion_id on public.cotizacion_partida
  for each row execute function public.cotizacion_partida_no_cambia_de_padre();

-- A5 · y el congelado NO SE DESACTIVA: poner `congelada_en = null` a mano reabría todo el resto.
-- La única transición legítima es null → fecha (la que hace `congelar_presupuesto`).
create or replace function public.cotizacion_congelada_no_se_desactiva()
returns trigger language plpgsql as $$
begin
  if old.congelada_en is not null and new.congelada_en is distinct from old.congelada_en then
    raise exception
      'el congelado no se desactiva ni se re-fecha: para cambiar la oferta se crea una versión nueva';
  end if;
  return new;
end $$;

drop trigger if exists cotizacion_congelada_no_se_desactiva_t on public.cotizaciones;
create trigger cotizacion_congelada_no_se_desactiva_t
  before update of congelada_en on public.cotizaciones
  for each row execute function public.cotizacion_congelada_no_se_desactiva();
