-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ESTADO DE LA BASE MAESTRA, Y LA RESPUESTA QUE CIERRA UN MAPEO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ── 1 · POR QUÉ EL DEFAULT ES 'HISTORICO' Y NO 'VALIDADO' ─────────────────────────────────────
--
-- Las 205 composiciones vigentes entraron de una sola fuente: la ingesta de «Planilla para Cotizar
-- (2).xlsm» del 2026-08-21. Nadie las contrastó contra nada después de eso. Marcarlas VALIDADO
-- sería afirmar una revisión que no ocurrió, y VALIDADO tiene una consecuencia que HISTORICO no
-- tiene: es norma, o sea que puede declarar que otro dato está mal. Si un histórico sin revisar
-- pudiera actuar de norma, el primer error de carga de la planilla quedaría consagrado y corrigiendo
-- a las mediciones reales de obra.
--
-- HISTORICO dice exactamente lo que pasó: la empresa cotizó así. Sirve para cotizar y no corrige a
-- nadie. Subir una a VALIDADO es una decisión con nombre y fecha — por eso el ascenso NO tiene
-- ninguna regla automática en el código: no existe `ascender()`.
--
-- ── 2 · INCOMPLETO NO SE GUARDA ACÁ ───────────────────────────────────────────────────────────
--
-- El CHECK admite los cuatro valores, pero INCOMPLETO se DERIVA y no se carga: sale de mirar los
-- cajones de la composición (`base-maestra-completitud.mjs`) y cambia solo cuando cambian las
-- líneas. Guardarlo como columna crearía una segunda verdad sobre el mismo hecho —§realidad única—
-- y el día que alguien agregue la línea de carga social que faltaba, la columna seguiría diciendo
-- INCOMPLETO hasta que alguien se acordara de tocarla. Está en el CHECK porque una migración futura
-- podría querer congelar el diagnóstico de una versión cerrada; hoy nadie lo escribe.
--
-- ── 3 · LA DECISIÓN DE MAPEO SE GUARDA O NO SIRVIÓ DE NADA ────────────────────────────────────
--
-- Medido sobre el dictado sin planos: «MAMPOSTERÍA LADRILLON CERÁMICO» no mapea porque T1018 exige
-- e = 0,20 m y el dictado no lo dice. El motor pregunta, alguien contesta, y sin esta tabla la
-- corrida siguiente vuelve a preguntar lo mismo. Una respuesta que se pierde es una respuesta que
-- no se dio: la persona aprende que contestar no sirve y deja de contestar.
--
-- INMUTABLE, con la misma regla que `cotizacion_override_precio`: sin GRANT ni policy de UPDATE.
-- Una decisión es un hecho fechado (§21, la historia no se borra). Si mañana se decide distinto,
-- eso es OTRA decisión sobre el mismo elemento y la última gana por `decidido_en`, no porque haya
-- pisado a la anterior — y así queda registrado que alguien cambió de opinión, que es información.
--
-- ADITIVA: una columna con default y una tabla nueva. No toca ni borra ningún dato existente.

-- ── 1 · el estado de cada análisis de la Base Maestra ─────────────────────────────────────────

alter table public.analisis
  add column if not exists estado text not null default 'HISTORICO';

alter table public.analisis
  drop constraint if exists analisis_estado_valido;

alter table public.analisis
  add constraint analisis_estado_valido
  check (estado in ('VALIDADO', 'HISTORICO', 'CANDIDATO', 'INCOMPLETO'));

comment on column public.analisis.estado is
  'VALIDADO cierra precio y ES norma. HISTORICO cierra precio y NO es norma (lo usamos antes no es '
  'asi se hace). CANDIDATO no cierra precio: lo aprendio el sistema y no lo aprobo nadie. '
  'INCOMPLETO se DERIVA de los cajones de la composicion (base-maestra-completitud.mjs) y no se '
  'carga acá. El default es HISTORICO porque las 205 vigentes vienen de la ingesta del xlsm y nadie '
  'las reviso: marcarlas VALIDADO seria afirmar una revision que no ocurrio. '
  'La consecuencia de cada valor vive en orquestador/lib/base-maestra-estado.mjs, no en esta tabla.';

-- ── 2 · la respuesta que cierra un mapeo ─────────────────────────────────────────────────────

create table if not exists public.base_maestra_decision (
  id uuid primary key default gen_random_uuid(),
  -- Qué elemento se estaba mapeando. Es texto y no una FK: la pregunta se hace sobre un dictado por
  -- teléfono tanto como sobre un cómputo de plano, y el primero no tiene fila en ninguna tabla.
  elemento text not null,
  unidad text,
  tipo_pregunta text not null check (tipo_pregunta in ('ATRIBUTO', 'CUAL_DE_ESTAS', 'VAN_JUNTAS')),
  -- La pregunta LITERAL que se hizo. Sin ella, dentro de seis meses la respuesta «T1018» no se
  -- puede interpretar: no se sabe qué se le preguntó a esa persona.
  pregunta text not null,
  respuesta text not null,
  -- Los códigos que la respuesta confirmó. Un array porque VAN_JUNTAS confirma DOS partidas — el
  -- caso T1107.1 + T1107.2, donde elegir una sola cotiza la mitad de la tarea.
  codigos text[] not null,
  atributo text,
  decidido_por uuid not null default auth.uid(),
  decidido_en timestamptz not null default now()
);

-- La consulta real es «¿ya contestaron esto para este elemento?»: elemento + unidad, la más
-- reciente primero.
create index if not exists base_maestra_decision_elemento
  on public.base_maestra_decision (elemento, unidad, decidido_en desc);

alter table public.base_maestra_decision enable row level security;

drop policy if exists base_maestra_decision_lectura on public.base_maestra_decision;
drop policy if exists base_maestra_decision_escritura on public.base_maestra_decision;

-- La lectura NO es económica: un jefe de obra tiene que poder ver por qué su tarea quedó mapeada a
-- la partida que quedó. Lo que la fila tiene de sensible son los códigos, no los precios — los
-- precios siguen detrás de ve_economia() donde ya estaban.
create policy base_maestra_decision_lectura on public.base_maestra_decision
  for select to authenticated
  using (true);

-- Nadie decide en nombre de otro. Es la misma regla que cotizacion_override_precio.autorizado_por.
create policy base_maestra_decision_escritura on public.base_maestra_decision
  for insert to authenticated
  with check (decidido_por = (select auth.uid()));

-- Sin update ni delete, y sin su GRANT: una policy sin grant es permission denied, y un grant sin
-- policy tampoco alcanza. Se omiten los dos a propósito (§21).
revoke update, delete on public.base_maestra_decision from authenticated;
grant select, insert on public.base_maestra_decision to authenticated;

comment on table public.base_maestra_decision is
  'La respuesta de una persona a una pregunta de mapeo que el codigo no pudo cerrar solo. Existe '
  'porque el motor declaraba el hueco y ahi terminaba: sobre el dictado sin planos mapeaba 0 de 2. '
  'INMUTABLE POR DISENO: no hay GRANT ni policy de UPDATE/DELETE. Decidir distinto manana es OTRA '
  'decision sobre el mismo elemento y gana por decidido_en — que alguien haya cambiado de opinion '
  'es informacion, no un error que corregir.';

comment on column public.base_maestra_decision.codigos is
  'Array porque VAN_JUNTAS confirma DOS partidas. Medido: PISO DE HORMIGON ALISADO MECANICO esta '
  'partido en T1107.1 (mano de obra, $17.550,90/m2) y T1107.2 (materiales, $28.939,50/m2). Elegir '
  'una sola cotiza el 38% o el 62% de la tarea, y el numero que publica no se delata solo.';
