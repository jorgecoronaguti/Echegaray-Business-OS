-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- REPORTAR UN PROBLEMA · lo que ve el que está parado frente al muro
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El diseño del Perfil Empleado pide cuatro cosas y ni una más: la tarea (ya preseleccionada), qué
-- pasa, una foto opcional y «¿frena el trabajo?». Dos de esas cuatro no tenían dónde guardarse.
--
-- ═══ POR QUÉ NO ES UNA SEGUNDA BASE DE PROBLEMAS ═══
--
-- Es la MISMA tabla `obra_restriccion` que usa la obra en escritorio, el mismo estado `abierta`, la
-- misma pantalla del jefe. Lo que cambia es la PUERTA: el alta de escritorio exige responsable y
-- fecha comprometida —«sin eso no es gestión, es una queja anotada»— y esas dos las decide quien
-- conduce la obra, no el oficial que ve que no llegaron los bloques. El empleado REPORTA; el jefe
-- GESTIONA. Un impedimento reportado nace sin responsable y sin compromiso, y se ve como pendiente
-- de asignar hasta que el jefe lo toma.

-- ¿FRENA EL TRABAJO? No es lo mismo «no llegaron los bloques y estamos parados» que «falta un
-- andamio para la semana que viene». Es la pregunta que ordena la lista del jefe, y hasta hoy había
-- que deducirla del texto.
alter table public.obra_restriccion add column if not exists frena boolean;
comment on column public.obra_restriccion.frena is
  'true = el trabajo está parado por esto. NULL = no se preguntó (los impedimentos cargados antes del 20/08/2026 y los del alta de escritorio, que no lo pregunta).';

-- LA FOTO. Vale más que el texto: «no se puede seguir» con una foto del paño mojado se entiende de
-- una. Va a Storage, no a la base — una imagen en una columna es una tabla que nadie puede leer.
alter table public.obra_restriccion add column if not exists foto_path text;
comment on column public.obra_restriccion.foto_path is
  'Ruta en el bucket privado `impedimentos`, con la obra como primera carpeta. NULL = se reportó sin foto, que es lo normal.';

-- Quién lo reportó. `creado_por` ya existe y guarda el usuario; esto NO se agrega. Lo que se hace es
-- dejarlo dicho, porque la pantalla del jefe tiene que poder preguntarle a quien lo vio.
comment on column public.obra_restriccion.creado_por is
  'El usuario que abrió el impedimento. Cuando lo reporta un empleado desde el teléfono, es a quien hay que preguntarle.';

-- ── EL BUCKET DE LAS FOTOS DE IMPEDIMENTO ───────────────────────────────────────────────────────
--
-- PRIVADO, y la carpeta es la OBRA: `<obra_id>/<uuid>.jpg`. Así el alcance del archivo es el mismo
-- que el de la fila —`ve_obra()`— y no dos criterios que pueden divergir. Público sería publicar el
-- estado de una obra de un cliente a cualquiera que adivine la URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('impedimentos', 'impedimentos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists impedimentos_lee_su_obra on storage.objects;
create policy impedimentos_lee_su_obra on storage.objects for select to authenticated
  using (bucket_id = 'impedimentos' and public.ve_obra((storage.foldername(name))[1]));

drop policy if exists impedimentos_sube_su_obra on storage.objects;
create policy impedimentos_sube_su_obra on storage.objects for insert to authenticated
  with check (bucket_id = 'impedimentos' and public.ve_obra((storage.foldername(name))[1]));

-- El grant por columna de `obra_restriccion` no cubre columnas nuevas: sin esto, el insert del
-- reporte falla con «permission denied for table obra_restriccion» y Next lo muestra como un 404.
grant insert (frena, foto_path), update (frena, foto_path) on public.obra_restriccion to authenticated;

-- ── `sin_clasificar` NO ES `otro` ───────────────────────────────────────────────────────────────
--
-- El vocabulario de `tipo` es la CAUSA del impedimento (falta material, falta equipo, falta un
-- trabajo previo…) y lo elige quien lo carga desde escritorio, que sabe clasificarlo. El empleado no
-- elige tipo: el diseño le pide cuatro cosas y ninguna es ésa.
--
-- Mandarlo como `otro` sería MENTIR: `otro` afirma que alguien miró la lista y no encajaba en
-- ninguna. `sin_clasificar` dice lo que pasó — todavía nadie lo clasificó — y deja que el jefe lo
-- reclasifique al tomarlo. La diferencia se nota el día que alguien mire cuántos impedimentos son
-- «otro»: sin esto, esa cifra crecería sola sin que nadie haya elegido nunca esa categoría.
alter table public.obra_restriccion drop constraint if exists obra_restriccion_tipo_check;
alter table public.obra_restriccion add constraint obra_restriccion_tipo_check
  check (tipo = any (array['material', 'informacion', 'equipo', 'mano_de_obra', 'trabajo_previo',
                          'permiso', 'ingenieria_cliente', 'seguridad', 'acceso', 'contrato',
                          'sin_clasificar', 'otro']));
