-- EL CLIENTE SE LLAMA DE DOS FORMAS, Y HASTA HOY TENÍA UNA SOLA COLUMNA.
--
-- El dueño (20/08): *"Separar correctamente ambos conceptos. Modelo: `nombre_comercial`,
-- `razon_social`. No inventes valores."*
--
-- ═══ QUÉ ESTABA MAL ═══
--
-- `clientes.nombre` guardaba «ARCOR», «La Estrella», «Messina» — el nombre con el que se los llama.
-- La ficha lo rotulaba **«Razón social»** y el formulario también. Eso no es un detalle de rótulo:
-- la razón social es lo que va en un contrato, en una factura y en el padrón de ARCA junto al CUIT,
-- y «Messina» no es la razón social de nadie. Con un solo campo, cargar la verdadera obligaba a
-- pisar el nombre con el que la empresa habla de ese cliente, o a mentir en uno de los dos lados.
--
-- ═══ POR QUÉ ES UN RENOMBRE Y NO UNA COLUMNA NUEVA AL LADO ═══
--
-- El valor que hoy está guardado ES el nombre comercial: se cargó para llamar al cliente, no para
-- facturarle. Agregar `nombre_comercial` vacía al lado de `nombre` dejaría DOS columnas para el
-- mismo concepto —una llena y una vacía— y la pregunta «¿cuál es el nombre de este cliente?»
-- pasaría a tener dos respuestas según quién la lea. El renombre conserva el dato, no toca un solo
-- `id` ni una sola relación, y Postgres arrastra solo las dos vistas que la leen.
--
-- `razon_social` NACE VACÍA EN LAS CINCO FILAS y así se queda: no hay ninguna fuente en la base que
-- diga cuál es la razón social de ARCOR, y derivarla del nombre comercial sería fabricarla. La ficha
-- la muestra como «sin cargar», que es la verdad, y se completa a mano desde Administración.

begin;

alter table public.clientes rename column nombre to nombre_comercial;
alter table public.clientes add column if not exists razon_social text;

comment on column public.clientes.nombre_comercial is
  'Con qué nombre se habla del cliente. Es el que se muestra en todas las pantallas y el que arma el slug.';
comment on column public.clientes.razon_social is
  'El nombre legal, el que va con el CUIT en un contrato o una factura. NULL = no se cargó; no se deriva del comercial.';

-- `obra_panel` NO SE TOCA: Postgres ya reescribió su `COALESCE(cl.nombre, …)` a `cl.nombre_comercial`
-- al renombrar, y `cliente_nombre` sigue significando exactamente lo mismo que significaba —el
-- nombre con el que se llama al cliente—, que es lo que corresponde mostrar en la columna CLIENTE
-- del portafolio. Reescribirla acá sería tocar una vista para que diga lo que ya dice.

-- `cliente_panel` SÍ: una vista no puede renombrar ni agregar columnas con `create or replace`, así
-- que se rehace entera. Se repite `security_invoker = true` — NO se hereda, y perderlo abriría la
-- ficha de todos los clientes a cualquiera con sesión.
drop view if exists public.cliente_panel;

create view public.cliente_panel with (security_invoker = true) as
select
  c.id                       as cliente_id,
  c.slug,
  c.nombre_comercial,
  c.razon_social,
  c.cuit,
  c.direccion,
  c.telefono,
  c.email,
  c.responsable_id,
  p.nombre                   as responsable_nombre,
  c.drive_carpeta_id,
  c.activo,
  c.notas,
  count(op.obra_id)::int                                              as n_obras,
  count(op.obra_id) filter (where op.estado = 'activa')::int          as n_obras_activas,
  sum(op.monto_contratado)                                            as contratado,
  sum(op.costo_real)                                                  as costo_real,
  sum(op.restricciones_abiertas)::int                                 as restricciones_abiertas,
  max(op.avance_sincronizado_en)                                      as avance_sincronizado_en,
  (select count(*)::int from public.cliente_contacto ct where ct.cliente_id = c.id)  as n_contactos,
  (select count(*)::int from public.cliente_documento cd where cd.cliente_id = c.id) as n_documentos
from public.clientes c
left join public.perfiles p  on p.id = c.responsable_id
left join public.obra_panel op on op.cliente_id = c.id
group by c.id, c.slug, c.nombre_comercial, c.razon_social, c.cuit, c.direccion, c.telefono,
         c.email, c.responsable_id, p.nombre, c.drive_carpeta_id, c.activo, c.notas;

grant select on public.cliente_panel to authenticated, service_role;

commit;
