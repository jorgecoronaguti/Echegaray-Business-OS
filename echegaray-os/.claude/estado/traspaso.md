# XSAS — HANDOFF

_actualizado: 2026-09-02_

## 1. OBJETIVO DEL PRODUCTO

XSAS es la IA operativa de Echegaray Construcciones. Objetivo final:

Jorge → app.ecsas.com.ar/xsas → lenguaje natural + archivos + contexto → XSAS Gateway →
skills/capabilities/engines/tools → datos y conocimiento ECSAS → acciones verificadas →
Reasoner/LLM SÓLO cuando XSAS no pueda resolverlo por sí mismo.

Claude Code NO es la interfaz operativa de la empresa. Se usa únicamente para desarrollar, corregir
y evolucionar XSAS.

Prueba definitiva: **Jorge puede cerrar Claude Code, entrar a /xsas y hacer su trabajo operativo diario.**

## 2. PRINCIPIOS OBLIGATORIOS

- skills first · deterministic first · Claude/Reasoner last · Claude-zero para tareas conocidas
- acceso universal, carga selectiva/JIT
- no inventar datos · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes contradicen
- acciones con RBAC + autorización + auditoría + verificación
- preservar genealogía/evidencia · aprender de experiencia real ECSAS
- no convertir referencias externas automáticamente en verdad ECSAS
- velocidad + certeza · minimizar llamadas, tokens y costo
- el límite semanal de Claude Code es un recurso escaso

## 3. REGLA DE DESARROLLO (consumo mínimo)

Sesiones cortas · contexto JIT · leer sólo lo necesario · no leer transcripts · no explorar todo el
repo · no megaprompts · no subagentes por defecto · no auditorías generales por defecto · tests
dirigidos durante desarrollo, suite completa sólo en hitos · reasoning mínimo suficiente · Opus/high
sólo para lo realmente difícil · reutilizar código/motores/skills antes de crear · respuestas cortas.

Cada cambio: problema concreto → localizar implementación → cambio mínimo correcto → test dirigido →
prueba negativa cuando corresponda → commit → actualizar este handoff.

## 4. ESTADO ACTUAL /XSAS

URL producción: https://app.ecsas.com.ar/xsas — UI real conectada al Gateway.

Último estado conocido:
- Gateway operativo · skills 44/44 · engine/tool factories 48/48 cargan · capacidades accesibles 70/125
- 55 capacidades de escritura bloqueadas esperando firma (`sinFirma`, `lib/xsas-permisos.mjs` →
  `TOOLS_AUTORIZADAS_A_ESCRIBIR`)
- Claude-zero determinístico probado · Claude-down para intenciones frecuentes probado · Reasoner por excepción
- disponibles: consultas Drive, financieras, obras, web/research · cotización parcial

**/xsas TODAVÍA NO ES PRODUCTO OPERATIVO COMPLETO.** Bloqueantes:
1. adjuntos desde /xsas no llegan al motor `comunicacion/archivos/flujo.mjs` (existe, 0 modelo, cableado a Mattermost)
2. no hay composición multi-skill/workflow general
3. no hay continuidad operacional real ("seguí con esto")
4. escrituras requieren resolver firma/autorización
5. routing natural puede seleccionar capacidades incorrectas

Bug real reproducible: usuario "necesito q edites el sheet flujo de fondos" → se ruteó a
`os.iva_anual` → "XSAS contestó sin texto". El routing operativo aún NO es confiable.
**No declarar /xsas PASS hasta resolver tareas reales completas.**

## 5. CRITERIO DAILY WORK REPLACEMENT

Desde /xsas Jorge debe poder escribir naturalmente ("editá el Sheet Flujo de Fondos", "conciliá este
extracto", "buscame los comprobantes de estos movimientos", "subilos a los legajos", "quién todavía
no cobró", "revisá esta obra", "cuánto cuesta esto hoy", "armame este Excel", "revisá este contrato",
"cotizame estos planos", "ahora corregí los que faltan", "seguí con esto") sin conocer nombres de
skills, capabilities, tablas ni herramientas.

XSAS resuelve autónomo: intención → contexto → skills → herramientas/datos → ejecución → verificación → respuesta.

## 6. COTIZADOR — OBJETIVO

Capacidad GENERAL de XSAS, no una solución para una obra particular.

Flujo: documentación/planos → interpretación → geometría → cómputo → partidas → composiciones →
recursos → HH/productividad → precios → costo → indirectos → riesgo → comercial → oferta → versión
congelada → obra → ejecución real → aprendizaje ECSAS.

Genealogía obligatoria: elemento del plano → cómputo → partida cotizada → composición/recursos →
actividad de obra → ejecución real.

Mismo input congelado + misma base + mismos precios/config = mismo resultado. No fabricar cantidades
para hacer coincidir precios.

## 7. RAZONAMIENTO GEOMÉTRICO DEL COTIZADOR (pendiente/en evolución)

Perfeccionar: 1) superficie impronta/cubierta/semicubierta · 2) barrido X/Y del plano · 3)
bases/zapatas y muertos de anclaje · 4) secciones y dimensiones · 5) excavaciones con profundidad
explícita · 6) vigas de fundación · 7) arriostramientos · 8) vigas de carga documentadas · 9)
columnas de carga · 10) encadenados · 11) longitud unitaria de vigas entre apoyos · 12) relaciones
base→columna→viga · 13) lectura cruzada planta→corte→detalle→cuadro→memoria · 14) FALTA_DATO y
CONFLICTO · 15) evidencia de cada cantidad.

Excavaciones — puntual: V = cantidad × largo_exc × ancho_exc × profundidad_exc · lineal: V =
longitud × ancho_exc × profundidad_exc. La profundidad SIEMPRE de evidencia, nunca inventada.

XSAS interpreta y computa lo documentado; no diseña estructura salvo motor estructural autorizado.

## 8. CONOCIMIENTO Y APRENDIZAJE

Prioridad: 1) hechos/proyectos reales ECSAS · 2) experiencia histórica ECSAS validada · 3) Base
Maestra/composiciones/procesos ECSAS · 4) conocimiento técnico con provenance · 5) normas/fuentes
primarias/web · 6) Reasoner/Claude para lo nuevo o ambiguo.

Aprendizaje: ejecución → Plan vs Real → candidato → contraste → validación →
regla/rendimiento/composición reutilizable. Una corrección humana NO se vuelve regla universal sola.

## 9. ESTADO TÉCNICO A CONSERVAR (git real, 2026-09-02)

- **HEAD main:** `1e4af528` — "fix(caja): el gráfico efectivo/banco muestra los egresos y cada bloque
  cuelga de su propia fila". Árbol LIMPIO, `main` == `origin/main`.
- **Producción** (`~/echegaray-os/produccion/echegaray-os`): `1e4af528`, == main (0/0). Desplegada.
- **Migraciones pendientes:** ninguna conocida de esta sesión (`reasoner_required_reason` en
  `orq.xsas_requests` ya APLICADA en sesiones previas).
- **Handbrakes:** `SHEETS-CONGELADOS` — última señal PUESTA (marca de `congelador-sheets.mjs` NO se
  borra; esta sesión sólo levantó por `ORQ_SHEETS_DESCONGELAR` para escrituras puntuales de gráficos
  CAJA). Timer `echegaray-flujo-caja.timer` parado. **VERIFICAR contra el estado real, no asumir.**
- **Servicios systemd en failed (de antes):** arca-sync, avance-sync, balanz-browser, flujo-caja.
- **Test dirigido relevante:** `orquestador/lib/caja-graficos.test.mjs` (verde) cubre el fix de
  gráficos CAJA (anclaje por fila + efectivo/banco con egresos).
- Ramas: muchas stale (`audit/*`, `design/*`, `datos/*`, …); ninguna pendiente crítica de esta sesión.

## 10. DECISIONES DEL DUEÑO PENDIENTES

lg85/86/87 en personas · freno de Sheets · firma `TOOLS_AUTORIZADAS_A_ESCRIBIR` (cola exacta en
`sinFirma`) · migración `orq.drive_audit` · 4 precios del catálogo · firma de recibos · dónde va la
solapa /xsas en la navegación.

## 11. PRÓXIMO TRABAJO

No inventar campaña nueva. Prioridades:

**P0 — convertir /xsas en herramienta operativa real:** routing natural confiable → adjuntos →
multi-skill → continuidad → escrituras autorizadas.

**P1 — perfeccionar el cotizador general:** motor geométrico/estructural → cómputo → precios/HH →
riesgo → aprendizaje.

Convergen: usuario adjunta documentación en /xsas → "cotizame esta obra" → XSAS ejecuta autónomo el cotizador.

## 12. REGLA PARA LA PRÓXIMA SESIÓN

Este archivo NO es verdad absoluta. La sesión nueva debe: 1) leer este handoff; 2) `git status
--short --branch`; 3) verificar HEAD; 4) inspeccionar SOLO los archivos necesarios para la tarea; 5)
trabajar. Si repo y handoff contradicen, **EL REPO MANDA.** No investigar historia salvo estricta necesidad.
