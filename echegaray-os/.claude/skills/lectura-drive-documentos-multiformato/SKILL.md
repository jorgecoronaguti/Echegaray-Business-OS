---
name: lectura-drive-documentos-multiformato
description: "Metodología para inspeccionar, leer, extraer y validar información desde Google Drive y documentos multiformato (Sheets, Docs, PDF, Excel, Word, CSV, imágenes/OCR) para Echegaray Business OS. Activar ante cualquier auditoría de datos, carga de línea base (PR0), conciliación financiera, o necesidad de convertir una fuente legacy en un registro candidato del OS. Nunca asume que 'leer un archivo' significa importar todo — prioriza lectura mínima suficiente, trazabilidad y detección explícita de lo que no se pudo leer."
allowed-tools: Read, Bash, mcp__claude_ai_Google_Drive__search_files, mcp__claude_ai_Google_Drive__get_file_metadata, mcp__claude_ai_Google_Drive__read_file_content, mcp__claude_ai_Google_Drive__download_file_content, mcp__claude_ai_Google_Drive__list_recent_files, mcp__claude_ai_Google_Drive__get_file_permissions
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "No aplica (dominio técnico) — no tiene criterio normativo propio, sirve a la skill de dominio dueña del dato (finanzas-tesoreria-construccion, impuestos-construccion, contabilidad-constructoras, derecho-laboral-construccion, etc.)"
---

# Lectura de Drive y Documentos Multiformato

## Propósito

Aportar el criterio técnico para inspeccionar, leer, extraer y validar información real desde Google Drive (Sheets, Docs, PDF, Excel, Word, CSV, imágenes) de la forma **mínima suficiente para responder una decisión de negocio concreta** — nunca "importar todo lo que se encuentre". Esta skill decide el *cómo* de la lectura y extracción; el *qué dato hace falta y por qué* lo sigue decidiendo la capacidad de negocio y la skill de dominio correspondiente (igual que `integraciones-apis-sistemas-externos` decide el *cómo* de una integración sin decidir el *qué*).

## Alcance

Cubre: exploración de carpetas de Drive, listado de archivos y subcarpetas, distinción entre archivo vigente e histórico, lectura completa de Google Sheets (todas las pestañas, no solo la primera), manejo de Sheets grandes sin importación ciega, lectura de fórmulas vs. valores visibles, lectura de Google Docs/PDF/Excel/Word/CSV, lectura de imágenes y documentos escaneados, criterio de cuándo usar OCR, tratamiento de archivos con nombres ambiguos o duplicados, tratamiento de archivos corruptos o con fórmulas rotas (`#REF!` y similares), registro de trazabilidad (fuente/archivo/pestaña/celda o rango/fecha/confiabilidad), comparación entre fuentes y detección de conflictos, prevención de tomar un archivo viejo como vigente, cuándo pedir acceso o aclaración humana, prohibición de inventar datos de un archivo no accesible, conversión de datos legacy en registros candidatos del OS, preparación de una matriz de extracción y validación.

No cubre: qué dato de negocio hace falta capturar y por qué (lo decide la capacidad/skill de dominio dueña del dato), ni el mecanismo de sincronización automática/API una vez que el dato ya está identificado y validado (`integraciones-apis-sistemas-externos`), ni el criterio de fondo de qué constituye una fuente de verdad financiera/fiscal/legal (`finanzas-tesoreria-construccion`, `impuestos-construccion`, `contabilidad-constructoras`, `derecho-construccion-contratos`).

## Preguntas profesionales que debe hacer

Orden de razonamiento obligatorio, siempre en esta secuencia:

1. ¿Qué decisión de negocio necesita este dato?
2. ¿Qué documentos podrían contenerlo? (no asumir un solo archivo por su nombre)
3. ¿Qué fuente parece más cercana a la verdad, y por qué (no solo "porque se llama así")?
4. ¿Qué archivos son vigentes y cuáles históricos/reemplazados?
5. ¿Qué datos pueden extraerse automáticamente con las herramientas disponibles hoy?
6. ¿Qué datos requieren validación humana explícita?
7. ¿Qué conflictos existen entre fuentes?
8. ¿Qué confiabilidad tiene cada dato extraído?
9. ¿Qué trazabilidad queda (archivo, pestaña, celda/rango, fecha de lectura)?
10. ¿Qué no se pudo leer, y hay que decirlo explícitamente?

## Marcos de análisis

- **Lectura inteligente, no importación total**: el objetivo nunca es "traer todo el archivo" — es extraer lo mínimo necesario para responder la pregunta 1. Un Sheet de 10 pestañas con 10 años de historial no se lee completo para responder "¿cuál es la deuda actual con proveedores?".
- **Confirmado / Inferido / Desconocido** (ya establecido en `discovery-drive-echegaray`, esta skill lo hereda y lo aplica a cualquier lectura, no solo a discovery): todo hallazgo se etiqueta como uno de los tres. No encontrar algo no es evidencia de que no existe — es "desconocido", nunca "confirmado que no existe".
- **El nombre del archivo no es la fuente de verdad de su contenido** (caso de referencia real ya documentado: `RESUMEN DE CUENTAS BANCARIAS.xlsx` es en realidad un padrón de legajos con CBU, no un resumen de cuentas de la empresa) — siempre verificar contenido antes de asumir función por título.
- **Vigente vs. histórico se determina por evidencia, no por suposición**: fecha de última modificación real, referencias cruzadas desde otros documentos activos (ej. Daily Meeting), y — el criterio más fuerte — si el propio dueño/usuario señala explícitamente cuál usa. Un archivo con nombre similar a otro "obsoleto" conocido no es automáticamente el mismo caso: pueden coexistir una copia archivada y una copia vigente con el mismo nombre en carpetas distintas (caso real detectado en este proyecto: dos `EJERCICIO 8.xlsx` con IDs y fechas de modificación distintas, uno en la carpeta raíz y otro en un archivo histórico anual — no asumir cuál es el vigente sin confirmarlo).
- **Extracción mínima necesaria**: leer la pestaña/rango que responde la pregunta de negocio primero; solo profundizar en el resto del archivo si esa lectura inicial deja un gap concreto sin resolver.
- **Trazabilidad como requisito de cada dato extraído, no como metadato opcional**: todo dato candidato a cargarse en el OS debe poder responder "de qué archivo, qué pestaña, qué celda/rango, leído qué día, con qué nivel de confianza" — sin esto, no es un dato válido para PR0 ni para ninguna capacidad del OS.

### Por tipo de documento

| Tipo | Cómo leer | Cuidado específico |
|---|---|---|
| Google Sheet | `read_file_content` para una lectura rápida — **pero esta herramienta, en la práctica de este proyecto, devuelve solo una pestaña (aparentemente la primera/activa), no la pestaña indicada por un parámetro `gid` en la URL.** Si el dato necesario vive en una pestaña específica distinta de la primera, esto es una limitación real a declarar explícitamente, no a ignorar (ver Gaps abajo). |
| Sheet muy grande (excede tokens) | Si `read_file_content` falla por tamaño, usar `download_file_content` (base64), guardar localmente y explorar con Bash/Python de forma selectiva — nunca cargar el archivo completo al contexto. Leer solo las secciones que responden la pregunta de negocio. |
| Fórmulas vs. valores | Distinguir explícitamente si lo que se lee es un valor calculado o una fórmula rota (`#REF!` y similares ya encontrados en archivos reales de Echegaray) — un `#REF!` significa que ese dato **no está disponible**, no que sea cero. |
| Google Doc | `read_file_content` directo; verificar fecha de modificación para distinguir plantilla de documento realmente usado (caso real: `Contrato de Obra` parecía plantilla sin uso, pero tenía modificación reciente — no asumir sin verificar). |
| PDF | `read_file_content` si el conector lo soporta como texto; si el PDF es una imagen escaneada sin capa de texto, tratarlo como imagen (ver fila siguiente) y no asumir que se extrajo contenido cuando en realidad vino vacío o ilegible. |
| Excel (.xlsx/.xlsm) | `.xlsm` no es soportado directamente por `read_file_content` (ya confirmado en este proyecto) — usar `download_file_content` y decodificar/inspeccionar localmente. |
| Word (.docx) | `read_file_content` directo; igual criterio de vigencia que Google Doc. |
| CSV | Lectura directa, más simple — igual exige registrar de qué exportación/fecha viene, un CSV no tiene "última modificación" confiable del dato subyacente. |
| Imagen / escaneo | No se puede leer contenido estructurado sin OCR. No inventar contenido de una imagen no procesada. |
| OCR | Usar solo cuando el dato necesario existe exclusivamente en formato imagen/escaneo y no hay otra fuente digital — no aplicar OCR por defecto a todo lo que sea imagen si el dato ya está disponible en otra fuente estructurada. Cualquier dato extraído por OCR se marca con confiabilidad más baja que un dato leído de una fuente nativa digital, hasta validación humana. |

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Suficiencia de la lectura | ¿Ya puedo responder la pregunta de negocio, o necesito seguir explorando? |
| Vigencia | ¿Qué evidencia concreta (fecha, referencia cruzada, confirmación del usuario) sostiene que este archivo es el que se usa hoy? |
| Confiabilidad del dato | ¿Viene de una fuente nativa estructurada, de OCR, de una fórmula rota, o de una inferencia? |
| Conflicto entre fuentes | ¿Dos archivos dan valores distintos para el mismo dato? ¿Cuál gana y por qué? |
| Necesidad real de pedir al humano | ¿Es una pregunta que ningún archivo puede responder, o solo no la busqué bien todavía? |

## Errores frecuentes

- Asumir que "leer un Sheet" trae todas sus pestañas — en la práctica de este proyecto, las herramientas disponibles devuelven una sola pestaña por defecto, y confundir eso con cobertura completa produjo conclusiones erróneas (ej. dar por leída una pestaña `CF_COB` que en realidad nunca se abrió).
- Tomar como vigente un archivo por su nombre o por parecerse a uno ya confirmado, sin verificar fecha de modificación ni ID real (caso real: dos archivos `EJERCICIO 8.xlsx` con IDs distintos, uno vigente y uno archivado, no distinguibles solo por el nombre).
- Interpretar una fórmula rota (`#REF!`) como si fuera un valor válido (ej. cero) en vez de marcarlo como dato no disponible.
- Dar por buena una lectura parcial (por límite de tamaño, error de la herramienta, o pestaña incorrecta) sin declarar explícitamente qué parte no se pudo leer.
- Pedirle al usuario información que ya está disponible en un archivo que no se inspeccionó lo suficiente — el checklist humano debe reducirse a excepciones reales, no a preguntas resolubles con más lectura.
- Simular que se abrió una pestaña específica indicada por `gid` cuando en realidad la herramienta devolvió la pestaña por defecto — declarar la limitación en vez de reportar el dato como confirmado.
- Sumar como si fueran independientes dos cifras que en realidad provienen de la misma fuente original duplicada en dos archivos (mismo error de doble conteo que ya documenta `cash-flow-operativo` para Flujo de Caja vs. Control de Gastos).
- Aplicar OCR a todo documento con imagen por defecto, generando trabajo y ruido cuando el dato ya existe en una fuente digital nativa.

## Información necesaria

- La pregunta de negocio concreta que motiva la lectura (nunca "explorar a ver qué hay" sin una pregunta detrás — eso requiere aprobación explícita del usuario, como ya establece `discovery-drive-echegaray`).
- El inventario de archivos candidatos ya conocido en `discovery-drive-echegaray` (para no repetir descubrimiento estructural ya hecho).
- Confirmación del usuario sobre cuál de varias fuentes similares es la vigente, cuando la evidencia interna no alcanza para decidirlo sin ambigüedad.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El dato leído es financiero (caja, cobranzas, obligaciones) | `finanzas-tesoreria-construccion` |
| El dato leído es contable/impositivo | `contabilidad-constructoras`, `impuestos-construccion` |
| El dato leído es de personal/nómina/legajo | `derecho-laboral-construccion` |
| El dato leído es un contrato o pliego | `derecho-construccion-contratos` |
| El dato leído es de compras/proveedores | `compras-abastecimiento-subcontratacion` |
| El dato leído es de seguridad/ART/EPP | `seguridad-higiene-art` |
| El dato leído alimenta un Post Mortem | la capacidad de Post Mortem del OS, más la skill de dominio del hallazgo |
| Ya se identificó y validó el dato y se necesita definir cómo mantenerlo sincronizado hacia adelante | `integraciones-apis-sistemas-externos` — esta skill entrega el dato validado, la otra decide cómo automatizar su actualización futura |
| Hay conocimiento estructural ya acumulado sobre Drive de Echegaray (qué archivos existen, cuáles son obsoletos) | `discovery-drive-echegaray` — consultar primero antes de re-explorar de cero |

## Sistema de fuentes

1. **Conocimiento profesional estable**: técnicas de extracción, verificación de vigencia, trazabilidad — no cambian con el tiempo.
2. **Normativa y regulación cambiante**: no aplica directamente (skill técnica).
3. **Documentación interna de Echegaray**: el inventario ya confirmado en `discovery-drive-echegaray` (sistemas vivos, obsoletos, duplicaciones conocidas).
4. **Datos estructurados del OS**: campos `origen`/`fuente_legacy` ya presentes en el esquema — todo dato extraído con esta skill que llegue a cargarse al OS debe poder trazarse a uno de estos valores.
5. **Experiencia histórica**: los hallazgos reales de PR0-A (ver Gaps abajo) son el primer caso de uso documentado de esta skill.
6. **Interpretación profesional**: lectura del caso concreto cuando la evidencia es ambigua.
7. **Recomendación**: qué validar con el usuario y qué cargar como candidato — nunca una carga automática sin ese paso.

## Política de fuentes externas y protocolo de vigencia

No depende de fuentes externas normativas. La "vigencia" que gestiona esta skill es la vigencia de un archivo (¿es el que se usa hoy?), no una vigencia normativa — se verifica con fecha de modificación real, referencias cruzadas entre documentos, y confirmación explícita del usuario cuando la evidencia interna no alcanza.

## Jurisdicción aplicable

No aplica jurisdicción normativa propia — es una skill técnica de método, no de dominio profesional-normativo.

## Límites de certeza

No puede afirmar que un archivo, pestaña o rango fue leído si la herramienta disponible no lo permitió (por tamaño, formato no soportado, o imposibilidad de seleccionar una pestaña específica) — debe decirlo explícitamente. No puede afirmar que un dato es vigente solo porque el archivo que lo contiene es reciente, si existe otro archivo con evidencia de uso activo simultáneo sin reconciliar. No puede resolver un conflicto entre dos fuentes por sí sola cuando ambas parecen igualmente válidas — eso requiere confirmación humana.

## Gaps de conocimiento conocidos (primera versión)

- **Limitación de herramienta confirmada en este proyecto**: no existe hoy un método verificado para seleccionar una pestaña específica de un Google Sheet por `gid` con las herramientas disponibles (`read_file_content` devuelve aparentemente siempre la primera pestaña/la activa). Un método candidato no validado todavía: `download_file_content` (base64) + descompresión local del `.xlsx` exportado + lectura del XML de la hoja mapeando `gid` a nombre de pestaña vía las relaciones internas del archivo (`xl/workbook.xml` + `xl/_rels/workbook.xml.rels`). Mientras este método no se pruebe y confirme, cualquier lectura de una pestaña específica indicada por `gid` debe declararse como no verificada.
- No existe todavía una matriz de extracción y validación reutilizable como plantilla — la primera se construyó ad-hoc durante PR0-A (Entregables 1-4); si se valida como útil en una segunda ronda, debería formalizarse como plantilla de esta skill.
- Sin casos de uso de OCR real todavía en este proyecto — ningún documento escaneado sin capa de texto fue procesado hasta ahora.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo real de este proyecto: se intentó leer una pestaña específica de un Sheet indicada por `gid` (evento) → la herramienta devolvió otra pestaña sin avisar (resultado/desvío) → la causa es que `read_file_content` no soporta selección de pestaña por `gid` (causa/evidencia) → si esto se repite con cada nueva fuente que el usuario señale por URL con `gid` (ya ocurrió más de una vez, recurrencia — clasificación B), se propone declarar explícitamente esta limitación en cada lectura futura y priorizar el método de descarga+parseo local antes de reportar un dato como confirmado (propuesta de aprendizaje) → pendiente de validación explícita del usuario y de probar el método candidato → si se confirma, se incorpora como procedimiento estándar de esta skill (pasaría a D/E) → se mide la próxima vez que se necesite leer una pestaña específica por `gid`.

## Relación con el OS

- **Áreas**: transversal — sirve a cualquier capacidad que necesite convertir una fuente legacy en un dato del OS (Administración, Personas, Compras, Dirección y Estrategia).
- **Capacidades existentes**: es el método detrás de todo lo ya hecho en `discovery-drive-echegaray` y en la extracción de PR0-A — antes no estaba formalizado como skill, vivía implícito en cada sesión de discovery.
- **Centro de Acción**: candidato futuro para acciones de "archivo no pudo leerse, requiere validación humana" o "conflicto entre fuentes sin resolver" durante una carga de línea base.
- **Dashboard**: no aporta alertas propias hoy.
- **Post Mortem**: relevante si un problema de obra se origina en un dato mal leído o mal reconciliado desde una fuente legacy.
- **Memoria del proyecto**: cualquier archivo cuya vigencia/estructura se confirme de forma definitiva debería actualizar `discovery-drive-echegaray`, no quedar solo en esta skill.
- **Futuros agentes/automatización**: la lectura exploratoria de un archivo puntual es clase A/B (bajo riesgo, se puede automatizar con revisión posterior); la decisión de qué dato cargar al OS como definitivo y cuál fuente gana en un conflicto es siempre clase E — requiere aprobación humana explícita, nunca se resuelve sola.

## Prohibido

No reportar como leída una pestaña, rango, PDF o imagen que en realidad no pudo abrirse o solo se leyó parcialmente — declarar explícitamente qué no se pudo leer. No inventar el contenido de un archivo inaccesible. No asumir vigencia de un archivo solo por su nombre o por una fecha de modificación reciente sin descartar el uso simultáneo de otra fuente. No importar un Sheet o documento completo cuando la pregunta de negocio se responde con una lectura mínima. No aplicar OCR por defecto cuando el dato ya existe en una fuente digital nativa.
