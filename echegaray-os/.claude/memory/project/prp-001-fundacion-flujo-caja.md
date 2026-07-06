# PRP-001 — Fundación + Flujo de Caja

Fecha: 2026-07-06

## Estado

PRP-001 (`.claude/PRPs/PRP-001-fundacion-flujo-de-caja.md`) en progreso. Fase 0 (Fundación), Incremento 1 completado y verificado (tsc, build, lint, Playwright en verde).

## Qué se construyó en el Incremento 1

- Migración `supabase/migrations/20260706161253_fundacion.sql`: tablas `clientes`, `obras`, `cuentas_financieras`, `proveedores`, con RLS habilitado.
- Tipos + Zod en `src/features/fundacion/types/`.
- Servicios en `src/features/fundacion/services/fundacionService.ts` (data access) y `actions.ts` (Server Actions).
- UI mínima en `src/app/(main)/fundacion/page.tsx` con forms por entidad.
- Tests en `tests/fundacion.spec.ts` (Playwright).

## Decisión: RLS sin roles definidos

Las 4 tablas tienen una sola policy `authenticated_full_access` (acceso total para cualquier usuario autenticado, sin particionar por `user_id`). Esto es correcto porque Echegaray Business OS no es multi-tenant — es una sola empresa. Revisar esta policy cuando existan roles internos (dueño / jefe de obra / administración) — hoy no están definidos (ver skill `add-login`, latente).

## Decisión: no hay proyecto Supabase real conectado todavía

No existe `.env.local`, ni un proyecto Supabase real, ni Docker instalado (no se puede correr `supabase start` para desarrollo local completo). Esto es un bloqueante real para probar el flujo end-to-end con datos reales, no algo que se deba resolver inventando credenciales.

**Cómo se validó sin esto**: se usó Postgres local (Homebrew, `postgresql@16`, ya corría en la máquina) para aplicar la migración en una base descartable y confirmar que el DDL es válido (constraints, FKs, triggers) — ver `reference/validar-sql-sin-supabase-live.md` para el procedimiento repetible. Esto NO valida RLS con `auth.uid()` real (Postgres puro no tiene el esquema `auth` de Supabase).

**Pendiente real**: cuando exista un proyecto Supabase (o el usuario decida instalar Docker para desarrollo local completo), aplicar todas las migraciones ahí y correr `get_advisors(type: "security")` vía el MCP de Supabase para confirmar RLS efectivo. Sin esto, el módulo de Flujo de Caja no puede probarse con datos reales — es la razón por la que los tests de Playwright de Fase 0 verifican degradación correcta (mensaje de error claro) en vez de un CRUD real contra la base.

## Próximo incremento sugerido

Incremento 2: Cobro y Pago (real/proyectado) ligados a Cliente/Obra/Proveedor/Cuenta financiera — Fase 1 del PRP. Ver skill `cash-flow-operativo` para las reglas de negocio antes de modelar estas tablas.
