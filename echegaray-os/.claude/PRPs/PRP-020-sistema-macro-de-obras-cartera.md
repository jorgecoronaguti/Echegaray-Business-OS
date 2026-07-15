# PRP-020: Sistema macro de obras (cartera / portfolio)

> **Estado**: PENDIENTE — 2026-07-15
> **Subordinado a**: OBJETIVO ESTRATÉGICO del `CLAUDE.md` raíz — crecer manteniendo control económico y operativo; "muchas obras sin capacidad de control es riesgo, no escala".
> **Se apoya en**: PRP-019 (ficha por obra) — el macro agrega lo que la ficha muestra por obra.

---

## Objetivo

Una vista **macro de todas las obras** (cartera) que responda de un vistazo: ¿cuánto tengo contratado y por ejecutar (backlog), cuánto margen esperado vs real en curso, dónde está el capital de trabajo comprometido, qué obras están en riesgo, y dónde asignar personas/equipos/caja. La foto de portfolio que Dirección necesita para priorizar.

## Por qué

| Problema | Solución |
|---|---|
| Se ven obras sueltas, no la CARTERA como sistema económico | Tablero macro: backlog contratado, margen ponderado, riesgo por obra, caja comprometida |
| No hay dónde decidir asignación de recursos entre obras | Ranking por margen/riesgo/avance; capacidad vs demanda |
| Crecer sin control de cartera = riesgo | Alerta temprana a nivel portfolio (concentración de cliente, obras en pérdida, caja atada) |

**Valor**: mejor SELECCIÓN y ASIGNACIÓN (capacidades 3 y 9 del CLAUDE.md); protege margen y caja a nivel empresa, no obra por obra.

## Estado real verificado (NO reconstruir)

- `obras` (4: Galpones cerrada, Galpón 9/Pisos/Cambio de Pisos pausadas), con estado y `monto_contratado`. Módulos de cálculo por obra ya existen (PRP-017).
- `desviosObras()` ya agrega desvíos de todas las obras; el "cuadro económico — todas las obras" (chat) es el germen textual de este macro.
- Estados de obra hoy: `contratada/pausada/cerrada` — la mayoría **pausada**: la cartera real necesita entender el porqué (dato del dueño) para no proyectar mal.
- **Gap**: no hay agregación de portfolio (backlog contratado total, margen ponderado, capital de trabajo comprometido, concentración por cliente) ni vista macro.

## Fases

- **F1 — Métricas de cartera**: calcular (determinístico) sobre todas las obras: backlog contratado (contratado − certificado/facturado), margen esperado vs real ponderado por monto, costo real acumulado, y concentración por cliente. Reusa `obra-economics`.
- **F2 — Tablero macro**: vista web con la cartera: por obra una fila con estado, contratado, margen, avance físico, desvío y semáforo; totales y ranking por riesgo/margen. Linkea a la ficha (PRP-019).
- **F3 — Riesgo de cartera**: alertas a nivel portfolio — obras en pérdida, cliente concentrado, caja de trabajo atada, muchas obras pausadas. Alimenta la vigilancia y el briefing.
- **F4 — Asignación de recursos**: cruzar capacidad (personas/equipos) con demanda de las obras activas; señalar sobre/sub-asignación. Requiere dato de recursos (dependencia de datos, activar cuando exista).
- **F5 — Selección (pipeline)**: extender a oportunidades no contratadas (pipeline ponderado) para decidir qué obras aceptar — cierra "seleccionar mejores obras". Requiere registrar pipeline.

## Criterios de éxito
- [ ] Un tablero muestra la cartera completa con backlog contratado, margen esperado vs real y semáforo de riesgo por obra.
- [ ] Los totales cuadran con la suma de las fichas individuales (sin duplicar cálculo).
- [ ] La vigilancia/briefing incorpora al menos una alerta de nivel cartera (ej. concentración de cliente, N obras pausadas).

## Dependencias y acción del dueño
- Reusa PRP-017/019. F4 necesita dato de recursos; F5 necesita registrar pipeline.
- Acción del dueño: aclarar el estado real de las obras pausadas (conflicto con cliente vs pausa técnica) — cambia cómo se proyecta la cartera.

## Riesgos
- No inventar métricas de portfolio sobre dato ausente: activar cada métrica cuando su dato tenga confianza (16/22 dominios aún en N1-3). Mostrar DESCONOCIDO antes que un número lindo pero falso.
