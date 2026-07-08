---
name: correccion-producto-ux-1-a-5
description: Corrección fuerte de producto (2026-07-08) -- navegación por trabajo real (8 grupos), home de Dirección accionable, tablero de Obras, alertas humanizadas, página Operador Digital consolidada, badges de confianza/frescura. El OS pasa de "conjunto de módulos técnicos" a experiencia operativa mínima.
metadata:
  type: project
---

Fecha: 2026-07-08. Jorge revisó la interfaz real y marcó explícitamente que, pese al motor/datos/arquitectura ya construidos, la experiencia no servía para operar la empresa (navegación confusa, lenguaje técnico expuesto, formularios mal ubicados, Dirección teniendo que reconstruir la decisión navegando varias pantallas). Pidió 5 PRs concretos, en orden.

## PR UX-1 — Navegación y home de Dirección

**Navegación**: de 14 links planos a 8 grupos por trabajo real (Dirección, Finanzas, Obras, Operación, Administración, Recursos, Operador Digital, Sistema). Motor de Decisiones/Rutinas/Backlog Autónomo dejan de ser links de primer nivel -- pasan a ser secciones de una sola página (Operador Digital). Comercial y Compras se sacan del nav (siguen accesibles por URL) por no tener datos reales suficientes hoy -- cargado en backlog, no una decisión silenciosa.

**Home de Dirección** (`/dashboard`, ya la página post-login): de 8 secciones técnicas por categoría de alerta a 6 bloques que responden en <30s -- Decidir hoy (top 5 alertas), Riesgos abiertos por área (conteos), Caja (saldo actual + peor semana proyectada, con `ConfianzaBadge`), Obras (top 5 por riesgo económico), Acciones (vencidas/próximas), OS trabajando (backlog abierto + fuentes atrasadas). Cero cálculo nuevo -- todo ya existía (F1, Motor de Observación, backlog_autonomo, fuentes_datos), esta página solo sintetiza.

**Nueva página `/operacion`** (requerida por el grupo de nav): plan semanal + restricciones cross-obra, reutilizando `actividades_semanales` ya existente. Deliberadamente mínima -- materiales/herramientas/pedidos dependen de la fuente AppSheet "Pedidos de Materiales" (Jorge sin acceso todavía, ya registrada como fuente pendiente, no bloqueante).

## PR UX-2 — Obras como tablero de gestión

Nuevo módulo `src/features/obras/types/tableroObras.ts`: compone (sin SQL nuevo) `obra_resumen_economico` + `obra_hh_resumen` + `obra_ejecucion_financiera` + `actividades_semanales` en una fila por obra -- avance, HH real/estimada, costo real, margen actualizado, certificado/cobrado, salud económica. Reutilizado tanto en `/obras` (tablero completo) como en la home de Dirección (top 5).

Activas primero, después por severidad económica (crítico antes que sano) -- "¿cuál miro primero?", no orden alfabético.

"Contratar obra" (antes lo primero que se veía) pasa a `<details>` colapsado ("+ Nueva obra"), acción secundaria real, no decorativa.

## PR UX-3 — Alertas accionables

`AlertaCard`: "Confianza: calculado" suelto reemplazado por `ConfianzaBadge` (humano, con tooltip explicando qué significa). "Fuente: registros_hh / obra_hh_resumen" (lenguaje técnico crudo) se mueve a un `<details>` "Detalle técnico" -- la tarjeta principal ahora dice "Por qué pasa" / "Qué recomiendo", y muestra Responsable cuando la alerta ya fue convertida en Acción.

## PR UX-4 — Operador Digital

Página nueva `/operador-digital` consolida Motor de Decisiones (top 3 recomendaciones) + Rutinas (resumen diaria/semanal) + Backlog Autónomo (abiertos) + Fuentes con problema -- cada sección linkea a su página completa para el detalle técnico, sin duplicar lógica. Incluye un stub honesto de "Preguntarle al OS" (input deshabilitado, "Próximo: Motor de Solicitudes") -- explícitamente no se finge un chatbot que no existe.

## PR UX-5 — Confianza/frescura visible

`ConfianzaBadge` (`src/shared/components/ConfianzaBadge.tsx`): un componente reutilizable para `NaturalezaDato`, con label humano + explicación en tooltip + color. Aplicado en AlertaCard, Caja actual/Peor semana (home de Dirección) y Costo real (tablero de Obras). Reemplaza texto crudo tipo "estimado"/"inferido" sin contexto.

## Backlog UX generado (real, no inventado)

Ficha de obra individual (`/obras/[id]`) sigue sin la estructura de secciones pedida (Resumen/Economía/Producción/HH/Certificación/Costos/Adicionales/Riesgos/Acciones/Fuentes) -- próximo ciclo de UX natural. Motor de Solicitudes sigue siendo un stub. Comercial/Compras fuera del nav. Operación mínima por fuente pendiente.

## Tests

Actualizados: `dashboard.spec.ts`, `obras.spec.ts`, `nav-jerarquia-y-estado-activo.spec.ts` (estructura nueva). Nuevos: `direccion-home-casos-reales.spec.ts`, `obras-tablero-casos-reales.spec.ts`, `operacion.spec.ts`, `operador-digital.spec.ts`, `operador-digital-casos-reales.spec.ts` -- todos contra datos reales ya verificados (Pisos: 58% avance, 681/4047 HH, $3.105.500 costo real).

## Próximo paso natural

Ficha de obra individual con la estructura de secciones pedida -- es la pieza más grande que falta para que Obras se sienta como "gestionar producción", no solo un tablero de entrada.
