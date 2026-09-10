-- LA POLICY DE `drive_index` COBRABA UNA RAMA QUE DIRECCIÓN NO NECESITA
--
-- ═══ LO MEDIDO (10/09/2026, `explain analyze` como `authenticated` con los claims de Dirección) ═══
--
-- La MISMA consulta —`path like 'PRESUPUESTOS - CLIENTES/%'`, 4.334 filas recorridas, 0 devueltas—:
--
--   sin RLS (dueño de la base) ........   1,9 ms
--   como `authenticated`/direccion ....  464 ms      ← 244 veces más
--
-- La diferencia entera es la segunda rama del `USING`:
--
--   (select ve_economia()) or drive_file_id in (select drive_file_ids_vinculados())
--
-- `drive_file_ids_vinculados()` sola cuesta 164 ms y devuelve 530 filas (medido). El planificador la
-- resuelve como `hashed SubPlan`, así que NO se evalúa por fila —ése no es el defecto—: el defecto
-- es que se materializa IGUAL aunque `ve_economia()` ya haya devuelto `true`. `OR` en SQL no
-- garantiza evaluación perezosa; Postgres es libre de evaluar los dos lados y acá los evalúa.
--
-- ═══ EL ARREGLO: `CASE`, QUE SÍ ES PEREZOSO ═══
--
-- `CASE` tiene evaluación condicional garantizada por el estándar: la rama `ELSE` no se evalúa si el
-- `WHEN` acertó. Quien ve economía sale por el `true` sin tocar la función; quien no —el cliente del
-- portal, el jefe de obra— paga exactamente lo mismo que antes. El PREDICADO NO CAMBIA: las mismas
-- filas para los mismos roles, sólo que sin comprar lo que no se usa.
--
-- `ve_economia()` sigue envuelto en `(select ...)` para que sea initplan y no una llamada por fila
-- (la trampa ya pagada: «RLS: porteros en (select …)»).
--
-- SIN EFECTO SOBRE LOS DATOS: no toca filas, sólo el plan con que se leen.

drop policy if exists drive_index_read on public.drive_index;

create policy drive_index_read on public.drive_index
  for select
  using (
    case
      when (select public.ve_economia()) then true
      else drive_file_id in (select public.drive_file_ids_vinculados())
    end
  );
