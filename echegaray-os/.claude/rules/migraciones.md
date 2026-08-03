---
paths:
  - "supabase/migrations/**"
---

# Migraciones

## La trampa que ya costó medio día

**Una migración en el repo no es una migración aplicada.** El archivo commiteado y la base real son
dos cosas distintas: una guarda de formato quedó apagada medio día porque el `.sql` existía y nadie
lo había corrido. Peor: el mensaje de arranque cuando la tabla no existe es igual al del arranque
normal, así que el sistema parecía sano.

Antes de dar por hecho que algo está vigente, consultarlo en la base — no en `migrations/`.

## Reglas

- **RLS habilitada siempre.** Una tabla sin policy no da error: devuelve cero filas. Un cero por
  falta de policy es indistinguible de un cero real.
- **Un índice único declarado sobre columnas que aceptan NULL no restringe nada.** Ya vivió sobre
  206 NULLs sin quejarse una vez.
- Las migraciones **no se aplican desde un hook ni desde un agente**: tocan datos productivos.
- Una migración vacía se bloquea en el cierre. Si el archivo está, tiene que decir algo.

## Verificación

La evidencia es el dato leído en su destino: la tabla consultada después de aplicar, no la pantalla
que respondió que sí.
