---
name: discovery-drive-echegaray
description: "Investigar el Google Drive de Echegaray Construcciones para responder una pregunta de negocio puntual, usando el conocimiento ya confirmado en dos rondas de discovery (AS-IS). Activar cuando se necesita un dato concreto de un archivo o sistema ya mapeado, o verificar si algo cambió desde el último discovery. No activar para explorar Drive de forma general."
allowed-tools: mcp__claude_ai_Google_Drive__search_files, mcp__claude_ai_Google_Drive__read_file_content, mcp__claude_ai_Google_Drive__get_file_metadata, mcp__claude_ai_Google_Drive__list_recent_files, mcp__claude_ai_Google_Drive__download_file_content, Read, Bash
metadata:
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
| CONTROL DE GASTOS.xlsx | Ledger diario de caja + cronograma de cobro por certificado | Vivo |
| Flujo de Caja - Cash Flow (Sheet) | Proyección de cobros, deudas a proveedores, cheques (usar el Sheet, no el Form) | Vivo — fuente de verdad de caja |
| Ingresos y Egresos - P&L (Sheet) | P&L mensual devengado, consolidado de empresa | Vivo |
| FACTURAS A/B/C | Archivo fiscal AFIP | Vivo |
| ALTAS-BAJAS-HM-EPP-DNI | Legajos de personal | Vivo |
| RESUMEN DE CUENTAS BANCARIAS.xlsx | En realidad es el padrón de legajo + CBU sueldo + CBU fondo de cese — el nombre no corresponde al contenido | Vivo |
| LIBRO DE SUELDOS Y JORNALES | Registro legal obligatorio (Art. 52 LCT) | Vivo, en carpetas mensuales (AÑO 2025/, SECONDI/) |
| SECONDI | Estudio jurídico externo, lleva compliance de ARCOR | Referencia externa |

## Archivos obsoletos conocidos

- `Flujo de Fondos.xlsx` — reemplazado por Ingresos y Egresos (P&L) + Flujo de Caja (Cash Flow) actuales. No usar como fuente.
- `EJERCICIO 8.xlsx` — obsoleto, mismo reemplazo que arriba.
- `Contrato de Obra.docx` — la plantilla existe, pero no se confirmó uso sistemático (no se encontraron contratos firmados en las carpetas de cliente revisadas).

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

Oportunidad (informal, sin registro salvo ARCOR) → Presupuesto (Planilla para Cotizar) → Contratación (plantilla, uso real no confirmado) → Planificación de obra (no existe consolidada) → Ejecución (Daily Meeting, gestión de tareas) → Horas Hombre (JORNALES, pago semanal, no comparado contra estimado) → Compras y costos (sin sistema, Control de Gastos como ledger) → Adicionales (sin registro) → Certificación/Facturación (Control de Gastos + FACTURAS) → Cobranza (Cash Flow + Control de Gastos, duplicado) → Cash Flow (percibido) → P&L (devengado) → Cierre de obra / Aprendizaje (no existe).

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
