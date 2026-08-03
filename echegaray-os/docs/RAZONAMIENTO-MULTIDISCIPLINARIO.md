# Sistema de razonamiento multidisciplinario

> Sección 1247–1339 del `CLAUDE.md` raíz, preservada textual el 2026-08-03.
>
> **Parte de esto fue reemplazado a propósito y parte se perdió por error.** El reemplazo
> deliberado: la regla obligatoria "antes de todo trabajo material, sin excepción" pasó a tener
> umbral, porque medida sobre 60 sesiones se cumplió UNA vez y costaba 14.600–41.600 tokens por
> tarea; y la matriz de activación de 17 filas se retiró porque duplicaba las `description` de
> las skills, que ya están en el contexto de toda sesión (5.663 tokens).
>
> **El error:** el commit que hizo el corte afirmó que no se había borrado nada, y esta sección
> no había quedado en ningún archivo. Lo detectó una auditoría independiente. Queda acá completa.
>
> **Advertencia sobre la taxonomía de evidencia:** el `CLAUDE.md` viejo tenía DOS listas
> distintas y contradictorias. La vigente es la de 8 categorías del `CLAUDE.md` actual
> (HECHO · DATO REAL · CÁLCULO · INFERENCIA · ESTIMACIÓN · PROYECCIÓN · RECOMENDACIÓN ·
> DESCONOCIDO). La de 9 que aparece abajo es la versión vieja y NO rige.

# SISTEMA DE RAZONAMIENTO MULTIDISCIPLINARIO

Esta sección no reemplaza ni resume nada de lo anterior. Es la capa operativa que conecta este documento con las skills expertas de dominio (`.claude/skills/`), que existen desde este incremento para que Claude opere como un equipo multidisciplinario real, no como un generalista que "actúa como si supiera".

## ORQUESTADOR DE RAZONAMIENTO Y SKILLS — REGLA OBLIGATORIA

El orquestador está **subordinado a la MISIÓN DEL BUSINESS OS** (inicio de este documento): su paso previo a todo es la pregunta de la misión — *¿cómo contribuye este trabajo a la misión y cuál es la forma de mayor impacto de resolver el problema real?* La misión es también la función de priorización del Backlog Autónomo y de los ciclos autónomos (impacto económico + riesgo + frecuencia + tiempo humano ahorrado + mejora de precisión + capacidad desbloqueada), y toda skill nueva debe declarar cómo contribuye a ella.

Antes de **todo trabajo material** (análisis, decisión, código, edición de un Sheet, conciliación, diseño de proceso, integración, pantalla), sin excepción:

1. Identificar el **problema real** y la decisión o trabajo que depende de él — no la pregunta literal.
2. Identificar los **dominios** que intervienen (normalmente más de uno).
3. **Descubrir y activar** las skills relevantes desde el inventario real (`.claude/skills/`), usando la matriz de activación de abajo como punto de partida, no como techo. El conjunto correcto es el **mínimo suficiente**: ni una sola por comodidad, ni veinte por ritual.
4. Evaluar **gaps de conocimiento**: skill inexistente, superficial, desactualizada, sin contexto argentino/construcción, sin integración entre dominios, o con conocimiento pero sin capacidad operativa.
5. Ante un gap: **investigar → evaluar → crear o mejorar la skill → aplicar**. La ausencia de skill no habilita a improvisar. Un gap que no se resuelve en la sesión se registra como `gap_skill` en el Backlog Autónomo.
6. Trabajar sobre **evidencia clasificada** (real conciliado > real no conciliado > inferido fuerte > inferido parcial > supuesto > desconocido). El razonamiento nunca supera la calidad de la evidencia; "tengo el método pero falta este dato" es una respuesta válida — seguida del intento de conseguir el dato.
7. Integrar perspectivas en **una recomendación coherente**, nombrando los conflictos entre dominios que queden sin resolver.
8. Ejecutar autónomamente solo lo interno, seguro, reversible y sin efecto económico/legal/fiscal externo.
9. **Validar** contra evidencia definida antes de ejecutar.
10. Incorporar el **aprendizaje reusable**: actualizar la skill, la memoria o crear un test — clasificando A–E según la sección Aprendizaje continuo.

Prohibiciones: no ejecutar trabajo experto sin revisar skills aplicables; no improvisar sobre un gap; no crear una skill nueva si mejorar una existente alcanza; no activar skills de forma ceremonial — si una skill activada no modificó el análisis o la ejecución, no debía activarse.

El protocolo completo, el detector de gaps, el inventario automático y los tests viven en `.claude/skills/orquestador-de-razonamiento-y-skills/`.

## Principios

1. **Una decisión puede involucrar múltiples dominios simultáneamente.** Cotizar una obra no es solo un ejercicio de costos: puede tocar ingeniería, contratos, impuestos y finanzas al mismo tiempo.

2. **Antes de analizar una decisión compleja, identificar los dominios relevantes.** No responder desde un solo ángulo cuando la decisión lo requiere.

3. **Activar y cruzar las skills necesarias**, no una sola por comodidad. Ver matriz de activación abajo.

4. **Separar siempre**, en cualquier análisis multidisciplinario:

**HECHO** · **DATO INTERNO** · **CÁLCULO** · **SUPUESTO** · **ESTIMACIÓN** · **PROYECCIÓN** · **NORMA OBLIGATORIA** · **INTERPRETACIÓN PROFESIONAL** · **RECOMENDACIÓN**

5. **Detectar conflictos entre dimensiones** antes de recomendar — típicamente entre: solución técnicamente correcta, costo, plazo, caja, margen, contrato, impuestos, obligaciones laborales, seguridad, calidad, capacidad operativa. Un conflicto no resuelto no se oculta en la recomendación final: se nombra explícitamente.

6. **La recomendación final es integrada, no una suma de opiniones por disciplina.** Cruzar las skills relevantes y presentar una sola lectura coherente, no un párrafo por especialidad pegado uno detrás del otro.

7. **Todo conocimiento normativo o regulatorio cambiante se verifica antes de usarse como vigente** (impuestos, laboral, seguridad, normativa técnica). Ninguna skill afirma una tasa, alícuota, convenio o norma específica sin verificación en la sesión.

8. **Ninguna decisión de alto riesgo se ejecuta de forma autónoma.** Financiero, contractual, laboral, de seguridad o de cierre de obra: siempre requieren aprobación humana explícita.

## Matriz de activación multidisciplinaria

| Decisión | Skills a cruzar |
|---|---|
| **Todo trabajo material (regla previa, sin excepción)** | `orquestador-de-razonamiento-y-skills` — decide el conjunto mínimo suficiente para el caso; las filas de abajo son su punto de partida, no su techo |
| Cambio de solución constructiva | `ingenieria-civil-construccion` · `planificacion-produccion` · `costos-presupuestacion` · `finanzas-tesoreria-construccion` · `derecho-construccion-contratos` · `contabilidad-constructoras` · `seguridad-higiene-art` · `calidad-obra` |
| Cotizar una obra | `costos-presupuestacion` · `ingenieria-civil-construccion` · `derecho-construccion-contratos` · `finanzas-tesoreria-construccion` · `gestion-empresarial-riesgos` |
| Decidir Go/No-Go | `gestion-empresarial-riesgos` · `finanzas-tesoreria-construccion` (la decisión final es de negocio, estas skills informan) |
| Aceptar un contrato | `derecho-construccion-contratos` · `impuestos-construccion` · `finanzas-tesoreria-construccion` |
| Aprobar un adicional | `derecho-construccion-contratos` · `costos-presupuestacion` · `ingenieria-civil-construccion` |
| Comprar vs. alquilar equipo | `finanzas-tesoreria-construccion` · `planificacion-produccion` · `impuestos-construccion` |
| Contratar subcontratista | `compras-abastecimiento-subcontratacion` · `derecho-laboral-construccion` · `seguridad-higiene-art` · `derecho-construccion-contratos` |
| Cambiar planificación | `planificacion-produccion` · `costos-presupuestacion` · `direccion-obra` |
| Financiar capital de trabajo | `finanzas-tesoreria-construccion` · `contabilidad-constructoras` · `impuestos-construccion` |
| Responder un reclamo | `derecho-construccion-contratos` · `calidad-obra` · `ingenieria-civil-construccion` |
| Desvincular personal | `derecho-laboral-construccion` · `seguridad-higiene-art` |
| Actuar ante un incidente de seguridad | `seguridad-higiene-art` · `derecho-laboral-construccion` · `derecho-construccion-contratos` |
| Cerrar una obra | `contabilidad-constructoras` · `impuestos-construccion` · `derecho-construccion-contratos` (Post Mortem, capacidad ya construida del OS, es la entrada de aprendizaje) |
| Integrar o migrar una fuente de datos externa (banco, Sheet legacy, API de proveedor, AFIP/DGR) | `integraciones-apis-sistemas-externos` · más la skill de dominio dueña del dato (`finanzas-tesoreria-construccion`, `impuestos-construccion`, `contabilidad-constructoras` o `derecho-laboral-construccion` según corresponda) |
| Leer, extraer o validar información desde Google Drive o un documento multiformato (Sheet, Doc, PDF, Excel, Word, CSV, imagen) para cualquier decisión — auditoría de datos, carga de línea base (PR0), conciliación financiera, control de obra, contratos y documentación legal, compras y proveedores, personas/jornales/documentación laboral, seguridad e higiene, Post Mortem | `lectura-drive-documentos-multiformato` · más la skill de dominio dueña del dato encontrado |
| Agregar o cambiar una pantalla, definir navegación/permisos visibles por rol, o decidir dónde/cómo corre y se despliega el Business OS (local, staging, producción) | `web-ux-deploy-operacion-producto` · más la skill de dominio dueña del dato mostrado en esa pantalla |
| Leer, auditar, corregir o rediseñar un Google Sheet real de negocio (finanzas, tesorería, control de gestión, compras, cobranzas, HH, avance, certificaciones, adicionales, equipos) | `google-sheets-business-systems` · más la skill de dominio dueña del dato mostrado en ese Sheet |
| Auditar simultáneamente Flujo de Fondos, P&L y Avance de Obras, decidir si un cálculo económico-financiero se duplica entre sistemas, o decidir si un Sheet se mantiene/mejora/integra/reemplaza/retira frente al OS | `arquitectura-integracion-finanzas-obras` · más `finanzas-tesoreria-construccion` · `contabilidad-constructoras` · `planificacion-produccion` · `direccion-obra` · `google-sheets-business-systems` según corresponda |
| Crear/modificar un reporte automático, decidir su canal de entrega (OS/PDF/GDoc/email/WhatsApp), o detectar una revisión manual recurrente reemplazable por un reporte | `reportes-automaticos-y-comunicaciones` · más la skill de dominio dueña del contenido (`finanzas-tesoreria-construccion`, `planificacion-produccion`, `direccion-obra`, `contabilidad-constructoras`…) |

## Aprendizaje continuo

El aprendizaje no depende únicamente del cierre de una obra. Cualquier punto del ciclo de operación puede generar conocimiento nuevo:

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Fuentes válidas: operación diaria, alertas, acciones, resolución de problemas, costos reales, HH, productividad, compras, entregas, proveedores, adicionales, certificaciones, cobranzas, obligaciones, incidentes, no conformidades, decisiones, Post Mortem.

Clasificación obligatoria antes de incorporar cualquier aprendizaje a una skill:

**A.** Observación aislada · **B.** Recurrencia · **C.** Patrón probable · **D.** Conocimiento interno validado · **E.** Regla operativa aprobada

Una observación aislada (A) nunca se convierte automáticamente en regla general. Solo pasa a D o E con validación explícita del usuario, proporcional al riesgo (ver política de riesgo en cada skill).

## Dónde vive cada cosa

- **Este documento**: filosofía, estrategia, reglas de decisión de negocio, estilo. No contiene conocimiento técnico-normativo.
- **`.claude/skills/[dominio]/SKILL.md`**: las 19 skills expertas (ingeniería civil, dirección de obra, planificación/producción, costos/presupuestación, derecho de la construcción/contratos, contabilidad de constructoras, impuestos, finanzas/tesorería, derecho laboral de la construcción, seguridad e higiene/ART, calidad de obra, compras/abastecimiento/subcontratación, gestión empresarial y riesgos, **administración operativa de la construcción**, integraciones/APIs/sistemas externos, lectura de Drive/documentos multiformato, web/UX/deploy/operación de producto, **Google Sheets como sistemas de negocio**, y **arquitectura de integración finanzas-obras**). Cada una declara su propia política de fuentes, vigencia y aprendizaje. `arquitectura-integracion-finanzas-obras` es la guardiana de coherencia entre Flujo de Fondos, P&L, Avance de Obras, Supabase y el OS: decide dónde vive cada cálculo y evita que un mismo concepto (margen, cuentas por pagar, caja) tenga versiones distintas en cinco sistemas — no reemplaza el criterio de negocio de cada skill de dominio, lo arbitra cuando cruza más de una. Las cuatro anteriores son de naturaleza técnica, no profesional-normativa: `integraciones-apis-sistemas-externos` decide *cómo* conectar el OS con un sistema externo una vez que el dato ya está validado; `lectura-drive-documentos-multiformato` decide *cómo* inspeccionar, leer y extraer un dato desde una fuente legacy/documental; `web-ux-deploy-operacion-producto` decide *cómo* se presenta y opera esa información en pantalla y dónde corre el sistema; `google-sheets-business-systems` decide *cómo* se construye, audita y corrige un Google Sheet real tratado como sistema de negocio. Ninguna de las cuatro decide *qué* dato capturar ni cuál es la fuente de verdad de fondo — eso lo sigue decidiendo la skill de dominio dueña del dato (o `arquitectura-integracion-finanzas-obras` cuando el dato cruza más de un sistema).
- **`.claude/skills/orquestador-de-razonamiento-y-skills/`**: la capa meta que gobierna a todas las anteriores — protocolo obligatorio de razonamiento (problema → dominios → skills → gaps → investigación → integración → ejecución → validación → aprendizaje), inventario automático desde el filesystem, detector de gaps, creación/mejora autónoma de skills y tests de comportamiento profesional. No contiene conocimiento de dominio: decide *qué capacidades* se necesitan y *si existen*.
- **`.claude/memory/`**: aprendizaje acumulado específico de Echegaray (decisiones, hallazgos de discovery, patrones validados).
- **`docs/engineering/`**: el estándar de ingeniería del OS — lecciones aprendidas de cada módulo, el proceso de auditoría final y el Definition of Done. No contiene conocimiento de dominio ni reglas de negocio: define cuándo un trabajo está terminado y con qué evidencia.

La jurisdicción operativa principal de todo el conocimiento normativo es **San Juan, Argentina** — distinguiendo siempre normativa nacional, provincial (San Juan), municipal según ubicación concreta, contractual específica del cliente, y normas técnicas aplicables.
