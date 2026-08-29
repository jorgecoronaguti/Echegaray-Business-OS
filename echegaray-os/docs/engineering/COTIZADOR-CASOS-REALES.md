# COTIZADOR — LOS CASOS REALES

Generado por `orquestador/scripts/cotizador-casos-reales.mjs` el 2026-08-29.
Documentos y conocimientos de `orquestador/datos/conocimiento/biblioteca.json`; partidas, análisis
y precios de las tablas reales. **Ninguna corrida llamó a un modelo.**

## El cuadro

| | QUATTROPANI (real) | LA ESTRELLA (ciego) | DOC INCOMPLETA | CÓMPUTO MANUAL |
|---|---|---|---|---|
| **documentos del corpus** | 10 | 14 | 2 | 0 |
| **conocimientos leídos** | 57 | 0 | 0 | 0 |
| **partidas** | 26 | 1 | 26 | 0 |
| **· incluidas por alcance** | 26 | 1 | 26 | 0 |
| **· excluidas por contrato** | 0 | 0 | 0 | 0 |
| **· sin decidir** | 0 | 0 | 0 | 0 |
| **cantidades resueltas** | 26 / 26 | 1 / 1 | 26 / 26 | 0 / 0 |
| **cobertura de cómputo** | 100.0 % | 100.0 % | 100.0 % | — |
| **composiciones resueltas** | 26 / 26 | 1 / 1 | 26 / 26 | 0 / 0 |
| **recursos explotados** | 110 | 7 | 110 | 0 |
| **· sin precio** | 3 | 0 | 3 | 0 |
| **precios vigentes / vencidos / faltantes** | 139 / 89 / 3 | 4 / 3 / 0 | 139 / 89 / 3 | 0 / 0 / 0 |
| **HH previstas** | 3.697,691 h | 50,4 h | 3.697,691 h | 0 h |
| **FALTA_DATO en la cola** | 2 | 0 | 0 | 0 |
| **CONFLICTO en la cola** | 1 | 0 | 0 | 0 |
| **bloqueantes** | 95 | 3 | 92 | 0 |
| **· sin impacto medido** | 6 | 0 | 3 | 0 |
| **preguntas dirigidas** | 96 | 3 | 92 | 0 |
| **plata en riesgo** | $ 17.388.173 | $ 19.457 | $ 17.388.173 | no medida |
| **COSTO DIRECTO** | NO SE AFIRMA | $ 512.293 | NO SE AFIRMA | NO SE AFIRMA |
| **· parcial (lo que sí cerró)** | $ 79.571.283 | $ 512.293 | $ 79.571.283 | $ 0 |
| **reconciliación explosión ↔ costo** | no comparable | cuadra (residuo $0) | no comparable | no comparable |
| **VENTA SIN IVA** | NO SE AFIRMA | $ 861.661 | NO SE AFIRMA | NO SE AFIRMA |
| **coeficiente** | s/d | 1.681968 | s/d | s/d |
| **margen sobre precio** | s/d | 16.61 % | s/d | s/d |
| **llamadas al modelo** | 0 | 0 | 0 | 0 |
| **CLAUDE AVOIDANCE RATE** | 100.0 % | 100.0 % | 100.0 % | — |
| **AUTONOMOUS RESOLUTION RATE** | 100.0 % | 100.0 % | 100.0 % | — |
| **incertidumbre NO declarada** | 0 | 0 | 0 | 0 |
| **latencia fría / tibia** | 36 ms / 13 ms | 24 ms / 23 ms | 10 ms / 9 ms | 15 ms / 13 ms |
| **huella de entradas** | ff753420a2e7e909 | 2dcc56d05a50fdf1 | 80fc3279fc3b271e | 4970a25c0946d764 |
| **ESTADO** | BLOQUEADO (96) | BLOQUEADO (3) | BLOQUEADO (93) | BLOQUEADO (1) |

## Qué bloquea cada caso

### QUATTROPANI (real)

1. **PRECIO_DESACTUALIZADO** · 367 (Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco) — el precio es del 2024-08-07 (752 días, vigencia 180): sirve de referencia y no cierra un presupuesto
2. **PRECIO_DESACTUALIZADO** · 333 (VIAJE DE TATU con RSU) — el precio es del 2024-09-01 (727 días, vigencia 180): sirve de referencia y no cierra un presupuesto
3. **PRECIO_DESACTUALIZADO** · 288 (MALLA SIMA ACINDAR Q188 (15x15 del 6)) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
4. **PRECIO_DESACTUALIZADO** · 294 (CUARZO PARA PISO INDUSTRIAL) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
5. **PRECIO_DESACTUALIZADO** · 24 (ELECTRODO 13 A 3,25mm) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
6. **PRECIO_DESACTUALIZADO** · 243 (HIERRO LISO ø 16) — el precio es del 2025-03-23 (524 días, vigencia 180): sirve de referencia y no cierra un presupuesto
7. **PRECIO_DESACTUALIZADO** · 247 (TORNILLO AUTOPERFORANTE 2") — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
8. **PRECIO_DESACTUALIZADO** · 154 (PLACA DE YESO 12,5 X 2,4 X 1,2) — el precio es del 2024-08-04 (755 días, vigencia 180): sirve de referencia y no cierra un presupuesto
9. **PRECIO_DESACTUALIZADO** · 292 (HELICOPTERO) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
10. **PRECIO_DESACTUALIZADO** · 359 (VIBRO COMPACTADOR NIWA 643 - EN DOLARES 10 mil dolares) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
11. **PRECIO_DESACTUALIZADO** · 24 (ELECTRODO 13 A 3,25mm) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
12. **PRECIO_DESACTUALIZADO** · 112 (CABLE UNIPOLAR 1,5 TIPO PIRELLI) — el precio es del 2026-03-01 (181 días, vigencia 180): sirve de referencia y no cierra un presupuesto

### LA ESTRELLA (ciego)

1. **PRECIO_DESACTUALIZADO** · 15 (CLAVO PUNTA PARIS 2") — el precio es del 2024-03-03 (909 días, vigencia 180): sirve de referencia y no cierra un presupuesto
2. **PRECIO_DESACTUALIZADO** · 329 (ALFALJIA) — el precio es del 2022-06-09 (1542 días, vigencia 180): sirve de referencia y no cierra un presupuesto
3. **PRECIO_DESACTUALIZADO** · 328 (TANZA) — el precio es del 2022-06-09 (1542 días, vigencia 180): sirve de referencia y no cierra un presupuesto

### DOC INCOMPLETA

1. **PRECIO_DESACTUALIZADO** · 367 (Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco) — el precio es del 2024-08-07 (752 días, vigencia 180): sirve de referencia y no cierra un presupuesto
2. **PRECIO_DESACTUALIZADO** · 333 (VIAJE DE TATU con RSU) — el precio es del 2024-09-01 (727 días, vigencia 180): sirve de referencia y no cierra un presupuesto
3. **PRECIO_DESACTUALIZADO** · 288 (MALLA SIMA ACINDAR Q188 (15x15 del 6)) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
4. **PRECIO_DESACTUALIZADO** · 294 (CUARZO PARA PISO INDUSTRIAL) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
5. **PRECIO_DESACTUALIZADO** · 24 (ELECTRODO 13 A 3,25mm) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
6. **PRECIO_DESACTUALIZADO** · 243 (HIERRO LISO ø 16) — el precio es del 2025-03-23 (524 días, vigencia 180): sirve de referencia y no cierra un presupuesto
7. **PRECIO_DESACTUALIZADO** · 247 (TORNILLO AUTOPERFORANTE 2") — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
8. **PRECIO_DESACTUALIZADO** · 154 (PLACA DE YESO 12,5 X 2,4 X 1,2) — el precio es del 2024-08-04 (755 días, vigencia 180): sirve de referencia y no cierra un presupuesto
9. **PRECIO_DESACTUALIZADO** · 292 (HELICOPTERO) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
10. **PRECIO_DESACTUALIZADO** · 359 (VIBRO COMPACTADOR NIWA 643 - EN DOLARES 10 mil dolares) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
11. **PRECIO_DESACTUALIZADO** · 24 (ELECTRODO 13 A 3,25mm) — el precio es del 2025-10-01 (332 días, vigencia 180): sirve de referencia y no cierra un presupuesto
12. **PRECIO_DESACTUALIZADO** · 112 (CABLE UNIPOLAR 1,5 TIPO PIRELLI) — el precio es del 2026-03-01 (181 días, vigencia 180): sirve de referencia y no cierra un presupuesto

### CÓMPUTO MANUAL

1. **SIN_PRECIO_CALCULABLE** · cotización — el costo directo no se pudo afirmar, así que el precio tampoco. NO es cero: es desconocido


## Reproducibilidad (§39)

RUN1 = RUN2 en las 4 corridas: **SÍ**.

- `QUATTROPANI (real)` → entrada `ff753420a2e7e909` · resultado `2f14be4f4d0bbaa8`
- `LA ESTRELLA (ciego)` → entrada `2dcc56d05a50fdf1` · resultado `9a8571502d1a45d7`
- `DOC INCOMPLETA` → entrada `80fc3279fc3b271e` · resultado `5b66a3b04ebe244f`
- `CÓMPUTO MANUAL` → entrada `4970a25c0946d764` · resultado `f37b95ee8bf14486`

## Lo que el dictado NO pudo mapear a la Base Maestra

### LA ESTRELLA (ciego)

mapeadas 1 · ambiguas 1 · sin partida 1

- **MAMPOSTERÍA LADRILLON CERÁMICO** → PARTIDA_CANDIDATA: «T1018» exige un atributo que el plano no demuestra: espesor_m (T1018 exige «e = 0,20 m»). La respuesta correcta acá es la pregunta, no un precio que lo supone
- **PISO DE HORMIGON ALISADO MECÁNICO** → AMBIGUO: «T1107.1» y «T1107.2» quedan a 0.096 de distancia (mínimo 0.25): son dos opciones, no una

### CÓMPUTO MANUAL

mapeadas 0 · ambiguas 1 · sin partida 1

- **MAMPOSTERÍA LADRILLON CERÁMICO** → PARTIDA_CANDIDATA: «T1018» exige un atributo que el plano no demuestra: espesor_m (T1018 exige «e = 0,20 m»). La respuesta correcta acá es la pregunta, no un precio que lo supone
- **PISO DE HORMIGON ALISADO MECÁNICO** → AMBIGUO: «T1107.1» y «T1107.2» quedan a 0.096 de distancia (mínimo 0.25): son dos opciones, no una


## El cruce exclusión ↔ cómputo, sobre el contrato REAL

- **aplicadas** (corroboradas en ≥2 documentos): `entrepiso`, `escalera`
- **candidatas** (un solo documento, preguntan en vez de excluir): `metalica`, `muros`
- **descartadas** (no alcanzan a ninguna partida): `pintura`, `revoques`
