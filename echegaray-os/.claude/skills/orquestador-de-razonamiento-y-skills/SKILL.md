---
name: orquestador-de-razonamiento-y-skills
description: "Capa meta obligatoria que gobierna cómo se razona y qué capacidades se activan antes de todo trabajo material en Echegaray Business OS: identificar el problema real, descubrir y activar el conjunto mínimo suficiente de skills, detectar gaps de conocimiento, investigar/crear/mejorar skills, integrar perspectivas en una sola recomendación, ejecutar sobre evidencia clasificada, validar y aprender. Activar SIEMPRE al inicio de cualquier análisis, decisión, edición de Sheet, conciliación, código o proceso — no es opcional ni decorativa. No contiene conocimiento de dominio: decide qué capacidades se necesitan y si existen."
allowed-tools: Read, Bash, Grep, Glob, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: meta-orchestration
  jurisdiccion-principal: "San Juan, Argentina"
---

# Orquestador de Razonamiento y Skills

## Propósito

**Subordinado a la MISIÓN DEL BUSINESS OS** (CLAUDE.md raíz, sección inicial): la pregunta previa a todo trabajo material es la de la misión — *¿cómo contribuye este trabajo a la misión y cuál es la forma de mayor impacto de resolver el problema real?* La misión es la función de priorización del Backlog Autónomo y de los ciclos autónomos; su integridad se verifica con `scripts/verificar_mision.py` (correr junto con `--validar` al tocar skills o el CLAUDE.md).

Que ningún trabajo material se ejecute con razonamiento genérico cuando existe (o debería existir) una capacidad experta que lo haga mejor. El orquestador convierte al sistema en algo más que "un LLM + una lista de skills": un sistema que sabe qué capacidades necesita para cada problema, detecta cuando no las tiene, las adquiere o mejora, las combina, actúa, valida y aprende.

Secuencia obligatoria:

`NO SÉ QUÉ HACER → IDENTIFICO QUÉ NECESITO SABER → BUSCO SI YA SÉ HACERLO → ACTIVO LA CAPACIDAD → SI NO ALCANZA, INVESTIGO → CREO O MEJORO LA CAPACIDAD → RAZONO CON EVIDENCIA → ACTÚO → VALIDO → APRENDO`

## Alcance

Cubre: la selección y combinación de skills, la detección de gaps de conocimiento, la creación/mejora autónoma de skills, la jerarquía de evidencia, la búsqueda autónoma de fuentes, la trazabilidad hacia el Operador Digital y el registro de gaps en el Backlog Autónomo.

No cubre: el conocimiento de dominio en sí (vive en cada skill), las reglas de negocio del CLAUDE.md raíz (las aplica, no las repite), ni la decisión final de negocio (siempre humana cuando el riesgo lo exige).

Aplica a todo trabajo material: análisis empresarial, decisiones, finanzas, tesorería, contabilidad, impuestos, legal, laboral, ingeniería, obras, planificación, producción, costos, presupuestos, cotizaciones, compras, proveedores, seguridad e higiene, personas, equipos, vehículos, herramientas, datos, Google Sheets, software, UX, arquitectura, automatización, integraciones, APIs y procesos.

## Protocolo de razonamiento obligatorio (A–M)

Ejecutar internamente antes y durante cada trabajo material. No es un formulario a mostrar — es el orden real del razonamiento. Solo se muestra la traza resumida cuando es útil (ver Trazabilidad).

| Paso | Pregunta | Regla |
|---|---|---|
| A | ¿Cuál es la pregunta aparente? | Qué se pidió literalmente. |
| B | ¿Cuál es el problema real? | Qué resultado empresarial se intenta conseguir. Si A≠B, resolver B (y decirlo). |
| C | ¿Qué decisión o trabajo depende de esto? | Sin decisión asociada, el análisis probablemente no es prioritario (regla de dashboards del CLAUDE.md raíz, generalizada). |
| D | ¿Qué evidencia existe? | Supabase, Sheets, Drive, documentos, PDFs, APIs, fuentes oficiales, historial git, código, tests, observaciones del OS, memoria del proyecto. Clasificarla (ver Jerarquía de evidencia). |
| E | ¿Qué dominios intervienen? | Normalmente más de uno. Nombrarlos antes de elegir skills. |
| F | ¿Qué skills existen? | Consultar el inventario real: `python3 scripts/inventario_skills.py` (descubrimiento automático desde el filesystem, nunca una lista manual). |
| G | ¿Son suficientes? | Evaluar cobertura, profundidad, actualidad, contexto argentino, contexto construcción y capacidad operativa. |
| H | ¿Falta conocimiento? | Si falta: investigar, contrastar fuentes, crear o mejorar skill, documentar criterio reusable. Nunca improvisar sobre el gap. |
| I | ¿Qué conflictos existen entre perspectivas? | Ej.: tesorería quiere diferir un pago; compras advierte corte de suministro; obras advierte plazo; legal advierte incumplimiento. Integrar consecuencias, no ocultar el conflicto. |
| J | ¿Cuál es la recomendación o plan? | Surge de evidencia + skills + restricciones. Una lectura coherente, no una opinión por disciplina. |
| K | ¿Qué puede ejecutarse autónomamente? | Solo lo interno, seguro, reversible, testeable, sin efecto económico/legal/fiscal externo (niveles A–D del Backlog; E–F requieren aprobación humana). |
| L | ¿Cómo se valida? | Definir la evidencia de éxito ANTES de ejecutar (ej.: "Total Egresos idéntico antes/después", "0 errores de fórmula", "test pasa"). |
| M | ¿Qué aprendimos? | Evaluar si corresponde actualizar skill, crear regla, test, detector, rutina, observación o mejora del OS. Clasificar A–E antes de incorporar. |

## Selección de skills: mínimo suficiente

Un problema empresarial normalmente cruza dominios. Nunca activar una sola skill por comodidad ni veinte por ritual — la selección se razona y se puede defender.

Ejemplos calibrados con casos reales de Echegaray:

- **"Tenemos tensión de caja"** → no solo `finanzas-tesoreria-construccion` + `cash-flow-operativo`. Según evidencia: cobranzas/certificación (`planificacion-produccion`), contratos (`derecho-construccion-contratos`), compras (`compras-abastecimiento-subcontratacion`), impuestos (`impuestos-construccion`), coherencia entre sistemas (`arquitectura-integracion-finanzas-obras`).
- **"Pisos consume demasiadas HH"** → `planificacion-produccion` (rendimientos) + `costos-presupuestacion` (impacto EAC) + `direccion-obra` (organización de frentes) + `ingenieria-civil-construccion` si la causa es técnica + `derecho-laboral-construccion` si la respuesta toca la cuadrilla + `finanzas-tesoreria-construccion` si el impacto es material en caja.
- **"Mejorar la planilla de gastos"** → no solo `google-sheets-business-systems`. También `administracion-operativa-construccion` (proceso real), `contabilidad-constructoras` (criterio devengado), `finanzas-tesoreria-construccion` (criterio percibido), `impuestos-construccion` (si hay dato fiscal), `arquitectura-integracion-finanzas-obras` (si el cálculo puede duplicarse con otro sistema).

La matriz de activación del CLAUDE.md raíz es el punto de partida, no el techo: si la situación real cruza un dominio que la matriz no lista, se agrega igual.

## Detector de gap de skill

Ante cada trabajo, clasificar explícitamente el estado de cobertura:

| Tipo | Descripción | Respuesta |
|---|---|---|
| A | No existe skill | Investigar → evaluar → crear si cumple los criterios de creación → aplicar. Si no se resuelve en la sesión: `gap_skill` al Backlog. |
| B | Existe pero es superficial | Profundizar la skill con la investigación de la sesión (sección de mejora autónoma). |
| C | Existe pero está desactualizada | Verificar vigencia (obligatorio en normativa) y actualizar. |
| D | Existe pero no cubre el contexto argentino | Investigar la variante local (ARCA, DGR San Juan, UOCRA, IERIC…) antes de aplicar el criterio genérico. |
| E | Existe pero no cubre construcción | Ídem: adaptar al contexto constructora antes de aplicar. |
| F | Existen varias skills pero falta integración | Evaluar si el patrón transversal es estable → skill de integración (ej. `arquitectura-integracion-finanzas-obras`). |
| G | Existe conocimiento pero no capacidad operativa | La skill "sabe qué" pero no "sabe hacer" (ej.: skill de impuestos sin capacidad de conciliación Libro IVA ↔ compras ↔ movimientos). Registrar el gap operativo, no fingir que la skill general cubre todo. |

El detector corre en el paso G del protocolo. Un gap detectado y no resuelto **siempre** deja rastro: o se resolvió en la sesión, o es un ítem `gap_skill` / `integracion_faltante` en el Backlog Autónomo, o quedó explícito en la respuesta como limitación. Nunca desaparece en silencio.

## Jerarquía de evidencia

Toda afirmación se apoya en un nivel declarado (alineado con `NaturalezaDato` del OS: confirmado/conciliado/observado/calculado/estimado/inferido/conflictivo/sin_dato):

1. **Dato real conciliado** — verificado contra dos fuentes independientes.
2. **Dato real no conciliado** — leído de una fuente real, sin cruce.
3. **Dato inferido con evidencia fuerte** — deducción con soporte múltiple.
4. **Dato inferido con evidencia parcial** — deducción con soporte único o débil.
5. **Supuesto** — declarado como tal, nunca disfrazado.
6. **Desconocido** — "no tengo ese dato".

La calidad del razonamiento no puede superar artificialmente la calidad de la evidencia. Una skill experta no convierte un dato malo en una conclusión confiable. La respuesta "tengo el método para responder, pero falta este dato" es válida — **seguida siempre del intento de conseguir el dato** (ver Búsqueda autónoma de fuentes).

## Búsqueda autónoma de mejores fuentes

Si una skill necesita información que las fuentes actuales no ofrecen bien, no detenerse de inmediato. Evaluar en orden: otras fuentes internas (pestañas, archivos de Drive, tablas del OS, historial), documentos no estructurados (PDF, imágenes vía `lectura-drive-documentos-multiformato`), APIs y fuentes oficiales (vía `integraciones-apis-sistemas-externos` y la política de vigencia de cada skill normativa), datos históricos, e inferencias verificables. Ejemplos: falta saldo bancario → investigar conectividad de lectura bancaria (límite conocido: login interactivo no evitable); falta dato fiscal → servicios de ARCA/DGR; falta productividad → HH + cantidades ejecutadas + actividad + período. La skill ayuda a buscar evidencia, no solo procesa la que ya está servida.

## Creación autónoma de skills

Autorizada cuando se cumplen **todas**: problema recurrente, conocimiento reusable, impacto empresarial, ninguna skill actual lo cubre suficientemente, y el conocimiento puede estructurarse y validarse.

Proceso obligatorio antes de crear:

1. Buscar si ya existe algo equivalente (inventario automático).
2. Evaluar si conviene mejorar una existente — **mejor antes que nuevo** (principio del CLAUDE.md raíz).
3. Investigar fuentes de calidad.
4. Definir alcance y límites explícitos (qué cubre / qué NO cubre / con qué skills cruza), **declarando cómo contribuye a la MISIÓN DEL BUSINESS OS** (qué resultado del Principio de Utilidad habilita).
5. Crear ejemplos con casos reales de Echegaray.
6. Definir validaciones (casos de test de comportamiento).
7. Integrarla al inventario (automático: existir en `.claude/skills/` con frontmatter válido alcanza).
8. Probarla en un caso real de la sesión.

No crear skills por cada tarea puntual — crear capacidades reutilizables. Toda skill nueva sigue el formato de las expertas existentes (frontmatter con `metadata.type`, Propósito, Alcance, Interacción con otras skills, Límites de certeza, Prohibido).

## Mejora autónoma de skills

Una skill no está terminada para siempre. Después de cada aplicación material, evaluar: ¿falló una regla? ¿faltó un caso? ¿hubo que corregir una interpretación? ¿apareció una fuente mejor? ¿cambió normativa? ¿se encontró una práctica superior? ¿un test descubrió un error? ¿Jorge corrigió repetidamente el mismo tipo de error? ¿el resultado real contradijo el supuesto?

Si la respuesta es sí a cualquiera: actualizar la skill, registrando en su cuerpo (o en memoria si es específico de Echegaray y no criterio general):

`ANTES CREÍAMOS → EVIDENCIA NUEVA → CAMBIO DE CRITERIO → NUEVA REGLA → VALIDACIÓN`

La actualización de aprendizaje de skills ya es autónoma (autorización permanente registrada en memoria: `feedback/autonomia-deploy-y-skills.md`). La clasificación A–E del CLAUDE.md raíz sigue aplicando: una observación aislada (A) se registra como observación, no como regla general; solo pasa a D/E con validación explícita proporcional al riesgo.

## Skills de integración

Cuando el problema no es falta de expertise vertical sino falta de conexión entre dominios (finanzas↔obras, compras↔producción, contratos↔adicionales, personas↔HH↔productividad, equipos↔obra↔costo, cotización↔resultados históricos, certificación↔facturación↔cobranza↔caja, impuestos↔compras↔ventas↔tesorería), evaluar si el patrón transversal es **estable** — si lo es, la respuesta es una skill de integración (como `arquitectura-integracion-finanzas-obras`), no estirar una skill vertical. Detectar estos gaps de forma autónoma y registrarlos como `integracion_faltante` en el Backlog.

## Inventario vivo de skills

El inventario **no es una lista manual** (la lista de `SKILLS_README.md` quedó obsoleta apenas se escribió — evidencia: decía "12 total" con 30 skills en disco). Es descubrimiento automático + metadata + validación:

```bash
cd echegaray-os && python3 .claude/skills/orquestador-de-razonamiento-y-skills/scripts/inventario_skills.py
```

El script escanea `.claude/skills/*/SKILL.md`, extrae frontmatter (nombre, descripción, tipo, herramientas), deriva la última modificación real desde git, valida la estructura mínima según el tipo de skill, y reporta advertencias (frontmatter incompleto, secciones obligatorias ausentes en skills expertas, descripciones sin criterio de activación). Ese output es la fuente de verdad del paso F del protocolo.

Metadata por skill (vive en cada SKILL.md, no en un registro central): `name`, `description` (obligatorio: debe decir cuándo activarla y cuándo NO), `metadata.type` (`expert-domain` | `technical` | `methodology` | `meta-orchestration`), y en el cuerpo: Alcance (inputs/outputs implícitos), Interacción con otras skills (dependencias y complementarias), Sistema de fuentes, Límites de certeza, Gaps conocidos. La madurez y la última mejora se derivan de git, no se declaran a mano.

## Tests de skills

Dos niveles, ambos en esta carpeta:

1. **Estructural (automatizado)**: `inventario_skills.py --validar` falla si una skill experta no declara frontmatter completo o le faltan secciones obligatorias. Correr al crear o modificar cualquier skill.
2. **Comportamiento profesional**: `CASOS_TEST.md` define casos de negocio representativos con comportamiento esperado y criterio de fallo (doble conteo obligación/cheque en Flujo de Fondos, pago atrasado que no es gasto del mes en P&L, productividad "extraordinaria" con costos incompletos, devengado vs. percibido en integración, fórmulas frágiles/incompatibles con configuración regional en Sheets). Se ejecutan aplicando el caso en sesión y comparando contra el comportamiento esperado — prueban comportamiento profesional, no existencia de archivos. Todo error real encontrado en producción se convierte en caso nuevo.

## Trazabilidad hacia el Operador Digital

Cuando el trabajo es material y el resultado se reporta (a Jorge o al Operador Digital), mostrar trazabilidad profesional resumida — nunca chain-of-thought interno:

```
ANÁLISIS: <problema real>
CAPACIDADES APLICADAS: <skills que modificaron el resultado — no las consultadas sin efecto>
EVIDENCIA: <fuentes usadas, con nivel de la jerarquía>
HALLAZGO: <lo que cambia la decisión>
ACCIÓN: <qué se ejecutó / qué requiere aprobación>
CONFIANZA: <alta | media | baja — acotada por la evidencia, no por la elocuencia>
GAP: <qué falta, si falta>
```

Solo cuando sea útil — un trabajo trivial no necesita traza. El canal estructural ya existe: los gaps registrados en `backlog_autonomo` aparecen en el Operador Digital y en `/backlog-autonomo` automáticamente (priorizados por impacto → urgencia → recencia).

## Integración con el Backlog Autónomo

Los gaps detectados y no resueltos en sesión se registran en la tabla real `backlog_autonomo` (tipos ya existentes: `gap_skill`, `integracion_faltante`, `gap_dato`, `deuda_tecnica`), con evidencia, fuente, confianza y recomendación. Priorización al decidir qué gap atacar primero:

**IMPACTO EMPRESARIAL × FRECUENCIA DE USO × RIESGO DE ERROR × CAPACIDADES DESBLOQUEADAS**

La conversión de un ítem de backlog en Acción del Centro de Acción ya existe en el OS (`accionDesdeBacklog`) — no duplicar ese mecanismo.

## Interacción con otras skills

Esta skill no compite con ninguna: las precede a todas. Delegaciones fijas: crear el archivo de una skill nueva → `skill-creator` (formato) + esta skill (criterio de si corresponde crearla); tocar un Sheet real → `google-sheets-business-systems` es siempre parte del conjunto; cálculo que puede vivir en dos sistemas → `arquitectura-integracion-finanzas-obras` es siempre parte del conjunto; memoria de proyecto → `memory-manager`.

## Límites de certeza

El orquestador no garantiza que el conjunto de skills elegido sea perfecto — garantiza que fue **razonado, explícito y auditable**. Si dos conjuntos son defendibles, elegir y decir por qué. No puede validar por sí mismo conocimiento normativo: eso lo hace cada skill con su protocolo de vigencia.

## Prohibido

- Ejecutar trabajo experto sin haber revisado el inventario de skills aplicables.
- Improvisar una respuesta profesional sobre un gap detectado.
- Crear una skill nueva cuando mejorar una existente alcanza.
- Activación ceremonial: listar skills que no modificaron el análisis.
- Presentar como conclusión confiable algo apoyado en evidencia de nivel 4–6 sin declararlo.
- Dejar un gap detectado sin rastro (ni resuelto, ni en backlog, ni declarado).
- Ejecutar autónomamente decisiones de nivel E–F (efecto económico/legal/fiscal externo o irreversible).
