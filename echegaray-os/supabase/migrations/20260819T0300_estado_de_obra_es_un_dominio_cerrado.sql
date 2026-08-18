-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL DOMINIO DE `obra_canonica.estado` ESTABA EN UN COMENTARIO, NO EN LA BASE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ CÓMO APARECIÓ ═══
--
-- La migración fundacional declara, textual (20260718170000_obra_canonica.sql:13):
--
--     estado text not null default 'activa',  -- activa | cerrada | pausada
--
-- El comentario dice tres valores. La base acepta cualquier cadena. Medido contra producción el
-- 19/08/2026, `obra_canonica` tiene CHECK sobre `etapa` y NINGUNO sobre `estado`:
--
--     obra_canonica_etapa_chk | CHECK (etapa = ANY (ARRAY['previo','inicio','desarrollo',
--                                                          'terminacion','cierre']))
--
-- Es la misma familia que el índice único que vivía sobre 206 NULLs: una restricción que todo el
-- mundo cree vigente porque está escrita en algún lado, y que no restringe nada.
--
-- ═══ POR QUÉ IMPORTA AHORA ═══
--
-- Desde este commit, `estado = 'cerrada'` es lo que saca a una obra del portafolio y de la ficha de
-- su cliente. O sea: `estado` dejó de ser una etiqueta descriptiva y pasó a DECIDIR qué ve el dueño.
-- Un valor fuera del dominio —'Cerrada' con mayúscula, 'finalizada', un espacio de más— produce una
-- obra que no está ni en la lista de activas ni en la de archivadas por ninguna regla que alguien
-- haya escrito. El defecto sería silencioso: no hay error, hay una obra menos.
--
-- Hoy la única puerta de escritura es `src/features/obras/services/actions.ts`, que valida con Zod
-- contra estos tres valores (verificado: ningún script del orquestador escribe la columna). Pero la
-- validación de la aplicación protege a la aplicación, no a la tabla: un `psql` a mano, un import o
-- una integración futura entran por al lado. El dominio va donde vive el dato.
--
-- ═══ SEGURIDAD DE APLICACIÓN ═══
--
-- Las 8 obras vivas al 19/08/2026 cumplen: 7 en 'activa' y 'galpones' en 'cerrada'. El CHECK no
-- rechaza ninguna fila existente. `not valid` + `validate` se usa igual, para que la validación de
-- las filas viejas no tome un lock de escritura sobre la tabla durante el ALTER.
--
-- NO TOCA RLS NI GRANTS: no hay tabla nueva. `obra_canonica` ya tiene sus policies
-- (`obra_canonica_select` por `ve_obra(id)`, `obra_canonica_write` por rol) y `authenticated` ya
-- tiene INSERT/UPDATE/DELETE desde 20260818230000_obra_canonica_grant_escritura.sql — verificado
-- contra `information_schema.role_table_grants`, que es lo que hacía falta para que archivar
-- escriba de verdad.

alter table public.obra_canonica
  drop constraint if exists obra_canonica_estado_chk;

alter table public.obra_canonica
  add constraint obra_canonica_estado_chk
  check (estado in ('activa', 'pausada', 'cerrada'))
  not valid;

alter table public.obra_canonica
  validate constraint obra_canonica_estado_chk;

-- El comentario deja de ser la única fuente del dominio, pero se queda: dice para qué sirve cada
-- valor, que es lo que el CHECK no puede decir.
comment on column public.obra_canonica.estado is
  'activa = se trabaja · pausada = sigue en la cartera aunque hoy no avance · cerrada = archivada: '
  'sale del portafolio y de la ficha del cliente, entra por su URL y se reactiva. Nunca se borra.';
