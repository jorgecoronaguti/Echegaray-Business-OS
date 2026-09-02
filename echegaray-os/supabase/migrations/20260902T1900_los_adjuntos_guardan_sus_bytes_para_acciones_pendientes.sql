-- UNA ACCIÓN QUE QUEDÓ A MEDIAS NO PUEDE PEDIR RE-ADJUNTAR EL ARCHIVO (dueño, 02/09/2026).
--
-- «cotiza» + dos planos → falta el proyecto → la respuesta pedía «mandámelos de nuevo con ese
-- dato»: la lectura persistida guardaba el TEXTO extraído, no los bytes, así que el mensaje
-- siguiente («Quattropani») no tenía con qué ejecutar. Ahora los bytes quedan junto a la lectura,
-- por (actor, hash) —la misma identidad de siempre—, y el follow-up completa la acción solo.
--
-- El tope de tamaño lo aplica el escritor (lib/xsas-archivos.mjs): un archivo más grande que el
-- tope se lee igual pero no persiste bytes, y la respuesta lo declara.
alter table orq.xsas_adjunto add column if not exists contenido_b64 text;
comment on column orq.xsas_adjunto.contenido_b64 is
  'los bytes del archivo en base64, para completar acciones pendientes sin re-adjuntar; null si superó el tope del escritor';
