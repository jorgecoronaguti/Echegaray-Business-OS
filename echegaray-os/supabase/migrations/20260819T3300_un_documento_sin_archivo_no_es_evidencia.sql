-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS 12 FILAS DE JULIO QUE AFIRMABAN SOBRE PAPELES QUE NADIE PUEDE ABRIR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El relevamiento de julio cargó 12 filas en `documentacion_legajo` para tres personas —ALANIZ,
-- GONZALEZ EMILIANO y SOSA— sin `drive_file_id`: seis decían "el papel está" y seis decían "el papel
-- no está". Ninguna de las doce se puede abrir ni comprobar.
--
-- Hoy la MISMA carpeta se leyó entera y archivo por archivo: 61 legajos, 192 papeles, cada uno con
-- su id de Drive. Contra esa lectura, las seis afirmativas no se sostienen — la carpeta de ALANIZ
-- tiene un alta, un examen médico y un documento sin nombre, y no tiene el DNI ni la libreta de
-- fondo de cese que la fila de julio daba por presentes—.
--
-- ═══ Y LAS QUE DECÍAN QUE FALTABA, TAMPOCO VAN ═══
--
-- Guardar la AUSENCIA de un documento como una fila es una segunda definición de "qué falta": la
-- primera es la lista de papeles que sí están. El día que alguien sube el EPP de Alaniz, la fila de
-- julio sigue diciendo que no lo tiene, y las dos conviven sin gritar. Lo que falta se DERIVA de lo
-- que hay —`REQUERIDOS_ACTIVO` menos lo vinculado— y por eso no se guarda.
--
-- Nada se pierde: la fuente de las doce filas es la misma carpeta de Drive que ahora está leída
-- exhaustivamente, y volver a correr `legajos-sincronizar.mjs` las reconstruye si alguna vez el
-- archivo aparece.

delete from public.documentacion_legajo where drive_file_id is null;

-- Un documento del legajo es un PAPEL, y un papel tiene archivo. Cargar uno a mano sin enlace
-- vuelve a abrir la puerta a afirmar sin poder mostrar.
alter table public.documentacion_legajo alter column drive_file_id set not null;
alter table public.documentacion_legajo drop constraint if exists documentacion_legajo_presente_check;
