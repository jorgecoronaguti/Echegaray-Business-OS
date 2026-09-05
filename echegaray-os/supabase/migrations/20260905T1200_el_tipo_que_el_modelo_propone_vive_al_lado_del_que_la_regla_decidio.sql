-- LO QUE EL MODELO PROPONE NO PISA LO QUE LA REGLA DECIDIÓ.
--
-- 832 documentos tienen tipo porque una regla lo reconoció con su marca obligatoria y su
-- evidencia. Otros 381 tienen texto y ninguna regla los reconoce: son el trabajo pendiente.
--
-- La tentación es escribir el tipo del modelo en `tipo` y listo. Sería un error de una clase que ya
-- se pagó en este repo: una vez que la propuesta y el hecho comparten columna, nadie puede
-- distinguir después cuáles se decidieron por evidencia y cuáles por parecido, y el ground truth
-- del que depende toda medición futura queda contaminado sin dejar rastro.
--
-- Por eso son columnas separadas. `tipo` sigue siendo lo que una regla probó. `tipo_propuesto` es
-- lo que el modelo cree, con su confianza y su método, esperando que una persona lo confirme — y
-- esa confirmación es la primera etiqueta HUMANA que este dataset va a tener.

alter table public.documento_leido
  add column if not exists tipo_propuesto      text,
  add column if not exists tipo_propuesto_conf numeric,
  add column if not exists tipo_propuesto_por  text,     -- 'vecinos-e5' | 'zero-shot' | ...
  add column if not exists tipo_confirmado_por text,
  add column if not exists tipo_confirmado_en  timestamptz;

comment on column public.documento_leido.tipo_propuesto is
  'Lo que el modelo cree que es. NUNCA reemplaza a `tipo`, que es lo que una regla probó con evidencia.';
comment on column public.documento_leido.tipo_confirmado_por is
  'Quién confirmó la propuesta. Una confirmación humana es la etiqueta más valiosa del dataset: es la única que no salió de una regla.';

create index if not exists documento_leido_propuesta_idx
  on public.documento_leido (tipo_propuesto, tipo_propuesto_conf desc)
  where tipo is null and tipo_propuesto is not null and tipo_confirmado_en is null;
