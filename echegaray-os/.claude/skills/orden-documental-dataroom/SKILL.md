---
name: orden-documental-dataroom
description: "Mejor práctica de orden y arquitectura documental administrativa para una PYME constructora, informada por el estándar de data room para due diligence pero SIEMPRE simplificada para reducir complejidad. Activar ante cualquier decisión de cómo organizar, nombrar, migrar, indexar o auditar el repositorio documental de la empresa (carpeta administracion de Drive: societario, finanzas, impuestos, contabilidad, RRHH/legajos, obras, presupuestos, compras, clientes, vehículos, seguridad). No decide el criterio fiscal/contable/legal de fondo (eso lo deciden impuestos-construccion, contabilidad-constructoras, derecho-laboral-construccion) — decide la ARQUITECTURA y el ORDEN del archivo. Cruza con administracion-operativa-construccion (día a día), lectura-drive-documentos-multiformato (cómo leer) e integraciones-apis-sistemas-externos (cómo indexar)."
metadata:
  type: reference
---

# Orden Documental y Data Room — PYME Constructora

## Propósito

Dar el criterio experto para que el repositorio documental de Echegaray (hoy la carpeta `administracion` de Drive: ~1.658 archivos en ~291 carpetas, con nomenclatura inconsistente) pase de un archivo que creció por acumulación a una **arquitectura documental navegable, auditable y lista para due diligence** — pero **siempre reduciendo complejidad**, no agregándola. Una PYME no necesita un data room de banco de inversión; necesita que cualquier persona (dueño, administración, Estudio Contable, un banco, un comprador, la ART, un abogado) encuentre lo que busca en segundos, y que ningún documento crítico falte o esté duplicado.

**Cómo contribuye a la misión del OS**: reduce el trabajo humano de buscar/rehacer documentación, baja el riesgo (un legajo incompleto, un contrato perdido, una factura sin respaldo son plata y exposición legal), y desbloquea capacidad — con el archivo ordenado e indexado, los especialistas del OS pueden leer la fuente correcta para cada tarea en vez de adivinar. Un archivo ordenado también acelera un crédito, una venta, una auditoría o una inspección.

## Principio central: REDUCIR COMPLEJIDAD

El estándar de data room existe para un due diligence (comprador/banco/auditor que necesita verificar la empresa entero). Se toma como **referencia de completitud** (qué categorías no pueden faltar), pero se **simplifica agresivamente** para una PYME:

- **Menos es más**: un data room corporativo tiene decenas de secciones; una constructora PYME necesita ~10-12 categorías raíz, no más.
- **Profundidad máxima ~3 niveles**. El caso real de `PRESUPUESTOS` (193 subcarpetas) es el anti-patrón: nadie navega 193 carpetas. Se agrupa por año/cliente/obra, no una carpeta por presupuesto.
- **Un solo hogar por documento**. Si un archivo podría ir en dos lados, se decide UNO y se referencia (acceso directo), nunca se duplica.
- **Nomenclatura predecible** para no depender de la memoria de quien lo guardó.
- La estructura debe poder explicarse en **una página**. Si no entra en una página, es demasiado compleja para una PYME.

## Arquitectura objetivo (taxonomía raíz)

Estructura de referencia para una constructora PYME (adaptar, no copiar literal). Cada categoría raíz mapea lo que ya existe en `administracion`:

```
00_INDICE_Y_GUIA            (README: qué va en cada carpeta + nomenclatura, 1 página)
01_SOCIETARIO_Y_LEGAL      (constitución ECSAS, estatuto, poderes, actas, contratos marco)
02_FINANZAS                (Flujo de Caja, P&L, bancos, COMPROBANTES DE TRANSFERENCIAS)
03_IMPUESTOS               (IVA 2026, Ganancias, IIBB, DDJJ, ARCA/DGR)
04_CONTABILIDAD            (BALANCES, ejercicios, libros)
05_PERSONAL                (legajos por empleado, FONDO DE CESE, UOCRA/IERIC, TELEGRAMAS)
06_OBRAS                   (una carpeta por obra: contrato, certificados, adicionales, ANRs)
07_PRESUPUESTOS            (cotizaciones, agrupadas por año/cliente — NO una carpeta por archivo)
08_COMPRAS_Y_PROVEEDORES   (FACTURAS A/B, órdenes de compra, remitos)
09_CLIENTES                (una carpeta por cliente: ARCOR, SECONDI, RIG SGR)
10_VEHICULOS_Y_EQUIPOS     (por unidad: cédula, seguro, VTV, service)
11_SEGURIDAD_E_HIGIENE     (ART, pliego SSMA ARCOR, capacitaciones, EPP)
```

Regla: **cada categoría raíz tiene un dueño** (quién la mantiene) y un criterio de qué entra. El número prefijo fija el orden (no alfabético caótico).

### Sub-arquitectura de los dos focos más grandes

- **05_PERSONAL / legajos**: una carpeta por empleado con un **checklist fijo** de documentos (Alta, DNI, Alta Médica/HM, EPP, Baja, Telegrama, Liquidación). Nomenclatura del legajo: `APELLIDO_NOMBRE` (sin fechas ni `:` en el nombre de la carpeta — la fecha va en el archivo). El caso real `AGUIRRE LEANDRO 7:2:26` es el anti-patrón (fecha con `:` en el nombre de carpeta, ilegible para sistemas).
- **07_PRESUPUESTOS**: agrupar por `AÑO / CLIENTE` y dentro los presupuestos como archivos con nomenclatura fecha_cliente_obra — nunca una subcarpeta por presupuesto (origen de las 193 subcarpetas).

## Convención de nomenclatura (una sola, para todo)

`AAAA-MM-DD_TIPO_ENTIDAD_descripcion.ext`

- **Fecha ISO al inicio** (`2026-02-07`), nunca `7:2:26` ni `7-2-26` — ordena solo y es legible por sistemas.
- **Sin `:` `/` `\` en nombres** (rompen rutas, sistemas y backups).
- **TIPO** de un vocabulario fijo: `FAC` (factura), `REC` (recibo), `ALTA`, `BAJA`, `DNI`, `HM`, `TELEGRAMA`, `CONTRATO`, `CERT` (certificado), `PPTO` (presupuesto), `TRANSF`, `DDJJ`…
- **ENTIDAD** normalizada (cliente/proveedor/empleado con nombre canónico, para no tener "Corralon Progreso" y "Corralón Progreso SA" como dos).
- Ejemplo: `2026-02-07_ALTA_AGUIRRE-LEANDRO.pdf`, `2026-06-30_FAC-A_CORRALON-PROGRESO_0001-00012345.pdf`.

## El ángulo Data Room (completitud para due diligence)

Cuando el objetivo es "estar listo para que un banco/comprador/auditor revise", verificar que existan y estén completas estas categorías (el checklist de DD simplificado para constructora):

1. **Societario**: constitución, estatuto, actas, poderes vigentes.
2. **Financiero**: EEFF/balances, Flujo de Caja, deuda bancaria y con proveedores.
3. **Fiscal**: DDJJ IVA/Ganancias/IIBB al día, situación ARCA/DGR, plan de pagos si hay.
4. **Laboral**: legajos completos, registro IERIC, cargas sociales UOCRA, Fondo de Cese, juicios/telegramas.
5. **Contratos**: obras vigentes (contrato + adicionales + certificados), clientes, alquileres, leasing de equipos.
6. **Activos**: vehículos y equipos (titularidad, seguros, VTV).
7. **Seguros y ART**: pólizas vigentes, pliegos de seguridad de clientes (ARCOR SSMA).
8. **Contingencias**: litigios laborales/comerciales, deudas contingentes.

Para una PYME el data room NO es un proyecto aparte: es la MISMA carpeta bien ordenada. Si la arquitectura de arriba está sana, el data room ya existe.

## Migración sin romper (crítico)

El archivo real tiene ~1.658 archivos en uso. **Nunca reorganizar en masa a ciegas** (rompe enlaces, `IMPORTRANGE`, referencias, y puede perder archivos):

1. **Primero indexar, no mover**: enumerar todo (id, ruta, tipo, fecha) a un catálogo — el OS puede leer y trabajar sobre el archivo desordenado mientras tanto.
2. **Diseñar la estructura objetivo** y validarla con el dueño antes de tocar nada.
3. **Migrar por categoría, incremental**, dejando accesos directos desde la ubicación vieja para no romper enlaces conocidos.
4. **Mover/renombrar es Nivel E** (efecto sobre el archivo real de la empresa): el OS propone, el humano aprueba. **Eliminar nunca es autónomo.**
5. Después de cada lote: verificar que nada se rompió (enlaces, Sheets que importan de otros).

## Controles de calidad documental (lo que el OS puede detectar)

- **Legajos incompletos**: empleado sin DNI / sin Alta Médica / sin Alta cargada / baja sin telegrama.
- **Facturas sin respaldo**: gasto en Control de Gastos sin factura archivada; factura sin comprobante de pago.
- **Obras sin contrato** o sin certificados; adicionales sin documentar.
- **Duplicados** (mismo documento en dos carpetas) y **huérfanos** (archivo sin categoría clara).
- **Vencimientos**: pólizas, VTV, habilitaciones, DDJJ próximas a vencer.
- **Nomenclatura fuera de convención** (candidatos a renombrar).

Cada hallazgo es trabajo accionable (backlog/acción), no solo un reporte.

## Preguntas profesionales que debe hacer

1. ¿Cuál es el propósito hoy: ordenar para operar mejor, o preparar un due diligence/crédito/venta? (define profundidad).
2. ¿Quién usa cada carpeta y con qué frecuencia? (lo que se usa a diario va accesible; lo histórico se archiva).
3. ¿Qué documento no puede faltar y hoy falta? (gaps antes que estética).
4. ¿La estructura entra en una página explicable? Si no, simplificar.
5. ¿Hay un solo hogar por documento, o duplicación/ambigüedad?
6. ¿La migración puede romper un enlace o una fórmula viva? (verificar antes de mover).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| Ejecutar el orden en el día a día (qué comprobante falta, envío al Estudio) | `administracion-operativa-construccion` |
| Leer/extraer contenido de un archivo del repositorio | `lectura-drive-documentos-multiformato` |
| Indexar todo el repositorio a un catálogo/Supabase | `integraciones-apis-sistemas-externos` |
| Completitud de legajos, IERIC, Fondo de Cese | `derecho-laboral-construccion` |
| Qué documentación fiscal/contable no puede faltar | `impuestos-construccion` · `contabilidad-constructoras` |
| Documentación de obra (contrato, certificados, adicionales) | `derecho-construccion-contratos` · `planificacion-produccion` |
| Pliego SSMA / ART en el data room | `seguridad-higiene-art` |

## Política de fuentes y vigencia

El criterio de arquitectura documental y nomenclatura es conocimiento estable. Lo que cambia y se verifica antes de usarse como vigente: qué documentación exige un due diligence/banco/organismo puntual (varía por operación), y los requisitos formales de registro laboral/fiscal (los deciden las skills de dominio, no ésta). Ante una operación concreta (venta, crédito, inspección), confirmar el checklist específico que pide la contraparte.

## Límites de certeza

No decide qué es correcto fiscal, contable o legalmente — sólo cómo se ordena y archiva. No reorganiza ni elimina archivos reales de forma autónoma (Nivel E/F: propone, el humano aprueba). No afirma que un legajo/carpeta está completo sin haber enumerado su contenido real.

## Prohibido

Mover, renombrar o eliminar archivos reales sin aprobación humana explícita. Duplicar un documento "por las dudas" en vez de referenciarlo. Crear estructuras de más de ~3 niveles o más de ~12 categorías raíz para una PYME. Proponer una reorganización sin haber indexado primero el estado real. Reorganizar un archivo que otra fuente viva referencia (`IMPORTRANGE`/enlaces) sin verificar el impacto.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Cada auditoría documental real de Echegaray (gaps encontrados, nomenclaturas problemáticas, duplicados) alimenta esta skill con patrones concretos (ej. "los legajos suelen faltar el HM"; "PRESUPUESTOS crece en subcarpetas si no se agrupa por año/cliente").
