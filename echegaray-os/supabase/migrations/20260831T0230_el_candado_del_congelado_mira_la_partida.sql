-- EL CANDADO DEL CONGELADO MIRA LA PARTIDA, QUE ES DONDE ESTÁ LA COTIZACIÓN.
--
-- ═══ POR QUÉ HAY UNA SEGUNDA MIGRACIÓN Y NO UNA CORRECCIÓN DE LA PRIMERA ═══
--
-- `20260831T0200` creó el trigger leyendo `old.cotizacion_id`, y **`cotizacion_partida_composicion`
-- no tiene esa columna**: la cotización cuelga de `partida_id → cotizacion_partida.cotizacion_id`.
--
-- Lo que hace a este error digno de quedar escrito es que **el ensayo lo dejó pasar**. El script de
-- migraciones corre el SQL entero dentro de una transacción y lo deshace, y eso atrapa sintaxis,
-- claves foráneas y CHECK violados. Pero `plpgsql` **no resuelve los identificadores del cuerpo de
-- una función hasta que la función se EJECUTA**: `create function` con una columna inexistente es
-- SQL perfectamente válido. El ensayo dijo que sí, la migración se aplicó y se registró, y el
-- defecto habría aparecido recién en el primer UPDATE real — bloqueando TODO, porque un trigger que
-- explota falla cerrado.
--
-- La lección, para el próximo trigger: **un ensayo de migración no prueba el cuerpo de una función.
-- Lo prueba una ejecución.** Por eso este candado se verifica corriendo un UPDATE contra la base
-- viva dentro de una transacción que después se deshace, en las dos direcciones: que rechace lo
-- congelado y que DEJE PASAR lo que está en borrador. Un candado que bloquea todo no es un candado:
-- es una puerta tapiada, y se ve igual de verde desde afuera.
--
-- El archivo anterior no se toca: editarlo después de aplicado rompe el hash del ledger, y ese hash
-- es justamente lo que permite darse cuenta de que alguien editó una migración ya corrida.

create or replace function public.una_composicion_congelada_no_se_reescribe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_congelada timestamptz;
  v_numero    text;
begin
  select c.congelada_en, c.numero
    into v_congelada, v_numero
    from public.cotizacion_partida cp
    join public.cotizaciones c on c.id = cp.cotizacion_id
   where cp.id = coalesce(old.partida_id, new.partida_id);

  if v_congelada is not null then
    raise exception
      'la cotizacion % esta congelada desde el % y su composicion no se reescribe: para cambiarla se crea una revision nueva',
      coalesce(v_numero, '?'), v_congelada
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.una_composicion_congelada_no_se_reescribe is
  'FROZEN != MUTABLE, verificado por ejecucion y no por ensayo. La cotizacion cuelga de partida_id, '
  'no de una columna propia: la primera version del trigger leia old.cotizacion_id, que no existe, '
  'y el ensayo no lo vio porque plpgsql no resuelve identificadores hasta ejecutar.';
