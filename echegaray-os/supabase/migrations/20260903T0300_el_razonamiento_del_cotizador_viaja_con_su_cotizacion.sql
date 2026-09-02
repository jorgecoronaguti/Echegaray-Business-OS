-- El razonamiento del cotizador viaja con su cotización.
--
-- «Presupuestos v5 · Lectura del plano»: el cómputo no es una lista que xsas escupe — es la
-- consecuencia de leer el plano en un orden, y cada paso deja evidencia y deriva partidas.
-- Hasta hoy ese razonamiento salía como TEXTO en la respuesta del chat y se perdía: la pantalla
-- del presupuesto no podía volver a mostrarlo. Ahora la estructura completa de `razonar()`
-- (superficies, bases, excavaciones, fundación lineal, verticales, luces, barrido — con citas
-- del plano y faltantes nombrados) persiste junto a la cotización que derivó de ella.
--
-- jsonb y no tablas: es una FOTO de la lectura que produjo ESTA versión. No se edita fila a
-- fila — cuando se rehace la lectura, nace otra versión con otra foto. La genealogía fila a
-- fila ya existe en `public.computo`.

alter table public.cotizaciones add column if not exists razonamiento jsonb;

comment on column public.cotizaciones.razonamiento is
  'La lectura del plano que derivó en esta cotización: los pasos de razonar() con citas y faltantes nombrados. NULL en cotizaciones anteriores o creadas a mano.';
