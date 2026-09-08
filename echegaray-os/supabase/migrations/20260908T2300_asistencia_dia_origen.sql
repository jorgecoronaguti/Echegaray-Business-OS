-- DE DÓNDE SALIÓ LA PRESENCIA: ALGUIEN LA ELIGIÓ, O LA DEDUJO UNA CARGA DE HORAS.
--
-- El dueño, 08/09/2026 18:15, con el Plantel abierto: *«no hay forma de cargar que la persona está
-- presente desde ninguna pantalla, incluso si le cargo las hs de ese día de manera manual en
-- planilla Asistencia»*. Nievas, Ochoa y Pastrán tenían 9 hs cargadas y HOY decía «sin marcar»,
-- porque `asistencia_dia` sólo la escribía la pantalla móvil de presencia.
--
-- La regla nueva: **cargar las horas de alguien desde la app ES declarar que estuvo** — lo afirma
-- la persona que escribe, no el sistema leyendo un número. Eso NO deroga «la presencia nunca se
-- deduce de las horas» (regla E del 08/09): sigue prohibido mirar `registros_hh` para responder si
-- alguien vino, y por eso lo importado de JORNALES (`fuente_legacy='sheet:jornales'`) no declara
-- nada: ahí nadie afirmó, se copió una planilla.
--
-- ═══ POR QUÉ HACE FALTA LA COLUMNA ═══
--
-- Sin `origen`, las dos declaraciones son indistinguibles y se pierden las dos reglas que las
-- separan:
--
--   1 · UNA PRESENCIA DEDUCIDA NO PISA UNA DECLARADA. El jefe marcó «no vino» a la mañana; a la
--       tarde Administración carga las horas de la cuadrilla entera y ese día pasaría a «presente»
--       sin que nadie lo haya afirmado — con la firma de quien sólo estaba cargando números.
--   2 · SÓLO SE RETIRA LO DEDUCIDO. Si se sacan las horas y el día queda vacío, la presencia que
--       existía por esas horas ya no tiene premisa. Una declaración explícita, en cambio,
--       sobrevive: sacar lo cargado no es decir que la persona no estuvo.
--
-- ADITIVA. `default 'declarada'` es el valor correcto para todo lo que ya está escrito: hasta hoy
-- la única puerta de esta tabla era la pantalla móvil, donde alguien elige el estado. Para revertir:
--   drop policy asistencia_dia_delete on public.asistencia_dia;
--   revoke delete on public.asistencia_dia from authenticated;
--   alter table public.asistencia_dia drop column origen;

alter table public.asistencia_dia
  add column if not exists origen text not null default 'declarada';

do $$
begin
  alter table public.asistencia_dia
    add constraint asistencia_dia_origen_valido check (origen in ('declarada', 'horas'));
exception when duplicate_object then null;
end $$;

comment on column public.asistencia_dia.origen is
  'declarada = alguien eligió el estado (pantalla de presencia, «Qué pasó ese día», la «A» de la '
  'grilla). horas = la presencia salió de escribir horas en la app. Una `horas` nunca pisa una '
  '`declarada`, y sólo una `horas` se retira cuando se borran las horas que la produjeron.';

-- ── EL GRANT DE LA COLUMNA NUEVA ────────────────────────────────────────────────────────────────
--
-- Una columna nueva NACE SIN PERMISO cuando el grant original se escribió por columna: el `grant
-- insert (persona_id, fecha, …)` del 20260908T1900 no la incluye, y sin esto todo insert que la
-- mande respondería «permission denied for column origen» — la misma trampa de 20260907T1900 y
-- 20260908T1530. El `select` de la tabla es completo y ya la cubre; se repite igual porque es
-- barato y porque el día que ese grant pase a ser por columna, éste sigue siendo correcto.
grant select (origen) on public.asistencia_dia to authenticated;
grant insert (origen) on public.asistencia_dia to authenticated;
grant update (origen) on public.asistencia_dia to authenticated;

-- ── BORRAR: SÓLO LO DEDUCIDO, Y SÓLO QUIEN ADMINISTRA ───────────────────────────────────────────
--
-- La tabla nació SIN delete a propósito («un error se corrige cambiando el estado, no borrando el
-- día»), y eso sigue valiendo para una declaración: borrarla deja «no se sabe» donde alguien había
-- dicho algo. Una fila `origen='horas'` es distinta: su única razón de existir eran unas horas que
-- ya no están. Dejarla sería afirmar una presencia cuya prueba se borró.
--
-- El filtro va en el `using`, que Postgres evalúa sobre la FILA EXISTENTE: una `declarada` no se
-- puede borrar ni llamando a PostgREST a mano.
drop policy if exists asistencia_dia_delete on public.asistencia_dia;
create policy asistencia_dia_delete on public.asistencia_dia for delete to authenticated
  using (public.es_administracion() and origen = 'horas');

-- POLICY SIN GRANT = «permission denied». Son dos permisos distintos (memoria: rls-no-es-grant).
grant delete on public.asistencia_dia to authenticated;
