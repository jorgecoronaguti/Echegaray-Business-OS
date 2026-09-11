-- ═══ LOS PAPELES DE UNA OBRA TIENEN DÓNDE ESTAR (dueño, 11/09/2026) ════════════════════════════
--
-- «En el CRM admin de app.ecsas.com.ar no encuentro las cotizaciones, los documentos, archivos y
-- demás cuestiones que han conformado todas las obras. Te pedí que todo de los clientes esté ahí.»
--
-- ═══ EL HUECO, MEDIDO (11/09/2026) ═══
--
--   cliente            archivos en Drive   los ve la ficha   atados a una OBRA
--   MESSINA                  143                113                 0
--   LA ESTRELLA               94                 94                 0
--   JAVIER SANCHEZ            63                  0                 0
--   FRANCO QUATTROPANI        41                 33                32
--
-- La ficha muestra papeles del CLIENTE —una lista plana de 113 archivos— y ninguna obra tiene los
-- suyos, salvo Quattropani, que tiene una sola obra y por eso «cliente» y «obra» son lo mismo.
-- Javier Sánchez no ve NINGUNO.
--
-- ═══ LO QUE FALTABA ERA EL VÍNCULO, NO LOS ARCHIVOS ═══
--
-- `drive_index` ya conoce los 1.252 archivos de «PRESUPUESTOS - CLIENTES» con su ruta, su tamaño y
-- su fecha. Lo que no existía es qué CARPETA es de qué OBRA: `obra_canonica.drive_carpeta_id` lo
-- tienen 11 obras de 26 y no alcanza —una obra tiene varias carpetas y una carpeta de cliente tiene
-- adentro las de sus obras—.
--
-- `obra_carpeta_drive` es ese vínculo, y NO SE INVENTA: lo escribe
-- `orquestador/scripts/obras-carpetas-drive.mjs` con tres reglas de evidencia (la carpeta declarada,
-- un papel de la obra adentro, el nombre de la carpeta resuelto por alias), y todo lo que no resuelve
-- queda en una lista para el dueño en vez de atarse por parecido.
--
-- ═══ POR QUÉ LA CLAVE ES LA CARPETA Y NO EL PAR ═══
--
-- Una carpeta pertenece a UNA obra. Con la clave en (obra_id, carpeta), dos obras podrían reclamar
-- la misma carpeta y los mismos papeles saldrían abajo de las dos: el dueño vería el presupuesto del
-- Playón de Azufre colgando también del adicional del tercer muro. La disputa se resuelve antes de
-- escribir —gana la obra mayor— o no se escribe.

create table if not exists public.obra_carpeta_drive (
  drive_folder_id text primary key,
  obra_id text not null references public.obra_canonica(id) on delete cascade,
  ruta text not null,
  -- QUÉ SON, POR DEFECTO, LOS PAPELES DE ESTA CARPETA. `null` = los clasifica el nombre de cada
  -- archivo. Es un default, nunca una afirmación sobre un archivo concreto.
  categoria_por_defecto text,
  fuente text not null check (fuente in (
    'obra_canonica.drive_carpeta_id',  -- alguien ya lo declaró
    'papel-ancla',                     -- adentro hay un papel atado a la obra con evidencia
    'nombre-de-carpeta',               -- el nombre resuelve a UNA obra del mismo cliente
    'manual')),                        -- lo ató una persona: ninguna corrida lo pisa
  porque text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz
);

comment on table public.obra_carpeta_drive is
  'QUÉ CARPETA DE DRIVE ES DE QUÉ OBRA. La escribe scripts/obras-carpetas-drive.mjs con tres reglas '
  'de evidencia; lo que no resuelve NO se ata por parecido, se reporta. `fuente = manual` es una '
  'decisión de una persona y ninguna corrida la pisa.';

create index if not exists obra_carpeta_drive_obra_idx on public.obra_carpeta_drive (obra_id);

-- ═══ RLS: LA MISMA PUERTA QUE `obra_canonica` ═══
--
-- Ver los papeles de una obra es ver la obra. Se copia el predicado de `obra_canonica_select`
-- (Administración y jefe de obra ven todo; el nivel campo, sólo sus obras) en vez de escribir uno
-- nuevo: dos definiciones de «puedo ver esta obra» se separan en el primer cambio de rol.
alter table public.obra_carpeta_drive enable row level security;

drop policy if exists obra_carpeta_drive_select on public.obra_carpeta_drive;
create policy obra_carpeta_drive_select on public.obra_carpeta_drive for select
  using ((select public.es_administracion())
         or (select public.current_rol()) = 'jefe_obra'
         or obra_id in (select public.mis_obras()));

drop policy if exists obra_carpeta_drive_escribe on public.obra_carpeta_drive;
create policy obra_carpeta_drive_escribe on public.obra_carpeta_drive for all
  using ((select public.es_administracion())) with check ((select public.es_administracion()));

-- Una policy sin GRANT es «permission denied»: la policy filtra filas, el GRANT abre la puerta.
grant select on public.obra_carpeta_drive to authenticated;
grant select, insert, update, delete on public.obra_carpeta_drive to service_role;

-- ═══ LOS PAPELES DE CADA OBRA, EN UNA SOLA VISTA ═══
--
-- Dos caminos, y el más fuerte gana POR ARCHIVO:
--
--   1 · EL PAPEL ATADO A LA OBRA. La cotización que fija su precio (`obra_contrato`), la OC o la OP
--       que mandó el cliente (`cliente_orden`), lo que alguien vinculó a mano (`obra_documento`).
--       Gana siempre: la OC del adicional del tercer muro está guardada DENTRO de la carpeta del
--       Playón de Azufre, y es del adicional aunque la carpeta sea de la madre.
--   2 · LA CARPETA, Y LA MÁS PROFUNDA GANA. «JAVIER SANCHEZ» está declarada como carpeta de la obra
--       original y adentro están «Entrepiso», «Instalacion Electrica» y «Pisos Industriales»: sin
--       esta regla, los papeles del entrepiso saldrían debajo de las DOS obras.
--
-- La vista NO clasifica el archivo (cotización, contrato, plano…): eso lo decide
-- `src/features/clientes/services/papelesDeObra.ts`, en UN solo lugar y con sus tests. Acá se
-- transporta el nombre y la ruta, que es la evidencia con la que se clasifica.
create or replace view public.obra_papel_drive
with (security_invoker = true) as
with archivo as (
  select d.drive_file_id, d.name, d.path, d.mime_type, d.size_bytes, d.modified_time, d.web_view_link
    from public.drive_index d
   where not d.is_folder
     and coalesce(d.trashed, false) = false
     and coalesce(d.ausente_en_drive, false) = false
),
candidato as (
  -- 1 · PAPEL ATADO A LA OBRA
  select a.*, k.obra_id, 1 as prioridad, 0 as largo,
         'la cotización o el contrato que fija el precio'::text as via
    from archivo a join public.obra_contrato k on k.fuente_drive_id = a.drive_file_id
  union all
  select a.*, r.obra_id, 1, 0, 'papel del cliente atado a la obra (' || coalesce(r.tipo, 'otro') || ')'
    from archivo a join public.cliente_orden r on r.drive_file_id = a.drive_file_id
   where r.obra_id is not null and r.eliminado_en is null
  union all
  select a.*, v.obra_id, 1, 0, 'vinculado a la obra'
    from archivo a join public.obra_documento v on v.drive_file_id = a.drive_file_id
  union all
  -- 2 · LA CARPETA DE LA OBRA
  select a.*, c.obra_id, 2, length(c.ruta), 'carpeta de la obra en Drive'
    from archivo a join public.obra_carpeta_drive c on a.path like c.ruta || '/%'
)
select distinct on (drive_file_id)
       drive_file_id, obra_id, name as nombre, path as ruta, mime_type, size_bytes,
       modified_time, web_view_link, via
  from candidato
 order by drive_file_id, prioridad, largo desc;

comment on view public.obra_papel_drive is
  'CADA ARCHIVO DE DRIVE CON LA OBRA A LA QUE PERTENECE. Gana el papel atado con evidencia por '
  'encima de la carpeta, y entre carpetas gana la MÁS PROFUNDA. No clasifica: eso lo hace '
  'papelesDeObra.ts, en un solo lugar.';

grant select on public.obra_papel_drive to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pantalla_cliente(p_slug text, p_solapa text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  with elegido as (
    select c.cliente_id from public.cliente_panel c where c.slug = p_slug
  ),
  -- SUS OBRAS, UNA VEZ. Las usan tres claves: la lista de la ficha, la actividad y el recorte de
  -- los certificados. Sin el CTE, la misma vista se recorrería tres veces en el mismo viaje.
  sus_obras as (
    select o.* from public.obra_panel o
     where o.cliente_id = (select cliente_id from elegido)
  )
  select jsonb_build_object(

    -- LA FICHA. `null` = no existe o no la puedo ver; la pantalla ya distingue eso de un error.
    'cliente', (select to_jsonb(c) from public.cliente_panel c where c.slug = p_slug),

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    -- LOS RESPONSABLES POSIBLES, sin las identidades de prueba: nombrar responsable a una cuenta de
    -- QA es una decisión de negocio tomada por accidente. Se filtra por `es_prueba`, no por texto.
    'responsables', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol)
                                order by p.nombre), '[]'::jsonb)
        from public.perfiles p where p.es_prueba = false
    ),

    'contactos', (
      select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
        from public.cliente_contacto k
       where k.cliente_id = (select cliente_id from elegido)
    ),

    'obras', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from sus_obras o),

    -- LO QUE OBRAS PUBLICA POR OBRA. Sin recortar por cliente: la ficha usa el mapa completo, igual
    -- que la cartera, y recortarlo acá sería una regla nueva que nadie pidió.
    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'obra_padre_id', e.obra_padre_id,
                                  -- EL CONTRATO EN SU MONEDA Y EL DÓLAR CON QUE SE VALUÓ: Quattropani
                                  -- se firmó en U$S y el peso equivalente cambia solo de un día para
                                  -- otro. Los dos viajan; la pantalla decide cuál muestra.
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  -- LOS DOS TOTALES DE OC NO SE SUMAN: `ventana` es lo que el cliente
                                  -- emitió dentro del año que acota el contratado e `historico` lo de
                                  -- otros años, que en una obra fusionada son órdenes viejas.
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  'contrato_mano_obra', e.contrato_mano_obra,
                                  'contrato_mano_obra_usd', e.contrato_mano_obra_usd,
                                  'contrato_materiales', e.contrato_materiales,
                                  'contrato_materiales_usd', e.contrato_materiales_usd,
                                  'contrato_total', e.contrato_total,
                                  'contrato_fuente', e.contrato_fuente,
                                  'contrato_fuente_drive_id', e.contrato_fuente_drive_id,
                                  'contrato_fuente_nombre', e.contrato_fuente_nombre,
                                  'contrato_cita', e.contrato_cita,
                                  'contrato_nota', e.contrato_nota)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    -- LO COBRADO POR TRABAJO — la MISMA vista y las MISMAS ocho columnas que `/clientes`. La ficha
    -- del CRM lo necesita para decir si un trabajo cobró; con una lectura propia, las dos pantallas
    -- del módulo volverían a poder decir números distintos sobre la misma obra.
    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
       where u.cliente_id = (select cliente_id from elegido)
    ),

    -- LO CONTRATADO Y LO COBRADO DEL CLIENTE, sumado por la base. `null` cuando el rol no ve
    -- economía (`ve_economia()` adentro de la vista) o cuando el cliente no tiene fila.
    'economia_cliente', (
      select jsonb_build_object(
               'cliente_id', x.cliente_id, 'contratado', x.contratado,
               'contratado_en_curso', x.contratado_en_curso, 'n_obras_en_curso', x.n_obras_en_curso,
               'n_obras_cerradas', x.n_obras_cerradas, 'n_obras_con_precio', x.n_obras_con_precio,
               'n_obras_sin_precio', x.n_obras_sin_precio, 'costo_real', x.costo_real,
               'facturado_90d', x.facturado_90d, 'cobrado_90d', x.cobrado_90d,
               'cobrado_total', x.cobrado_total, 'cobrado_neto_total', x.cobrado_neto_total,
               'saldo', x.saldo, 'vencido', x.vencido, 'por_vencer', x.por_vencer,
               'pendiente_contractual', x.pendiente_contractual)
        from public.cliente_economia x
       where x.cliente_id = (select cliente_id from elegido)
    ),

    -- LOS PAPELES DEL CLIENTE, con `atribucion`: la ficha muestra CÓMO se ató cada uno a su obra.
    'papeles', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'obra_id', r.obra_id, 'tipo', r.tipo, 'numero', r.numero,
               'fecha', r.fecha, 'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
               'nombre_archivo', r.nombre_archivo, 'atribucion', r.atribucion,
               'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.cliente_id = (select cliente_id from elegido)
         and r.eliminado_en is null
    ),

    -- CUÁNTOS VÍNCULOS A DRIVE TIENE, SIEMPRE. La barra de solapas escribe «Documentos · N» en
    -- las nueve caras, y sin esta cuenta recortar las filas convertiría ese N en un cero falso —
    -- que es peor que el peso que se ahorra. `count(` no fabrica un número de negocio: es el
    -- `.length` del mismo array, con el mismo `where`, hecho antes del cable.
    'n_documentos', (
      select count(*) from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ),

    -- LOS VÍNCULOS A DRIVE, y APARTE los archivos. No se cruzan acá: ver la cabecera.
    'documentos', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', d.drive_file_id, 'rol', d.rol, 'origen', d.origen,
               'creado_en', d.creado_en)), '[]'::jsonb)
        from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    -- LA TERCERA OLA QUE DEJA DE SER UNA OLA: esto esperaba a que volvieran los ids de arriba.
    'drive', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', a.drive_file_id, 'name', a.name, 'path', a.path,
               'mime_type', a.mime_type, 'modified_time', a.modified_time)), '[]'::jsonb)
        from public.drive_index a
       where a.drive_file_id in (
               select d.drive_file_id from public.cliente_documento d
                where d.cliente_id = (select cliente_id from elegido))
    ) else '[]'::jsonb end,

    -- LAS NOTAS Y SUS AUTORES, por separado: una nota cuyo perfil ya no está queda SIN FIRMA, que
    -- es la verdad, en lugar de perderse. Ese cruce lo hace TypeScript y sigue siendo uno solo.
    'notas', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en)
               order by n.creado_en desc), '[]'::jsonb)
        from public.cliente_nota n
       where n.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    'autores', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)), '[]'::jsonb)
        from public.perfiles p
       where p.id in (
               select n.autor_id from public.cliente_nota n
                where n.cliente_id = (select cliente_id from elegido) and n.autor_id is not null)
    ) else '[]'::jsonb end,

    -- LAS FECHAS DEL CLIENTE PARA LA ACTIVIDAD salen de `clientes`, no de `cliente_panel`: la vista
    -- no las publica, y agregarlas ahí sería una migración para una solapa que no la necesita.
    'actividad_cliente', case when p_solapa is null or p_solapa = 'actividad' then (
      select jsonb_build_object('nombre_comercial', c.nombre_comercial,
                                'created_at', c.created_at, 'updated_at', c.updated_at)
        from public.clientes c where c.id = (select cliente_id from elegido)
    ) else null::jsonb end,

    -- LOS CERTIFICADOS DE SUS OBRAS — la otra lectura que esperaba a la ola anterior.
    'certificados', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
               'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
               'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
               'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
        from public.certificados t
       where t.obra_canonica_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- ═══ LOS PAPELES QUE CONFORMARON CADA OBRA (dueño, 11/09/2026) ═══
    --
    -- «No encuentro las cotizaciones, los documentos, archivos y demás cuestiones que han conformado
    -- todas las obras.» Viajan SÓLO en la cara Documentos, que es la única que los dibuja: son 106
    -- filas en Messina y arrastrarlas por las otras ocho caras es el peso que 20260911T1200 acaba de
    -- sacar.
    'papeles_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', z.drive_file_id, 'obra_id', z.obra_id, 'nombre', z.nombre,
               'ruta', z.ruta, 'mime_type', z.mime_type, 'size_bytes', z.size_bytes,
               'modified_time', z.modified_time, 'web_view_link', z.web_view_link,
               'via', z.via)), '[]'::jsonb)
        from public.obra_papel_drive z
       where z.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LAS CARPETAS VINCULADAS. Sin esto, «esta obra no tiene papeles» y «esta obra no tiene carpeta
    -- vinculada en Drive» se dibujan igual —una lista vacía— y son dos hechos opuestos: el primero
    -- es una obra sin documentar y el segundo, trabajo del OS que falta hacer.
    'carpetas_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', y.obra_id, 'drive_folder_id', y.drive_folder_id, 'ruta', y.ruta,
               'fuente', y.fuente)), '[]'::jsonb)
        from public.obra_carpeta_drive y
       where y.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LOS PRESUPUESTOS DE ESTE CLIENTE. La aplicación traía TODA la cartera vigente y descartaba en
    -- memoria; el filtro es el mismo predicado (`cliente_id`), sólo que antes del cable.
    'presupuestos', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.fecha_cotizacion desc), '[]'::jsonb)
        from public.cotizacion_cascada z
       where z.vigente = true and z.cliente_id = (select cliente_id from elegido)
    )
  )
$$;

comment on function public.pantalla_cliente(text, text) is
  'LAS DIECISIETE LECTURAS DE LA FICHA DEL CLIENTE EN UN VIAJE. Desde 20260911T2100 la cara '
  'Documentos trae además `papeles_obra` (los archivos de Drive de cada obra, vía obra_papel_drive) '
  'y `carpetas_obra` (qué obras tienen carpeta vinculada), que NINGUNA otra cara transporta. El '
  'resto del contrato no cambia: p_solapa recorta el DIBUJO, quien recorta por rol es la RLS.';

notify pgrst, 'reload schema';
