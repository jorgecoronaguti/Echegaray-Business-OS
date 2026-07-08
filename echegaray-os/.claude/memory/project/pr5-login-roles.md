---
name: pr5-login-roles
description: PR5 — Login real (Supabase Auth) + roles (Dirección/Administración/Jefe de Obra) + RLS diferenciada por rol, validado con una cuenta real y pruebas autenticadas reales (no sintéticas).
metadata:
  type: project
---

Fecha: 2026-07-08. Cierra el ciclo O1-B→O1-C→O1-D→Centro de Acción 2.0→Login.

## Qué se construyó

- `perfiles` (id→auth.users, rol, nombre) + función `current_rol()` (security definer, restringido a `authenticated` tras el hallazgo del linter).
- Middleware de sesión (`src/middleware.ts`) — sin esto, `@supabase/ssr` no refresca el token en Server Components y la sesión se corta sola.
- Login/Signup reales (`features/auth/`) sobre el scaffold vacío que ya existía (`(auth)/login`, `(auth)/signup` eran solo placeholders con `.gitkeep`, sin ninguna lógica).
- RLS reescrita por rol en las tablas donde "mínimo privilegio" importa de verdad: financieras (`movimientos_caja`, `obligaciones`, `aplicaciones_pago`, `cuentas_financieras` — escritura solo `direccion`/`administracion`) y operacionales (`actividades_semanales`, `registros_hh` — escritura también `jefe_obra`). `acciones`: lectura+creación abierta, resolución solo `direccion`/`administracion`.

## Alcance explícitamente NO cubierto (gap declarado, no escondido)

- Lectura sigue abierta a cualquier autenticado en TODAS las tablas — decisión deliberada dado el tamaño del equipo, no un descuido.
- 10 tablas siguen con la policy vieja `authenticated_full_access` sin diferenciar por rol: clientes, proveedores, obras, presupuestos, partidas_presupuesto, costos_reales, adicionales, certificados, compras, post_mortems.
- No existe vínculo real "jefe de obra → su obra específica" (responsable sigue siendo texto libre) — un jefe_obra puede escribir actividad semanal/HH de cualquier obra, no solo la suya.

## Auditoría RLS real (no solo afirmada)

`get_advisors(type=security)` corrido después de aplicar la migración encontró 2 hallazgos reales, ambos resueltos o documentados en el momento:
1. `current_rol()` era ejecutable por el rol `anon` (sin sesión) vía RPC — corregido revocando `execute` de `public`/`anon`, dejando solo `authenticated`.
2. `acciones.creacion_autenticados` y las 10 tablas sin diferenciar quedan con `WITH CHECK (true)` — señalado por el linter como "permissive", aceptado conscientemente para este incremento (ver gaps arriba).

## Pruebas autenticadas reales (no solo "sin sesión no crashea")

Se creó una cuenta real vía el flujo real de signup (`jorge.o.corona+direccion-test-...@gmail.com`), confirmada por SQL (Supabase requiere confirmación de email; no hay acceso a ese inbox real desde acá, así que se marcó `email_confirmed_at` directamente — equivalente a lo que hace el link del mail). Se validó, con sesión real:

- **Lectura permitida** (autenticado, cualquier rol): `/caja` no muestra el banner de RLS.
- **Escritura operación permitida** (`jefe_obra`): pudo crear una actividad semanal real en Pisos.
- **Escritura financiera denegada** (`jefe_obra`): intentar crear un `movimiento_caja` devolvió el error real de RLS de Postgres, visible en la UI.
- **Escritura financiera permitida** (`administracion`, mismo usuario, rol reasignado vía SQL): el mismo formulario, el mismo usuario, ahora sí insertó el movimiento — confirma que la diferencia es el rol, no la sesión.

El 4to caso quedó como `test.skip` documentado en `tests/auth-roles.spec.ts` (no automatizado permanentemente: requeriría credenciales de service role dentro del test, que la app nunca expone al cliente por diseño). Los datos de prueba generados (movimiento y actividad "Prueba E2E...") se borraron después de validar — no quedan mezclados con los datos reales de Pisos/Galpones.

## Próximo paso natural (no implementado en este PR)

Vincular `responsable` de `actividades_semanales`/`obras` a un usuario real (FK a `perfiles`) para poder acotar la escritura de un jefe de obra a sus propias obras — hoy es solo texto libre.
