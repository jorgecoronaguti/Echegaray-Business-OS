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
| **bloqueantes** | 6 | 0 | 3 | 0 |
| **· sin impacto medido** | 6 | 0 | 3 | 0 |
| **preguntas dirigidas** | 96 | 3 | 92 | 0 |
| **plata en riesgo** | no medida | no medida | no medida | no medida |
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
| **latencia fría / tibia** | 33 ms / 13 ms | 26 ms / 17 ms | 10 ms / 17 ms | 18 ms / 13 ms |
| **huella de entradas** | 92f5b502ec50e5f8 | 55d5ab9b43549426 | 0ca94dff1ecca70b | c294b49a9771b55f |
| **ESTADO** | BLOQUEADO (7) | LISTO PARA OFERTAR | BLOQUEADO (4) | BLOQUEADO (1) |

## Qué bloquea cada caso

### QUATTROPANI (real)

1. **AMBIGUO** · alcance:metalica — «metalica» aparece negado en UN solo documento («CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA - ECSAS + Quattropani»): puede ser lo excluido o el lugar donde algo no se hace. No se aplica solo
2. **AMBIGUO** · alcance:muros — «muros» aparece negado en UN solo documento («CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA - ECSAS + Quattropani»): puede ser lo excluido o el lugar donde algo no se hace. No se aplica solo
3. **CONFLICTO** · documento-proyecto.version.contrato-de-obra-y-memoria-descriptiva-ecsas-quattropani.SALDO: EL MONTO RESTANTE ES DE (U$S 31500 + IVA), EL MISMO SERÁ ABONADO MEDIANTE — hay dos versiones del mismo documento (97 % de frases en común) y sólo «CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA - ECSAS + Quattropani» dice: «Saldo: el monto restante es de (U$S 31500 + IVA), el mismo 
4. **SIN_PRECIO** · 116 (BUJE RED 25x20 ACQUA SYSTEM (3/4x1/2)) — no hay ninguna observación de precio para este recurso
5. **SIN_PRECIO** · 4 (CAL HIDRATADA EN POLVO) — no hay ninguna observación de precio para este recurso
6. **SIN_PRECIO** · 88 (ADHESIVO PARA PVC) — no hay ninguna observación de precio para este recurso
7. **SIN_PRECIO_CALCULABLE** · cotización — el costo directo no se pudo afirmar, así que el precio tampoco. NO es cero: es desconocido

### LA ESTRELLA (ciego)

_sin bloqueos_

### DOC INCOMPLETA

1. **SIN_PRECIO** · 116 (BUJE RED 25x20 ACQUA SYSTEM (3/4x1/2)) — no hay ninguna observación de precio para este recurso
2. **SIN_PRECIO** · 4 (CAL HIDRATADA EN POLVO) — no hay ninguna observación de precio para este recurso
3. **SIN_PRECIO** · 88 (ADHESIVO PARA PVC) — no hay ninguna observación de precio para este recurso
4. **SIN_PRECIO_CALCULABLE** · cotización — el costo directo no se pudo afirmar, así que el precio tampoco. NO es cero: es desconocido

### CÓMPUTO MANUAL

1. **SIN_PRECIO_CALCULABLE** · cotización — el costo directo no se pudo afirmar, así que el precio tampoco. NO es cero: es desconocido


## Reproducibilidad (§39)

RUN1 = RUN2 en las 4 corridas: **SÍ**.

- `QUATTROPANI (real)` → `92f5b502ec50e5f877f214ef`
- `LA ESTRELLA (ciego)` → `55d5ab9b435494269d2f5ee4`
- `DOC INCOMPLETA` → `0ca94dff1ecca70bdeb61ea1`
- `CÓMPUTO MANUAL` → `c294b49a9771b55f84fd66e7`

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
