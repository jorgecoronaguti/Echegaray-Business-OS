---
name: rls-sin-policy-falla-en-silencio
description: Una tabla con RLS habilitado pero sin policy para un comando específico (ej. DELETE) no da error -- simplemente afecta 0 filas en silencio. Si un cleanup de test "no da error" pero el dato sigue ahí, sospechar de esto antes que de un bug de lógica.
metadata:
  type: feedback
---

Encontrado el 2026-07-08 auditando por qué varios tests con cleanup en `finally` (con try/catch correctos, sin crashear) seguían dejando residuo real en `acciones` y `backlog_autonomo` después de correr limpio.

**Causa real:** `acciones` tenía policies de SELECT/INSERT/UPDATE pero ninguna de DELETE. Postgres con RLS habilitado deniega por defecto cualquier comando sin policy que lo cubra explícitamente -- y Supabase/PostgREST no lo reporta como error: el `DELETE` "tiene éxito" pero afecta 0 filas. `backlog_autonomo` sí tenía una policy `for all` (cubre delete), así que ese cleanup funcionaba -- la asimetría entre las dos tablas fue lo que hizo el bug difícil de encontrar a primera vista.

**Por qué importa más allá de los tests:** ni siquiera `direccion`/`administracion` podían borrar una acción mal creada a través de la app -- no era solo un problema de testing, era un gap real de funcionalidad. Corregido con una policy `eliminacion_acciones` (mismo criterio que la de UPDATE ya existente).

**Cómo aplicar:** cuando un cleanup de test (o cualquier DELETE/UPDATE desde el cliente) "no tira error" pero el dato sigue existiendo, verificar primero `select polname, polcmd from pg_policy where polrelid = '<tabla>'::regclass` antes de asumir un bug de lógica en el código. Revisar también si la tabla necesita esa policy para uso real de la app, no solo para el test -- muchas veces sí.
