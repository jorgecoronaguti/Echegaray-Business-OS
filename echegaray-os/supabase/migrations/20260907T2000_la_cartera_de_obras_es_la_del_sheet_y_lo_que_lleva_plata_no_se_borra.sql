-- LA CARTERA DE OBRAS VUELVE A SER LA DEL SHEET — Y LO QUE LLEVA PLATA NO SE BORRA (07/09/2026)
--
-- EL PEDIDO, TEXTUAL DEL DUEÑO: *"Obras en app.ecsas.com.ar - solo quiero q queden las q aparecen
-- en pestaña obras del sheet flujo de fondos con fecha de inicio y fin nada mas, lo demas vacialo
-- para volver a empezar"*.
--
-- LA LISTA NO SE TIPEA ACÁ: son las diez de `orquestador/lib/obras-datos.mjs#OBRAS_FUTURAS`, que es
-- la transcripción de la pestaña OBRAS del Flujo de Caja. El bloque de VALUES de abajo se generó de
-- ese módulo, no a mano, y el test `obras-cartera-canonica.test.mjs` falla si vuelven a separarse.
--
-- ═══ POR QUÉ ESTO NO ES UN `DELETE FROM obra_canonica` (medido el 07/09) ═══
--
-- «Vaciar» la tabla habría arrastrado, por FK o por cascada declarada:
--   · 25 cobranzas   (arcor 15 · messina 10)  — plata COBRADA
--   · 1.414 filas de `obra_partida_costo_real` (la-estrella 606 · san-francisco 514 · arcor 240 ·
--     messina 54) — costo real importado de Compras
--   · 244 partes de `obra_ejecucion` en obras que no están en la lista — hechos fechados
--   · 90 `documento_cliente` y 72 `esquema_pago` — lo que el portal del cliente publica
-- Ninguna de esas filas es la cartera; son la HISTORIA ECONÓMICA colgada de ella. Borrarlas para
-- limpiar una pantalla es exactamente el error que la regla de oro 7 nombra. Así que:
--
--   · las diez del Sheet   → quedan `activa`, con nombre, cliente, inicio y fin, y NADA más;
--   · las que no están     → `estado = 'cerrada'`. Salen de la cartera por la puerta que la página
--                            ya tiene («N obras archivadas fuera de esta lista»), sin perder un peso;
--   · `prueba-e2e`         → ésa SÍ se borra: es basura de una corrida de E2E que quedó en
--                            producción, no tiene plata ni documentos, y su cascada está declarada.
--
-- ═══ QUÉ SE VACÍA DE VERDAD ═══
--
-- El PLAN y el AVANCE de las diez: actividades, partes, restricciones, dependencias, partidas de
-- plan, observaciones y asignaciones. Eso es lo que el dueño quiere volver a empezar, y no es plata.
-- NO se vacían: `obra_partida_costo_real` (costo real importado de Compras), `registros_hh` (horas
-- imputadas), `obra_documento`/`documento_cliente` (papeles reales), `obra_alias` (cómo el texto de
-- Cobranzas y Compras encuentra la obra) ni `cotizaciones`/`presupuestos`.
--
-- ═══ `obra_egreso_proyectado` NO SE TOCA, Y ADEMÁS SE REPARA ═══
--
-- Es la fuente del Cash Flow: 24 filas por $145.855.278, verificado antes y después. Esta migración
-- no cambia ni un monto. Lo que sí hace es LLENAR los `obra_canonica_id` que estaban en NULL porque
-- la obra canónica no existía todavía: `sf-mamposteria` y `messina-playon-azufre` y `messina-bsa`
-- quedaban colgadas de su `obra_clave` sin fila del otro lado. Al crearlas, el vínculo se puede
-- cerrar — 11 filas vinculadas pasan a 21. Las 3 que siguen sin vínculo son las que no tienen obra
-- canónica declarada en ese ledger, y se dejan como están: inventarlo sería fabricar el mapeo.
--
-- ═══ TODO ES REVERSIBLE: EL RESPALDO SE TOMA ANTES ═══
--
-- Un `UPDATE` que pone NULL no se deshace mirando el diff. El esquema `respaldo_obras_20260907`
-- guarda las 18 filas de `obra_canonica` tal como estaban y las filas de plan que se borran. No está
-- expuesto a PostgREST y no tiene policies: sólo lo lee quien administra la base.
--
-- SIN `begin`/`commit` PROPIOS: `aplicar-migracion.mjs` envuelve el archivo, y un commit adentro
-- cierra la transacción de afuera y deja aplicado lo que el ensayo dijo que había revertido.

-- ── 1 · RESPALDO ────────────────────────────────────────────────────────────────────────────────
create schema if not exists respaldo_obras_20260907;
revoke all on schema respaldo_obras_20260907 from public, anon, authenticated;

create table if not exists respaldo_obras_20260907.obra_canonica as select * from public.obra_canonica;
create table if not exists respaldo_obras_20260907.obra_actividad as select * from public.obra_actividad;
create table if not exists respaldo_obras_20260907.obra_actividad_insumo_plan as select * from public.obra_actividad_insumo_plan;
create table if not exists respaldo_obras_20260907.obra_actividad_paso as select * from public.obra_actividad_paso;
create table if not exists respaldo_obras_20260907.obra_ejecucion as select * from public.obra_ejecucion;
create table if not exists respaldo_obras_20260907.obra_restriccion as select * from public.obra_restriccion;
create table if not exists respaldo_obras_20260907.obra_dependencia as select * from public.obra_dependencia;
create table if not exists respaldo_obras_20260907.obra_partida_plan as select * from public.obra_partida_plan;
create table if not exists respaldo_obras_20260907.obra_origen_cotizacion as select * from public.obra_origen_cotizacion;
create table if not exists respaldo_obras_20260907.obra_plan_real_observacion as select * from public.obra_plan_real_observacion;
create table if not exists respaldo_obras_20260907.obra_asignacion as select * from public.obra_asignacion;

-- RLS en toda tabla nueva, aunque el esquema no esté expuesto: la regla no admite «además».
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'respaldo_obras_20260907'
  loop
    execute format('alter table respaldo_obras_20260907.%I enable row level security', t);
    execute format('revoke all on respaldo_obras_20260907.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ── 2 · LAS DIEZ DEL SHEET ──────────────────────────────────────────────────────────────────────
-- `id_canonico` reutiliza la fila que YA existe cuando el vínculo está declarado en
-- `obra_egreso_proyectado`; si no, la clave del Sheet ES el id. Cambiarle el id a una obra que el
-- ledger del Cash Flow ya apunta habría roto esas 11 filas por $87M.
create temporary table _cartera (
  id_canonico text primary key, obra_clave text not null, nombre text not null,
  cliente_texto text not null, cliente_slug text not null,
  inicio date not null, fin date not null
) on commit drop;

insert into _cartera values
  ('pisos-industriales', 'sf-pisos-industriales', 'PISOS INDUSTRIALES', 'San Francisco', 'san-francisco', '2026-08-05'::date, '2026-09-30'::date),
  ('instalacion-electrica', 'sf-instalacion-electrica', 'INSTALACIÓN ELÉCTRICA', 'San Francisco', 'san-francisco', '2026-08-10'::date, '2026-10-16'::date),
  ('entrepiso-y-escalera', 'sf-entrepiso-escalera', 'ENTREPISO Y ESCALERA', 'San Francisco', 'san-francisco', '2026-08-10'::date, '2026-08-21'::date),
  ('sf-mamposteria', 'sf-mamposteria', 'MAMPOSTERÍA', 'San Francisco', 'san-francisco', '2026-08-07'::date, '2026-08-19'::date),
  ('messina-playon-azufre', 'messina-playon-azufre', 'PLAYÓN DE AZUFRE', 'MESSINA', 'messina', '2026-09-07'::date, '2026-10-09'::date),
  ('messina-bsa', 'messina-bsa', 'BSA', 'MESSINA', 'messina', '2026-07-29'::date, '2026-08-21'::date),
  ('quattropani', 'quattropani-salon-comercial', 'SALÓN COMERCIAL', 'Quattropani - Melisa García SAS', 'quattropani', '2026-08-18'::date, '2026-12-30'::date),
  ('messina-playon-dilucion-acido', 'messina-playon-dilucion-acido', 'PLAYÓN DILUCIÓN DE ÁCIDO', 'MESSINA', 'messina', '2026-09-03'::date, '2026-12-31'::date),
  ('messina-adicional-tercer-muro', 'messina-adicional-tercer-muro', 'ADICIONAL TERCER MURO', 'MESSINA', 'messina', '2026-09-02'::date, '2026-12-31'::date),
  ('messina-pisos-120-rampa', 'messina-pisos-120-rampa', 'PISOS 120 M² Y RAMPA', 'MESSINA', 'messina', '2026-07-20'::date, '2026-12-31'::date);

-- El cliente sale de `clientes.slug`, no de un UUID pegado: si el slug no existe, la migración
-- muere acá en vez de dejar diez obras sin dueño.
insert into public.obra_canonica (id, nombre, estado, tipo, cliente_texto, cliente_id, fecha_inicio_plan, fecha_fin_plan, orden)
select c.id_canonico, c.nombre, 'activa', 'obra', c.cliente_texto,
       (select cl.id from public.clientes cl where cl.slug = c.cliente_slug),
       c.inicio, c.fin, 100
from _cartera c
on conflict (id) do update set
  nombre            = excluded.nombre,
  estado            = 'activa',
  tipo              = 'obra',
  cliente_texto     = excluded.cliente_texto,
  cliente_id        = excluded.cliente_id,
  fecha_inicio_plan = excluded.fecha_inicio_plan,
  fecha_fin_plan    = excluded.fecha_fin_plan;

-- «NADA MÁS QUE INICIO Y FIN»: todo lo que es JUICIO, ESTADO o MONTO de la obra se vacía.
--
-- TRES EXCEPCIONES, Y NINGUNA ES UN OLVIDO:
--   · `drive_carpeta_id` y `cliente_id` son PUNTEROS a algo real que existe afuera. Borrarlos no
--     vacía una obra: deja huérfanos los papeles y las cobranzas que la nombran.
--   · `jornada_horas`, `dias_habiles`, `radio_obra_metros` y `contrato_moneda` son NOT NULL con
--     default — la base ya decidió que no pueden estar vacíos. Vuelven al DEFAULT, que es el estado
--     «sin configurar» que el dueño está pidiendo. El primer intento los puso en NULL y la base lo
--     rechazó: «null value in column "jornada_horas" violates not-null constraint».
update public.obra_canonica set
  etapa = null, monto_contratado = null, contrato_monto = null,
  fecha_inicio_real = null, fecha_fin_real = null, jefe_obra = null, ubicacion = null,
  contrato_moneda = default, jornada_horas = default, dias_habiles = default,
  radio_obra_metros = default, orden = default
where id in (select id_canonico from _cartera);

-- ── 3 · VOLVER A EMPEZAR: SE VACÍA EL PLAN, NO LA PLATA ─────────────────────────────────────────
-- El plan y el avance de las diez se van. `obra_actividad` arrastra por cascada declarada sus pasos,
-- insumos, notas y dependencias; lo que no cuelga de ella se borra explícito para que el efecto se
-- lea en este archivo y no haya que ir a buscar la cascada a otra migración.
delete from public.obra_plan_real_observacion where obra_id in (select id_canonico from _cartera);
delete from public.obra_partida_plan           where obra_id in (select id_canonico from _cartera);
delete from public.obra_origen_cotizacion      where obra_id in (select id_canonico from _cartera);
delete from public.obra_ejecucion              where obra_id in (select id_canonico from _cartera);
delete from public.obra_restriccion            where obra_id in (select id_canonico from _cartera);
delete from public.obra_dependencia            where obra_id in (select id_canonico from _cartera);
delete from public.obra_asignacion             where obra_id in (select id_canonico from _cartera);

-- ═══ UNA ACTIVIDAD CON HORAS IMPUTADAS NO SE BORRA (lo dijo la base, no yo) ═══
--
-- `registros_hh.actividad_id` es `ON DELETE SET NULL`, así que borrar la actividad no borra la hora:
-- la deja colgando sin a qué. Y el índice único de `registros_hh` incluye
-- `coalesce(actividad_id, '000…')`, con lo cual dos imputaciones de la MISMA persona el MISMO día a
-- DOS actividades distintas colapsan en la misma clave. El ensayo de esta migración murió ahí:
-- «duplicate key value violates unique constraint "registros_hh_persona_unico"» — persona
-- 17fdcfb1 el 20/08/2026 en Salón Comercial, 1 h en una actividad y 15 h en otra.
--
-- Sumarlas sería inventar una jornada de 16 h; borrarlas sería borrar mano de obra ya imputada. Las
-- dos son decisiones de costo laboral y no las toma una migración de limpieza. Así que las cuatro
-- actividades con horas —y sus antecesoras, porque `actividad_padre_id` es RESTRICT— SOBREVIVEN al
-- reset y quedan declaradas abajo. Son 4 de 138: el plan igual vuelve a empezar.
create temporary table _actividad_protegida on commit drop as
with recursive con_horas as (
  select distinct a.id, a.actividad_padre_id
  from public.obra_actividad a
  where a.obra_id in (select id_canonico from _cartera)
    and (exists (select 1 from public.registros_hh h where h.actividad_id = a.id)
      or exists (select 1 from public.obra_partida_costo_real k where k.actividad_id = a.id))
), arbol as (
  select id, actividad_padre_id from con_horas
  union
  select p.id, p.actividad_padre_id
  from public.obra_actividad p join arbol h on h.actividad_padre_id = p.id
)
select id from arbol;

-- HOJAS PRIMERO. `obra_actividad(actividad_padre_id)` es RESTRICT: un solo `delete` del conjunto
-- entero puede tropezar con su propio orden de filas. El bucle borra las que ya no tienen hijas y
-- repite; sin hijas que borrar, corta. El tope de 50 vueltas es contra un ciclo imposible en el
-- árbol, no contra la profundidad real (que hoy es 3).
do $$
declare borradas int; vueltas int := 0;
begin
  loop
    delete from public.obra_actividad a
    where a.obra_id in (select id_canonico from _cartera)
      and a.id not in (select id from _actividad_protegida)
      and not exists (select 1 from public.obra_actividad h where h.actividad_padre_id = a.id);
    get diagnostics borradas = row_count;
    vueltas := vueltas + 1;
    exit when borradas = 0 or vueltas > 50;
  end loop;
  if exists (select 1 from public.obra_actividad a
             where a.obra_id in (select id_canonico from _cartera)
               and a.id not in (select id from _actividad_protegida)) then
    raise exception 'quedaron actividades sin borrar que no estaban protegidas';
  end if;
end $$;

-- ── 4 · LO QUE NO ESTÁ EN EL SHEET SALE DE LA CARTERA ───────────────────────────────────────────
-- NINGUNA FILA DE `obra_canonica` SE BORRA. Se archivan, que es como esta pantalla ya saca una obra
-- de la lista sin esconder que existe («N obras archivadas fuera de esta lista · Verlas»).
--
-- `prueba-e2e` iba a ser la excepción —es basura de una corrida de E2E que quedó en producción— y
-- tampoco se borra: tiene 2 fichadas en `asistencia_marca` con FK NO ACTION, y el ensayo lo dijo
-- («violates foreign key constraint "asistencia_marca_obra_id_fkey"»). Borrar una fichada para
-- limpiar una pantalla es tocar registro de asistencia, que no es de esta migración. Archivada sale
-- igual de la cartera, y la limpieza de la basura de E2E queda como trabajo propio.
update public.obra_canonica set estado = 'cerrada'
where id not in (select id_canonico from _cartera) and estado <> 'cerrada';

-- ── 5 · EL CASH FLOW: NI UN MONTO CAMBIA, PERO EL VÍNCULO SE CIERRA ─────────────────────────────
update public.obra_egreso_proyectado e set obra_canonica_id = c.id_canonico
from _cartera c
where e.obra_clave = c.obra_clave and e.obra_canonica_id is null;

-- ── 6 · GUARDAS: SI ALGO DE ESTO NO ES CIERTO, LA MIGRACIÓN NO SE APLICA ────────────────────────
-- Un `delete` que no falló no prueba nada. Éstas son las tres afirmaciones que el trabajo hace.
do $$
declare n_activas int; n_egresos int; total_egresos numeric;
begin
  select count(*) into n_activas from public.obra_canonica where estado = 'activa';
  if n_activas <> 10 then
    raise exception 'la cartera debía quedar en 10 obras activas y quedó en %', n_activas;
  end if;

  select count(*), coalesce(sum(monto), 0) into n_egresos, total_egresos from public.obra_egreso_proyectado;
  if n_egresos <> 24 or total_egresos <> 145855278 then
    raise exception 'obra_egreso_proyectado cambió: % filas por $% (esperado 24 por $145.855.278)', n_egresos, total_egresos;
  end if;

  if exists (select 1 from public.cobranza where obra_id is not null
             and obra_id not in (select id from public.obra_canonica)) then
    raise exception 'quedó una cobranza apuntando a una obra que ya no existe';
  end if;
end $$;

