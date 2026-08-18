-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DOCUMENTOS DE OBRA — SE COMPLETA EL VÍNCULO QUE YA EXISTÍA. NO SE CREA UNA TABLA NUEVA.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ QUÉ HABÍA ANTES DE ESCRIBIR ESTO ═══
--
-- Leído en la base real el 18/08/2026, no en `migrations/`:
--
--   public.obra_documento → obra_id, drive_file_id, rol, origen, creado_en · 0 filas
--   pk (obra_id, drive_file_id) · fk obra_id → obra_canonica · check origen in (manual|path_inferido)
--   public.drive_index    → 2.467 archivos, 368 carpetas, con name/path/mime_type/is_folder
--
-- O sea: la tabla del vínculo ya existía desde `20260817210000_modulo_01_obras.sql`, sin un solo
-- escritor. Crear otra tabla habría dejado dos lugares donde vive la misma relación, que es
-- exactamente lo que la regla de REALIDAD ÚNICA prohíbe. Acá se le agrega lo que le faltaba.
--
-- ═══ POR QUÉ EL VÍNCULO GUARDA NOMBRE Y TIPO SI `drive_index` YA LOS TIENE ═══
--
-- No es duplicar metadata: es el único caso en que el vínculo tiene algo que el índice no.
-- `drive_index` es el espejo de UNA carpeta —`administracion`— y se resincroniza entero cada 4 h.
-- Un archivo que alguien pega desde otra carpeta de Drive, o desde el Drive personal de un jefe de
-- obra, NO está en el índice y nunca va a estar. Sin estas columnas ese vínculo se mostraría con el
-- id crudo de Drive como nombre, que no le dice nada a nadie.
--
-- La precedencia es al revés de lo que parece: **`drive_index` gana**. `nombre`/`tipo`/`mime_type`
-- son lo que se supo AL VINCULAR, y sólo se usan cuando el índice no conoce el archivo. Un archivo
-- renombrado en Drive aparece con su nombre nuevo apenas el índice lo sincroniza; el guardado acá
-- no lo pisa. El archivo NO se copia a Supabase: lo único que viaja es el id y el rótulo.
--
-- ═══ POR QUÉ NO HAY `cliente_id` ═══
--
-- El pedido decía «obra_id y/o cliente_id». No se agrega, a propósito: `public.cliente_documento`
-- ya existe con la misma forma y es el vínculo del cliente, y `obra_canonica.cliente_id` ya dice de
-- qué cliente es cada obra. Un `cliente_id` acá abriría un SEGUNDO camino para la misma relación y
-- dos caminos discrepan el día que alguien mueve una obra de cliente. Queda declarado como decisión,
-- no como olvido.

-- ── 1 · LAS COLUMNAS QUE LE FALTABAN AL VÍNCULO ─────────────────────────────────────────────────

alter table public.obra_documento
  add column if not exists nombre     text,
  add column if not exists tipo       text not null default 'archivo',
  add column if not exists mime_type  text,
  -- QUIÉN LO VINCULÓ, TOMADO DE LA SESIÓN Y NO DEL FORMULARIO. `auth.uid()` como default es la
  -- única forma de que el dato no sea falsificable: un campo del formulario lo edita cualquiera
  -- desde el navegador. Sin sesión (un script con service_role) queda null, que es la verdad.
  add column if not exists creado_por uuid default auth.uid();

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.obra_documento'::regclass and conname = 'obra_documento_tipo_check'
  ) then
    alter table public.obra_documento
      add constraint obra_documento_tipo_check check (tipo in ('archivo', 'carpeta'));
  end if;
end $$;

-- ── 2 · EL VOCABULARIO DE `origen`: CONFIRMADO vs INFERIDO ──────────────────────────────────────
--
-- Decía `manual|path_inferido`, que mezcla CÓMO se cargó con QUÉ TAN CIERTO es. Lo que la pantalla
-- tiene que poder decir es otra cosa: si una persona afirmó que este archivo es de esta obra
-- (`confirmado`) o si lo dedujo el OS por la ruta del archivo (`inferido`). Es la misma distinción
-- HECHO vs INFERENCIA que gobierna todo el resto del sistema, y por eso viaja hasta la columna
-- RELACIÓN de la tabla en vez de quedarse en un campo técnico.
--
-- El check se suelta ANTES del update: convertir 'manual' en 'confirmado' con el check viejo puesto
-- viola la restricción y aborta la migración entera. Hoy son 0 filas, pero el orden tiene que ser
-- correcto igual — esta migración se puede re-aplicar sobre una base que ya tenga datos.
alter table public.obra_documento drop constraint if exists obra_documento_origen_check;

update public.obra_documento
   set origen = case origen when 'manual' then 'confirmado' when 'path_inferido' then 'inferido' end
 where origen in ('manual', 'path_inferido');

alter table public.obra_documento alter column origen set default 'confirmado';
alter table public.obra_documento
  add constraint obra_documento_origen_check check (origen in ('confirmado', 'inferido'));

-- ── 3 · UN ARCHIVO NO SE VINCULA DOS VECES A LA MISMA OBRA ──────────────────────────────────────
--
-- Eso ya lo garantiza la PRIMARY KEY `(obra_id, drive_file_id)`, que es un índice único de verdad y
-- sobre dos columnas `not null` — no el índice único declarado sobre columnas anulables que en este
-- repo convivió con 206 NULLs sin quejarse una vez. No se agrega un índice único redundante: sería
-- una segunda restricción que dice lo mismo y que el día que se toque una hay que acordarse de la
-- otra. El código traduce el 23505 a castellano.
--
-- El índice que SÍ falta es el inverso: «¿a qué obras está vinculado este archivo?». Sin él esa
-- pregunta es un scan completo, y es la que hay que poder contestar antes de borrar algo en Drive.
create index if not exists obra_documento_archivo_idx on public.obra_documento (drive_file_id);

-- ── 4 · RLS. SE PARTE EL `FOR ALL` EN INSERT / UPDATE / DELETE ──────────────────────────────────
--
-- `20260818T2359_escritura_tambien_por_obra.sql` dejó `obra_documento_write` como `for all` con el
-- acotamiento correcto (`ve_obra(obra_id)` + rol), y por eso hoy NO hay fuga: la lectura efectiva
-- queda en `ve_obra(...) OR (ve_obra(...) AND rol)`, que es `ve_obra(...)`.
--
-- Aún así se parte en tres. `FOR ALL` incluye SELECT, y las policies permisivas se combinan con OR:
-- mientras la de escritura sea más ancha o igual que la de lectura en su `using`, la de lectura es
-- decorativa. Ese fue el defecto que se pagó en `obra_actividad`, y no depende de la voluntad de
-- quien escribió la policy: depende de que nadie relaje el `using` de la escritura tres migraciones
-- más adelante. Con INSERT/UPDATE/DELETE separados, la única policy que decide qué se LEE es la de
-- SELECT, y esa clase de error deja de ser posible en esta tabla.
--
-- El acotamiento por obra se copia textual de `20260818T2359`: `ve_obra(obra_id)` decide qué filas
-- se pueden tocar, y en UPDATE el `with check` decide qué filas se pueden DEJAR — sin él, un update
-- podría mover el vínculo a otra obra, que es escribir en la obra ajena por la puerta de la propia.
alter table public.obra_documento enable row level security;

drop policy if exists obra_documento_select on public.obra_documento;
create policy obra_documento_select on public.obra_documento for select to authenticated
  using (public.ve_obra(obra_id));

drop policy if exists obra_documento_write on public.obra_documento;

drop policy if exists obra_documento_insert on public.obra_documento;
create policy obra_documento_insert on public.obra_documento for insert to authenticated
  with check (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );

drop policy if exists obra_documento_update on public.obra_documento;
create policy obra_documento_update on public.obra_documento for update to authenticated
  using (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  )
  with check (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );

drop policy if exists obra_documento_delete on public.obra_documento;
create policy obra_documento_delete on public.obra_documento for delete to authenticated
  using (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );

-- ── 5 · RLS NO ES GRANT ─────────────────────────────────────────────────────────────────────────
--
-- Una policy sin su grant da `permission denied`, y Next lo muestra como un 404: la pantalla entera
-- desaparece y el mensaje no dice nada de permisos. Los grants ya estaban puestos; se re-otorgan
-- porque un grant repetido no molesta y uno faltante tira la pantalla. `service_role` necesita los
-- suyos aparte: PostgREST no hereda nada del rol `postgres`.
grant select, insert, update, delete on public.obra_documento to authenticated;
grant select, insert, update, delete on public.obra_documento to service_role;

comment on table public.obra_documento is
  'VÍNCULO obra ↔ archivo/carpeta de Drive. El archivo NO se copia: acá vive el id y el rótulo. La metadata manda desde drive_index cuando el archivo está indexado.';
comment on column public.obra_documento.nombre is
  'Nombre conocido AL VINCULAR. Respaldo: si drive_index tiene el archivo, gana drive_index.name.';
comment on column public.obra_documento.tipo is
  'archivo | carpeta. Sale de la forma de la URL de Drive, o de lo que declaró quien vinculó cuando pegó un id pelado.';
comment on column public.obra_documento.mime_type is
  'Mime de Drive o extensión, cuando se pudo saber. Nunca inventado: null es una respuesta válida.';
comment on column public.obra_documento.origen is
  'confirmado = lo afirmó una persona · inferido = lo dedujo el OS por la ruta del archivo.';
comment on column public.obra_documento.creado_por is
  'auth.uid() de quien vinculó, puesto por default. No viaja en el formulario: sería falsificable.';
