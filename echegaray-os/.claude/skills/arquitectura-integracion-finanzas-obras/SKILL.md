---
name: arquitectura-integracion-finanzas-obras
description: "Guardiana de coherencia entre Flujo de Fondos (finanzas-tesoreria-construccion), P&L (contabilidad-constructoras), Avance de Obras (planificacion-produccion/direccion-obra), Supabase y el Business OS. Activar SIEMPRE que un cambio de fórmula, tabla o dato pueda calcularse en más de un sistema, antes de auditar los tres Sheets reales simultáneamente, o al decidir si un Sheet se mantiene/mejora/integra/reemplaza/retira frente al OS. No reemplaza a las skills de dominio — decide dónde vive cada cálculo y evita que existan cinco versiones distintas de la misma empresa."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "No aplica (arquitectura de datos) -- hereda criterio de negocio de finanzas-tesoreria-construccion, contabilidad-constructoras, planificacion-produccion, costos-presupuestacion según el dato en cuestión"
---

# Arquitectura de Integración Finanzas-Obras

## Propósito

Evitar que Flujo de Fondos, P&L, Avance de Obras, Supabase y el Business OS se conviertan en cinco versiones distintas de la misma realidad empresarial. Esta skill no calcula márgenes, ni proyecta caja, ni mide avance — decide **dónde nace cada dato, dónde vive el cálculo canónico, y qué sistemas lo consumen**, para que Dirección nunca reciba dos números distintos para la misma pregunta.

Es la aplicación directa, a nivel de arquitectura de datos, del principio ya establecido en el `CLAUDE.md` raíz: *"Nunca crear una tabla, un flujo o una pantalla que ya exista en otro lado sin justificación explícita."*

## Alcance

Cubre: el diccionario de eventos de negocio que atraviesan Obra→Caja→P&L, la matriz de fuente de verdad por concepto crítico, los contratos de información entre sistemas, la prohibición de doble lógica de cálculo, y la decisión de transición Sheets↔OS por capacidad.

No cubre: el criterio de negocio de cada dominio (vive en `finanzas-tesoreria-construccion`, `contabilidad-constructoras`, `planificacion-produccion`, `direccion-obra`, `costos-presupuestacion`), ni la mecánica de edición de un Sheet puntual (`google-sheets-business-systems`). Esta skill se activa **junto con** esas otras, nunca en su lugar.

## Principio general

Los tres sistemas reales representan realidades diferentes pero conectadas:

- **Flujo de Fondos = realidad financiera y temporal** (percibido).
- **Ingresos y Egresos / P&L = realidad económica devengada.**
- **Avance de Obras = realidad productiva y económica de cada obra.**

Regla fundamental — nunca:

- optimizar cada Sheet como un silo aislado;
- duplicar un cálculo que ya existe en otro sistema;
- inventar una sincronización automática que nadie pidió ni validó;
- mezclar percibido con devengado;
- confundir avance físico con avance económico;
- confundir costo pagado con costo incurrido;
- confundir certificado con facturado;
- confundir facturado con cobrado;
- confundir compra con recepción;
- confundir obligación con pago;
- confundir presupuesto con forecast;
- confundir costo comprometido con costo real.

Cada concepto crítico debe poder responder: definición, evento de origen, fecha relevante, fuente primaria, sistema propietario, sistema(s) consumidor(es), criterio de actualización, mecanismo de conciliación, nivel de confianza.

## Diccionario de eventos de negocio (mínimo obligatorio)

Para cada evento de la lista, antes de tocar una fórmula que lo use, confirmar: qué significa, quién lo genera, fecha del evento vs. fecha económica vs. fecha financiera, fuente primaria, identificador único, tablas/pestañas afectadas, sistemas consumidores, mecanismo de conciliación, riesgo de duplicación.

`presupuesto creado` · `presupuesto aprobado` · `contrato firmado` · `adicional identificado` · `adicional aprobado` · `actividad planificada` · `actividad iniciada` · `avance registrado` · `HH trabajada` · `material solicitado` · `compra solicitada` · `compra aprobada` · `orden emitida` · `material recibido` · `factura recibida` · `costo devengado` · `obligación creada` · `pago programado` · `pago realizado` · `cheque emitido` · `cheque debitado` · `certificado preparado` · `certificado aprobado` · `factura emitida` · `cuenta por cobrar creada` · `cobro esperado` · `cobro realizado`.

No completar este diccionario de una sola vez de forma especulativa — construirlo evento por evento, a medida que una auditoría real lo necesita, con datos confirmados de los Sheets reales (no supuestos).

## Matriz de fuente de verdad (construir con la arquitectura real, no copiar este ejemplo)

| Concepto | Sistema propietario | Sistemas consumidores |
|---|---|---|
| Caja real conciliada | Fuente bancaria / conciliación manual hoy | Flujo de Fondos, Dirección, forecast |
| Movimiento financiero (cobro/pago real o proyectado) | `Flujo de Caja - Cash Flow` (Sheet, confirmado fuente de verdad hoy) | Caja, forecast, conciliación, OS (`movimientos_caja`) |
| Costo devengado | Registro económico de costos de obra | Obra, P&L, EAC |
| HH real | Captura operativa semanal (JORNALES / `registros_hh` en el OS) | Obras, productividad, costo laboral |
| Avance físico | Control de obra (hoy informal, no migrado — gap confirmado) | Obras, forecast, Dirección |
| Certificado aprobado | Certificación de obra | Cuentas por cobrar, P&L (según criterio a confirmar con el estudio contable), forecast |
| Cobro real | Movimiento financiero conciliado | Caja, cuentas por cobrar, capital de trabajo |

Cada fila debe poder señalarse con evidencia real (una celda, una fórmula, una tabla) — no se acepta una fila "razonable" sin haber leído el sistema real primero.

## Contratos de información obligatorios entre dominios

**Avance de obra → Control económico**: avance físico + HH + productividad + costo real + costo comprometido + restricciones → ETC → EAC → margen forecast.

**Obra → Flujo de Fondos**: plan de producción → necesidades de materiales → compras → obligaciones → calendario de pagos → forecast de caja. Y en paralelo: avance/certificación → facturación → cuenta por cobrar → fecha probable de cobro → forecast de caja.

**Obra → P&L**: costos incurridos → costo devengado. Ingreso económico → reconocimiento según criterio definido y consistente (gap: el criterio exacto de reconocimiento no está confirmado con el estudio contable externo — ver `contabilidad-constructoras`).

**P&L ↔ Flujo de Fondos**: devengado vs. percibido, con el puente de conciliación ya definido en `contabilidad-constructoras` (EBITDA≠CAJA).

## Prohibición de doble lógica

Antes de escribir cualquier fórmula, query, función TypeScript/SQL o rutina de Apps Script, preguntar: **¿este cálculo ya existe en otro lugar?**

Si existe: identificar cuál es el cálculo canónico, reutilizarlo o exponerlo, o migrarlo de forma controlada — nunca dejar que el Sheet calcule un margen, Supabase calcule otro, TypeScript calcule un tercero y el Dashboard muestre un cuarto. Debe existir trazabilidad de cálculo: de dónde sale cada número que Dirección ve.

## Responsabilidad sobre la transición Sheets → OS

No asumir que todos los Sheets deben desaparecer inmediatamente, ni que deben permanecer para siempre. Para cada capacidad, decidir explícitamente una de cinco:

| Decisión | Cuándo aplica |
|---|---|
| **MANTENER** | Es una buena interfaz de captura o análisis; no hay ganancia real en migrarla. |
| **MEJORAR** | Funciona pero tiene deficiencias de diseño/fórmula/UX (aplicar `google-sheets-business-systems`). |
| **INTEGRAR** | Debe alimentar al OS automáticamente sin dejar de ser la interfaz de captura. |
| **REEMPLAZAR PROGRESIVAMENTE** | El OS puede ofrecer un flujo claramente mejor, y existe capacidad construida (PRP) que lo soporta. |
| **RETIRAR** | Solo cuando exista reemplazo validado y reconciliado — nunca antes. |

## Responsabilidad sobre datos externos

Para cada dato crítico, evaluar si existe una fuente superior: bancos, ARCA, BCRA, APIs, extractos, AppSheet, Drive, Gmail futuro, sistemas de proveedores, organismos relevantes. Por ahora: **solo lectura, extracción y conciliación** — no ejecutar operaciones externas sin autorización explícita.

## Protocolo de auditoría cruzada (obligatorio antes de tocar más de un sistema)

1. **Leer todo**: las tres pestañas completas de cada sistema (no solo la que Jorge menciona), fórmulas, valores, rangos nombrados, validaciones, tablas dinámicas, gráficos, Apps Script, IMPORTRANGE, dependencias externas, integración actual con Supabase y con el OS.
2. **Mapear**: `FUENTE → INPUT → TRANSFORMACIÓN → OUTPUT → CONSUMIDOR → DECISIÓN`.
3. **Auditar**: errores conceptuales, de fórmula, temporales, doble conteo, duplicaciones, fuentes congeladas, datos manuales evitables, referencias rotas, procesos incómodos, problemas de performance/regionalización, inconsistencias entre sistemas.
4. **Contrastar con mejores prácticas**: cuando el cambio sea material, verificar documentación oficial/profesional actual (WebSearch), comparar alternativas, elegir por robustez, precisión, simplicidad, rendimiento y mantenibilidad — no por sofisticación.
5. **Diseñar antes de editar**: AS-IS → problema → causa → arquitectura objetivo → transición → implementación → validación → rollback.
6. **Implementar**: cambios seguros, reversibles y verificables pueden ejecutarse de forma autónoma. Ningún cambio destructivo sin protección (ver `google-sheets-business-systems`, protección de rangos).
7. **Validar**: releer, recalcular, comparar, conciliar, probar casos reales y de borde, comprobar períodos/arrastre/fechas/regionalización/dependencias.
8. **Crítica propia**: ¿la solución reduce trabajo? ¿mejora precisión? ¿elimina duplicación? ¿es entendible? ¿escala? ¿genera una nueva fuente de contradicción? ¿debería vivir en Sheets, en Supabase, o ser una pantalla del OS? ¿existe una fuente externa mejor?

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Duplicación | ¿Este cálculo ya existe en otro sistema? |
| Propiedad | ¿Cuál es el sistema propietario real de este dato hoy? |
| Confianza | ¿Qué nivel de confianza tiene este dato (real/estimado/supuesto)? |
| Transición | ¿Mantener, mejorar, integrar, reemplazar o retirar esta capacidad? |
| Reversibilidad | ¿El cambio propuesto se puede deshacer si algo sale mal? |

## Errores frecuentes

- Auditar los tres sistemas por separado en vez de simultáneamente — se pierden las duplicaciones que solo aparecen al cruzarlos.
- Proponer una "sincronización automática" entre Sheets sin que nadie la haya pedido ni validado el riesgo de que quede desincronizada en silencio.
- Migrar una capacidad del Sheet al OS antes de que el reemplazo esté validado y reconciliado (violación directa de "RETIRAR solo con reemplazo validado").
- Dejar que el mismo número (ej. un margen) se calcule en el Sheet y en el OS con fórmulas ligeramente distintas, sin que nadie note la divergencia hasta que Dirección la ve en una reunión.

## Información necesaria

- Los tres Sheets reales completos: `Flujo de Caja - Cash Flow`, `Ingresos y Egresos - P&L`, y la fuente real de avance de obra (a confirmar cuál es hoy — ver Fase 1 de la aplicación inmediata).
- Estado real de integración Supabase↔Drive (`scripts/google_workspace/`, PRPs 001-015 del OS).
- `.claude/memory/project/arquitectura-fuentes-informacion.md` y `continuidad-operacional-datos.md` (jerarquía de verdad ya aprobada).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El dato en conflicto es de caja/tesorería | `finanzas-tesoreria-construccion` |
| El dato en conflicto es de P&L/devengado | `contabilidad-constructoras` |
| El dato en conflicto es de avance/HH/economía de obra | `planificacion-produccion`, `direccion-obra` |
| El dato en conflicto es de costo/presupuesto | `costos-presupuestacion` |
| La tarea es editar un Sheet puntual (no decidir arquitectura) | `google-sheets-business-systems` |
| El dato viene de un sistema externo (banco, ARCA, proveedor) | `integraciones-apis-sistemas-externos` |
| El dato hay que extraerlo de un documento/Drive primero | `lectura-drive-documentos-multiformato` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios de arquitectura de datos, master data management, single source of truth.
2. **Documentación interna de Echegaray**: los tres Sheets reales, PRPs del OS, memoria del proyecto.
3. **Datos estructurados del OS**: esquema real de Supabase (tablas, vistas, triggers ya construidos).
4. **Interpretación profesional**: lectura del caso concreto.
5. **Recomendación**: acción sugerida, siempre con la decisión MANTENER/MEJORAR/INTEGRAR/REEMPLAZAR/RETIRAR explícita.

## Política de fuentes externas y protocolo de vigencia

Si se cita un patrón de arquitectura de datos o de MDM como respaldo de una decisión de diseño, verificar con WebSearch que la fuente sea reconocida (proveedores de MDM, documentación técnica seria) y registrar fecha de consulta. No inventar un "estándar de la industria" sin poder señalar de dónde sale.

## Jurisdicción aplicable

No aplica — es un dominio técnico de arquitectura de datos, no normativo.

## Límites de certeza

No puede afirmar cuál es el "sistema propietario" real de un dato sin haber leído los tres sistemas — no inferir la matriz de fuente de verdad sin evidencia directa. No puede recomendar RETIRAR una capacidad de Sheet sin que el reemplazo ya esté validado y reconciliado con datos reales.

## Gaps de conocimiento conocidos (primera versión)

**Corregido 2026-07-09 (lectura real, Fase 1 de la aplicación inmediata)**: el gap anterior ("no existe fuente de avance físico") era incorrecto. Existen **dos fuentes reales y estructuradas de avance de obra que hoy no están conectadas entre sí**:

1. `Avances de Obra` (Sheet nativo, compartido, propiedad de Rodrigo, ID `1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug`) — una pestaña por obra (Estrella, San Francisco, LE - Comedor, Messina), con Gantt real: actividad/comentario/inicio/fin/días/estado/% hecho + grilla diaria de % de avance por actividad. Esta es la fuente primaria real de **avance físico**.
2. `Ingresos y Egresos - P&L`, pestañas `08_Control_Obra [obra]` y `08_Control_Cliente [obra]` — checklist de gestión y estado por obra/cliente (datos generales, responsable interno, estado narrativo tipo "Pausado por trabajos en ARCOR"). No es un Gantt ni tiene % de avance físico verificable — es una bitácora de estado.

Ninguna de las dos alimenta la otra ni al Cash Flow de forma automática (no se encontró IMPORTRANGE entre ellas). Esto es una duplicación conceptual real: dos lugares "por obra" con información parcialmente superpuesta y ningún mecanismo de conciliación. Pendiente de Fase 2/3: decidir cuál es el sistema propietario de "estado de obra" y si el otro se integra, se retira, o se redefine su propósito para que no compitan.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: se detecta que un mismo concepto (ej. "cuentas por pagar") se calcula distinto en dos sistemas (evento/desvío) → se investiga la causa (criterio de "pagado" distinto en cada fórmula) → si se repite con otro concepto (recurrencia/patrón), se propone una regla general de nomenclatura y ubicación de cálculos canónicos → el usuario valida (nivel de riesgo según si afecta una decisión financiera) → se incorpora a la matriz de fuente de verdad de esta skill → se mide si la próxima auditoría cruzada encuentra menos divergencias.

## Historial de aprendizaje (append-only, más reciente arriba)

(vacío — se completa con la primera auditoría cruzada real de los tres sistemas)

## Relación con el OS

- **Áreas**: transversal — Administración y Finanzas + Obras y Producción.
- **Capacidades existentes**: consumidora de todo lo ya construido (PRP-001 a PRP-015) como referencia de "qué ya existe antes de proponer algo nuevo".
- **Centro de Acción**: puede generar una acción cuando detecta una divergencia real entre sistemas no explicada.
- **Dashboard**: no aporta una sección propia — su output es la coherencia de las secciones existentes, no una nueva.
- **Post Mortem**: consumidora si el post-mortem de una obra revela que dos sistemas mostraban resultados distintos durante la ejecución.
- **Memoria del proyecto**: la matriz de fuente de verdad validada y el diccionario de eventos deberían consolidarse ahí a medida que se confirman con evidencia real.
- **Futuros agentes/automatización**: cualquier sincronización automática entre sistemas es candidata futura de clase C/D como máximo tras validación explícita repetida — nunca clase E sin aprobación humana dado el riesgo de propagar un error silenciosamente a los tres sistemas a la vez.

## Prohibido

No declarar un sistema como "fuente de verdad" de un concepto sin haber leído los tres sistemas reales. No recomendar retirar un Sheet sin reemplazo validado. No inventar una sincronización automática entre sistemas sin autorización explícita del usuario.
