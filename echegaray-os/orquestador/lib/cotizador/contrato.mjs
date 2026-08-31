// EL CONTRATO DEL COTIZADOR — los nombres que el motor, el chat y la pantalla comparten.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE ANTES QUE EL MOTOR ═══
//
// Tres caras van a leer lo mismo: la pantalla de presupuesto, la conversación XSAS y Claude Code.
// Si cada una define «falta un dato» a su manera, el mismo presupuesto va a decir tres cosas. Acá
// están los estados, la forma del resultado de etapa, las acciones con su permiso y los tipos de
// issue — y NADA MÁS. Es vocabulario, no lógica: por eso es puro, no importa nada del OS y se puede
// leer entero en cinco minutos.
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No traduce a castellano de pantalla. `FALTA_DATO` es un estado de DOMINIO y la UI decide si lo
// muestra como «pendiente», «falta el dato» o un ícono. El modelo no cambia porque la pantalla
// cambie (§2 del programa).
//
// ═══ LA REGLA QUE GOBIERNA TODO EL ARCHIVO ═══
//
// Ningún estado de ausencia vale cero. `NULL ≠ 0`, `ERROR ≠ 0`, `SIN_PRECIO ≠ 0`. Eso está
// codificado en `esAusencia()` y en `noEsCero()`, y todo el motor pregunta por ahí en vez de
// comparar strings sueltos: un `=== 'FALTA_DATO'` tipeado en veinte lugares es veinte lugares donde
// se puede olvidar uno.

/** Cambiar el contrato es cambiar lo que construyen las otras caras. Se sube cuando se AGREGA algo
 *  (compatible) y el registro de por qué va en `docs/engineering/COTIZADOR-CONTRATO.md`. */
export const VERSION_CONTRATO = '1.1.0'

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · LOS ONCE ESTADOS DE DOMINIO (§2)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * El estado de un DATO del presupuesto: una cantidad, un precio, una partida, una HH.
 * Son once y no se agregan a gusto — cada uno implica una forma distinta de resolverlo, y esa forma
 * está en `COMO_SE_RESUELVE`.
 */
export const ESTADO = Object.freeze({
  EXTRAIDO: 'EXTRAIDO',       // salió de un documento, con cita literal
  CALCULADO: 'CALCULADO',     // salió de una fórmula sobre entradas declaradas
  HISTORICO: 'HISTORICO',     // ECSAS lo usó antes. NO es una norma (§29)
  PROPUESTO: 'PROPUESTO',     // el sistema propone; nadie lo aceptó todavía
  CONFIRMADO: 'CONFIRMADO',   // una persona con permiso lo aceptó
  VALIDADO: 'VALIDADO',       // contrastado contra una fuente independiente
  FALTA_DATO: 'FALTA_DATO',   // el hueco DECLARADO. No es cero
  AMBIGUO: 'AMBIGUO',         // hay más de una lectura y ninguna gana
  CONFLICTO: 'CONFLICTO',     // dos fuentes se contradicen. Sólo evidencia lo resuelve (§31)
  ERROR: 'ERROR',             // el dato es imposible (unidad incompatible, negativo donde no puede)
  NO_APLICA: 'NO_APLICA',     // la pregunta no corresponde. Distinto de no saber
})

export const COMO_SE_RESUELVE = Object.freeze({
  EXTRAIDO: 'ya está resuelto: se verifica abriendo el documento en la cita',
  CALCULADO: 'ya está resuelto: se verifica rehaciendo la fórmula con las entradas declaradas',
  HISTORICO: 'sirve como referencia; para cotizar hay que confirmarlo con alguien que decida',
  PROPUESTO: 'lo acepta o lo cambia una persona con permiso de escritura',
  CONFIRMADO: 'ya está resuelto por decisión humana registrada',
  VALIDADO: 'ya está resuelto y contrastado contra una fuente que no lo produjo',
  FALTA_DATO: 'hay que ir a buscarlo: proyecto → XSAS → experiencia ECSAS → técnico → web → persona',
  AMBIGUO: 'una pregunta dirigida con las opciones a la vista; el sistema NO desempata solo',
  CONFLICTO: 'evidencia nueva o una autoridad que decida. No se resuelve por mayoría ni por promedio',
  ERROR: 'hay que corregir el dato de entrada; no se puede seguir sobre él',
  NO_APLICA: 'nada: la pregunta no corresponde a este elemento',
})

/** Los estados que significan «acá no hay número». Nunca valen cero, nunca entran a una suma
 *  afirmada, y siempre producen un issue en la cola de atención. PURA. */
export const AUSENCIAS = Object.freeze([
  ESTADO.FALTA_DATO, ESTADO.AMBIGUO, ESTADO.CONFLICTO, ESTADO.ERROR,
])

/** ¿Este estado significa que NO hay dato? PURA. */
export const esAusencia = (estado) => AUSENCIAS.includes(estado)

/**
 * ¿ESTE VALOR SE PUEDE SUMAR? PURA.
 *
 * Es la función que impide el defecto que ya está medido en la base: `cotizacion_cascada` hace
 * `coalesce(sum(subtotal), 0)` y `sum()` de Postgres IGNORA los NULL, así que una partida
 * subcontratada sin precio se cae de la suma y el presupuesto se publica completo. Acá un valor
 * ausente no se ignora: envenena el total, que es lo que §15 pide («componente crítico en
 * ERROR/FALTA_DATO ⇒ el total no se afirma»).
 */
export const sumable = ({ valor, estado } = {}) =>
  !esAusencia(estado) && valor !== null && valor !== undefined && Number.isFinite(Number(valor))

/** Los estados que NO pueden sostener un número en una cotización congelada. `HISTORICO` está acá:
 *  una práctica histórica es referencia, no norma, y ascenderla es exactamente lo que
 *  `practica-historica.mjs` prohíbe por código. PURA. */
export const NO_CIERRAN = Object.freeze([...AUSENCIAS, ESTADO.PROPUESTO, ESTADO.HISTORICO])
export const cierra = (estado) => Boolean(estado) && !NO_CIERRAN.includes(estado)

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LAS ETAPAS Y LA FORMA DE SU RESULTADO (§1)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Las once etapas, EN ORDEN. El orden es parte del contrato: `COST` no puede correr antes que
 *  `COMPOSE` porque no tendría qué costear. */
export const ETAPA = Object.freeze({
  INGEST: 'INGEST',
  INTERPRET: 'INTERPRET',
  SCOPE: 'SCOPE',
  TAKEOFF: 'TAKEOFF',
  MAP: 'MAP',
  COMPOSE: 'COMPOSE',
  COST: 'COST',
  COMMERCIAL: 'COMMERCIAL',
  VALIDATE: 'VALIDATE',
  FREEZE: 'FREEZE',
  OUTPUT: 'OUTPUT',
})

export const ORDEN_ETAPAS = Object.freeze([
  ETAPA.INGEST, ETAPA.INTERPRET, ETAPA.SCOPE, ETAPA.TAKEOFF, ETAPA.MAP, ETAPA.COMPOSE,
  ETAPA.COST, ETAPA.COMMERCIAL, ETAPA.VALIDATE, ETAPA.FREEZE, ETAPA.OUTPUT,
])

/** Cómo terminó una etapa. `DEGRADADA` es la que hace falta para el CLAUDE-ZERO (§34): produjo
 *  resultado sin el proveedor de razonamiento y lo dice. No es OK y no es FALLIDA. */
export const STATUS = Object.freeze({
  OK: 'OK',
  DEGRADADA: 'DEGRADADA',
  BLOQUEADA: 'BLOQUEADA',   // no puede seguir hasta que alguien resuelva un blocking_issue
  FALLIDA: 'FALLIDA',       // se rompió; el motivo va en blocking_issues
  OMITIDA: 'OMITIDA',       // no correspondía correrla
})

/**
 * EL RESULTADO DE UNA ETAPA. Nueve campos, siempre los nueve, siempre en el mismo orden.
 *
 * «No texto libre solo» (§1) es literal: `result` puede ser cualquier forma, pero las otras ocho
 * llaves existen SIEMPRE aunque estén vacías. Una etapa que devuelve `{status:'OK'}` a secas obliga
 * a quien la consume a adivinar si no encontró conflictos o si no los buscó — y esas dos cosas se
 * ven iguales desde afuera. Por eso el constructor las materializa.
 *
 * PURA. Congelada: un consumidor que muta el resultado de una etapa rompe la reproducibilidad.
 */
export function resultadoEtapa({
  etapa, status = STATUS.OK, result = null, evidence = [], provenance = [],
  confidence = null, missing_data = [], conflicts = [], blocking_issues = [], next_actions = [],
} = {}) {
  if (!ORDEN_ETAPAS.includes(etapa)) {
    throw new Error(`etapa desconocida: ${etapa}. Las etapas son ${ORDEN_ETAPAS.join(' → ')}`)
  }
  if (!Object.values(STATUS).includes(status)) throw new Error(`status desconocido: ${status}`)
  // Una etapa con blocking_issues NO puede declararse OK: el status sería una afirmación que sus
  // propios datos desmienten. Se corrige acá, en el borde, y no en cada llamador.
  const real = blocking_issues.length && status === STATUS.OK ? STATUS.BLOQUEADA : status
  return Object.freeze({
    etapa,
    status: real,
    result,
    evidence: Object.freeze([...evidence]),
    provenance: Object.freeze([...provenance]),
    confidence,
    missing_data: Object.freeze([...missing_data]),
    conflicts: Object.freeze([...conflicts]),
    blocking_issues: Object.freeze([...blocking_issues]),
    next_actions: Object.freeze([...next_actions]),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LOS TIPOS DE ISSUE DE LA COLA DE ATENCIÓN (§22)
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const TIPO_ISSUE = Object.freeze({
  FALTA_DATO: 'FALTA_DATO',
  CONFLICTO: 'CONFLICTO',
  AMBIGUO: 'AMBIGUO',
  SIN_PRECIO: 'SIN_PRECIO',
  PRECIO_DESACTUALIZADO: 'PRECIO_DESACTUALIZADO',
  SUBCONTRATO_SIN_PRECIO: 'SUBCONTRATO_SIN_PRECIO',
  OUTLIER_PENDING: 'OUTLIER_PENDING',
  COMMERCIAL_DECISION: 'COMMERCIAL_DECISION',
  UNIDAD_INCOMPATIBLE: 'UNIDAD_INCOMPATIBLE',
  EXCLUSION_CON_COMPUTO: 'EXCLUSION_CON_COMPUTO',  // el alcance excluye algo que igual se computó
  SIN_PARTIDA: 'SIN_PARTIDA',
  CANTIDAD_CRITICA_AUSENTE: 'CANTIDAD_CRITICA_AUSENTE',
  FUGA_ENTRE_CLIENTES: 'FUGA_ENTRE_CLIENTES',
  /** Un precio que salió de una página web reemplazó a uno propio vencido. Es información legítima
   *  y NO es experiencia de ECSAS: congelar una oferta sobre él exige que alguien lo asuma. */
  PRECIO_DE_INTERNET: 'PRECIO_DE_INTERNET',
})

/** Cuánto duele. `BLOQUEANTE` no es un adjetivo: es lo que hace que `puedeCongelar` diga que no. */
export const SEVERIDAD = Object.freeze({
  BLOQUEANTE: 'BLOQUEANTE',
  ALTA: 'ALTA',
  MEDIA: 'MEDIA',
  BAJA: 'BAJA',
})

const PESO_SEVERIDAD = Object.freeze({ BLOQUEANTE: 3, ALTA: 2, MEDIA: 1, BAJA: 0 })

/**
 * UN ISSUE. Siete campos y ninguno decorativo:
 *
 *   `impact` es PLATA o `null` — nunca cero. Un issue sin impacto conocido y uno con impacto cero
 *   son cosas distintas: el primero hay que mirarlo, el segundo no. Escribir `0` cuando no se sabe
 *   lo manda al fondo de la cola, que es exactamente donde no tiene que estar.
 *
 *   `recommended_action` es una ACCIÓN del command layer, no una frase. Así la pantalla puede
 *   ofrecer el botón y el chat puede ofrecer la intención, desde el mismo dato.
 *
 * PURA.
 */
export function issue({
  type, severity = SEVERIDAD.MEDIA, entity, impact = null, evidence = null,
  recommended_action = null, detalle = null,
} = {}) {
  if (!Object.values(TIPO_ISSUE).includes(type)) throw new Error(`tipo de issue desconocido: ${type}`)
  if (!Object.values(SEVERIDAD).includes(severity)) throw new Error(`severidad desconocida: ${severity}`)
  if (!entity) throw new Error('un issue sin entidad no se puede resolver: ¿qué hay que mirar?')
  return Object.freeze({
    type, severity, entity,
    impact: impact === null || impact === undefined ? null : Number(impact),
    evidence, recommended_action, detalle,
  })
}

/**
 * LA COLA, ORDENADA POR BLOQUEO Y DESPUÉS POR MATERIALIDAD (§22). PURA.
 *
 * El impacto DESCONOCIDO (`null`) va DESPUÉS de los conocidos dentro de la misma severidad, no al
 * fondo de todo: no saber cuánto cuesta un hueco no lo vuelve inofensivo, pero un hueco de $30 M
 * medido merece mirarse antes que uno sin medir. El desempate final es por entidad, para que dos
 * corridas devuelvan la MISMA cola (§39).
 */
export function ordenarCola(issues = []) {
  return [...issues].sort((a, b) =>
    PESO_SEVERIDAD[b.severity] - PESO_SEVERIDAD[a.severity]
    || (b.impact ?? -1) - (a.impact ?? -1)
    || String(a.type).localeCompare(String(b.type))
    || String(a.entity).localeCompare(String(b.entity)))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL COMMAND LAYER Y SU RBAC (§19, §40)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Los seis permisos. No son roles: un rol tiene permisos, y el mismo permiso lo pueden tener dos
 *  roles distintos. La pregunta que hace el motor es siempre por PERMISO. */
export const PERMISO = Object.freeze({
  READ: 'READ',
  WRITE: 'WRITE',
  COMMERCIAL_WRITE: 'COMMERCIAL_WRITE',
  FREEZE: 'FREEZE',
  APPROVE: 'APPROVE',
  GLOBAL_POLICY_WRITE: 'GLOBAL_POLICY_WRITE',
})

/**
 * QUÉ VE Y QUÉ PUEDE CADA ROL.
 *
 * El jefe de obra tiene READ y WRITE y NO tiene COMMERCIAL_WRITE — y eso no alcanza, porque §40
 * dice que además NO VE lo comercial: ni por chat, ni por API, ni por el inspector, ni por un
 * mensaje de error, ni por un export, ni por la revisión, ni por preparar obra. Por eso existe
 * `VE_COMERCIAL` aparte de los permisos de escritura: leer el margen es una capacidad propia, y en
 * este repo ya pasó una vez que una capacidad de LECTURA terminó escribiendo.
 */
export const ROL = Object.freeze({
  DUENO: 'DUENO',
  ADMINISTRACION: 'ADMINISTRACION',
  JEFE_DE_OBRA: 'JEFE_DE_OBRA',
  LECTOR: 'LECTOR',
})

export const PERMISOS_DE_ROL = Object.freeze({
  DUENO: Object.freeze([PERMISO.READ, PERMISO.WRITE, PERMISO.COMMERCIAL_WRITE, PERMISO.FREEZE, PERMISO.APPROVE, PERMISO.GLOBAL_POLICY_WRITE]),
  ADMINISTRACION: Object.freeze([PERMISO.READ, PERMISO.WRITE, PERMISO.COMMERCIAL_WRITE, PERMISO.FREEZE]),
  JEFE_DE_OBRA: Object.freeze([PERMISO.READ, PERMISO.WRITE]),
  LECTOR: Object.freeze([PERMISO.READ]),
})

/** Los roles que pueden VER cifras comerciales (margen, beneficio, coeficiente, precio de venta).
 *  Se deriva de COMMERCIAL_WRITE a propósito: no hay un rol que pueda escribir lo comercial y no
 *  verlo, y tener la lista suelta permitiría que se separen sin que nadie lo note. */
export const veComercial = (rol) => (PERMISOS_DE_ROL[rol] ?? []).includes(PERMISO.COMMERCIAL_WRITE)

/**
 * LAS ACCIONES DEL COMMAND LAYER, con el permiso que cada una exige.
 *
 * Es la lista cerrada de lo que se le puede pedir al presupuesto. El LLM produce una INTENCIÓN con
 * uno de estos `action` y nunca escribe estado de negocio: entre la intención y la mutación pasan
 * AUTORIZACIÓN → VALIDACIÓN → REGLAS → OUTLIER → MUTACIÓN → RECÁLCULO → PERSISTENCIA (§19), y las
 * primeras cuatro son código de este repo, no del modelo.
 *
 * `muta: false` marca las CONSULTAS. No pasan por outlier ni por undo, y por eso no pueden cambiar
 * nada aunque el modelo se equivoque de acción.
 */
export const ACCION = Object.freeze({
  update_quantity:     { permiso: PERMISO.WRITE,               muta: true,  campos: ['target', 'value', 'unit'] },
  exclude_scope:       { permiso: PERMISO.WRITE,               muta: true,  campos: ['target', 'reason'] },
  include_scope:       { permiso: PERMISO.WRITE,               muta: true,  campos: ['target', 'reason'] },
  set_subcontract:     { permiso: PERMISO.WRITE,               muta: true,  campos: ['target', 'supplier', 'value', 'currency'] },
  set_resource_price:  { permiso: PERMISO.WRITE,               muta: true,  campos: ['target', 'value', 'currency', 'source'] },
  commercial_override: { permiso: PERMISO.COMMERCIAL_WRITE,    muta: true,  campos: ['target', 'value'] },
  set_global_policy:   { permiso: PERMISO.GLOBAL_POLICY_WRITE, muta: true,  campos: ['target', 'value'] },
  freeze:              { permiso: PERMISO.FREEZE,              muta: true,  campos: [] },
  approve:             { permiso: PERMISO.APPROVE,             muta: true,  campos: [] },
  undo:                { permiso: PERMISO.WRITE,               muta: true,  campos: ['correlation_id'] },
  evidence_query:      { permiso: PERMISO.READ,                muta: false, campos: ['target'] },
  blockers_query:      { permiso: PERMISO.READ,                muta: false, campos: [] },
  cost_query:          { permiso: PERMISO.READ,                muta: false, campos: ['target'] },
  commercial_query:    { permiso: PERMISO.COMMERCIAL_WRITE,    muta: false, campos: ['target'] },
})

/**
 * ═══ LA COSTURA OFICIAL DEL COMMAND LAYER (contrato 1.1.0) ═══
 *
 * `comandos.ejecutar()` es SÍNCRONA y no escribe. Recibe `mutar`, que devuelve un PLAN de escritura
 * —qué filas tocar y con qué valores— y el plan lo aplica QUIEN LLAMA, con SU credencial.
 *
 * No es una limitación pendiente de arreglar: es lo que mantiene la RLS honesta. Si el motor
 * escribiera, escribiría con la conexión del servidor —rol del pool, RLS no aplicada— y los seis
 * permisos volverían a vivir sólo en JavaScript, que es el agujero que la migración 20260829T1500
 * cerró. Aplicando el caller, la base vuelve a preguntar quién es.
 */

/**
 * ¿ESTE ROL PUEDE ESTA ACCIÓN? PURA.
 *
 * Devuelve el motivo cuando no puede, y el motivo NO nombra el valor que se quería escribir: un
 * mensaje de error es un canal de lectura, y §40 dice que el jefe de obra no ve lo comercial NI POR
 * UN ERROR. «No tenés permiso para cambiar el beneficio» está bien; «no podés poner el beneficio en
 * 19 %» ya le contó cuánto es.
 */
export function autorizar({ rol, action } = {}) {
  const def = ACCION[action]
  if (!def) return { ok: false, motivo: `acción desconocida: ${action}` }
  const permisos = PERMISOS_DE_ROL[rol]
  if (!permisos) return { ok: false, motivo: `rol desconocido: ${rol}` }
  if (!permisos.includes(def.permiso)) {
    return { ok: false, motivo: `la acción «${action}» exige el permiso ${def.permiso} y el rol ${rol} no lo tiene`, permisoFaltante: def.permiso }
  }
  return { ok: true, permiso: def.permiso, muta: def.muta }
}

/**
 * UNA INTENCIÓN ESTRUCTURADA — lo ÚNICO que el LLM tiene permitido producir (§19).
 *
 * No muta nada, no toca la base, no calcula. Es un sobre con cuatro datos y su texto original, y su
 * única garantía es sintáctica: si la acción no existe en la lista cerrada, no se construye. Todo
 * lo demás —¿ese target existe? ¿ese número es plausible? ¿tiene permiso?— lo decide el código
 * después, en ese orden.
 */
export function intencion({ action, target = null, value = null, unit = null, textoOriginal = null, ...extra } = {}) {
  const def = ACCION[action]
  if (!def) throw new Error(`el modelo propuso una acción que no existe: ${action}`)
  // ═══ 1.1.0 · LOS CAMPOS DECLARADOS VIAJAN ═══
  //
  // La 1.0.0 descartaba `supplier`, `reason`, `currency` y `source` — campos que `ACCION[x].campos`
  // DECLARA y que `comandos.validar()` LEE. Con eso, el canónico «la sanitaria la hace X por 8,5M»
  // NO se podía expresar con el constructor oficial: sin `supplier`, la validación lo trata como
  // «sanitaria 8,5M» y pregunta quién. El frente tuvo que escribir un constructor paralelo, que es
  // la receta de siempre para que dos definiciones se separen.
  //
  // Sólo se propaga lo DECLARADO: un campo que la acción no nombra sigue sin entrar, así que el
  // modelo no puede colar datos que ninguna validación mira.
  const sumar = {}
  for (const [k, v] of Object.entries(extra)) if (def.campos.includes(k)) sumar[k] = v
  return Object.freeze({ action, target, value, unit, textoOriginal, propuestaEn: null, ...sumar })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · LAS INVARIANTES DEL §42, COMO CÓDIGO
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LAS TRECE DESIGUALDADES DEL §42, escritas una sola vez.
 *
 * Están acá y no repartidas en trece tests porque son el CONTRATO, no la implementación: un test
 * las verifica sobre el motor, pero la lista de qué nunca puede confundirse con qué es una decisión
 * de negocio y vive con el vocabulario. Cada una tiene su test negativo en `contrato.test.mjs`.
 */
export const INVARIANTES = Object.freeze([
  { id: 'NULL≠0', porQue: 'un dato ausente no vale cero: cero es una medición' },
  { id: 'ERROR≠0', porQue: 'un dato imposible no vale cero: hay que corregirlo' },
  { id: 'UNKNOWN≠0', porQue: 'no saber cuánto vale no es que valga nada' },
  { id: 'SIN_PRECIO≠0', porQue: 'un subcontrato sin cotizar no es gratis: es un agujero (§14)' },
  { id: 'HISTORICO≠VALIDADO', porQue: 'que ECSAS lo haya usado no lo vuelve correcto (§29)' },
  { id: 'CANDIDATO≠NORMA', porQue: 'una práctica candidata no asciende sola a regla (§30)' },
  { id: 'EXTERNAL≠ECSAS', porQue: 'lo que se leyó en la web nunca se vuelve experiencia propia (§32)' },
  { id: 'COST≠PRICE', porQue: 'el costo directo no es el precio de venta: entre medio hay 7 escalones' },
  { id: 'QUOTE≠OFFER', porQue: 'la oferta sale de la versión congelada, no del borrador vivo (§25)' },
  { id: 'FROZEN≠DRAFT', porQue: 'lo congelado no muta; para cambiarlo se crea una versión (§24)' },
  { id: 'REVISION≠MUTACIÓN', porQue: 'una revisión no altera la versión ya ofertada (§26)' },
  { id: 'HH≠CREW', porQue: 'las horas hombre no son la dotación' },
  { id: 'HH≠DURACIÓN', porQue: 'más personas no reducen las HH totales, reducen la duración (§12)' },
])
