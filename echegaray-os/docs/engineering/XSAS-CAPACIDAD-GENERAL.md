# XSAS — CAPACIDAD GENERAL DE COTIZACIÓN

> El objetivo no es que XSAS aprenda a cotizar UN proyecto. Es que XSAS **sepa cotizar**.

Este documento es el mapa del programa y, sobre todo, **la línea de base contra la que se mide si
sirvió**. No es un plan: es una medición con fecha.

---

## 1. LA LÍNEA DE BASE — 2026-08-30

Corrida real de `orquestador/scripts/cotizador-casos-reales.mjs` contra la base de producción, cero
llamadas al modelo. Estos son los números de ANTES.

| | QUATTROPANI (real) | LA ESTRELLA (ciego) | DOC INCOMPLETA | CÓMPUTO MANUAL |
|---|---|---|---|---|
| documentos del corpus | 10 | 14 | 2 | 0 |
| partidas | 26 | 1 | 26 | 0 |
| cobertura de cómputo | 100,0 % | 100,0 % | 100,0 % | — |
| recursos explotados | 110 | 7 | 110 | 0 |
| precios vigentes / vencidos / faltantes | 139 / 89 / 3 | 4 / 3 / 0 | 139 / 89 / 3 | 0 / 0 / 0 |
| HH previstas | 3.697,7 h | 50,4 h | 3.697,7 h | 0 h |
| bloqueantes | 95 | 3 | 92 | 0 |
| preguntas dirigidas | 96 | 3 | 92 | 0 |
| plata en riesgo | $ 17.388.173 | $ 19.457 | $ 17.388.173 | no medida |
| **COSTO DIRECTO** | **NO SE AFIRMA** | $ 512.293 | **NO SE AFIRMA** | **NO SE AFIRMA** |
| VENTA SIN IVA | NO SE AFIRMA | $ 861.661 | NO SE AFIRMA | NO SE AFIRMA |
| llamadas al modelo | 0 | 0 | 0 | 0 |
| **ESTADO** | BLOQUEADO (96) | BLOQUEADO (3) | BLOQUEADO (93) | BLOQUEADO (1) |

**Lo que ese cuadro dice, sin adorno: tres de los cuatro casos no pueden afirmar su costo directo.**
No porque el motor no sepa computar —la cobertura de cómputo es 100%— sino porque **no tiene precios
que sostengan un número**. El motor está sano y la despensa vacía.

### Los tres agujeros que la línea de base deja a la vista

1. **El precio es el camino crítico.** Los 95 bloqueantes de Quattropani son, casi uno por uno,
   `PRECIO_DESACTUALIZADO`: Panel Chapa Trape 754 días, PLACA DE YESO 757, VIAJE DE TATU 729, HIERRO
   LISO ø16 526, y una fila de recursos a 334. Sobre 389 recursos con precio, **285 vencidos + 38 sin
   fecha = 66 usables (17%)**.
2. **La vigencia de 180 días es un número puesto a dedo, y se nota.** El CABLE UNIPOLAR 1,5 quedó
   vencido **por tres días** (183). Un cable de cobre, un HELICOPTERO y un VIBRO COMPACTADOR cotizado
   en dólares no envejecen al mismo ritmo, y hoy los tres vencen el mismo día.
3. **La materialidad no existe.** Entre los bloqueantes conviven el Panel Chapa Trape, que mueve
   millones, y el TORNILLO AUTOPERFORANTE 2", que mueve centavos. Los dos frenan igual una obra de
   $ 79,5 M. Un clavo sin precio no puede detener una oferta.

### Una métrica que no puede decir que no

En la misma columna en la que Quattropani sale **BLOQUEADO con 96 preguntas abiertas**, el informe
publica **AUTONOMOUS RESOLUTION RATE 100,0 %**. Está midiendo el denominador equivocado: lo que el
motor intentó, no lo que había que resolver. Si `Human Questions = 96`, esa tasa no puede ser 100%.
Es el patrón que en este repo ya costó caro —un control incapaz de dar rojo— y entra al programa como
defecto, no como observación.

---

## 2. GENERALIZACIÓN — el problema real

**En la base sólo hay cotizaciones de un cliente.** Medido: 6 cotizaciones de FRANCO QUATTROPANI, 7
sin cliente (las `COT-2026-00x` del mismo salón comercial y una de QA). De los cuatro casos del
cuadro, tres son Quattropani o variantes suyas y el cuarto es un dictado de tres renglones.

Un motor probado contra un solo proyecto no está probado: está memorizado.

El corpus real tiene 170 documentos de 18 clientes, y el reparto señala solo el tercer caso:

| cliente | documentos | por qué sirve o no |
|---|---|---|
| **ARCOR - SAN JUAN** | **57** | **el tercer caso**: ver abajo |
| LA ESTRELLA | 14 | ya usado, pero como dictado |
| FERRER HNOS · JAVIER SANCHEZ · VUELO PLACO | 12 c/u | reserva para caso ciego nuevo |
| MESSINA | 11 | obra ejecutada — sirve para Plan vs Real |
| FRANCO QUATTROPANI | 10 | la regresión conocida |

### Por qué ARCOR es el caso que prueba el motor

Es **estructuralmente lo opuesto** a Quattropani, y ahí está su valor:

- **Formatos**: 49 planillas, 6 OOXML, 2 OLE2. Casi ningún PDF y **ningún plano de arquitectura** —
  Quattropani es planos; ARCOR es planillas.
- **No es una obra: es una cartera de obras chicas industriales.** Luceras de la Línea SIG, filtro
  sanitario con estructuras metálicas, cocheras, ampliación del piso del baño maría, restauración de
  vestuarios, modificación de canal para tamiz, cisterna.
- **La estructura de partidas la impone el cliente.** Los «ARSJ Planilla de cotización - …» son la
  plantilla que ARCOR manda a llenar. Hay que mapear nuestra Base Maestra sobre la grilla de ellos,
  no sobre la nuestra: un ejercicio que Quattropani nunca obliga a hacer.
- **Hay pliego de especificaciones técnicas en `.doc` OLE2**, cómputo entregado por el cliente,
  cronograma en `.docx`, y dos vestuarios casi idénticos (Hombres / Mujeres) más un «REV F» en un
  nombre de archivo: versiones y casi-duplicados de verdad.

**Y el hallazgo incómodo:** `delProyecto(biblioteca,'arcor')` devuelve **57 documentos, 2
conocimientos y 1 hueco**. Los documentos están registrados, no estudiados — el corpus guarda el
nombre y el hash, no el contenido interpretado. Los 57 llegan además con `etapa: undefined`.

---

## 3. EL MAPA DE CAPACIDADES

Clasificación al arrancar el programa, sobre código y base medidos.

| § | Capacidad | Estado inicial | P | Frente |
|---|---|---|---|---|
| 3 | Documentos multiformato | PARTIAL — 9 familias de formato detectadas y parsers propios; los documentos no se relacionan entre sí | P0 | D |
| 4 | Cómputo con genealogía | PARTIAL | P0 | D |
| 5 | Base Maestra general | PARTIAL | P0 | E |
| 6 | Composiciones / APU | PARTIAL | P0 | E |
| 7 | HH / productividad | PARTIAL | P0 | E |
| 8 | **Precios autónomos** | **MISSING** — sólo vigencia plana de 180 días | **P0** | A |
| 9 | Subcontratos | PARTIAL — misma vigencia plana | P0 | B |
| 10 | Indirectos | PARTIAL | P0 | B |
| 11 | Política comercial versionada | PARTIAL — hay política y override; falta versión | P0 | B |
| 12 | Research engine | PARTIAL — existe con jerarquía de autoridad, sin cablear al cotizador | P1 | F |
| 13 | Claude no es dependencia | PARTIAL — 0 llamadas medidas; falta el fast path explícito | P1 | F |
| 14 | Cotización estructurada | READY | — | — |
| 15 | Versionado DRAFT→FREEZE→OFFER | READY | — | — |
| 16 | Presupuesto → obra | PARTIAL — dos funciones puras sin persistencia | P0 | C |
| 17 | **Ejecución real** | **MISSING** — tablas de obra sí, relación con la cotización no | **P0** | C |
| 18 | Plan vs Real | PARTIAL | P0 | C |
| 19 | Learning loop con governance | PARTIAL | P1 | G |
| 21 | Métricas | PARTIAL — y una de ellas no puede dar rojo | P1 | F |
| 22 | Generalización | PARTIAL — un solo proyecto real | P0 | integración |

**El agujero más caro no es de código: es de relación.** Nada ata `cotizacion_partida` y su
composición a la ejecución real de la obra. Las dos mitades existen y no se tocan, y sin esa relación
el aprendizaje no puede existir — se puede escribir el circuito entero y no aprendería nada.

---

## 4. INVARIANTES

Ninguno se da por bueno sin un test que pruebe que el control **puede** dar rojo.

`NULL ≠ 0` · `ERROR ≠ 0` · `SIN_PRECIO ≠ 0` · `SIN_DATO ≠ 0` · `HISTORICO ≠ VALIDADO` ·
`CANDIDATO ≠ NORMA` · `WEB ≠ EXPERIENCIA_ECSAS` · `HH ≠ DURACIÓN` · `COSTO ≠ PRECIO` ·
`FROZEN ≠ MUTABLE` · margen sobre venta ≠ markup sobre costo · `INDIRECTO_CALCULADO ≠ APLICADO`.

La mutación se **corre**: se rompe el código, se ve el test en rojo, se revierte y se anota el
resultado observado. Un comentario que dice «esto lo pondría rojo» sin haberlo corrido ya se coló
cuatro veces en este proyecto y las cuatro escondía un control muerto.

---

## 5. FUERA DE ALCANCE, DECLARADO

- **UX/UI.** No se diseñan pantallas, no se toca Design v5, no hay cosmética. Primero capacidad.
- **`authenticated` puede TRUNCATE tablas.** Es real y está registrado como ticket propio de
  plataforma. No se mezcla con este camino crítico salvo que amenace directamente la cotización.
- **Optimizar un presupuesto particular.** Quattropani, La Estrella y ARCOR son regresiones. Los
  casos prueban el motor; no entrenan la respuesta esperada. Cambiar una regla para que un histórico
  «cierre» invalida el caso y el motor.
