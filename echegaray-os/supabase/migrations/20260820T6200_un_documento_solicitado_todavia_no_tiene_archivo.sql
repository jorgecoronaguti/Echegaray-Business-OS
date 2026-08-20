-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UN DOCUMENTO SOLICITADO TODAVÍA NO TIENE ARCHIVO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `documentacion_legajo.drive_file_id` era NOT NULL, y esa restricción hacía IMPOSIBLE el primer
-- estado del ciclo que el perfil empleado necesita: **solicitado**.
--
-- El modelo ya tiene la columna `presente` y el código ya la lee —`estadoDe()` devuelve `falta`
-- cuando es false, desde el 20/08— pero una fila con `presente = false` no se podía insertar sin
-- inventarle un id de Drive. O sea: la tabla podía decir «este papel no está» sólo si alguien le
-- ponía la dirección de un archivo que no existe. Las 847 filas de hoy tienen todas su archivo, así
-- que el agujero nunca se había tocado.
--
-- Sin esto, «Te piden el apto médico» no existe: Administración no tiene cómo pedir un documento, y
-- la pantalla del empleado nunca tiene nada que mostrarle en Pendientes.
--
-- NO SE AFLOJA NADA MÁS. La columna sigue siendo la dirección del archivo real cuando el archivo
-- existe; lo que se admite es el caso en que TODAVÍA no existe, que es el que la pantalla necesita.
alter table public.documentacion_legajo alter column drive_file_id drop not null;

comment on column public.documentacion_legajo.drive_file_id is
  'El archivo en Drive. NULL cuando el documento está SOLICITADO y todavía no se presentó: presente = false. El archivo nunca se copia a la base — acá va su id.';

-- El grant por columna tiene que cubrir `presente` para que Administración pueda marcar que un
-- papel falta. RLS no es GRANT: sin esto la policy es correcta y la escritura da «permission denied».
grant insert (presente, drive_file_id, fecha_vencimiento), update (presente, drive_file_id, fecha_vencimiento)
  on public.documentacion_legajo to authenticated;

-- ── LA REGLA QUE REEMPLAZA AL NOT NULL, Y QUE DICE MÁS QUE ÉL ───────────────────────────────────
--
-- El NOT NULL cubría un caso real: «una fila sin `drive_file_id` es *el papel está* sin papel que
-- abrir». Eso sigue siendo cierto y sigue prohibido — pero sólo cuando la fila AFIRMA que el papel
-- está. Un documento solicitado no afirma nada: dice que falta.
--
-- La regla correcta no es «siempre tiene archivo», es «si dice que está, tiene que poder abrirse».
alter table public.documentacion_legajo drop constraint if exists documentacion_legajo_presente_con_archivo;
alter table public.documentacion_legajo add constraint documentacion_legajo_presente_con_archivo
  check (not presente or drive_file_id is not null);
