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

## 10ter. SESIÓN 02/09 · TARDE (reglas nuevas del dueño, aplicadas y desplegadas)

- **REGLA E (dueño, 02/09): el balde «Cheques» del gráfico de CAJA sólo suma egresos AVALADOS por un
  cheque EMITIDO** (rubro 'Cheques emitidos': cartera + cuotas de cobertura). El plan «a pagar con
  cheque» sin cheque emitido es deuda de Proveedores. `puertaDeCheque`: ningún vivo cae al vacío
  (13 × $12,1M estaban invisibles); el cruzado sale por Compras como cuota COMPROMETIDA
  (`cuotasEnCheque`, ahora rubro 'Cheques emitidos'). Commit `2a8fb778`; libro y anexo regenerados;
  serie verificada (10/09 1,5M · 17/09 470k · 21/09 3,64M · 22/09 1M · 25/09 2,56M).
- **Proveedores sección 1 RESTAURADA de la revisión 52253** (ayer) + espacio insertado (13 filas):
  cuadro A = pivot por-proveedor + «Pagos por fecha» (distribución por fecha desde Compras, pedido
  del dueño — reemplaza «Primer vencimiento») + «Qué hacer»; cuadro B = pivot detalle en A28. Cero
  errores. NO tocar la sección con los scripts pivot-aplicar/aplicar-vivo sueltos: se pisan entre
  sí (hoy se pisaron 3 veces; el restaurador completo quedó en scratchpad de la sesión).
- Cash Flow Mensual agrandado a 160 filas (el bloque A CUBRIR de cheques no entraba, hoja 109).
- Cobertura de cheques corrida: A CUBRIR 18 cheques · $22.799.019 (sep–dic).
- Pendiente del dueño: 4 físicos de Corralón (310/322/324/327) sin instrumento afirmable en el
  registro; facturas PENDIENTES cuya plata ya viaja en cheque vivo pesan DOBLE hasta marcarse
  Pagadas en Compras (decisión conservadora, declarada en el commit).

## 10quater. CRITERIO DEL DUEÑO APLICADO A COMPRAS (02/09, tarde)

- **Lo pagado con cheque emitido NO es deuda del proveedor**: 19 facturas «Pendiente» con medio
  cheque/echeq cubiertas por cheques vivos se marcaron Pagado en Compras (T=total, X=Pagado, con
  read-back): Corralón 18 filas $1.287.260 (cubiertas por $5,94M en cheques «VARIAS» vivos) +
  Femenia $3.823.600 (echeq 380, monto exacto). Deuda de Corralón quedó $171.314; Femenia salió.
- El echeq 380 del registro quedó con proveedor Femenia (dato del banco, estaba vacío).
- Circuito completo verificado: Compras pagada → cruce → cuota COMPROMETIDA → balde «Cheques» del
  gráfico (sólo emitidos vivos, ventana 30d): 10/09 1,5M · 17/09 471k · 21/09 3,64M · 22/09 1M ·
  25/09 2,56M.

## 10quinquies. GATE 3 · HITO 1 — EL COTIZADOR SE PIDE POR /XSAS (02/09, desplegado, commit `4439241e`)

El dueño ordenó: «cerremos XSAS para que comience a trabajar como cotizador; es la primera prueba
de que XSAS es el LLM de Echegaray sin depender de Claude».

- **Mecanismo GENERAL adjuntos→capacidad**: una tool declara `adjuntos: true` y
  `intentarConAdjuntos` (gateway) la elige por la MISMA afinidad del ruteo, con umbral
  cabeza+disparador (5) — «mirá esta obra» sigue siendo ingesta; «cotizame esta obra» y «cotizá
  esto» matchean. Los adjuntos viajan como `args.archivos`; en acciones/traza sólo nombre+tamaño.
- **`plano.cotizar` recibe adjuntos**: PRIMERO los sube al Drive del proyecto y los deja en
  `public.drive_index` (`lib/plano/adjuntos.mjs`, mismo upsert que `drive-indice.pg.test`), y
  recién entonces corre el pipeline de siempre → misma genealogía que un plano histórico. Carpeta
  del proyecto por índice con preferencia «presupuesto»; si no hay, `COTIZACIONES XSAS - <proyecto>`
  bajo la raíz indexada.
- **Límite declarado**: `orq.xsas_adjunto` guarda TEXTO, no bytes → un `falta_dato` con adjuntos
  pide reenviarlos junto con el dato (el mensaje lo dice).
- **E2E vivo por la puerta (127.0.0.1:8791/xsas)**: adjunto + «cotizame esta obra de PRUEBA XSAS
  GATE3» → `adjunto_con_motor`, proyecto extraído, archivo VERIFICADO en Drive leyéndolo de vuelta
  + fila en `drive_index` + intento firmado en `public.xsas_escritura`; respuesta honesta (un txt
  no es plano legible). Prueba limpiada (papelera + delete del índice).
- Tests: `xsas-cotizador-adjuntos.test.mjs` (5) · `plano/adjuntos.test.mjs` (4) · XSAS 71/71 ·
  plano completo verde. Cierre SIN auditor tercero (instrucción de consumo vigente).

**Inventario clave (medido)**: el motor grande `lib/cotizador/` (~50 módulos: política comercial,
cascada de precios, freeze, oferta, plan-vs-real) NO es alcanzable desde el gateway — ninguna tool
lo importa. El generador del PDF de presupuesto (`lib/presupuesto/formato-echegaray.mjs`) tampoco
tiene tool. Son los candidatos naturales de los próximos hitos.

## 10sexies. GATE 3 · HITO 2 — EL RAZONAMIENTO DEL COTIZADOR (02/09, desplegado, commit `33c436a7`)

El dueño pidió (02/09) que el cotizador conteste sus 7 pasos: superficies (impronta/cubierta/
semicubierta) · bases por tipo + muertos + secciones · vigas de fundación/arriostramiento/carga +
sísmica · columnas + encadenados · longitud de viga entre columnas · barrido X/Y · excavaciones con
PROFUNDIDAD.

- **Tool `plano.razonamiento`** (drive.read, lectura pura) en `lib/tools/plano-tool.mjs`; el motor
  es `lib/plano/razonamiento.mjs` (puro): clasificación por ROL con orden específico→general
  («excavación de bases» ≠ base; muerto ≠ base; VF ≠ viga de carga), secciones sólo con cita,
  sísmica = cita o DESCONOCIDO, excavaciones vía `computarExcavacion` (estaba huérfano) sólo con
  ancho+largo+profundidad citados.
- **Quick win estructural**: el PROMPT de `interpretar.mjs` pedía `grilla` (superficies declaradas,
  dimensiones totales, luces entre ejes) desde siempre y `validarLamina` la TIRABA. Ahora se
  conserva validada — y como el caché guarda el crudo, vale RETROACTIVAMENTE sin re-pagar visión.
  `profundidad_m` entró al contrato de dimensiones (láminas ya cacheadas no la traen: sale como
  FALTA, sin bump de versión de caché — decisión declarada).
- **E2E vivo** («razonamiento del cotizador de quattropani…», 21,9 s, 0 llamadas de visión):
  respuesta real con B0 60×60 (conflicto 8-vs-9 declarado), muertos separados, secciones citadas,
  sísmica con cita, luces 6·6·6 m, impronta 18,3×10,9, y excavaciones = FALTA profundidad (honesto).
- Tests: `razonamiento.test.mjs` (7) · plano completo exit 0 · XSAS 62/62.
- Trampa REPETIDA y corregida en el acto: el primer `git merge` corrió DENTRO del worktree (no-op)
  y producción quedó vieja — el deploy se verificó por el hash y se rehízo desde main.

## 10septies. CONSOLIDACIÓN DEL NÚCLEO (02/09 tarde-noche, commits `f9928ccd` + `45dfc71e`, DESPLEGADOS)

Orden del dueño: consolidar XSAS como IA empresarial general (no otro gate). Cerrado:

- **Objetivo compuesto** (`partirObjetivo` + `atenderCompuesto`): varias capacidades en un pedido,
  secuencial, 0 modelo; resultados como DATOS (`datos.partes[]`); residuo `PENDIENTE_RAZONAMIENTO`
  con motivo. Guardián: ≥2 capacidades DISTINTAS o flujo normal. E2E vivo: caja+vencido+cobranzas
  en un pedido, 3 tools, llm null. SIN NINGÚN provider (env sin claves, gateway real, base real):
  determinístico entero funciona; compuesto con parte ambigua → 2 resueltas + 1 pendiente.
- **Registro por convención**: `toolsDelNucleo` descubre `lib/tools/*-tool.mjs` con
  `registroXsas({google})` — capability nueva SIN editar el núcleo (fixture test; la escritura
  descubierta sin firma cae en `sinFirma`: descubrir ≠ autorizar).
- **Acción pendiente** (defecto reportado por el dueño EN VIVO: «no entiendo q quiere q haga»):
  los bytes de adjuntos persisten en `orq.xsas_adjunto.contenido_b64` (migración `20260902T1900`
  APLICADA y verificada); falta_dato con adjuntos pregunta en criollo y guarda la pendiente;
  `atenderPendiente` completa con el mensaje siguiente (bytes por hash, arg determinístico si es
  corto), limpia la pendiente, no secuestra pedidos largos, aísla por actor. E2E vivo completo.
- **Conocimiento del cotizador v1** (pasos 1-6, excavaciones, profundidades, number→evidence,
  cruce documental, relaciones, no-diseña) versionado en la skill `costos-presupuestacion` —
  dominio del cotizador, no /xsas.
- Aprendizaje: NO se reconstruyó — CANDIDATO→VALIDADO→reutilización ya existe y está testeado
  (`xsas-aprendizaje` 32/32 + `rendimiento-para-cotizar`).
- Métrica real (orq.xsas_requests, 7 días): 209 pedidos · 196 sin modelo (93,8%) · niveles: 163 N0
  · 27 N1 · 19 N2/N3 · ms prom 4.152.
- Suite XSAS 212/212 · consolidación 6/6 · pendiente 3/3. Prod verificada por hash `45dfc71e`.
- LIMITACIONES declaradas: composición A.output→B.input automática entre tools distintas NO existe
  (los datos viajan estructurados, el encadenado es secuencial); «buscá en la web…» con palabra
  «cotiza» rutea mal a finanzas (web.search existe, afinidad eligió otra); tramos reales C1→C2 y
  barrido X/Y inverso del cotizador: parciales (motor v1).
- ⚠️ Trampa del worktree-merge caída DOS veces hoy: `git merge` encadenado tras `cd` al worktree
  es no-op y producción queda vieja. El merge va en un Bash call SEPARADO desde el árbol principal,
  y el deploy se verifica POR HASH siempre.

## 10octies. LAS 2 BRECHAS DEL NÚCLEO CERRADAS (02/09 noche, commits `fe387dd4`+`6abc34f4`+`9ec60734`, DESPLEGADOS)

- **Composición A.output→B.input por CONTRATO** (`lib/xsas-composicion.mjs`, puro): bus de datos
  con origen por campo; conexión sólo por nombre exacto + tipo exacto del `input_schema` — sin
  conversiones (tipo distinto = `CAPABILITY_INCOMPATIBLE`), sin texto, sin modelo. Ejecutor por
  RONDAS con reevaluación: bus (gratis) → extractor barato por cláusula → correr → reevaluar.
  Falla parcial no borra progreso; la independiente corre aunque otra esté bloqueada. El objetivo
  a medias persiste (pendientes+bus en `orq.xsas_contexto.compuesto`) y «hacelo»/el dato retoman
  SÓLO lo bloqueado. E2E vivo: razonamiento→(proyecto por bus)→cotizar + estado_empresa, 3
  capacidades, 46,7 s, 1 sola llamada de extracción (chat_cost), encadenado en la genealogía.
- **Routing research vs dominio** (`pideInvestigacion`, general: verbo búsqueda + señal
  afuera/precio − objeto de obra): «buscá en la web cuánto cotiza el dólar» → `web.search` vivo
  con fuentes; «cotizame esta obra» → cotizador. Negativos de clase en tests.
- Suite XSAS 221/221 · composición 9/9. Producción `9ec60734` por hash.
- LIMITACIONES: no existe hoy en el registro un par real B→C conectado por argumento REQUERIDO
  (la cadena viva probada es A→B por `proyecto`; B→C corre por orden, no por dato) · el extractor
  barato puede copiar un genérico como valor («esta obra» → proyecto='obra'; visto vivo con un 403
  de Drive de fondo) — pre-existente del flujo simple, declarado, no corregido acá.

## 10nonies. MEMORIA CONVERSACIONAL PERSISTENTE (02/09 noche, commit `585cb175`, DESPLEGADO `c11b50ce`)

- Tres capas: `orq.xsas_mensaje` (RAW, evidencia, nunca se reescribe) · `orq.xsas_contexto`
  (trabajo, ya existía) · `orq.xsas_memoria` (consolidada: estados mencionado/decidido/confirmado/
  superado/conflicto, genealogía `supersede_a`/`superada_por`, provenance chat+mensaje+actor+fecha).
  Migración `20260902T2300` APLICADA y verificada leyendo information_schema.
- `lib/xsas-memoria.mjs`: extracción por gatillos explícitos (decidimos/confirmamos/dato numérico —
  la charla y las preguntas NO producen memoria), corrección con par nuevo/viejo («es 450, no 540»),
  consolidación sin duplicar, supersesión conservadora (`comparteTema`: nunca cruza entidades),
  conflicto cuando una corrección alcanza asuntos distintos, recuperación JIT (≤5 memorias, filtro
  por tema+entidad). Todo determinístico, 0 modelo, aislado por actor.
- Gateway: hook N0 `pideMemoria` (decisión/porqué/pendiente/retomar, con guardia anti-secuestro:
  «hacé lo que decidimos ayer» NO se secuestra) → `via='memoria_conversacional'` · después de cada
  respuesta `registrarIntercambio` persiste raw + consolida lo que el USUARIO afirmó (lo que
  contesta XSAS no es evidencia). Una consulta de memoria no crea memoria.
- E2E vivo (obra canario, filas borradas al final): decisión en chat A → chat B nuevo la recupera
  con provenance (`memoria_conversacional`, nivel 0, 121 ms server) → corrección en chat C →
  chat D devuelve el dato nuevo y dice «reemplazó a …» → zonda inexistente honesto → otro actor no
  ve nada. `xsas_requests`: llm=false en TODAS las operaciones de memoria (el llm=true de C fue la
  respuesta conversacional a la corrección, camino pre-existente; la supersesión fue determinística).
- Tests: `xsas-memoria.test.mjs` 11/11 · suite XSAS+plano 540/540 · typecheck limpio.
- LIMITACIONES: memoria por actor, sin compartir entre roles (compartir exige decisión del dueño) ·
  extracción por patrones castellanos explícitos (una decisión dicha sin gatillo no se captura; el
  Reasoner NO se usa para extraer — ambigüedad semántica queda para un gate futuro) · «retomar»
  recupera decisiones+pendientes pero no re-monta el bus compuesto del chat viejo · entidades por
  rótulo («obra X», «de X»), sin diccionario de obras reales.

## 11. PRÓXIMO TRABAJO

No inventar campaña nueva. Prioridades:

**P0 — GATE 3 restante:** hito 2 = continuidad de cotización (follow-ups «qué falta» / «qué
destraba» desde la cotización persistida, 0 modelo; hoy `atenderDesdeContexto` no sabe de
cotizaciones) · hito 3 = exponer el motor grande `lib/cotizador/` como tool (política comercial,
freeze, oferta) · hito 4 = PDF de presupuesto por tool (`lib/presupuesto/`) · multi-skill +
resolver la cola `sinFirma` con el dueño.

**P1 — perfeccionar el cotizador general:** motor geométrico/estructural → cómputo → precios/HH →
riesgo → aprendizaje.

~~Convergen: usuario adjunta documentación en /xsas → "cotizame esta obra" → XSAS ejecuta autónomo
el cotizador~~ — **CERRADO en hito 1** para el camino adjuntos→borrador; queda el detalle rico en
pantalla (los `datos` llegan al front y no se pintan — `src/features/presupuestos/` ya tiene los
componentes).

## 12. REGLA PARA LA PRÓXIMA SESIÓN

Este archivo NO es verdad absoluta. La sesión nueva debe: 1) leer este handoff; 2) `git status
--short --branch`; 3) verificar HEAD; 4) inspeccionar SOLO los archivos necesarios para la tarea; 5)
trabajar. Si repo y handoff contradicen, **EL REPO MANDA.** No investigar historia salvo estricta necesidad.
