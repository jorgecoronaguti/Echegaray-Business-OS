---
name: discovery-drive-echegaray
description: "Investigar el Google Drive de Echegaray Construcciones para responder una pregunta de negocio puntual, usando el conocimiento ya confirmado en dos rondas de discovery (AS-IS). Activar cuando se necesita un dato concreto de un archivo o sistema ya mapeado, o verificar si algo cambió desde el último discovery. No activar para explorar Drive de forma general."
allowed-tools: mcp__claude_ai_Google_Drive__search_files, mcp__claude_ai_Google_Drive__read_file_content, mcp__claude_ai_Google_Drive__get_file_metadata, mcp__claude_ai_Google_Drive__list_recent_files, mcp__claude_ai_Google_Drive__download_file_content, Read, Bash
metadata:
  type: methodology
  author: echegaray-os
---

# Discovery Drive — Echegaray Construcciones

Conocimiento acumulado en dos rondas de discovery (estructural + contenido) sobre la carpeta de Google Drive raíz de Echegaray Construcciones. No reemplaza el análisis AS-IS completo — lo resume para no rehacer el discovery en cada sesión.

## Propósito

Permitir que una sesión futura resuelva una duda puntual sobre un proceso o archivo de Echegaray sin explorar Drive de cero.

## Cuándo usarlo

- Confirmar un dato concreto de un archivo ya identificado abajo.
- Verificar si algo cambió desde el último discovery (¿sigue existiendo esta planilla? ¿tiene la misma estructura?).
- Confirmar el formato real de una fuente de datos que una fase del OS va a integrar o reemplazar.

## Cuándo NO usarlo

- Para explorar carpetas o archivos "a ver qué hay" sin una pregunta concreta detrás — eso es una nueva ronda de discovery y requiere aprobación explícita del usuario, no este skill.
- Para tomar decisiones de arquitectura o diseño de módulos — este skill informa, no decide.
- Para escribir, mover, copiar o modificar cualquier archivo de Drive.

## Sistemas principales identificados y función real

| Sistema | Función real | Estado |
|---|---|---|
| Daily Meeting (Sheet) | Gestión semanal de tareas por obra (ritual tipo EOS) | Vivo |
| Vision/Tracción (Sheet) | Visión estratégica anual y a 5 años | Vivo |
| Planilla para Cotizar.xlsm | Motor de costeo: precios unitarios + mano de obra. Plantilla oficial confirmada, con pestañas específicas para clientes recurrentes (ARCOR, Saint Gobain) | Vivo — fuente de verdad de presupuestos |
| PRESUPUESTOS/[cliente] | Archivo disperso de presupuestos/requisiciones por cliente, sin estructura común entre clientes | Vivo, sin normalizar |
| JORNALES (Sheet) | Cálculo semanal de sueldos por trabajador + asignación de una obra por trabajador/semana | Vivo, se actualiza con frecuencia |
| CONTROL DE GASTOS.xlsx | **CORRECCIÓN 2026-07-09 (verificado con openpyxl sobre el .xlsx real, no sobre el snippet de texto del conector)**: es un archivo de **16 pestañas real y vivo**, mucho más rico de lo que el nombre sugiere: `Hoja1` (dashboard), `BANCO`/`EFECTIVO` (ledgers reales con tabla Excel `Register`/`Register8`), `CHEQUES A CUBRIR`, `CHEQUES A COBRAR`, `CARGA DE FACTURAS` (aging de cobros por antigüedad: 1-7/8-15/16-30/31-60/61-90 días), `GASTOS FIJOS`, `Pagos en EFECTIVO (2)`, y **6 pestañas por cliente** (`ARCOR`, `LA ESTRELLA`, `MESSINAS`, `IMOTOR`, `OBRAS SIN FACTURA`, `SAINT GOBAIN`) con ciclo completo Remito→FA→Cobro→Retención Ganancias/IIBB por obra. **El hallazgo previo de "fórmulas rotas `#REF!` en SALDO BCO/EFECTIVO/DESCUBIERTO" era incorrecto** — verificado con `data_only=True`: esas celdas devuelven valores reales (`SALDO BCO ACTUAL` = fórmula `SUM` sobre tabla `Register`, `SALDO EFECTIVO` = `EFECTIVO!L1`, ambas con resultado numérico real, no error). El `#REF!` visto antes era un artefacto de cómo el conector de Drive convierte a texto una tabla de Excel con referencias estructuradas (`Register[Depósito (+)]`), no un error real del archivo. **Riesgo real distinto y más acotado**: `CHEQUES A COBRAR`/`CHEQUES A CUBRIR` usan `GETPIVOTDATA(...,[1]Ingresos!...)` — el prefijo `[1]` es una referencia a un libro externo vinculado; si ese vínculo externo se rompe, ahí sí puede aparecer un `#REF!` real, no verificado todavía. **Bug real y acotado encontrado**: la fórmula de `Monto a Cobrar S/F` (`=MESSINAS!I1+IMOTOR!I1+'LA ESTRELLA'!B1`) no incluye a `ARCOR`, `SAINT GOBAIN` ni `OBRAS SIN FACTURA` — subestima el monto real a cobrar, probablemente por no haberse actualizado al agregar clientes nuevos. | Vivo, con saldo de banco/caja real y utilizable hoy |
| Flujo de Caja - Cash Flow (Sheet) | Proyección de cobros, deudas a proveedores, cheques (usar el Sheet, no el Form) | Vivo — fuente de verdad de caja |
| Ingresos y Egresos - P&L (Sheet) | P&L mensual devengado, consolidado de empresa | Vivo |
| FACTURAS A/B/C | Archivo fiscal AFIP | Vivo |
| ALTAS-BAJAS-HM-EPP-DNI | Legajos de personal | Vivo |
| RESUMEN DE CUENTAS BANCARIAS.xlsx | En realidad es el padrón de legajo + CBU sueldo + CBU fondo de cese — el nombre no corresponde al contenido | Vivo |
| LIBRO DE SUELDOS Y JORNALES | Registro legal obligatorio (Art. 52 LCT) | Vivo, en carpetas mensuales (AÑO 2025/, SECONDI/) |
| SECONDI | Estudio jurídico externo, lleva compliance de ARCOR | Referencia externa |

## Archivos obsoletos conocidos

- `Contrato de Obra.docx` — la plantilla existe, pero no se confirmó uso sistemático (no se encontraron contratos firmados en las carpetas de cliente revisadas).

## SISTEMA FINANCIERO VIGENTE (corrección mayor, confirmada por el usuario, 2026-07-07)

Hubo dos correcciones erróneas de este archivo en la misma sesión antes de llegar a esto — quedan documentadas para no repetir el error de método (búsquedas sin acotar `parentId` devuelven homónimos y llevan a conclusiones falsas). La jerarquía real, confirmada directamente por el usuario:

**Fuente de verdad actual — ambos archivos propiedad de `jorge.o.corona@gmail.com` (el dueño), parentId `1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs`, actualizados semanalmente:**

| Archivo | Pestañas | Contenido real |
|---|---|---|
| **`Flujo de Caja - Cash Flow`** (id `1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8`) | `RESUMEN` | Posición consolidada: deudas por proveedor, cobros proyectados/reales (con Categoría B/N), cheques emitidos aún no debitados, pendientes del mes, proyectado por mes (incluye "Sueldos" y "SINDICATOS" como buckets de pago), composición Banco/Caja |
| | `Compras` | Ledger detallado de gastos: Categoría (B/N), fecha factura, proveedor, modalidad de pago, tipo de comprobante, **Unidad de Negocio** (`Civil` / `Mantenimiento` / `Estructura`), **Cliente/Asignación** (obra si es Civil/Mantenimiento; `Taller` o `Administracion` si es Estructura), importe/IVA/total, forma de pago, estado (parcial/total, pagado) |
| **`Ingresos y Egresos - P&L`** (id `1-NAqlEuKoB0IqCY4res5OiJhbbz_7-F2M-zmpnkpMYg`) | `05_Dashboard_P&L` | **P&L mensual completo devengado**, ya proyectado a todo 2026: Ingresos Civil / Ingresos Mantenimiento → Costos Directos (por línea) → Margen Bruto (%) → Gastos generales (Estructura, Administrativos) → **Cargas sociales y contribuciones (FCL, otros)** → Total Gastos operativos → **Impuesto a los Ingresos Brutos** → EBITDA (%) → Amortizaciones → Resultados financieros → **Impuesto s/ Débitos y Créditos Bancarios** → EBT → Impuesto a las ganancias → Resultado neto (%). Incluye mix Civil/Mantenimiento % |
| | `CF_COB` | Cobranzas proyectadas y reales — ledger detallado paralelo a `Compras`, mismo nivel de detalle del lado de ingresos |

**Esto reemplaza conclusiones previas de este mismo archivo y de la revisión estratégica de arquitectura**: el P&L consolidado de empresa, el desglose de cargas sociales, IIBB, impuesto al cheque, y la separación Civil/Mantenimiento **ya existen, completos y con proyección a futuro** — no es un gap de "construir desde cero", es un gap de **integración/migración** de un sistema ya sofisticado.

**Confirmaciones clave que esto resuelve:**
- **"Civil" y "Mantenimiento" son las dos líneas de negocio reales** con ingresos/costos propios en el P&L — confirma exactamente lo que dijo el usuario ("no son licitación, es mantenimiento edilicio"): Mantenimiento es una línea de negocio con entidad propia, no una curiosidad de un cliente.
- **"Estructura" es la unidad de negocio no vinculada a obra**, y sus dos sub-asignaciones reales son **Taller** y **Administración** (no "Almacen" — esa lectura de la carpeta separada de abajo era de un sistema legacy distinto).
- **La dualidad Blanco/Negro es real, explícita, y vive en la Categoría de cada movimiento** tanto en `Compras` como en cobros — confirma la pregunta abierta que ya existía sobre la columna Categoría B/N. Ninguna tabla del OS la modela hoy.
- **Cargas sociales, IIBB e impuesto al cheque ya se calculan** mensualmente en el P&L — no hacen falta preguntas de descubrimiento adicionales sobre esto, hace falta decidir cómo integrarlo.

**Sistema legacy, superseded por lo anterior — carpeta `Administración` (parentId `1tJH-J8HFSF_B5r0qa-iA3RlqSsH3T9CO`), mantenida por `administracion@ecsas.com.ar` / `rodrigo@ecsas.com.ar`:**

| Archivo | Qué era | Estado |
|---|---|---|
| `EJERCICIO 7.xlsx` / `EJERCICIO 8.xlsx` | Ledger de gastos con IVA por comprobante, precursor de la pestaña `Compras` actual | **Reemplazado** — confirmado por el usuario. Última modificación marzo 2026, antes de que el sistema nuevo tomara la posta |
| `Flujo de Fondos.xlsx` | Ledger de pagos/cheques a cubrir | Probablemente superseded por el mismo motivo — no confirmado explícitamente, tratar como legacy salvo evidencia en contrario |
| `CONTROL DE GASTOS - HISTORICO.xlsx` | Ya se sabía histórico por nombre | Histórico |
| `Flujos_Obras_Corregido.xlsx` | Control financiero por obra con **Grado de avance (%)** y plan de cobro por cuotas | Sin confirmar si fue reemplazado — **el dato de avance físico no vi que esté en el sistema nuevo**, puede seguir siendo la única fuente de ese dato puntual. Verificar antes de descartarlo. |

**Lección de método**: cuando el usuario corrige una conclusión de discovery, la corrección del usuario prima sobre cualquier lectura de archivo — pero documentar igual la evidencia encontrada (fechas de modificación, contenido) porque ayuda a explicar el "por qué" del reemplazo en vez de aceptarlo a ciegas.

## Duplicaciones conocidas

- Cobros: registrados en Flujo de Caja (proyectado) y en Control de Gastos (real) sin reconciliar.
- Mano de obra: JORNALES (cálculo de pago) vs. Libro de Sueldos y Jornales (registro legal) — mismos datos, dos lugares.
- Legajo de trabajador: ALTAS-BAJAS y RESUMEN DE CUENTAS BANCARIAS usan Nº de legajo; JORNALES usa nombre libre — no cruzan automáticamente.
- Documentación societaria (RIG SGR / ANRs / Balances) duplicada en 2-3 carpetas.

## Reglas para búsquedas puntuales

1. `search_files` no es recursiva ni está acotada a un árbol de carpetas — un `title contains` sin `parentId` devuelve resultados de todo Drive, incluyendo archivos personales irrelevantes. Acotar con `parentId` cuando se conozca la carpeta.
2. No encontrar un archivo en una búsqueda por título no es evidencia concluyente de que no existe.
3. Antes de leer un archivo grande, usar `get_file_metadata` para revisar tamaño/tipo. Si `read_file_content` falla por tamaño o tipo no soportado (`.xlsm` no está soportado), usar `download_file_content` (base64) y decodificar localmente — nunca asumir el contenido sin poder leerlo.
4. Leer solo lo necesario para responder la pregunta puntual. No recorrer carpetas hermanas "ya que se está ahí".

## Confirmado / inferido / desconocido

Todo hallazgo debe etiquetarse como uno de los tres. Nunca presentar un inferido como confirmado. Ejemplo: la ausencia de un sistema de compras formal es **inferido** (no se encontró evidencia), no **confirmado** (no se puede probar una ausencia total con una búsqueda no exhaustiva).

## Prohibido asumir fuente de verdad por nombre de archivo

`RESUMEN DE CUENTAS BANCARIAS.xlsx` es el caso de referencia: el nombre sugiere un resumen de cuentas de la empresa, pero el contenido real es un padrón de legajos con CBU. Verificar el contenido siempre, no asumir por el título.

## Reglas de acceso

Solo lectura y búsqueda. No crear, copiar, mover ni modificar ningún archivo de Drive durante una sesión de discovery. Las herramientas de escritura del conector (`create_file`, `copy_file`) no están en `allowed-tools` de este skill.

## Criterio estratégico

Toda lectura e interpretación de Drive se evalúa contra el `CLAUDE.md` raíz (estrategia de Echegaray Construcciones) y el Blueprint TO-BE aprobado. Un archivo interesante no es prioritario si no conecta con el cuello de botella actual o con la fase en construcción.

## Mapa resumido del flujo empresarial conocido

Oportunidad (informal, sin registro salvo ARCOR) → Presupuesto (Planilla para Cotizar) → Contratación (plantilla, uso real no confirmado) → Planificación de obra (no existe consolidada) → Ejecución (Daily Meeting, gestión de tareas) → Horas Hombre (JORNALES, pago semanal, no comparado contra estimado) → Compras y costos (sin sistema — Control de Gastos NO es esta fuente, es cobranzas por obra) → Adicionales (sin registro) → Certificación/Facturación (Control de Gastos + FACTURAS) → Cobranza (Cash Flow + Control de Gastos, duplicado) → Cash Flow (percibido) → P&L (devengado) → Cierre de obra / Aprendizaje (no existe).

El detalle completo vive en el análisis AS-IS ya producido en esta conversación — no se reproduce acá para mantener el skill compacto.

## Preguntas abiertas detectadas en el AS-IS

- Contenido real de la pestaña "DIAGRAMACION" de Planilla para Cotizar.
- Si RESUMEN DE CUENTAS BANCARIAS.xlsx es la única fuente de cuentas/CBUs reales o hay otra.
- Si existe algún criterio informal de selección de obras no documentado.
- Tratamiento de la columna "Categoría" (B/N) del Flujo de Caja — pendiente de definición de negocio, no técnica.

## JORNALES — estructura confirmada (verificación puntual PRP-008, 2026-07-07)

- **Granularidad semanal**: cada bloque de filas es una semana, con columnas de horas por día (L-V) que suman un total semanal por trabajador.
- **Trabajador**: nombre libre ("OBRERO"), no legajo — no cruza automáticamente con ALTAS-BAJAS ni RESUMEN DE CUENTAS BANCARIAS.
- **Obra**: texto libre, **una sola por trabajador por semana** (valores como "S/O", "SAINT GOBAIN", incluso "VACACIONES" usado como si fuera una obra) — un trabajador no puede repartir horas entre dos obras en la misma semana en esta fuente.
- **Sin columna de cuadrilla, frente ni especialidad.** La columna "Tarea del día" no tiene texto de tarea real confiable en la muestra revisada.
- Columnas "$ HORA"/"JORNAL" son cálculo de sueldo semanal (nómina), no una valorización lista para costo real de obra.

## Planilla para Cotizar — HH estimadas (verificación puntual PRP-008)

- Hoja **"Recursos"**: valoriza Oficial/Ayudante como insumos por hora (alimenta `COSTO MO` de cada partida en pesos, sin exponer cantidad de HH).
- Hoja **"DESCRIPCION DE TAREAS"**: sí tiene HH estimadas por tarea (Ayudantes/Oficial/Horas), pero con **layout ad-hoc que cambia dentro de la misma hoja** — no parseable de forma automática y confiable.
- Hojas **"MO Lu-Vi 8 a 16"** y **"Costo MO"** (oculta): confirman 4 categorías reales UOCRA reutilizables: Oficial Especializado, Oficial, Medio Oficial, Ayudante.

## Ronda de lectura financiera/impositiva real (2026-07-09, cuenta de servicio)

Con acceso real de lectura/escritura ya autorizado de forma permanente ([[autonomia-lectura-edicion-financiera]]), primera lectura real de archivos nunca vistos:

- **IVA 2026** (carpeta, parentId real `1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs`): PDFs mensuales **Libro IVA Ventas** (Enero 2026 a Mayo 2026 confirmados, más Noviembre 2025) — formato AFIP real: fecha, comprobante, cliente, CUIT, neto gravado, IVA, total, retenciones IVA RG18. Es la fuente real de IVA débito fiscal mensual — nunca antes leída, sin conexión al P&L (que hoy *calcula* IIBB/impuestos, no los toma de acá).
- **FACTURAS A** (folder real, id `1tAY4RtcGVZ_S-_bpTOVMkIH8rql_y4_G`, mismo parent que Cash Flow/P&L): facturas AFIP reales emitidas por Echegaray Construcciones SAS (CUIT 30-71630464-3) a ARCOR, IMOTOR SRL, Manufacturas Químicas Juan Messina (Messinas), Alimentos del Sur SAS, Macro Construcciones SRL, clientes individuales. Contiene subcarpeta **FACTURAS C** (monotributo/exento). Confirma el facturado real — nunca cruzado contra Certificados ni contra cobrado real.
- **CERTIFICADOS** (folder real, id `162nfC4dq41WSFAL3ibSaRLtjURb_1181`): certificados de obra por cliente (ej. `CERTIFICADOS N°1 - SAN FRANCISCO.xlsx`) con Avance de Obra %, cantidades certificadas, importes — el snippet de texto del conector muestra `#REF!`, pero dado lo encontrado en Control de Gastos (ver abajo) esto **debe verificarse con openpyxl antes de darlo por real**, no asumir que está roto solo por el snippet.
- **ADICIONALES — corrección importante**: `ADICIONALES.xlsm` (id `1M_p-AQaFXRY0UF8ccH_NKHV4SM5DlMht`) **no es un tracker consolidado de adicionales de toda la empresa** — vive dentro de la carpeta específica del cliente Javier Nasser (parentId `1jFKZbLl6dNLUs9yd8PeH_yI0AgsrWOcx`), junto a su propia `COTIZACION INTERNA.xlsm` y presupuestos. Es el archivo de cotización interna de ESE cliente/obra, no una fuente única de adicionales de la empresa. La carpeta general **`ADICIONALES`** (id `14qlRcYSH-sWyVRdQU3awi4A6MlSg5cA6`) sí es transversal, pero contiene PDFs ya emitidos por obra (San Francisco, Javier Nasser, etc.), no una base de datos — no hay hoy un tracker único de adicionales de toda la empresa.
- **CONTROL DE GASTOS.xlsx — autocorrección importante (verificado con openpyxl sobre el .xlsx descargado, no sobre el snippet de texto)**: el archivo NO es "solo cobros por cliente/obra" como se documentó unas horas antes en esta misma sesión — tiene 16 pestañas reales, incluyendo `BANCO`/`EFECTIVO` con saldo real y funcionando (ver tabla arriba). **El hallazgo de "`#REF!` en SALDO BCO/EFECTIVO" que generó una Acción crítica en el OS era un falso positivo** — el snippet de texto del conector de Drive no resuelve referencias a tablas de Excel (`Register[...]`) y las muestra como `#REF!`, pero el archivo real, leído con `data_only=True`, devuelve valores numéricos reales (SALDO BCO ACTUAL = $3.473.742,75, SALDO EFECTIVO = $2.279.600, al 2026-07-09). **Lección de método**: el snippet/contentSnippet de `search_files`/`get_file_metadata` para archivos Excel puede rendirizar mal referencias a Tablas o libros externos — para cualquier afirmación de "fórmula rota", descargar y verificar con `openpyxl` (`data_only=True` para el valor cacheado real, `data_only=False` para ver la fórmula) antes de tratarlo como hecho, no confiar en el snippet de texto.
- **Nuevo hallazgo sin leer todavía**: `Reporte Economico Echeg Const SAS.xlsm` (id `1YXVFeknIS2TyoqkmeO_0KY4mc9bHM4tp`, mismo parent que P&L/Cash Flow) — nombre sugiere reporte económico consolidado, candidato directo para la próxima lectura. También sin leer: carpetas `RIG SGR` y `ANRs` (financiamiento/subsidios) en el mismo parent.
- **Detalle de deuda real de Santander** encontrado como PDF descargado manualmente (`Detalle de deuda.pdf`, cuotas de préstamo prendario, 21/60, vencimiento 07/07/2026) — confirma que aunque no hay API de Santander, si esta práctica de descarga manual continúa, es una fuente real y periódica de estado de deuda bancaria sin necesidad de integración.
- **Estructura real de Flujo de Caja - Cash Flow** (11 pestañas, no 2 como se documentó antes): `RESUMEN`, `Compras`, `Cheques`, `Tarjeta de Credito`, `Caja`, `02_Cobranzas`, `04_CFSemanal`, `05_CFMensual`, `01_Valores Iniciales`, `06_Alertas_Vencimiento`, `Gastos`. `CF_COB` y `CF_GAS` en el archivo de P&L son `=IMPORTRANGE(...)` puros de `02_Cobranzas` y `Compras` respectivamente — no son datos independientes, son un espejo en vivo. La fuente primaria real de cobros/gastos vive en Cash Flow, no en el P&L.
- **Estructura real de Ingresos y Egresos - P&L** (20 pestañas, no 2): además de `05_Dashboard_P&L`/`CF_COB`/`CF_GAS`, tiene pestañas `08_Control_Cliente [nombre]`/`08_Control_Obra [nombre]` (checklist de gestión por obra/cliente, no financiero) y, **hallazgo mayor**: un segundo motor de cotización activo (`NUEVA_COT`, `_CATALOGO_COT`, `11_RECURSOS`, `12_ANALISIS_TAREAS`, `13_PRESUPUESTO_TAREAS`, `14_MO_UOCRA`, con menú de Apps Script "Menu Echegaray → Generar Cotizacion") — **sin confirmar todavía si reemplaza, complementa o quedó abandonado frente a `Planilla para Cotizar.xlsm`**. Esto es una pregunta abierta de negocio, no técnica, para Jorge.
