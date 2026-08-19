-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `obra_actividad.hh_real` SE RETIRA EN DOS PASOS, NO EN UNO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL ERROR QUE CORRIGE ═══
--
-- `20260819T2200` borró la columna de una. El razonamiento era correcto —0 filas cargadas de 344, y
-- tener un campo escrito a mano al lado de las horas imputadas de verdad en `registros_hh` es dos
-- números para el mismo hecho— pero el ORDEN estaba mal:
--
--   La base se cambia AHORA. El código se despliega DESPUÉS.
--
-- Entre las dos cosas, el código vivo de producción sigue mandando `hh_real` en cada alta y en cada
-- edición de una actividad del cronograma (`features/obras/services/actions.ts`). Contra una columna
-- que ya no existe, PostgREST devuelve `PGRST204` y GUARDAR UNA ACTIVIDAD DEJA DE FUNCIONAR en las
-- ocho obras. Una migración no puede romper la versión de la aplicación que está corriendo: el
-- orden que no rompe es primero el código que deja de usar la columna, después la columna.
--
-- Así que la columna VUELVE, vacía, y su retiro definitivo queda como un paso posterior al despliegue
-- —una línea: `alter table public.obra_actividad drop column hh_real`—.
--
-- ═══ QUÉ IMPIDE QUE VUELVA A SER UNA SEGUNDA VERDAD MIENTRAS TANTO ═══
--
-- Nada la escribe: el campo salió del panel de la actividad y de las dos acciones que la mandaban.
-- Y `orquestador/lib/hh-imputacion.test.mjs` vigila que siga VACÍA — si algo vuelve a cargarla, el
-- test se pone rojo y nombra la fila. Un comentario no habría impedido nada; un canario sí.
--
-- HH real por actividad la publica `obra_actividad_hh` sumando `registros_hh`. Ése es, desde hoy, el
-- único cálculo, y es el que leen Cronograma y Personal.

alter table public.obra_actividad add column if not exists hh_real numeric;

comment on column public.obra_actividad.hh_real is
  'RETIRADA (19/08/2026). Nadie la lee ni la escribe: HH real por actividad la publica obra_actividad_hh '
  'sumando registros_hh. Queda hasta que se despliegue el código que dejó de mandarla; después se borra.';
