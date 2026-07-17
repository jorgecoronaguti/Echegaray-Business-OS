-- Por qué se eligió el modelo en cada llamada del chat (adjunto_lectura / adjunto_escritura /
-- escritura_sheet / escritura / archivo_abierto / criterio / presupuesto / mail / enseñar /
-- investigar / agenda / fast_off / simple / degradado). Permite analizar DÓNDE va el costo de
-- sonnet (93% del gasto del chat) y decidir con evidencia qué rutas mover a haiku o a 0-API,
-- sin degradar a ciegas la calidad de las que sí necesitan el modelo potente.
alter table orq.chat_cost add column if not exists motivo text;
comment on column orq.chat_cost.motivo is
  'Motivo de la eleccion de modelo (para analizar el costo por tipo de operacion y decidir que mover a haiku/0-API).';
