# PRP-001 — Fundación + Flujo de Caja

Fecha: 2026-07-06

## Estado

PRP-001 (`.claude/PRPs/PRP-001-fundacion-flujo-de-caja.md`) en progreso. **Fase 0 (Fundación) y Fase 1 (Movimientos de Caja — Capacidad "Caja Operativa"): CERRADAS y validadas contra Supabase real** (proyecto `jdqbpchkjrxktcxndnho`). tsc/build/lint/Playwright en verde en ambas.

A partir de Fase 1, el enfoque de trabajo cambió por pedido del usuario: cada incremento debe construir una **capacidad real del negocio** (pensar desde el negocio antes que la tecnología), no solo entidades técnicas aisladas — Capacidad 1 fue "Caja Operativa".

## Capacidad 1 — Caja Operativa (Fase 1, 2026-07-06)

- Tabla `movimientos_caja`: una sola tabla para Cobro y Pago (`tipo` discriminador), no dos tablas separadas — decisión justificada por menor duplicación, cálculo de posición futuro más simple (`GROUP BY` en vez de `UNION`), y porque calza con cómo ya funciona el ledger real (tab "Compras" del Cash Flow actual, un registro plano). Contraparte resuelta con `cliente_id`/`proveedor_id`/`obra_id` nullable + CHECK según `tipo` (cobro exige cliente+obra; pago exige proveedor, obra opcional).
- Migración `supabase/migrations/20260706190257_flujo_caja_movimientos.sql` — aplicada vía MCP, GRANT a `authenticated` incluido desde el inicio (no repitió el bug de Fundación), verificada con datos de prueba (constraints de contraparte y de fecha real rechazan combinaciones inválidas correctamente).
- UI en `/caja`: formulario que cambia campos según `tipo` (cobro↔pago) y según `estado` (muestra "fecha real" solo si es "real"), listado de movimientos. Reutiliza los servicios de `fundacionService` para las listas de clientes/obras/proveedores/cuentas (no duplica esa data access).
- Fuera de alcance deliberado (no pedido, YAGNI): Factura/Certificado como entidades propias, cálculo de posición/saldo, cheques/echeqs, dashboards, reportes, P&L.
- Verificado antes de codear: estructura vigente del Sheet "Flujo de Caja - Cash Flow" (lectura puntual vía discovery-drive-echegaray, no discovery general) — confirma que los campos modelados (proyectado/real, fecha esperada vs. fecha de pago real, cliente/obra, proveedor, concepto, parcial vs. total) coinciden con lo que ya se usa hoy.

## Qué existe en Supabase real

- Proyecto real: Project Ref `jdqbpchkjrxktcxndnho`, URL `https://jdqbpchkjrxktcxndnho.supabase.co`.
- `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) — gitignored, nunca commiteado.
- MCP remoto oficial en `.mcp.json` (raíz), `https://mcp.supabase.com/mcp?project_ref=jdqbpchkjrxktcxndnho`, HTTP + OAuth, sin `read_only`, acceso completo. Confirmado funcionando (herramientas `mcp__supabase__*` verificadas: `get_project_url`, `get_publishable_keys`, `list_tables`, `list_migrations`, `apply_migration`, `execute_sql`, `get_advisors`).
- Tablas `clientes`, `obras`, `cuentas_financieras`, `proveedores` — creadas, RLS habilitado, verificadas con datos de prueba (insertados y borrados) contra FK, CHECK y trigger `updated_at`.
- 3 migraciones aplicadas y reconciliadas en `supabase/migrations/` con el mismo nombre/versión que `list_migrations` reporta: `20260706184601_fundacion.sql`, `20260706184700_fundacion_fix_function_search_path.sql`, `20260706184852_fundacion_grant_authenticated.sql`.

## Bugs reales encontrados y corregidos al validar contra Supabase real (no aparecían contra Postgres local)

1. **`set_updated_at()` con `search_path` mutable** (`get_advisors(security)`, lint `function_search_path_mutable`). Fix: `set search_path = ''` en la función.
2. **Faltaban GRANTs de tabla para `authenticated`** — la policy RLS `USING (true)` no alcanza sin el GRANT base; sin esto, `authenticated` tenía `permission denied` igual que `anon`. Esto **no se puede detectar en Postgres puro sin el setup de roles de Supabase** — es la razón concreta por la que "validar con Postgres local" (Incremento 1, primera pasada) no es sustituto de probar contra un proyecto real. Fix: `GRANT SELECT, INSERT, UPDATE, DELETE ON <tabla> TO authenticated` en las 4 tablas. `anon` se dejó deliberadamente sin GRANT (además de sin policy) — bloqueado en ambas capas.

## Verificación de acceso (autenticado vs. no autenticado)

- **No autenticado, HTTP real** (anon key vía REST): `401 permission denied` en SELECT e INSERT. Confirmado.
- **Autenticado**: verificado a nivel de rol de Postgres (`SET LOCAL ROLE authenticated`) — SELECT e INSERT funcionan. **No se probó con un JWT real de usuario** porque crear un usuario de prueba vía signup público chocó con el rate limit de emails por default del proyecto (`over_email_send_rate_limit`) — no se intentó más allá de 2 intentos para no insistir contra ese límite. Es una limitación de entorno documentada, no una duda sobre si RLS funciona: el rol `authenticated` es exactamente el rol al que un JWT real mapea, y ya se comprobó que ese rol tiene acceso correcto.
- **App real (`/fundacion`) sin sesión**: muestra `permission denied for table clientes` — correcto y esperado, porque no existe login todavía (feature separada, no construida en Fundación). Se corrigió el mensaje de la UI para no decir "Supabase no está configurado" en este caso (era engañoso) — ahora distingue "sin sesión autenticada, RLS bloqueando correctamente" de un error real de configuración, buscando `permission denied` en el mensaje de error.

## Decisión: RLS sin roles definidos

Las 4 tablas tienen una sola policy `authenticated_full_access` (acceso total para cualquier usuario autenticado, sin particionar por `user_id`). Correcto porque Echegaray Business OS no es multi-tenant. Revisar cuando existan roles internos (dueño / jefe de obra / administración) — ver skill `add-login`, latente.

## Aprendizaje operativo: MCP conectado a mitad de sesión no siempre expone sus tools de inmediato

Costó dos sesiones nuevas + un reload completo de VS Code para que las tools `mcp__supabase__*` aparecieran después de agregar/autenticar el servidor. Si un MCP server nuevo muestra `✔ Connected` en `claude mcp list` pero `ToolSearch` no encuentra sus tools, no asumir que el servidor está mal — probar primero con una sesión nueva, y si eso no alcanza, un reload completo de la ventana/extensión (no solo una pestaña de chat nueva).

## Housekeeping hecho de paso (sin tocar lógica funcional)

- `echegaray-os/.mcp.json` y `.claude/example.mcp.json`: entrada `supabase` actualizada del patrón legado (`npx` + PAT/service_role) al patrón remoto oficial.
- Skill `supabase`: nota agregada aclarando que este proyecto usa el MCP remoto oficial, para que no se fabrique un PAT como atajo si las tools vuelven a faltar.
- Migración local renombrada (`20260706161253` → `20260706184601`) para que el nombre/versión coincida exactamente con lo que Supabase registra en `list_migrations`.

## Próxima capacidad sugerida

Capacidad 2 candidata: Cheques y echeqs (Fase 2 del PRP) — evaluar primero si extiende `movimientos_caja` (nuevo valor de `tipo`, o tabla relacionada que la referencia) antes de proponer una tabla nueva independiente. Replicar siempre el GRANT explícito a `authenticated` desde el primer intento de la migración.
