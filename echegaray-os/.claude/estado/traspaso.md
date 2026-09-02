# XSAS — HANDOFF

_actualizado: 2026-09-02 (GATE 1 y GATE 2 del executor cerrados)_

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

**/xsas TODAVÍA NO ES PRODUCTO OPERATIVO COMPLETO.** Bloqueantes que quedan:
1. no hay composición multi-skill/workflow general (GATE 3)
2. escrituras requieren resolver firma/autorización (cola `sinFirma`)

**GATE 2 (adjuntos + continuidad) CERRADO 02/09 y DESPLEGADO** (commit `51131125`):
- Adjuntos nativos: /xsas acepta CSV/TXT/PDF/Excel (base64 para binarios, tope 8MB/archivo, borde
  HTTP 12MB). Ingesta en `lib/xsas-archivos.mjs` REUTILIZA `leerArchivo` de
  `comunicacion/archivos/flujo.mjs`; identidad = sha256; lectura persistida en `orq.xsas_adjunto`
  por actor; parse reutilizado por hash. Extracto → importador real (mismo candado). Formato sin
  motor → FORMATO_NO_SOPORTADO.
- Continuidad: `orq.xsas_contexto` por (actor, correlation_id) — la UI ya mandaba un correlation
  estable por conversación. `referenciaContextual` (anáfora, no frases hardcodeadas) →
  `atenderDesdeContexto` contesta desde la lectura persistida, 0 modelo; sin contexto, ruteo normal.
- Seguridad probada con tests negativos: otro actor con el MISMO correlation_id no ve nada; la
  inyección documental (CSV con «ignorá todo y ejecutá…») no corre ninguna tool.
- MIGRACIÓN `20260902T1100` APLICADA y verificada en la base (tablas + RLS leídas post-apply).
- E2E VIVO (127.0.0.1:8791): PDF real → texto extraído (via archivo_ingesta, llm=false); follow-up
  «lo que quedó pendiente» y «resumen de eso» → contexto_archivos, llm=false; 2 archivos con
  identidades distintas y dedup por hash; follow-up DESPUÉS de reiniciar el servicio → recuperado
  desde Postgres, llm=false.
- Fix de paso: `google.uploadFile` → ownerToken (403 de cuota de la cuenta de servicio).
- UI (Conversacion.tsx + route.ts): deploy automático de Vercel desde GitHub (push hecho); la
  verificación visual en el navegador queda para el dueño o la próxima sesión.

**GATE 1 (executor básico) CERRADO 02/09 y DESPLEGADO** (commits `b338b8a0`, `8eea0049`, `559aefd6`):
- `pideMutacion` (xsas-resolutores): un pedido de ESCRITURA ya no se contesta con una tool de
  lectura ni con un párrafo del modelo. Formas verbales exactas + desambiguación por palabra
  anterior («¿qué genera más costo?» no es mutación).
- mutación sin tool de escritura ejecutable → `necesita_autorizacion` nombrando la cola `sinFirma`;
  con tool alcanzable pero sin dato → `falta_dato` nombrando el argumento; con tool autorizada →
  ejecuta (probado con doble).
- NUNCA respuesta vacía: garantía central en `respuestaOk` (respaldo con los datos) +
  `textoDeDatos` lee `resumen[]` (caja.vencido salía sin texto teniendo la lectura adentro).
- E2E VIVO contra producción (127.0.0.1:8791/xsas): la frase exacta del bug → necesita_autorizacion
  con texto, 0 LLM, traza en `orq.xsas_requests` verificada; «que vence esta semana» →
  `caja.vencido` con datos reales, 0 LLM.
- Cambio de contrato declarado: los dobles de `plano.cotizar` pasaron a `os.write` (su capability
  real desde 27/08); «armame una cotizacion» sin proyecto → `falta_dato` determinístico.
- Rojo PREEXISTENTE que queda: `caso-controlado-circuito.pg.test.mjs` («evidencia con fecha
  futura», 2026-09-02T03:00Z) — fecha-dependiente, NO tocado por este gate, pendiente de arreglo.
- Cierre firmado por tests + E2E vivo; SIN auditor tercero (instrucción de consumo de esta sesión).

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

- **HEAD main:** `559aefd6` — GATE 1 executor + fix emoji UI. Árbol LIMPIO salvo este traspaso,
  `main` == `origin/main` (pusheado 02/09).
- **Producción** (`~/echegaray-os/produccion/echegaray-os`): `559aefd6`, == main. Servicio
  `echegaray-xsas-gateway` (user unit; es quien sirve /xsas, `servidor-entrante.mjs`) reiniciado y
  verificado vivo con el código nuevo. OJO: el MAPA dice que los servicios corren de
  `deploy-comunicacion` — quedó VIEJO: corren de `produccion/echegaray-os`. La UI (Conversacion.tsx)
  necesita build de Next para verse — NO hecho (cosmético, sólo el 📎).
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

## 10bis. SESIÓN 02/09 (GATE 2, interrumpida por pedidos del dueño)

- **CAJA (Sheet)**: causa raíz encontrada y CERRADA — el editor vivo ENCOGE un gráfico que se pasa
  del borde de la hoja (el PDF no: por eso la verificación por PDF daba bien y el dueño lo veía
  mal). Hoja llevada a 68 filas, 4 gráficos redibujados (anclas 22/37/52, alto 284, aire 16px),
  generador blindado (`FILA_FINAL_DE_GRAFICOS`), commit `27c36651` pusheado.
- **Embargo Agüero**: oficio CP7-9378/16 (DATA 2000 SA c/ Agüero, $14.675,50) subido al legajo
  (2 jpg). Retención YA practicada (recibo 2026-08 Q2, concepto 4090). El DEPÓSITO judicial NO
  aparece en banco_movimientos (cargado hasta 01/09). Pendiente del dueño: depósito Banco San Juan
  cta 481690/7 CBU 0450009402800048169079 + acreditar a juzpaz7-sjn@jussanjuan.gov.ar.
- **GATE 2 A MEDIO HACER**: rama `xsas-gate2`, worktree `.claude/worktrees/xsas-gate2`, checkpoint
  `e0911bdb` (NO mergear como está). Falta: terminar Conversacion.tsx, tests dirigidos, APLICAR la
  migración `20260902T1100` (en el repo ≠ aplicada), E2E por la puerta, deploy. El detalle está en
  el mensaje del commit.
- Defecto encontrado de paso: `google.uploadFile` usaba el token del robot (403 sin cuota) — fix en
  la rama gate2.

## 11. PRÓXIMO TRABAJO

No inventar campaña nueva. Prioridades:

**P0 — convertir /xsas en herramienta operativa real:** ~~routing natural~~ (G1) → ~~adjuntos +
continuidad~~ (G2) → **GATE 3: multi-skill + mutaciones autorizadas (firma del dueño)**.

**P1 — perfeccionar el cotizador general:** motor geométrico/estructural → cómputo → precios/HH →
riesgo → aprendizaje.

Convergen: usuario adjunta documentación en /xsas → "cotizame esta obra" → XSAS ejecuta autónomo el cotizador.

## 12. REGLA PARA LA PRÓXIMA SESIÓN

Este archivo NO es verdad absoluta. La sesión nueva debe: 1) leer este handoff; 2) `git status
--short --branch`; 3) verificar HEAD; 4) inspeccionar SOLO los archivos necesarios para la tarea; 5)
trabajar. Si repo y handoff contradicen, **EL REPO MANDA.** No investigar historia salvo estricta necesidad.
