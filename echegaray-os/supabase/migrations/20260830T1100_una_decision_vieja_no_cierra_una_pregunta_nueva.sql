-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA DECISIÓN VIEJA NO CIERRA UNA PREGUNTA NUEVA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ── EL AGUJERO DE LA MIGRACIÓN ANTERIOR ───────────────────────────────────────────────────────
--
-- `base_maestra_decision` se indexó por (elemento, unidad, decidido_en desc). Con esa clave, una
-- respuesta guardada contra «mampostería ladrillón cerámico» cierra ese elemento PARA SIEMPRE, sin
-- importar qué se le haya preguntado a la persona.
--
-- Lo que esa persona contestó no fue «esta tarea es T1018». Fue una pregunta concreta: «el único
-- espesor analizado en la Base Maestra es 0,20 — ¿es ése?». El día que entre una mampostería de
-- ladrillón a 0,15, la pregunta pasa a ser OTRA —ahora hay dos espesores y hay que elegir— y la
-- respuesta vieja no la contesta: fue dada cuando no había alternativa. Cerrar el hueco nuevo con
-- ella es poner en boca de alguien una decisión que no tomó, y firmada con su uuid.
--
-- ── LA HUELLA, Y QUÉ GARANTIZA CADA COSA ──────────────────────────────────────────────────────
--
-- `huella` = tipo de pregunta | atributo que faltaba | conjunto ordenado de códigos ofrecidos.
-- La produce `huellaDePregunta()` y es determinística. Cualquiera de las tres cosas que cambie da
-- otra huella, y otra huella es una pregunta que hay que volver a hacer.
--
-- Hay que ser preciso sobre qué garantiza el motor de base de datos y qué no:
--
--   · `base_maestra_decision_huella_presente` (CHECK) garantiza que NINGUNA fila se guarde sin
--     huella. Eso sí lo impone Postgres: una decisión sin huella no entra.
--   · `base_maestra_decision_reuso` (índice) es por dónde entra la búsqueda de reúso.
--
-- Lo que Postgres NO puede imponer es que el código BUSQUE por huella en vez de por elemento: un
-- índice no obliga a nadie a usarlo. Esa garantía es del test —`base-maestra-decision.pg.test.mjs`,
-- «una decisión vieja NO cierra una pregunta nueva»— y de la mutación que lo prueba. Decirlo así es
-- más honesto que decir que «la restricción lo cubre», porque no lo cubre sola.
--
-- ADITIVA: agrega una columna con default sobre una tabla que hoy tiene 0 filas, un CHECK y un
-- índice. No toca ni borra nada.

alter table public.base_maestra_decision
  add column if not exists huella text not null default '';

-- El default '' existe sólo para que el ALTER pase sobre filas preexistentes; a partir de acá el
-- CHECK lo prohíbe. Se saca el default para que una inserción que se olvide de la huella FALLE en
-- vez de guardar una fila vacía que después nadie va a poder reusar ni auditar.
alter table public.base_maestra_decision
  alter column huella drop default;

alter table public.base_maestra_decision
  drop constraint if exists base_maestra_decision_huella_presente;

alter table public.base_maestra_decision
  add constraint base_maestra_decision_huella_presente
  check (huella <> '' and huella like '%|%|%');

-- Por acá entra la búsqueda de reúso: mismo elemento, misma unidad, MISMA pregunta, la más reciente
-- primero. El índice viejo por (elemento, unidad) se deja: sirve para mostrarle a una persona todo
-- lo que se decidió alguna vez sobre un elemento, que es otra consulta y también hace falta.
create index if not exists base_maestra_decision_reuso
  on public.base_maestra_decision (elemento, unidad, huella, decidido_en desc);

comment on column public.base_maestra_decision.huella is
  'tipo|atributo|codigos-ofrecidos-ordenados. La produce huellaDePregunta() en '
  'orquestador/lib/base-maestra-pregunta.mjs y es deterministica. Es la clave del reuso: una '
  'decision solo cierra la MISMA pregunta que se contesto. Si entra una partida nueva al catalogo, '
  'cambian los codigos ofrecidos, cambia la huella y se vuelve a preguntar. Preguntar de mas cuesta '
  'una conversacion; cerrar de mas cuesta plata. NO incluye precios: que el hormigon haya aumentado '
  'no cambia que elemento es.';
