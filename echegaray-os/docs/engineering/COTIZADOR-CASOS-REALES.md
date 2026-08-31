# COTIZADOR — LOS CASOS REALES

Generado por `orquestador/scripts/cotizador-casos-reales.mjs` el 2026-08-31.
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
| **plata excluida por contrato** | $ 0 | $ 0 | $ 0 | $ 0 |
| **· excluidas sin valorizar** | 0 | 0 | 0 | 0 |
| **cantidades resueltas** | 26 / 26 | 1 / 1 | 26 / 26 | 0 / 0 |
| **cobertura de cómputo** | 100.0 % | 100.0 % | 100.0 % | — |
| **composiciones resueltas** | 26 / 26 | 1 / 1 | 26 / 26 | 0 / 0 |
| **recursos explotados** | 110 | 7 | 110 | 0 |
| **· sin precio** | 3 | 0 | 3 | 0 |
| **precios vigentes / vencidos / faltantes** | 158 / 70 / 3 | 4 / 3 / 0 | 158 / 70 / 3 | 0 / 0 / 0 |
| **HH previstas** | 3.697,691 h | 50,4 h | 3.697,691 h | 0 h |
| **FALTA_DATO en la cola** | 2 | 0 | 0 | 0 |
| **CONFLICTO en la cola** | 1 | 0 | 0 | 0 |
| **bloqueantes** | 76 | 3 | 73 | 0 |
| **· sin impacto medido** | 6 | 0 | 3 | 0 |
| **preguntas dirigidas** | 77 | 3 | 73 | 0 |
| **plata en riesgo** | $ 12.485.690 | $ 19.457 | $ 12.485.690 | no medida |
| **COSTO DIRECTO** | NO SE AFIRMA | $ 512.293 | NO SE AFIRMA | NO SE AFIRMA |
| **· parcial (lo que sí cerró)** | $ 79.571.283 | $ 512.293 | $ 79.571.283 | $ 0 |
| **reconciliación explosión ↔ costo** | no comparable | cuadra (residuo $0) | no comparable | no comparable |
| **VENTA SIN IVA** | NO SE AFIRMA | $ 861.661 | NO SE AFIRMA | NO SE AFIRMA |
| **coeficiente** | s/d | 1.681968 | s/d | s/d |
| **margen sobre precio** | s/d | 16.61 % | s/d | s/d |
| **llamadas al modelo** | 0 | 0 | 0 | 0 |
| **CLAUDE AVOIDANCE RATE** | 100.0 % (52 decisiones) | 100.0 % (2 decisiones) | 100.0 % (52 decisiones) | SIN_MEDIR |
| **AUTONOMOUS RESOLUTION RATE** | 40.0 % (130 a resolver) | 40.0 % (5 a resolver) | 41.6 % (125 a resolver) | SIN_MEDIR |
| **incertidumbre NO declarada** | 0 | 0 | 0 | 0 |
| **latencia fría / tibia** | 819 ms / 706 ms | 34 ms / 33 ms | 693 ms / 663 ms | 14 ms / 15 ms |
| **huella de entradas** | d1507481798fab3c | 67edcf0670a7f6a0 | ac84ca9f68d2dd32 | c7aedb05216dcfa2 |
| **ESTADO** | BLOQUEADO (77) | BLOQUEADO (3) | BLOQUEADO (74) | BLOQUEADO (1) |

## Qué bloquea cada caso

### QUATTROPANI (real)

1. **PRECIO_DESACTUALIZADO** · 367 (Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco) — el único precio que hay venció y NO se usa en silencio: venció: 754 días de antigüedad contra una vigencia de 180 días — 180 días = 30 × 21% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
2. **PRECIO_DESACTUALIZADO** · 333 (VIAJE DE TATU con RSU) — el único precio que hay venció y NO se usa en silencio: venció: 729 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
3. **PRECIO_DESACTUALIZADO** · 243 (HIERRO LISO ø 16) — el único precio que hay venció y NO se usa en silencio: venció: 526 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
4. **PRECIO_DESACTUALIZADO** · 154 (PLACA DE YESO 12,5 X 2,4 X 1,2) — el único precio que hay venció y NO se usa en silencio: venció: 757 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
5. **PRECIO_DESACTUALIZADO** · 327 (PLANCHUELA 1 1/4" ESP  1/8) — el único precio que hay venció y NO se usa en silencio: venció: 754 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
6. **PRECIO_DESACTUALIZADO** · 64 (CERAMICOS PARA REVESTIMIENTO 1º) — el único precio que hay venció y NO se usa en silencio: venció: 395 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
7. **PRECIO_DESACTUALIZADO** · 3 (ADHESIVO PARA CERAMICOS - KLAUKOL) — el único precio que hay venció y NO se usa en silencio: venció: 395 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
8. **PRECIO_DESACTUALIZADO** · 28 (PINO ALAMO TABLA 1"x4") — el único precio que hay venció y NO se usa en silencio: venció: 911 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
9. **PRECIO_DESACTUALIZADO** · 28 (PINO ALAMO TABLA 1"x4") — el único precio que hay venció y NO se usa en silencio: venció: 911 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
10. **PRECIO_DESACTUALIZADO** · 151 (MONTANTE 0,34 X 2,6) — el único precio que hay venció y NO se usa en silencio: venció: 757 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
11. **PRECIO_DESACTUALIZADO** · 243 (HIERRO LISO ø 16) — el único precio que hay venció y NO se usa en silencio: venció: 526 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
12. **PRECIO_DESACTUALIZADO** · 29 (PINO ALAMO TIRANTE 2"x4") — el único precio que hay venció y NO se usa en silencio: venció: 476 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la

### LA ESTRELLA (ciego)

1. **PRECIO_DESACTUALIZADO** · 15 (CLAVO PUNTA PARIS 2") — el único precio que hay venció y NO se usa en silencio: venció: 911 días de antigüedad contra una vigencia de 42 días — 42 días = 30 × 5% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la de
2. **PRECIO_DESACTUALIZADO** · 329 (ALFALJIA) — el único precio que hay venció y NO se usa en silencio: venció: 1544 días de antigüedad contra una vigencia de 42 días — 42 días = 30 × 5% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la d
3. **PRECIO_DESACTUALIZADO** · 328 (TANZA) — el único precio que hay venció y NO se usa en silencio: venció: 1544 días de antigüedad contra una vigencia de 42 días — 42 días = 30 × 5% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la d

### DOC INCOMPLETA

1. **PRECIO_DESACTUALIZADO** · 367 (Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco) — el único precio que hay venció y NO se usa en silencio: venció: 754 días de antigüedad contra una vigencia de 180 días — 180 días = 30 × 21% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
2. **PRECIO_DESACTUALIZADO** · 333 (VIAJE DE TATU con RSU) — el único precio que hay venció y NO se usa en silencio: venció: 729 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
3. **PRECIO_DESACTUALIZADO** · 243 (HIERRO LISO ø 16) — el único precio que hay venció y NO se usa en silencio: venció: 526 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
4. **PRECIO_DESACTUALIZADO** · 154 (PLACA DE YESO 12,5 X 2,4 X 1,2) — el único precio que hay venció y NO se usa en silencio: venció: 757 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
5. **PRECIO_DESACTUALIZADO** · 327 (PLANCHUELA 1 1/4" ESP  1/8) — el único precio que hay venció y NO se usa en silencio: venció: 754 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
6. **PRECIO_DESACTUALIZADO** · 64 (CERAMICOS PARA REVESTIMIENTO 1º) — el único precio que hay venció y NO se usa en silencio: venció: 395 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
7. **PRECIO_DESACTUALIZADO** · 3 (ADHESIVO PARA CERAMICOS - KLAUKOL) — el único precio que hay venció y NO se usa en silencio: venció: 395 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
8. **PRECIO_DESACTUALIZADO** · 28 (PINO ALAMO TABLA 1"x4") — el único precio que hay venció y NO se usa en silencio: venció: 911 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
9. **PRECIO_DESACTUALIZADO** · 28 (PINO ALAMO TABLA 1"x4") — el único precio que hay venció y NO se usa en silencio: venció: 911 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
10. **PRECIO_DESACTUALIZADO** · 151 (MONTANTE 0,34 X 2,6) — el único precio que hay venció y NO se usa en silencio: venció: 757 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
11. **PRECIO_DESACTUALIZADO** · 243 (HIERRO LISO ø 16) — el único precio que hay venció y NO se usa en silencio: venció: 526 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la
12. **PRECIO_DESACTUALIZADO** · 29 (PINO ALAMO TIRANTE 2"x4") — el único precio que hay venció y NO se usa en silencio: venció: 476 días de antigüedad contra una vigencia de 365 días — 365 días = 30 × 50% ÷ 2.63%/mes · recortado ×0.74 porque el IPC que sostiene la

### CÓMPUTO MANUAL

1. **SIN_PRECIO_CALCULABLE** · cotización — el costo directo no se pudo afirmar, así que el precio tampoco. NO es cero: es desconocido


## Reproducibilidad (§39)

RUN1 = RUN2 en las 4 corridas: **SÍ**.

- `QUATTROPANI (real)` → entrada `d1507481798fab3c` · resultado `919a03827ffa1cc6`
- `LA ESTRELLA (ciego)` → entrada `67edcf0670a7f6a0` · resultado `9a8571502d1a45d7`
- `DOC INCOMPLETA` → entrada `ac84ca9f68d2dd32` · resultado `1d186dcb371f2180`
- `CÓMPUTO MANUAL` → entrada `c7aedb05216dcfa2` · resultado `f37b95ee8bf14486`

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

