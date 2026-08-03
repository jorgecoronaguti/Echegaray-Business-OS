-- LAS NOTAS DEL DUEÑO SOBRE UN PROVEEDOR, A PRUEBA DE QUE LA LISTA CAMBIE (31/07/2026)
--
-- EL PROBLEMA, EN SUS PALABRAS: "recien puse pagado en compras y no borro el agrupar segun
-- corresponde". Cuando un proveedor se paga, sale de la lista de deuda — y su nota se queda sin dueño.
-- Las notas vivían SÓLO en la columna Comentarios de esa lista, así que pagarle a alguien borraba lo
-- que él había escrito sobre ese alguien. Ya pasó: la nota de FEMENIA desapareció de la pestaña cuando
-- su deuda se fue a cero, y la de Hormiserv quedó en una fila huérfana de un diseño anterior.
--
-- Una nota vale por la ENTIDAD de la que habla, no por el renglón donde cayó ni por si hoy le debemos.
-- Acá viven, por proveedor, independientes de la lista. El generador las escribe en la pestaña cada
-- corrida; si el dueño las edita, la próxima corrida las lee y gana su texto.
--
-- BORRAR TAMBIÉN ES UNA DECISIÓN SUYA: si el proveedor ESTÁ en la lista y la celda quedó vacía, la
-- borró a mano y se borra acá. Si el proveedor NO está (le pagamos), la celda vacía no prueba nada y
-- la nota se conserva.

create table if not exists public.proveedor_notas (
  file_id        text not null,
  proveedor      text not null,
  -- La grafía normalizada con la que se busca: sin tildes, minúsculas, espacios colapsados. La clave
  -- de negocio es el nombre, y en Compras el mismo proveedor aparece escrito de varias formas.
  clave          text not null,
  nota           text not null,
  actualizado_en timestamptz not null default now(),
  -- CUÁNDO EL GENERADOR LA ESCRIBIÓ EN LA PESTAÑA. Es el tercer dato que hace falta para distinguir
  -- "el dueño la borró" de "el proveedor acaba de reaparecer y todavía no la puse": las dos son la
  -- misma celda vacía. Sin esto, la primera corrida tras volver a deberle a alguien borraría su nota.
  escrita_en     timestamptz,
  primary key (file_id, clave)
);

comment on table public.proveedor_notas is
  'Lo que el dueño escribió sobre un proveedor. Sobrevive a que la lista de deuda cambie: pagarle a un proveedor no puede borrar la nota que habla de él.';
comment on column public.proveedor_notas.clave is
  'El nombre normalizado (sin tildes, minúsculas). En Compras el mismo proveedor aparece con varias grafías.';
comment on column public.proveedor_notas.proveedor is
  'La grafía tal como la escribió el dueño la última vez: es la que se muestra.';
