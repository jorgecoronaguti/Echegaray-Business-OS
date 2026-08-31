# XSAS — el baseline congelado antes de la segunda campaña

Medido el 2026-08-31 sobre `main @ 16f348df`, que es el commit que corre en producción. Existe para
una sola cosa: que al final se pueda comparar contra algo que no escribí después de saber el
resultado. Un baseline anotado a posteriori no es un baseline.

## Veredicto de partida

**FAIL · 12 de 24 demostradas.** El instrumento que produjo este número es
`orquestador/lib/cotizador/dod.mjs`, y su regla es que lo que no se midió nunca suma al numerador.

## Las doce que SÍ estaban demostradas

| # | criterio | la medición |
|---|---|---|
| 2 | reconstruye alcance | 26 partidas con estado, 0 sin decidir |
| 5 | usa composiciones | 26 resueltas, 0 incompletas que hayan costado cero |
| 7 | estima HH/productividad | 3.697,69 h |
| 10 | calcula costo directo | afirmado en 2 casos |
| 13 | deriva precio | coeficiente derivado, y no escribible (se probó intentándolo) |
| 14 | declara incertidumbre | 0 sin declarar |
| 15 | genera cotización versionada | congelada inmutable, oferta deriva de la congelada |
| 16 | pasa presupuesto a obra | 1 obra con genealogía |
| 17 | captura real | 25 relaciones partida↔actividad |
| 18 | compara Plan vs Real | 2 comparaciones, 0 causas inventadas |
| 19 | genera aprendizaje candidato | 5 generados |
| 20 | valida/promueve con governance | 0 promovidos, 5 rechazados por gobernanza |

**No se reabren.** El pedido es explícito: no reabrir componentes con PASS salvo defecto demostrado.

## Las tres en rojo

| # | criterio | la medición que lo puso en rojo |
|---|---|---|
| 1 | entiende proyectos heterogéneos | 4 proyectos distintos pero sólo **2 formatos** llegan al motor |
| 8 | gestiona precios autónomamente | **0 resueltos autónomamente** · 49 ya vigentes · 56 necesitan humano · sobre 107 recursos |
| 24 | auditor independiente PASS | firmó `PASS_CON_LIMITACIONES`, no `PASS` |

## Las nueve sin ejercitar, y por qué

Cuatro porque **ninguna corrida las alcanzó**: #4 selector de partidas, #6 explosión de recursos,
#21 reutilización de aprendizaje — y #3 cómputo con evidencia, que tiene una razón más precisa: las
26 partidas traen cantidad pero ninguna trae evidencia, fuente ni nota, porque vienen cargadas en la
cotización en vez de reconstruidas de un documento.

Cinco porque **el dato todavía no existe o el término no lo contesta ninguna consulta**:

- **#9 subcontratos** — no hay un solo subcontrato cargado. Cero subcontratos no es «los maneja mal».
- **#11 indirectos** — 14 conceptos catalogados y ninguna cotización los usa: el indirecto sigue
  entrando por el porcentaje de la política.
- **#12 política versionada** — las versiones existen y ninguna cotización las referencia: la
  cascada sigue tomando la vigente.
- **#22 funciona sin Claude** — el cero de `llamadas_llm` es **estructural**: `correr()` cablea
  `llamadasLLM: []`, así que el término no puede decir que no. El hecho de fondo es cierto y está
  probado, pero por otro lado (`sin-llm.test.mjs`).
- **#23 generaliza** — los 5 casos corren de punta a punta, pero «nadie aflojó un umbral para que
  cierren» no lo contesta una consulta: lo sostienen el diff auditado y las mutaciones corridas.

## Las huellas de los cinco casos, congeladas

Son la prueba de reproducibilidad: si al final una cambia sin que haya cambiado su entrada, algo se
movió que nadie declaró.

| caso | huella de entradas | llamadas al modelo |
|---|---|---|
| QUATTROPANI (real) | `592b54c554c9b299` | 0 |
| LA ESTRELLA (ciego) | `0727882052238013` | 0 |
| DOC INCOMPLETA | `b0aa5dc8e90fe32c` | 0 |
| CÓMPUTO MANUAL | `ded40c1e09eaff51` | 0 |
| ARCOR | `56982dd9b778b244` | 0 |

**RUN1 = RUN2 en las cinco.**

## Lo demás que estaba medido

- Suite: 12.756 tests, exit 0.
- Producción: `16f348df`, cinco servicios activos.
- 170 documentos en la biblioteca: 113 planilla, 49 OOXML, 7 OLE2, **1 PDF, 0 CAD**.
- Quattropani: 10 documentos, **ningún plano**. Su `COMPUTO.xlsx` está en etapa `NO_LEIDO`.
- Plan vs Real: 25 relaciones, 406 observaciones, **2 comparables**, 5 candidatos, 0 validados.
- Base Maestra: 6 pares posiblemente duplicados, T1075.1 vs T1111.0 a factor 2,25, **0 de 205**
  declara cuadrilla.
- Seguridad: **187 de 196 tablas** vaciables con `TRUNCATE` por cualquier autenticado, y las tablas
  nuevas nacen así.
