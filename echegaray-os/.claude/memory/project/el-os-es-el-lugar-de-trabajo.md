---
name: el-os-es-el-lugar-de-trabajo
description: Corrección de rumbo (2026-07-09) -- el OS pasa de capa de lectura sobre Drive a lugar donde Echegaray realmente carga/modifica/da de baja datos, con permisos reales por rol y régimen autónomo diario reorientado a este objetivo.
metadata:
  type: project
---

Fecha: 2026-07-09. Jorge corrigió el rumbo del ciclo "Operabilidad Real": construir pantallas que **leen** datos que solo yo cargo manualmente desde Drive no tiene ninguna utilidad real -- nadie en Echegaray puede operar el OS por su cuenta. La misión pasa a ser: **el OS es el lugar donde Echegaray trabaja** -- Dirección dirige desde ahí, Operaciones (2 personas) gestiona obras desde ahí, Administración ejecuta/controla procesos desde ahí, Campo con interfaces mínimas, Operador Digital observa/investiga/mejora todo.

## Hallazgo real que motivó la corrección

Verificado con SQL directo contra Supabase (no supuesto):
- Las 26 tablas de `public` tenían RLS habilitada, pero **11 de ellas** (`adicionales`, `certificados`, `clasificaciones_costo_obra`, `clientes`, `compras`, `costos_reales`, `obras`, `partidas_presupuesto`, `post_mortems`, `presupuestos`, `proveedores`) usaban una única policy `authenticated_full_access` (`using(true)`) -- sin diferenciación de rol, pese a que `perfiles.rol` (`direccion`/`administracion`/`jefe_obra`) ya existía desde PR5. Las otras 15 (`acciones`, `registros_hh`, `movimientos_caja`, `obligaciones`, `personas`, `equipos`, etc.) sí usaban `current_rol()` correctamente -- el gap no era total, pero sí real en tablas centrales (obras, costos, compras).
- **Cero tablas** tenían `creado_por`/`actualizado_por`/`actualizado_en` -- no había forma de saber si un dato lo cargó una persona real o yo leyendo un Sheet.
- `fuentes_datos` modela las 23 fuentes como si el origen fuera siempre Drive (`drive_file_id`/`drive_url`); no existía el concepto "esto se carga nativo en el OS".

## Corrección de esquema (fundación, antes de tocar pantallas)

Dos migraciones aplicadas:
1. `20260709140000_fundacion_trazabilidad_roles.sql`: agrega `creado_por`/`actualizado_por`/`actualizado_en` (con trigger `set_actualizado_en()`) a las 26 tablas vía `DO` block dinámico; extiende `perfiles_rol_check` para admitir `'campo'` (sin fabricar ninguna cuenta).
2. `20260709141500_rls_diferenciada_gap_tablas.sql`: reemplaza `authenticated_full_access` en las 11 tablas gap por policies `_select`/`_write` siguiendo el patrón ya validado de PR5 (`current_rol()`). `obras` y `adicionales` distinguen jefe_obra (puede insertar/actualizar) de dirección/administración (puede eliminar/aprobar), reflejando el flujo real de detección de adicionales del CLAUDE.md raíz.

Suite completa corrida en `--workers=1` tras ambas migraciones: 71 passed, 0 failed (RLS nueva no bloqueó ningún flujo existente).

## Auditoría de qué ya tenía alta/modificación nativa (evitar duplicar trabajo)

Antes de construir nada, se verificó qué dominios ya tenían `actions.ts` con `'use server'`: **HH, Compras, Costos Reales, Movimientos de Caja, Obligaciones, Presupuestos, Certificados (vía `ejecucion-financiera`), Adicionales, Clientes/Proveedores/Cuentas Financieras (vía `fundacion`), Acciones, Post-Mortem y Actividades Semanales YA tenían formularios reales construidos en ciclos anteriores** -- reconstruirlos hubiera duplicado trabajo (regla explícita del CLAUDE.md técnico). Los únicos dos dominios sin ningún camino de escritura eran **Personas** y **Equipos**.

## Alta/modificación/baja nativa construida este ciclo

- **Personas** (`src/features/personas/`): `personaInputSchema`/`actualizarPersonaInputSchema` (zod), `insertPersona`/`actualizarPersona`, `PersonaForm` (alta de legajo) y `PersonaActualizarForm` (categoría/especialidad/retribución/**fecha de baja**/notas) montados en `/personas` dentro de `<details>` colapsables por fila. La baja no es una decisión laboral tomada por el OS -- es el registro de una decisión ya resuelta fuera (Art. 245 LCT), igual que el resto del legajo.
- **Equipos** (`src/features/equipos/`): `equipoInputSchema`, `insertEquipo`/`eliminarEquipo`, `EquipoForm` y `EliminarEquipoForm` montados en `/equipos`. Equipos cargados nativo se marcan `fuente_legacy = 'OS'`, distinguibles de los 6 vehículos reales descubiertos en Drive.

Ambos probados con tests de negocio reales (`tests/personas-alta-baja.spec.ts`, `tests/equipos-alta-baja.spec.ts`) con auto-sanación, sin alterar los conteos reales ya verificados (30 legajos, 6 vehículos). Scorecard actualizado con evidencia: Personas y Equipos 2→3.

## Régimen autónomo diario reorientado

El cron diario (piloto de 7 días, `CronCreate`, session-scoped) se relanzó con la misión corregida: cada corrida debe identificar UNA fuente todavía dependiente de lectura manual/Drive y construirle alta/baja/modificación nativa, en orden de prioridad por frecuencia×criticidad real (`fuentes_datos`) -- ya no "buscar mejoras" en abstracto ni proponer integraciones externas (bancos, ARCA quedan explícitamente descartados como prioridad). Techo de autonomía confirmado por Jorge: nunca ejecutar solo un movimiento de caja real, contrato, decisión de personas o integración externa -- siempre pasa a `acciones` (origen='sistema') para decisión humana. Construir el *formulario* para que una persona real cargue esos datos sí es de bajo riesgo y se hace directo.

**Límite honesto de este mecanismo**: `CronCreate` es session-scoped (muere si se cierra la sesión, expira solo a los 7 días). No es automatización durable -- la alternativa real (cron de sistema operativo invocando `claude -p` headless) queda pendiente de que Jorge la confirme, por tocar su máquina.

## Próximo paso natural

Seguir la lista de prioridad ya declarada en la misión del cron: Movimientos de caja/Costos/Compras (ya tienen formulario, falta confirmar que reemplacen en la práctica la lectura de Control de Gastos/Flujo de Caja) → Presupuestos/Certificados/Adicionales (formulario ya existe, falta uso real) → cuentas institucionales reales para que Operaciones/Administración/Campo dejen de depender de la única cuenta de prueba existente.
