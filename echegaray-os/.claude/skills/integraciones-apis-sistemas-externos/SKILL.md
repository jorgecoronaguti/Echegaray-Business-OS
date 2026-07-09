---
name: integraciones-apis-sistemas-externos
description: "Criterio de arquitectura de integraciones con sistemas externos para Echegaray Business OS: APIs REST/webhooks, autenticación, sincronización, idempotencia, reconciliación, migración desde Sheets legacy. Activar ante cualquier decisión de conectar el OS con un banco, AFIP/DGR, un proveedor, o de migrar una fuente Drive/Sheet a una capacidad del OS. Nunca asume que hace falta una API cuando una carga manual o import batch alcanza."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "No aplica (dominio técnico) — hereda jurisdicción de finanzas-tesoreria-construccion o impuestos-construccion cuando la integración es bancaria o fiscal"
---

# Integraciones, APIs y Sistemas Externos

## Propósito

Aportar el criterio técnico para diseñar cualquier conexión entre Echegaray Business OS y un sistema externo (banco, AFIP/DGR San Juan, proveedor, Google Sheets legacy, API de terceros) de la forma **más simple que sea suficiente** — nunca la más sofisticada posible. Esta skill decide el *cómo* técnico; el *qué dato hace falta y por qué* lo sigue decidiendo la capacidad de negocio y la skill de dominio correspondiente (`finanzas-tesoreria-construccion`, `impuestos-construccion`, etc.).

## Alcance

Cubre: diseño de integraciones REST/webhooks, autenticación (OAuth 2.0, API keys) y manejo seguro de secretos, sincronización (polling vs. eventos, incremental), idempotencia, reintentos/backoff, rate limits, paginación, reconciliación de datos, prevención de duplicados, trazabilidad de origen, timestamps y zonas horarias, resolución de conflictos, fuente de verdad por dominio, integraciones bancarias/fiscales/contables, Google Sheets como fuente legacy o transitoria, importación de archivos, observabilidad y logs de sincronización, manejo de errores parciales, estrategia de backfill, migración progresiva.

No cubre: qué dato de negocio hace falta capturar (capacidad del OS + skill de dominio), ni el criterio fiscal/legal de fondo de una integración bancaria o de AFIP (`finanzas-tesoreria-construccion`, `impuestos-construccion` deciden eso — esta skill solo aporta el mecanismo).

## Preguntas profesionales que debe hacer

1. ¿Qué decisión de negocio necesita este dato, y con qué urgencia real?
2. ¿Cuál es la fuente de verdad de este dato — el sistema externo o el OS? Nunca deben mandar los dos al mismo tiempo sobre el mismo campo.
3. ¿Qué frecuencia de actualización realmente hace falta (tiempo real, diaria, semanal) — no la que "se podría" tener?
4. ¿Qué nivel de confiabilidad requiere? (un error silencioso en una conciliación bancaria no es lo mismo que uno en un dato informativo)
5. ¿Cuál es el mecanismo más simple que alcanza: carga manual, importación batch puntual, o integración directa?
6. ¿Cómo se reconcilia el dato si el OS y la fuente externa discrepan?
7. ¿Cómo se detecta si la sincronización dejó de funcionar sin que nadie lo note (falla silenciosa)?
8. ¿Cómo se evita contar el mismo movimiento dos veces?
9. ¿Cómo se migra sin interrumpir la operación diaria de Echegaray (nunca "cortar" un sistema legacy antes de validar el nuevo en paralelo)?

## Marcos de análisis

- **Orden de preferencia ya establecido en el CLAUDE.md raíz**: `Proceso claro → Sheet → Apps Script/automatización → No-code → Software especializado → Desarrollo propio` — esta skill nunca recomienda una API cuando una carga manual o un import batch resuelve el mismo problema con menor riesgo y esfuerzo.
- **Una fuente de verdad por dato, siempre**: ya hay precedente real en el OS — `movimientos_caja.origen` (`manual`/`flujo_caja_sheet`/`control_gastos`) traza de dónde vino cada fila sin que dos fuentes manden al mismo tiempo sobre el mismo movimiento. Toda integración nueva debe seguir el mismo patrón, no inventar uno propio.
- **Idempotencia por diseño, no por confianza**: el OS ya tiene el patrón correcto en varios lados (`unique index` sobre `movimiento_caja_id` en `costos_reales`/`adicionales`/`certificados`; `unique(alerta_origen_id)` en `acciones`) — cualquier integración nueva necesita una clave de idempotencia explícita desde el primer diseño, no como parche después de un incidente de duplicación.
- **Migración en paralelo, nunca en corte**: mismo principio que ya aplica `cash-flow-operativo` para la transición Sheet→OS — un sistema legacy no se apaga hasta que el nuevo demostró ser confiable corriendo en paralelo un tiempo razonable.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Volumen/frecuencia real | ¿Cuántas veces por día/semana cambia este dato de verdad? |
| Costo de error | ¿Qué pasa si el dato llega tarde, duplicado, o no llega? |
| Complejidad de la fuente | ¿Tiene API real y documentada, o solo exporta CSV/Sheet? |
| Esfuerzo de mantenimiento | ¿Quién sostiene esto si el proveedor cambia su API sin aviso? |
| Reversibilidad | ¿Se puede volver a carga manual si la integración falla? |

## Errores frecuentes

- Construir una integración API completa para un dato que cambia una vez por semana, cuando un import manual lo resuelve en minutos — sobreingeniería explícitamente fuera de esta skill.
- No definir una clave de idempotencia y terminar duplicando movimientos de caja al reintentar una sincronización fallida.
- Tratar un timestamp sin zona horaria explícita — desfasajes de un día son un error real y frecuente en reportes financieros.
- Hacer polling agresivo de una fuente que no lo necesita, agotando rate limit sin necesidad real.
- No loggear ni alertar cuando una sincronización deja de correr — la falla silenciosa es peor que la falla visible.
- Apagar un sistema legacy antes de validar que el nuevo dato coincide, perdiendo la capacidad de detectar una migración mal hecha.

## Información necesaria

- Qué decisión de negocio depende del dato (la aporta la capacidad/skill de dominio correspondiente, no esta skill).
- Si la fuente externa tiene API real, documentación pública y límites de rate publicados, o si es exclusivamente exportable (Sheet/CSV).
- Volumen y frecuencia real de cambio del dato de origen — no la frecuencia teórica.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| Integración bancaria (conciliación, saldos, cheques/eCheq) | `finanzas-tesoreria-construccion` |
| Integración fiscal/AFIP/DGR San Juan | `impuestos-construccion` |
| Integración contable | `contabilidad-constructoras` |
| Migrar legajo/nómina desde un sistema externo | `derecho-laboral-construccion` |
| Cualquier decisión de qué dato capturar y por qué | la skill de dominio de negocio correspondiente — esta skill nunca decide sola qué integrar, solo cómo |

## Sistema de fuentes

1. **Conocimiento profesional estable**: patrones de integración (idempotencia, backoff, paginación, reconciliación) — no cambian con el tiempo.
2. **Normativa y regulación cambiante**: normas de seguridad de datos o manejo de secretos si llegaran a aplicar (sin evidencia hoy de que Echegaray esté sujeta a un régimen específico más allá de buenas prácticas generales).
3. **Documentación interna de Echegaray**: los campos `origen`/`fuente_legacy` ya presentes en el esquema (`movimientos_caja`, `costos_reales`, `compras`, `obligaciones`, etc.) son el precedente real de cómo el OS traza procedencia de dato.
4. **Datos estructurados del OS**: todas las tablas con `fuente_legacy`/`origen` ya construidas.
5. **Experiencia histórica**: ninguna integración real construida todavía — gap explícito, ver abajo.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: mecanismo de integración sugerido, siempre el más simple que sea suficiente.

## Política de fuentes externas y protocolo de vigencia

Antes de diseñar una integración contra una API real (banco, AFIP, proveedor), verificar con WebSearch/WebFetch la documentación oficial vigente: endpoints, método de autenticación, límites de rate, formato de paginación. Las APIs cambian de versión sin aviso — nunca asumir que la documentación de memoria del modelo sigue vigente. Registrar: fuente, versión de API documentada, fecha de consulta, estado de verificación.

## Jurisdicción aplicable

No tiene jurisdicción normativa propia. Cuando la integración es bancaria o fiscal, hereda la jurisdicción de `finanzas-tesoreria-construccion` (nacional, entidades financieras) o `impuestos-construccion` (nacional/San Juan/municipal según corresponda) — esta skill no decide jurisdicción, la respeta y la consulta.

## Límites de certeza

No puede afirmar que una API de un proveedor específico soporta webhooks, un rate limit concreto, o un método de autenticación determinado sin verificar su documentación vigente. No puede garantizar cero duplicados sin que exista una clave de idempotencia real definida por diseño — no basta con "reintentar con cuidado".

## Gaps de conocimiento conocidos (primera versión, parcialmente superado -- ver Historial)

Hasta el 2026-07-09 no existía ninguna integración real construida en Echegaray Business OS — todo el dato entraba por carga manual o por lectura puntual de Drive vía `discovery-drive-echegaray` (descubrimiento de lectura, no integración operativa). Esto cambió parcialmente: ver Historial de aprendizaje. Sigue sin existir ninguna integración bancaria (Santander) ni fiscal (ARCA) real -- ambas requieren un trámite externo (gestión con el banco, certificado digital en ARCA) que todavía no se hizo.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una futura integración bancaria deja de sincronizar durante varios días sin que nadie lo note (evento) → se detecta por una diferencia entre el saldo del OS y el saldo real del banco (resultado/desvío) → la causa es la ausencia de una alerta de salud de la integración (causa/evidencia) → si se repite con otra integración futura (recurrencia), se propone que toda integración nueva incluya un chequeo de salud obligatorio desde el diseño (propuesta de aprendizaje) → el usuario valida (nivel 2, criterio profesional) → se incorpora como criterio de esta skill → se mide en la próxima integración que se construya.

## Historial de aprendizaje (append-only, más reciente arriba)

- **2026-07-09** — Primera integración real construida: cuenta de servicio de Google (`scripts/google_workspace/`) con lectura/escritura acotada a archivos compartidos explícitamente (Sheets/Docs/Drive), sin delegación de dominio -- mecanismo más simple que alcanza, siguiendo el marco de esta misma skill. Jorge compartió la carpeta completa "administracion" de Drive, dando acceso real a ~45 archivos (incluyendo hallazgos nuevos: `ADICIONALES.xlsm`, `PRESUPUESTO PISO - INTERNO.xlsm`, carpetas `CERTIFICADOS`/`RECIBOS`/`FACTURAS A`). Escritura limitada por diseño a agregar (filas/pestañas/texto), nunca a sobrescribir -- varias fuentes reales (Control de Gastos, JORNALES) ya tienen fórmulas rotas y no hay que arriesgarse a empeorarlo. Idempotencia: no aplica todavía porque no hay escritura automática recurrente, solo lectura y agregado puntual bajo pedido.

## Relación con el OS

- **Áreas**: transversal — no pertenece a una sola área, es infraestructura que sirve a todas (Administración para banco/AFIP, Compras para proveedores, Personas para nómina externa).
- **Capacidades existentes**: ninguna integración real construida; el patrón `origen`/`fuente_legacy` ya usado en `movimientos_caja`, `costos_reales`, `compras`, `obligaciones`, `presupuestos` es la base a reutilizar en cualquier integración futura.
- **Centro de Acción**: candidato futuro para acciones de "sincronización caída" o "diferencia de conciliación sin explicar" — no construido hoy.
- **Dashboard**: no aporta alertas propias hoy.
- **Post Mortem**: no aplica directamente, salvo que una obra documente un problema de datos originado en una integración.
- **Memoria del proyecto**: cualquier patrón de integración validado (ej. cómo se resolvió la reconciliación con un banco específico) debería documentarse ahí, no quedar solo en el código.
- **Futuros agentes/automatización**: la sincronización determinística (clase A) es la única que se automatiza libremente. Cualquier resolución de conflicto de datos financieros o fiscales entre el OS y una fuente externa requiere aprobación humana (clase E) — nunca se resuelve solo automáticamente cuál de las dos fuentes "tiene razón".

## Prohibido

No recomendar una integración API cuando una carga manual o un import batch resuelve el mismo problema con menor riesgo y esfuerzo. No inventar límites de rate, métodos de autenticación o comportamiento de una API real sin verificar su documentación vigente. No diseñar ninguna sincronización sin una clave de idempotencia explícita.
