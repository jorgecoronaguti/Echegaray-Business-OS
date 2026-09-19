-- EL RUBRO DEL PROVEEDOR SE DEDUCE DE LO QUE VENDIÓ, Y LO DEDUCIDO NO PISA LO DECLARADO.
--
-- Hasta hoy `public.proveedores` tenía doce columnas y ninguna era el rubro; la pantalla escribía
-- «sin rubro» en las 36 filas y el propio canvas lo daba por perdido: *«El rubro no tiene fuente: no
-- se filtra por algo que no está cargado»* (`Administración v4 · Pantallas.dc.html:170`). El dueño
-- decidió lo contrario el 06/09/2026: cargarlo deduciéndolo de lo que cada uno vendió.
--
-- ═══ DOS COLUMNAS Y NO UNA — EL PRECEDENTE ES DE ESTE MISMO REPO ═══
--
-- `20260905T1200` separó `documento_leido.tipo` (lo que una regla PROBÓ) de `tipo_propuesto` (lo que
-- un modelo CREE) por una razón que vale idéntica acá: una vez que la deducción y el hecho comparten
-- columna, nadie puede distinguir después cuáles se decidieron por evidencia y cuáles por parecido.
--
--   `rubro`          LO DECLARADO POR UNA PERSONA. Nace null y sólo lo escribe la ficha.
--   `rubro_deducido` LO CALCULADO de las compras, con su evidencia al lado.
--
-- El rubro que la pantalla muestra es `coalesce(rubro, rubro_deducido)`, y se dibuja distinto según
-- de cuál venga. Así **la corrección manual le gana a la deducción para siempre sin ninguna bandera
-- que alguien pueda olvidar**: el deductor escribe una columna que la persona no usa, y no existe
-- ningún camino por el que pueda pisar la otra. Un `rubro_origen` de un solo campo habría dependido
-- de que cada `update` futuro se acordara de respetarlo.
--
-- ═══ POR QUÉ LA EVIDENCIA ES OBLIGATORIA CUANDO HAY DEDUCCIÓN ═══
--
-- Regla de oro 2: nunca presentar una estimación como un hecho. Un rubro deducido sin la cuenta que
-- lo produjo es indistinguible de uno inventado, y a los tres meses nadie sabe si «Materiales» salió
-- de 213 compras o de que el nombre decía «Corralón». El CHECK lo impone en la base y no en el
-- script: si la regla vive en el código, la primera carga hecha a mano por otra puerta la saltea.
--
-- ═══ EL VOCABULARIO LO IMPONE UN CHECK ═══
--
-- Siete valores. Tres los nombra el canvas —Materiales (`:156`), Subcontratista (`:162`) y Fletes
-- (`:165`)— y cuatro los obliga la evidencia: 113 filas de combustible, 20 de alquiler de equipos,
-- 17 de baños y contenedores y 21 de EPP no son «materiales» de construcción, y meterlas ahí para
-- que entren en el vocabulario del mockup sería falsear la lectura del gasto.
--
-- SUBCONTRATISTA NO ES UNA ETIQUETA COSMÉTICA. Es la que dispara el control mensual de ART con
-- nómina y de cargas sociales, porque un problema del sub es un problema de Echegaray por
-- solidaridad laboral. Por eso el deductor pide más evidencia para ese valor que para los demás —
-- ver `deducir-rubro-proveedores.mjs`— y por eso «FLETES» queda en el vocabulario aunque HOY NINGUNA
-- deducción pueda producirlo: no existe ninguna familia de material que lo alimente. Que esté en el
-- CHECK sirve para que una persona pueda declararlo; que no salga de la deducción se declara acá
-- para que nadie lo lea como que no hay fleteros.

alter table public.proveedores
  add column if not exists rubro                    text,
  add column if not exists rubro_declarado_por      text,
  add column if not exists rubro_declarado_en       timestamptz,
  add column if not exists rubro_deducido           text,
  add column if not exists rubro_deducido_evidencia text,
  add column if not exists rubro_deducido_en        timestamptz;

comment on column public.proveedores.rubro is
  'LO DECLARADO POR UNA PERSONA desde la ficha. Le gana a `rubro_deducido` para siempre: el deductor no escribe esta columna.';
comment on column public.proveedores.rubro_deducido is
  'Lo CALCULADO de las compras del proveedor. Nunca se presenta como decidido: la pantalla lo dibuja apagado y con su evidencia.';
comment on column public.proveedores.rubro_deducido_evidencia is
  'La cuenta que produjo la deducción, en palabras. Sin ella un rubro deducido es indistinguible de uno inventado.';

do $$ begin
  alter table public.proveedores add constraint proveedores_rubro_ck
    check (rubro is null or rubro in (
      'Materiales', 'Subcontratista', 'Fletes', 'Combustible', 'Equipos',
      'Servicios de obra', 'Seguridad e higiene'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.proveedores add constraint proveedores_rubro_deducido_ck
    check (rubro_deducido is null or rubro_deducido in (
      'Materiales', 'Subcontratista', 'Fletes', 'Combustible', 'Equipos',
      'Servicios de obra', 'Seguridad e higiene'));
exception when duplicate_object then null; end $$;

-- LA EVIDENCIA NO ES OPCIONAL. Un rubro deducido sin la cuenta que lo produjo no se puede auditar.
do $$ begin
  alter table public.proveedores add constraint proveedores_rubro_deducido_evidencia_ck
    check (rubro_deducido is null
           or (rubro_deducido_evidencia is not null and length(btrim(rubro_deducido_evidencia)) > 0));
exception when duplicate_object then null; end $$;

-- QUIÉN LO DECLARÓ TAMPOCO ES OPCIONAL. Un rubro declarado sin autor es un rubro deducido con otro
-- nombre: se leería como decisión humana sin que nadie la haya tomado.
do $$ begin
  alter table public.proveedores add constraint proveedores_rubro_declarado_ck
    check (rubro is null
           or (rubro_declarado_por is not null and length(btrim(rubro_declarado_por)) > 0));
exception when duplicate_object then null; end $$;

-- ═══ EN ESTA TABLA UNA COLUMNA NUEVA NACE ABIERTA, NO CERRADA — MEDIDO, NO SUPUESTO ═══
--
-- La regla conocida del repo es que una columna nueva nace SIN permiso y se vuelve invisible para la
-- web. Acá pasa lo contrario y hay que decirlo, porque la consecuencia es la peligrosa: `proveedores`
-- tiene el grant a nivel de TABLA (`role_table_grants` → authenticated: SELECT, INSERT, UPDATE,
-- DELETE), no columna por columna. Lo que aparece en `column_privileges` es la EXPANSIÓN de ese
-- grant, no una lista curada — leerlo al revés fue el error de la primera versión de esta migración.
-- O sea: `rubro_deducido` y su evidencia nacían escribibles desde la web.
--
-- Eso rompe lo único que hace valer la deducción: que su rastro no se pueda fabricar. Si la pantalla
-- puede escribir «Subcontratista» en `rubro_deducido` con la evidencia que quiera, la distinción
-- entre lo probado y lo supuesto —que es el motivo entero de tener dos columnas— deja de existir.
--
-- Se cierra donde se decide: se retira el UPDATE de tabla y se vuelve a conceder columna por
-- columna. La lista incluye las doce originales para no romper nada que hoy escriba, y de las seis
-- nuevas SÓLO las tres declaradas. `rubro_deducido`, su evidencia y su fecha las escribe el deductor
-- por conexión directa, que corre como `postgres` y no depende de este grant.
--
-- El SELECT no se toca: el rubro deducido se LEE en la pantalla —es la mitad del trabajo pendiente—
-- y esconderlo dejaría la ficha sin poder explicar de dónde salió lo que muestra.
revoke update on public.proveedores from authenticated;
grant update (
  id, nombre, created_at, updated_at, creado_por, actualizado_por, actualizado_en,
  cuit, activo, razon_social, notas, es_prueba,
  rubro, rubro_declarado_por, rubro_declarado_en
) on public.proveedores to authenticated;

-- El INSERT queda como estaba —a nivel de tabla— y con él un alta puede nacer con un
-- `rubro_deducido` escrito a mano. Es un agujero MÁS CHICO y se declara en vez de taparse a medias:
-- el alta de proveedor pasa por `proveedoresActions.ts`, que arma la fila campo por campo, y
-- cerrarlo pide revisar el circuito de alta entero. Queda anotado como límite conocido.

-- El recorte «sin rubro» es la puerta al trabajo pendiente, y es el que se va a consultar seguido.
create index if not exists proveedores_sin_rubro_idx
  on public.proveedores (nombre)
  where rubro is null and rubro_deducido is null;
