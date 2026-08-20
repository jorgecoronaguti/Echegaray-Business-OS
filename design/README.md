# /design — Handoff canónico del Echegaray Business OS

Fuente de verdad del DISEÑO APROBADO. Producido en Claude Design; consumido por Claude Code.

## Qué es
El **contrato visual y UX del Echegaray Business OS**: el diseño aprobado que hay que implementar, no una inspiración. Claude Code implementa esto con máxima fidelidad reutilizando la arquitectura funcional real del OS.

## Qué contiene
- `system/` — Design System: marca, color, tipografía, espaciado, interacción, layout, responsive, componentes, principios UX y referencias. Incluye `tokens.json` y `tokens.css`.
- `screens/` — especificación por pantalla aprobada (layout, zonas, componentes, estados, interacciones, permisos, responsive).
- `screens/visual/` — **representación visual de alta fidelidad**: los mockups aprobados, abribles y medibles en el navegador. Ver su `README.md`.
- `assets/` — logo oficial (isotipo y lockup horizontal).

## Cuál es la fuente de verdad visual
1. `system/` manda sobre cualquier captura.
2. Los tokens de color ya existen en la app: `echegaray-os/src/app/globals.css` + `tailwind.config.ts`. `tokens.json` los replica para herramientas de diseño; **si difieren, gana globals.css** y hay que corregir el JSON.
3. Las imágenes de referencia son referencia, no contrato.

## Cómo leerlo
`system/UX_PRINCIPLES.md` → `system/COLOR.md` + `TYPOGRAPHY.md` + `SPACING_BORDERS.md` → `system/COMPONENTS.md` → la pantalla que vas a implementar en `screens/`.

## Pantallas aprobadas
- Obra → Planificación → Gantt (`screens/planificacion-gantt.md`) — la más detallada.
- Obras: cartera, Gantt de cartera, alta en pasos, Resumen, Ejecución, Personal, Operación, Documentos (`screens/obras.md`).
- Administración: entrada, Personas, legajo, Cuadrillas, Proveedores, Pendientes de imputación, Usuarios (`screens/administracion.md`).
- Clientes: cartera y record del cliente (`screens/clientes.md`).
- Accesos: Mi cuenta, **Mi legajo · Mis horas · Mis documentos** (desktop + mobile), `/campo` mobile, chat interno por obra, Operación global y Herramientas (`screens/accesos.md`).

## Fuera del alcance actual (declarado, no pendiente)
Economía y Finanzas (certificaciones, flujo de caja, calendario financiero, ingeniería financiera, scorecard, aprobaciones, reportes), Descargas, Login/Signup y Operarios. No están diseñados a propósito: no se implementan desde este handoff.
El mobile diseñado es el alcance operativo: `/campo`, parte diario, Mi cuenta / Mis horas / Mis documentos. El ERP de escritorio no se lleva completo al teléfono.

## Regla de implementación
Claude Code debe implementar las pantallas aprobadas con máxima fidelidad visual y UX, reutilizando la arquitectura funcional real del Echegaray Business OS. No debe rediseñar ni reinterpretar el producto sin modificar primero el Design System aprobado.

Corolarios:
- No reemplazar los patrones aprobados por componentes genéricos ni volver al diseño actual de app.ecsas.com.ar.
- No eliminar funcionalidad real del OS para conseguir fidelidad visual: si la app tiene una capacidad válida que el diseño debe contener, se adapta al Design System.
- La seguridad no se resuelve ocultando UI: los permisos que este diseño refleja deben hacerse cumplir en DB/API/RLS.
- Si algo no está especificado, se resuelve con el Design System — no improvisando otro patrón.

## Estado
Design System ✅ · Tokens ✅ · Assets ✅ · Interacciones y responsive ✅ · Representación visual ✅ · Tipografía: decidida (IBM Plex Sans/Mono, ver `system/TYPOGRAPHY.md`) ✅ · Economía/Finanzas, Descargas, Login: fuera de alcance por decisión.
