---
name: tests-autenticados-deben-autolimpiarse
description: Todo test Playwright que hace una escritura real autenticada (no bloqueada por RLS) debe crear su propio fixture identificable y borrarlo en el mismo test -- nunca operar sobre "la fila real que aparezca primero".
metadata:
  type: feedback
---

Regla, no sugerencia: cualquier test que hace login real y después escribe algo que RLS permite (no queda bloqueado) tiene que limpiar su propio dato en el mismo test, en un bloque que corra siempre (try/finally o al final del test mismo).

**Por qué:** el 2026-07-08 se encontró que 3 tests reales (`auth-roles.spec.ts` x2, `backlog-autonomo-conversion.spec.ts`) llevaban corridas insertando/mutando datos reales sin limpiarse: 7 actividades semanales de basura acumuladas en la obra real Pisos, 2 movimientos de caja reales falsos (uno de ellos apareciendo en el forecast de F1 que ve Jorge), y — el más serio — 3 ítems reales de `backlog_autonomo` convertidos en 3 `acciones` reales como efecto secundario de correr la suite, no como decisión deliberada. Ninguno de estos era intencional; se acumuló en silencio durante varias sesiones porque cada test asumía que su escritura sería bloqueada por RLS o no se molestaba en limpiar.

**Cómo aplicar:**
- Si el test usa una cuenta con permisos de escritura reales (`direccion`/`administracion` en la cuenta de prueba compartida), asumir que CUALQUIER insert va a persistir de verdad.
- Usar un marcador distintivo y greppable en el campo de texto principal (ej. `Prueba E2E ${Date.now()}`) para poder ubicar y borrar exactamente esa fila, nunca "la primera" o "la última".
- Si el test verifica una conversión/transformación de un dato ya existente (ej. backlog -> acción), crear el propio fixture sintético primero -- no operar sobre datos reales de gestión que ya estén en la tabla, porque una vez que existen rutinas autónomas poblando esas tablas (ver [[continuidad-operacional-datos]]), "la fila que aparezca primero" deja de ser predecible y pasa a ser un ítem real.
- Usar `@supabase/supabase-js` con las mismas env vars públicas de la app (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`) para el cleanup directo cuando no exista una acción de UI para borrar — `playwright.config.ts` ya carga `.env.local` al proceso de test para esto.
- Los tests que nunca inician sesión (RLS bloquea todo) no necesitan este cuidado -- ahí el bloqueo mismo es la garantía.
