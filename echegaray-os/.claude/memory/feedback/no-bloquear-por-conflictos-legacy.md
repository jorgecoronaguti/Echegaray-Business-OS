---
name: no-bloquear-por-conflictos-legacy
description: Ante inconsistencias entre archivos legacy, proponer una resolución con criterio profesional y seguir avanzando — no tratar cada conflicto como pregunta bloqueante para Jorge.
metadata:
  type: feedback
---

Cuando la extracción de datos (PR0-A y similares) detecta inconsistencias internas entre fuentes legacy, **no tratarlo automáticamente como motivo para frenar y preguntar**. Aplicar los criterios de fuente de verdad ya establecidos (proximidad al hecho económico, trazabilidad, nivel de detalle vs. agregado, actualización/recencia, consistencia) para proponer una resolución, marcarla explícitamente como **INFERENCIA/RECOMENDACIÓN** (nunca como HECHO), explicar el riesgo de esa elección, y seguir adelante con el flujo. Reservar la escalada a Jorge solo para preguntas de hecho de negocio genuinamente irreducibles (que ningún documento puede responder) — y ni siquiera ahí frenar todo el proceso: cargar con un flag explícito de confianza baja y continuar.

**Por qué**: Jorge lo dijo directamente después de que le presenté 4 preguntas de checklist como bloqueantes tras una ronda de extracción con varios conflictos de datos: *"es que justamente este tipo de cosas son las que quiero que detectes y vayamos mejorando, no que te frenen."* Quiere que el proceso de construcción del OS demuestre valor resolviendo/mejorando datos legacy desordenados con criterio profesional, no pausando en cada discrepancia. Coincide con el principio "jugar a ganar" del CLAUDE.md raíz (decidir desde el objetivo, no desde cada obstáculo) y con que el aprendizaje puede iniciarse en cualquier punto de la operación — detectar inconsistencias es el aporte de valor, escalar todo no lo es.

**Cómo aplicar**: ante cifras en conflicto entre fuentes, primero evaluar: (1) cuál es más granular/trazable a transacciones individuales vs. una celda de resumen o snapshot manual, (2) cuál se actualizó más recientemente / es más probable que esté viva vs. desactualizada, (3) si ambas cifras representan conceptos genuinamente distintos (en cuyo caso ambas coexisten sin conflicto real). Solo escalar lo que quede después de ese análisis — hechos operativos que ningún documento puede confirmar. Ver [[pr0-linea-base-echegaray]] para el caso concreto donde se aplicó esto por primera vez (cheques a cubrir/cobrar, jornales).
