---
name: admin-finanzas-sheets-clase-mundial
description: "Contrato OBLIGATORIO del área de Administración y Finanzas de Echegaray: cada vez que se toca un Sheet real (leer, escribir, rediseñar), el resultado tiene que quedar minimalista, de clase mundial y cumplir las 9 Reglas de Oro del dueño. Activar SIEMPRE antes de tocar cualquier pestaña del 'Flujo de Caja - Cash Flow' u otro Sheet de admin/finanzas, junto con google-sheets-business-systems (el cómo técnico) y la skill de dominio dueña del dato (finanzas-tesoreria-construccion, contabilidad-constructoras). No decide qué dato hace falta: hace cumplir el estándar y la disciplina de ejecución, y verifica con las herramientas reales del OS."
allowed-tools: Read, Bash, Edit, Write, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  area: "Administración y Finanzas"
  jurisdiccion-principal: "San Juan, Argentina"
---

# Admin & Finanzas — Sheets de Clase Mundial

## Propósito

Que **ninguna edición de un Sheet de Administración y Finanzas se dé por terminada** hasta que la pestaña queda minimalista, entendible de un vistazo y cumple las 9 Reglas de Oro. Esta skill existe porque el estándar no puede depender de que alguien lo recuerde caso por caso: es el contrato que se aplica automáticamente cada vez que se toca una planilla del área. El dueño fue explícito: *"cada pestaña de sheet tiene que quedar minimalista y de clase mundial"* y *"está todo desordenado y no se comprende"* — esta skill es la respuesta durable a eso.

No reemplaza a `google-sheets-business-systems` (el criterio técnico de cómo se construye/audita un Sheet) ni a las skills de dominio (`finanzas-tesoreria-construccion`, `contabilidad-constructoras`, que deciden qué dato es correcto). Las **orquesta y las hace obligatorias**, y agrega la parte que faltaba: el estándar de negocio del dueño + las herramientas concretas del OS que lo miden + la disciplina de cierre.

## Alcance

Cubre: el estándar de negocio del dueño (9 Reglas de Oro) + el checklist de clase mundial + las reglas de legibilidad + el protocolo de ejecución y cierre + qué herramienta del OS mide cada cosa, aplicado a cualquier pestaña de un Sheet real de Administración y Finanzas (hoy sobre todo el "Flujo de Caja - Cash Flow": RESUMEN, CAJA, Cheques Emitidos, Tarjeta de Credito, Jornales por Quincena, Cargas Sociales, Impuestos y Financieros, Recurrentes, Estructura, Materiales, Proveedores, los dos Cash Flow, 01_Valores Iniciales, Parámetros y las réplicas `_RAW`).

No cubre: el criterio técnico de fórmulas/arquitectura de Sheets (lo aporta `google-sheets-business-systems`), qué dato de negocio es correcto o qué decisión soporta (skills de dominio), ni el mecanismo de integración con Supabase/APIs una vez que el dato sale del Sheet (`integraciones-apis-sistemas-externos`). No edita Compras ni Cobranzas (fuente).

## Cuándo se activa (siempre)

Antes de leer, escribir o rediseñar cualquier pestaña de un Sheet real de admin/finanzas — sobre todo el **"Flujo de Caja - Cash Flow"** (`1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8`). No hay "arreglo rápido" que la saltee.

**Compras y Cobranzas NO se editan**: son la fuente de muchos datos. Se leen, nunca se reescriben.

## Las 9 Reglas de Oro (del dueño, verbatim — mandan sobre todo)

1. **Todos los desarrollos basados en el OS, no inventar nada.** La capacidad vive en el núcleo (un script versionado + su agente), no en una conversación ni en un número suelto.
2. **No inventar. Si el dato no está en el Sheet, buscarlo en el Drive/data room; y buscar datos en internet que complementen al Sheet** (inflación, índices, cotizaciones) — ANTES de declararlo faltante.
3. **Se actualiza solo y con autonomía: un agente de IA por cada cosa, y un MACRO AGENTE que activa a todos los demás.** En este archivo el macro agente es `orquestador/scripts/flujo-caja-rehacer-todo.mjs` (itera `PASOS` de `orquestador/lib/flujo-caja-pasos.mjs`). Toda capacidad nueva nace con su script en `PASOS`.
4. **Cada pestaña queda minimalista y de clase mundial** — buscar mejores prácticas en las skills del OS (`google-sheets-business-systems`) y en internet.
5. **Nunca un número pegado: todo en celda referenciada y/o fórmula.** El dato de ORIGEN sí se pega, pero declarado (fecha + fuente) y en su pestaña réplica (`_ARCA_RAW`, `_F931_RAW`, `_BANCO_RAW`, `_UOCRA_RAW`, `_J_OBREROS`, `_J_OFICINA`).
6. **Todo a Supabase**: la fuente de verdad de cada concepto vive UNA vez en el núcleo Postgres; el Sheet es una cara.
7. **Proyectar valores para el resto del año, siempre con inflación** — el dato de inflación se busca en internet (INDEC), aplicado a los DOS lados (ingreso y costo).
8. **Los Cash Flow Semanal y Mensual reflejan TODOS los datos del Sheet, nada suelto, criterio PERCIBIDO.** El control del pie prueba diferencia $0 contra Compras; el bloque de cobertura cuenta lo que existe fuera de Compras (AFIP, cheques).
9. **No duplicar: un solo juego de rubros.** Los rubros se definen una vez en `orquestador/lib/rubro-caja.mjs` (`REGLAS`), que genera la fórmula del Sheet Y el SQL de Supabase.

## El checklist de CLASE MUNDIAL (de google-sheets-business-systems, obligatorio antes de cerrar)

1. **Separación captura / cálculo / presentación** — no calcular sobre la pestaña donde alguien escribe a mano; la vista no muestra fórmulas ni IDs internos.
2. **La fórmula más simple que resuelve**: SUMIFS/COUNTIFS antes que QUERY/SUMPRODUCT; ÍNDICE+COINCIDIR/XLOOKUP antes que VLOOKUP; LET para no repetir subcálculos; **rangos CERRADOS** (`A5:C1000`) no abiertos (`A:A`).
3. **IFERROR sólo cuando el error es esperado** — nunca para tapar una búsqueda que falla.
4. **Nunca celdas combinadas en zonas de datos** (rompen ordenar/filtrar/pivots/API).
5. **Parámetros en celda con etiqueta + rango con nombre** (`orquestador/lib/rangos-nombrados.mjs`) — nunca un número enterrado en una fórmula.
6. **Validación de datos (dropdowns) en columnas categóricas** + **formato condicional para que el error se VEA** (ya existe `orquestador/scripts/formato-condicional.mjs`: pinta en rojo toda celda con error, en todas las calculadas).
7. **Rangos protegidos** sobre fórmulas/parámetros críticos.
8. **Inputs visualmente distintos de las fórmulas**; encabezados congelados; orden lógico (id → fecha → monto → estado).
9. **Trazabilidad**: todo dato de origen declara fecha, fuente y quién lo cargó.
10. **Devengado (P&L) vs percibido (Cash Flow) nunca mezclados** en la misma columna.
11. **Controles de calidad**: duplicados, fechas inválidas, rangos que se quedaron cortos, totales por dos caminos.
12. **es-AR SIEMPRE**: separador `;`, decimal coma, fechas DD/MM/YYYY, nombres de hoja con espacio entre comillas simples (`'Cash Flow Mensual'!`); releer y verificar `#ERROR!`/`#¿NOMBRE?` después de escribir.
13. **MINIMALISMO**: menos, no más. Quitar lo redundante, la nota al hecho (el detalle remitido a su pestaña o a la nota de la celda), no duplicar cuadros.

## Legibilidad: que se ENTIENDA de un vistazo (lo que faltaba)

El dueño: *"una de las pestañas de mayor importancia como CAJA no se entiende"*. Minimalista no es sólo "sin defectos": es que quien abre la pestaña entienda **el mensaje en tres segundos**. Reglas de legibilidad, obligatorias:

- **El titular arriba, siempre**: las 2-3 cifras que se deciden (ej. en CAJA: *la plata que hay · lo ya comprometido · lo que queda disponible*). El resto es el detalle de esas cifras.
- **Numeración de bloques CONSECUTIVA y sin huecos.** Un cuadro que va "1, 2, 3, 4, 8, 9" desorienta: parece que faltan bloques. Renumerar 1..N sin saltos cada vez que se agrega o saca un bloque.
- **Un bloque = una idea.** Si un bloque mezcla líneas de crédito con el costo del descubierto y una reconciliación bancaria, se parte o se condensa. La densidad técnica sepulta el mensaje.
- **Ningún número que asuste sin su explicación al lado.** Dos columnas que difieren mucho (banco vs pestaña) llevan su nota de por qué difieren, o son un hallazgo a resolver — nunca se dejan mudas.
- **Los controles/reconciliaciones van DEBAJO del mensaje principal**, no encima ni entremedio. Son importantes pero no son lo primero que se lee.
- **Menos bloques.** Antes de agregar un cuadro, preguntar si su información no cabe como una línea de un cuadro que ya existe.

## Protocolo obligatorio (Modo de Desarrollo Permanente) — no negociable

**A. Entender** para qué existe la pestaña, quién la usa, qué decisión soporta, de dónde sale cada dato. No inventar el propósito.
**B. Auditar** el estado real contra las herramientas del OS (abajo), no a ojo.
**C. Diseñar** antes de escribir: qué se mantiene, qué se elimina, qué se simplifica, cómo queda más entendible. Cambios quirúrgicos; reutilizar antes que crear; no refactorizar de más.
**D. Implementar** vía el script dueño de la pestaña (que corre en `PASOS`), nunca a mano sobre el Sheet. Leer el rango antes de escribir; es-AR; filas por RÓTULO en variable, nunca por posición fija; `clearValues` cubre toda la altura.
**E. Verificar contra el Sheet**: releer valores Y formatos; 0 celdas en error; los controles cierran (diferencia $0); verificar MERGES.
**F. Validar con números reales**: contra la fuente, un total conocido o un período ya cerrado. "Se ve razonable" no es verificado.
**Cierre**: `node --check` + `npm run orq:test` + `npm run typecheck` + lint + prueba real; los cuatro auditores en cero; commit a `infra/anthropic-api-engine` y round-trip a `main`; actualizar la memoria del proyecto. Dejar el repo más entendible que antes.

## Las herramientas reales del OS que MIDEN el estándar (usarlas, no opinar)

| Qué verifica | Herramienta |
|---|---|
| Números pegados donde debería haber fórmula (regla 5) | `orquestador/scripts/censo-numeros-pegados.mjs [pestaña]` |
| Defectos de pantalla: texto cortado/apretado, texto en celda de número, fecha cero, hueco (regla 4/legibilidad) | `orquestador/scripts/auditar-pantalla.mjs` |
| Rangos que se quedaron cortos y ya dejan plata afuera | `orquestador/scripts/auditar-rangos-fosilizados.mjs` |
| Las reglas de oro, medidas una por una | `orquestador/scripts/auditar-reglas-de-oro.mjs` |
| Reparar: alto de fila para texto apretado / formato por contenido | `orquestador/scripts/reparar-pantalla.mjs` |
| Reparar: ensanchar o mandar a nota el texto que no entra | `orquestador/scripts/reparar-textos.mjs` |
| Formato condicional "error en rojo" en todas las calculadas | `orquestador/scripts/formato-condicional.mjs` |
| Correr TODO en orden (el macro agente) | `orquestador/scripts/flujo-caja-rehacer-todo.mjs` |

Regla operativa: **auditar con el PIPELINE completo (macro agente), no scripts sueltos** — un script solo puede dejar un formato que `reparar-pantalla`/`reparar-textos` corrigen recién en el pipeline (pasó con B46 de Cargas Sociales y las columnas de los Cash Flow).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| Cómo construir/auditar técnicamente el Sheet | `google-sheets-business-systems` (obligatoria) |
| Qué dato de caja/cobranzas/pagos es correcto | `finanzas-tesoreria-construccion` |
| Qué es correcto en devengado/P&L | `contabilidad-constructoras` |
| Coherencia entre Flujo de Fondos, P&L, Avance y el OS | `arquitectura-integracion-finanzas-obras` |
| Leer un dato por primera vez desde Drive | `lectura-drive-documentos-multiformato` / `discovery-drive-echegaray` |
| Migrar una parte del Sheet al núcleo | `integraciones-apis-sistemas-externos` |

## Prohibido

Dar una pestaña por terminada con: un número pegado indefendible (fuera de las excepciones declaradas por tope), un defecto de pantalla en una calculada, numeración de bloques con huecos, un número que difiere de otro sin explicación al lado, una celda en error, un control que no cierra, o sin que los cuatro auditores den cero. Editar Compras o Cobranzas. Inventar un dato en vez de buscarlo en Drive/internet. Cerrar sin correr el protocolo completo de validación.

## Límites de certeza

No puede afirmar que una pestaña quedó "de clase mundial" sin haber corrido los cuatro auditores del OS y obtenido cero — el estándar se mide, no se opina. No puede dar por buena una legibilidad sin verla renderizada (valores Y formatos releídos del Sheet), porque un script solo puede dejar formato que el pipeline corrige recién después. No decide qué número es el correcto ante una discrepancia de negocio: eso lo resuelve la skill de dominio, y si es de alto riesgo, requiere confirmación humana (Nivel E). No puede garantizar que una escritura no colisionó con una edición humana concurrente sin revisar el historial de revisiones.

## Aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN → MEDICIÓN`. Cada hallazgo de legibilidad o de estándar se incorpora acá (append-only) o a la memoria del proyecto; cada hallazgo de NEGOCIO real va a la skill de dominio, no acá.

### Historial de aprendizaje (más reciente arriba)

- **2026-09-05** — **MINIMALISMO EXTREMO: el Sheet no lleva aclaraciones ni explicaciones de nada.** Decisión del dueño, textual: *"quiero q en el diseño del sheet flujo de fondos respete el minimalismo extremo y no tenga aclaraciones ni explicaciones de nada"*. **Deroga** la regla de legibilidad que decía «ningún número que asuste sin su explicación al lado» y la de «la nota al hecho»: en el Sheet no va ninguna de las dos. Lo que se hacía con una nota ahora tiene tres salidas y ninguna es escribir en la pestaña: (1) el número se explica solo o el cuadro está mal armado; (2) la discrepancia es un HALLAZGO y se resuelve, no se anota; (3) el porqué vive en el código del script dueño, que es donde alguien lo va a buscar cuando importe. Una pestaña con explicaciones es una pestaña que no se entiende sola. Excluidas de todo trabajo: **Compras · Cobranzas · CAJA · Cheques Emitidos · Cheques Recibidos**. Clasificación: **E. regla operativa aprobada**.

- **2026-07-22** — Nace la skill. Contexto: tras varias iteraciones limpiando defectos de pantalla pestaña por pestaña, el dueño marcó que el problema real no eran los defectos sino que **las pestañas no se entienden** (CAJA como caso). Aprendizaje incorporado: minimalista = entendible de un vistazo, no sólo "sin errores"; numeración consecutiva; titular arriba; controles debajo; ningún número mudo. Y que el estándar tiene que ser una SKILL que se aplique sola, no un criterio que yo recuerde. Clasificación: **E. regla operativa aprobada** (pedido explícito del dueño).
