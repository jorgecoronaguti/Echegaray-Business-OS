-- 20260908T2100 · EL CHECK VIEJO TODAVÍA EXIGÍA OBRA A LA AUSENCIA
--
-- `20260908T2000` permitió la ausencia/licencia sin obra (regla del dueño, 08/09/2026: «la ausencia es
-- de la persona, no de una obra») y agregó `registros_hh_sin_obra_solo_ausencia`. Pero `20260819T0100`
-- había dejado `registros_hh_tiene_obra` —`obra_id is not null or obra_canonica_id is not null`— y la
-- prueba de la migración corrió en un Postgres descartable que no lo tenía. Contra la base real la
-- primera ausencia sin obra rebotó: «violates check constraint "registros_hh_tiene_obra"».
--
-- Se reescribe con la misma excepción que el CHECK nuevo: toda fila de horas lleva obra, salvo una
-- ausencia o licencia. Las dos restricciones quedan coherentes entre sí.
alter table public.registros_hh drop constraint if exists registros_hh_tiene_obra;
alter table public.registros_hh add constraint registros_hh_tiene_obra
  check (obra_id is not null or obra_canonica_id is not null or tipo_hora in ('ausencia', 'licencia'));
