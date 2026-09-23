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

## Toda tabla nueva nace con grant (Supabase, 30/10/2026)

Supabase ya no expone por la Data API lo que `postgres` crea en `public` sin `grant` explícito; en
esta base es así desde 20260818T2330 (`pg_default_acl` sólo reparte a `service_role`). Desde
20260923T2000 los privilegios por defecto también reparten a `authenticated`, pero un default es una
red, no un contrato. **Cada `create table` en `public` lleva, en la misma migración, las tres cosas:**

```sql
create table public.cosa (…);
alter table public.cosa enable row level security;
create policy cosa_lee on public.cosa for select to authenticated using (…);
grant select, insert, update, delete on public.cosa to authenticated;   -- lo que la política permite, no más
```

- **RLS no es GRANT**: la política dice QUÉ filas; el grant dice SI PUEDE mirar la tabla. Con grant y
  sin política, cero filas; con política y sin grant, «permission denied»; con grant y sin RLS, todo.
- `service_role` ya lo tiene por defecto; `anon` NUNCA por defecto: se le da a mano, con motivo.
- **Una columna nueva nace sin permiso** cuando la tabla tiene grant POR COLUMNA (`banco_movimientos`,
  `cobranzas`, `documento_espejo_corrida`, `obra_economia_sheet`, `recupero_art`): el
  `alter table … add column` lleva su `grant select (columna)`.
- `supabase/migrations/grants.test.mjs` lee toda migración posterior a 20260923T2000 y falla si crea
  una tabla sin las tres cosas. Corre con la suite (`npm run orq:test`).

## Verificación

La evidencia es el dato leído en su destino: la tabla consultada después de aplicar, no la pantalla
que respondió que sí.

## Reproducibilidad (hardening 22/08/2026)

La cadena entera se reproduce desde una base VACÍA sin intervención manual:

1. `supabase/bootstrap/entorno-plataforma.sql` — como superusuario: lo que en hosted pone la
   plataforma (pg_cron, `auth.users`, funciones `auth.*` versión hosted, storage mínimo,
   privilegios por defecto angostos).
2. `node orquestador/scripts/reconstruir-desde-cero.mjs --url postgres://…` — la cadena con
   constancia en `public.migracion_aplicada`. `--con-semilla` agrega identidades y Base Maestra
   mínimas (SÓLO entornos de prueba).

Reglas que la reconstrucción impuso:

- **El nombre del archivo ES la posición en la cadena.** Una migración que usa un objeto creado
  después no falla en producción (se aplicó a mano en otro orden) pero corta la reconstrucción.
- **Ningún objeto se crea por fuera de migrations.** Lo que un script cree en runtime con
  if-not-exists también se escribe en la cadena (constancia), como hizo `20260822T1500`.
- El ledger es `public.migracion_aplicada` (258/258 con constancia desde el 22/08/2026);
  `aplicar-migracion.mjs --estado` delata archivos editados después de aplicarse.
