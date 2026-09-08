// CAMBIAR LA OBRA ACTUAL DE UNA PERSONA — la decisión, sin base de datos.
//
// El dueño (08/09/2026): *"la asignación de personal en cada obra es imposible… necesito algo mucho
// más sencillo; por el momento que sea desde planilla asistencia con un dropdown de obra actual"*.
// Elegir otra obra en la grilla de asistencia es UN gesto, pero son DOS escrituras sobre
// `obra_asignacion`: cerrar la vigente y abrir la nueva. Qué se cierra, con qué fecha y qué se abre
// se decide acá, sin red, para que se pueda probar sin base.
//
// ═══ CERRAR NO ES BORRAR ═══
//
// La asignación anterior recibe `hasta`; la fila queda. Es lo que respalda las horas que la persona
// imputó mientras estuvo, y es lo que hace que la cronología de la ficha pueda mostrar el cambio.
// Un `delete` haría que cada rotación de plantel borrara el pasado de la obra.
//
// ═══ POR QUÉ `hasta` ES AYER Y NO HOY ═══
//
// El cambio rige DESDE HOY: la nueva abre con `desde = hoy`. Si la anterior cerrara hoy, las dos
// serían vigentes hoy y la grilla tendría que elegir una por horas — el cambio se vería a medias.
// Con `hasta = ayer` el día de hoy tiene una sola obra.
//
// ═══ SALVO QUE LA ANTERIOR HAYA EMPEZADO HOY ═══
//
// Corregir en el momento una asignación recién creada dejaría `hasta` ANTES de `desde`: un período
// que afirma que la persona trabajó menos que ningún día. Ahí `hasta = desde`, que es lo único
// cierto — estuvo asignada ese día. No se borra: alguien la creó y eso es historia.

// ═══ QUIÉN PUEDE MOVER A ALGUIEN DE OBRA (dueño, 08/09/2026 — segunda decisión del día) ═══
//
// A la mañana el dueño había dicho *"sólo usuarios admin puedan hacer eso"*. A la tarde, probando
// la carga desde el teléfono, lo cambió: *"al comenzar el día tengo que marcar la asistencia de las
// personas, pero ¿qué pasa si no modifiqué el lugar de trabajo? Tenés que habilitar a los jefes de
// obra a poder modificar las obras asignadas del personal"*. Manda esta.
//
// El motivo es el proceso real, no la comodidad: quien mueve gente entre obras a las 7 de la mañana
// es el jefe, y si tiene que pedirle a Administración que reasigne antes de poder marcar la
// asistencia, la asistencia se carga en la obra equivocada o no se carga. Un plantel mal asignado
// imputa el costo de mano de obra a otra obra igual —sólo que en silencio y sin nadie que lo firme.
//
// SIGUE AFUERA `campo`. Es el único rol que la RLS acota por obra: el operario carga lo suyo y no
// decide plantel. Y sigue afuera «sin rol»: sin perfil no se mueve a nadie.
//
// NO alcanza `es_administracion()` de la base —incluye al jefe desde 20260819T4900 y ahora eso
// coincide, pero por casualidad, no por diseño—: acá manda el ROL DEL PERFIL, que es la lista que
// el dueño decidió. La regla vive una vez y la aplican las dos puntas: la pantalla para no ofrecer
// un control que va a rebotar, y la acción —que es la puerta de verdad— para rechazar la llamada
// venga de donde venga.
export const ROLES_QUE_MUEVEN_DE_OBRA = ['direccion', 'administracion', 'jefe_obra'] as const

export function puedeCambiarObraActual(rol: string | null | undefined): boolean {
  return typeof rol === 'string' && (ROLES_QUE_MUEVEN_DE_OBRA as readonly string[]).includes(rol)
}

/** Una asignación ABIERTA de la persona: `hasta is null`, en cualquier obra y con cualquier `desde`
 *  —también sin `desde`—. El nombre viene resuelto: el acuse nunca escribe un id. */
export interface AsignacionAbierta {
  id: string
  obra_id: string
  /** El nombre real de la obra. Nunca el id. */
  nombre: string
  /** Hay filas abiertas sin `desde` (las creó la web antes de exigirlo). No son un error de lectura. */
  desde: string | null
}

export interface CierreDeAsignacion {
  id: string
  hasta: string
}

export interface PlanDeObraActual {
  cerrar: CierreDeAsignacion[]
  /**
   * La obra que se abre. `null` cuando el destino es «Sin obra» o ya estaba abierta.
   *
   * `hasta` NO VIAJA CUANDO ES ABIERTO, no viaja como `null`: el cambio de hoy —que es el 99% de
   * los gestos— tiene que producir literalmente el mismo objeto que producía antes de existir la
   * programación. Con `hasta: null` adentro, cada `deepEqual` de los tests de «desde hoy» habría
   * que retocarlo, y retocar el test que protege el comportamiento viejo es justamente la forma de
   * dejar de protegerlo.
   */
  abrir: { obra_id: string; desde: string; hasta?: string } | null
  /**
   * EL REGRESO DEL TRAMO SANDWICH. «Tres días en Quattropani y vuelve a San Francisco»: cuando el
   * tramo programado tiene `hasta`, la obra donde la persona está hoy se reabre al día siguiente.
   *
   * Es un `insert` más, no un `update` sobre la fila que se cerró: esa fila ya tiene su `hasta` y
   * representa el período real que la persona estuvo ahí. Reabrirla borraría el corte y dejaría un
   * único tramo que afirma que nunca se fue.
   */
  reabrir: { obra_id: string; desde: string } | null
  /** No hay nada que escribir: ya estaba exactamente así. */
  sinCambio: boolean
  /** La línea que lee quien tocó el desplegable. Siempre con nombres, nunca con ids. */
  acuse: string
}

/** El día anterior en ISO. Se calcula en UTC a propósito: la fecha ya viene como `YYYY-MM-DD` y
 *  construirla con la zona local movería el día en cada máquina con offset negativo. */
export function diaAnterior(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) throw new Error(`Fecha inválida: ${iso}`)
  return new Date(t - 86_400_000).toISOString().slice(0, 10)
}

/** El día siguiente en ISO. Mismo criterio UTC que `diaAnterior`, y por la misma razón. */
export function diaSiguiente(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) throw new Error(`Fecha inválida: ${iso}`)
  return new Date(t + 86_400_000).toISOString().slice(0, 10)
}

/** `hasta` de una asignación que se cierra porque el destino arranca el día `corte`: la víspera del
 *  corte, salvo que la asignación haya empezado ese mismo día o después. Una fila sin `desde` cierra
 *  en la víspera: no hay ningún comienzo que el cierre pueda quedar por delante.
 *
 *  Cuando el cambio es DESDE HOY, `corte` es hoy y la víspera es ayer — el comportamiento de
 *  siempre. Cuando es programado, `corte` es el `desde` futuro y la anterior sigue vigente hasta el
 *  día anterior al pase: cerrarla ayer le sacaría a la persona los días que todavía va a trabajar
 *  donde está, y esas horas ya no tendrían asignación que las respalde. */
function cierreDe(a: AsignacionAbierta, corte: string): string {
  const vispera = diaAnterior(corte)
  return a.desde && a.desde > vispera ? a.desde : vispera
}

/**
 * Hasta cuándo se puede programar un pase. Sesenta días.
 *
 * No es un número técnico: es hasta dónde llega la planificación real de esta empresa. Más allá, lo
 * que se está escribiendo no es un plan sino una intención, y una intención guardada como
 * asignación se convierte sola en el dato con el que después se imputa costo de mano de obra.
 */
export const MAX_DIAS_PROGRAMACION = 60

/** `2026-09-10` → `10/09`. El acuse habla de días, no de timestamps; y el formateo vive acá para
 *  que la decisión pura no dependa de `Intl` ni de la zona horaria del navegador. */
const fechaCorta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * ¿Se puede programar un pase con estas fechas? `null` = sí.
 *
 * ═══ POR QUÉ ES UNA FUNCIÓN Y NO UN `refine` DE ZOD ═══
 *
 * Las tres reglas dependen de HOY, y hoy entra por parámetro en todo este módulo justamente para
 * que ningún test se rompa a medianoche. Un esquema de Zod que leyera el reloj adentro sería el
 * único tramo de la cadena que no se puede probar. Zod valida la FORMA (que sea una fecha); esto
 * valida la DECISIÓN.
 *
 * Las usan las dos puntas: el panel para no ofrecer un botón que va a rebotar, y la acción —que es
 * la puerta— para rechazar la llamada venga de donde venga.
 */
export function validarProgramacion(
  { hoy, desde, hasta }: { hoy: string; desde: string; hasta?: string | null },
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return 'La fecha de inicio no es una fecha.'
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 'La fecha de fin no es una fecha.'
  // HACIA ATRÁS NO SE PROGRAMA. Mover a alguien a una obra la semana pasada reimputaría el costo de
  // mano de obra de días que ya se cargaron y ya se miraron. Corregir el pasado es la corrección de
  // jornada, que además dice a qué obra va cada día.
  if (desde < hoy) return 'No se puede programar hacia atrás: para corregir un día ya cargado está la corrección de jornada.'
  const tope = new Date(Date.parse(`${hoy}T00:00:00Z`) + MAX_DIAS_PROGRAMACION * 86_400_000)
    .toISOString().slice(0, 10)
  if (desde > tope) return `No se puede programar a más de ${MAX_DIAS_PROGRAMACION} días (hasta el ${fechaCorta(tope)}).`
  if (hasta && hasta < desde) return 'El último día no puede ser anterior al primero.'
  return null
}

/**
 * Su asignación vigente HOY, que es la obra a la que vuelve cuando termina un tramo con `hasta`.
 *
 * Misma regla que usa la grilla para decidir qué muestra el desplegable (`obraActivaDe` en
 * `quincenaPorObra.ts`): empezó o siempre estuvo, y gana el `desde` más reciente. Un tramo con
 * `desde` futuro NO es la vigente — todavía no rige, y hacer volver a la persona a una obra donde
 * nunca estuvo sería inventar el regreso.
 *
 * Con dos abiertas vigentes el mismo día —que en la base las hay— se elige una sola y de forma
 * determinística: el `id` desempata para que el mismo gesto escriba siempre lo mismo.
 */
function vigenteHoy(abiertas: AsignacionAbierta[], hoy: string): AsignacionAbierta | null {
  const candidatas = abiertas.filter((a) => !a.desde || a.desde <= hoy)
  if (candidatas.length === 0) return null
  return [...candidatas].sort((a, b) =>
    (b.desde ?? '').localeCompare(a.desde ?? '') || a.id.localeCompare(b.id))[0]
}

/** Entre varias filas abiertas de la MISMA obra se conserva la de historia más larga: la del `desde`
 *  más viejo, y una sin `desde` pierde contra cualquiera que tenga fecha —es la fila incompleta que
 *  dejó la web—. El `id` desempata para que el plan no dependa del orden en que llegó la lectura. */
function masVieja(a: AsignacionAbierta, b: AsignacionAbierta): AsignacionAbierta {
  if (a.desde && b.desde) {
    const porFecha = a.desde.localeCompare(b.desde)
    if (porFecha !== 0) return porFecha <= 0 ? a : b
  } else if (a.desde || b.desde) {
    return a.desde ? a : b
  }
  return a.id.localeCompare(b.id) <= 0 ? a : b
}

/**
 * Qué escribir para que la persona quede DESDE HOY en `destino`.
 *
 * ═══ UNA PERSONA TIENE UNA OBRA ACTUAL, Y ESO INCLUYE LO QUE YA ESTABA MAL ═══
 *
 * `abiertas` son TODAS las asignaciones con `hasta is null` de la persona, sin filtrar por obra ni
 * por `desde`. En la base hay gente con dos abiertas a la vez (una la creó la web sin `desde`, la
 * otra la reconstruyó el historial de JORNALES), y ahí es donde el desplegable venía fallando: si
 * se cerraba sólo una y la otra ya era del destino, el `insert` chocaba contra el índice único
 * `obra_asignacion_una_vigente` y la persona quedaba cerrada y sin abrir — 0 vigentes.
 *
 * Por eso el plan es siempre el mismo: si YA hay una abierta en el destino se conserva ésa y se
 * cierran TODAS las demás —incluidas las duplicadas de la misma obra—; si no la hay se cierran
 * todas y se abre una sola. `destino = null` es «Sin obra»: sólo cierra.
 */
export function planDeCambioDeObra({ abiertas, destino, hoy, desde = hoy, hasta = null }: {
  abiertas: AsignacionAbierta[]
  destino: { id: string; nombre: string } | null
  hoy: string
  /**
   * Desde qué día rige el pase. Ausente = hoy, que es el desplegable de la grilla y no cambió.
   *
   * El dueño (08/09/2026): *«una cosa es hoy y cuando planifico quiero poner lo de mañana y
   * siguientes»*. Un pase futuro NO es otra tabla: es la MISMA `obra_asignacion` con la fecha que
   * corresponde. Una tabla de «planes» al lado sería la segunda definición de dónde trabaja
   * alguien, y el día que el plan se cumpliera habría que copiarlo a mano de una a la otra.
   */
  desde?: string
  /** Último día del tramo. `null` = hasta nuevo aviso. Con fecha, la persona vuelve a la obra donde
   *  está hoy al día siguiente — es el pase de tres días a otra obra. */
  hasta?: string | null
}): PlanDeObraActual {
  let seConserva: AsignacionAbierta | null = null
  for (const a of destino ? abiertas.filter((x) => x.obra_id === destino.id) : []) {
    seConserva = seConserva ? masVieja(seConserva, a) : a
  }
  const sobran = abiertas.filter((a) => a.id !== seConserva?.id)
  const cerrar = sobran.map((a) => ({ id: a.id, hasta: cierreDe(a, desde) }))
  const abrir = destino && !seConserva
    ? { obra_id: destino.id, desde, ...(hasta ? { hasta } : {}) }
    : null

  // EL REGRESO SÓLO EXISTE SI HAY TRAMO NUEVO Y TIENE FIN. Sin `abrir` no hay de dónde volver: o no
  // se movió a nadie, o la persona ya estaba en el destino y el tramo no se creó.
  const vuelve = hasta && abrir ? vigenteHoy(abiertas, hoy) : null
  const reabrir = vuelve && vuelve.obra_id !== destino?.id
    ? { obra_id: vuelve.obra_id, desde: diaSiguiente(hasta as string) }
    : null

  if (cerrar.length === 0 && !abrir) {
    return {
      cerrar, abrir, reabrir: null, sinCambio: true,
      acuse: destino ? `Ya estaba en ${destino.nombre}.` : 'Ya estaba sin obra.',
    }
  }
  return {
    cerrar, abrir, reabrir, sinCambio: false,
    acuse: acuseDe({ destino, seConserva, cerradas: sobran, hoy, desde, hasta, vuelve }),
  }
}

/** «Desde hoy en SALÓN COMERCIAL · antes PISOS INDUSTRIALES, GALPÓN 9». El «antes» nombra todo lo
 *  que se cerró: si no se cerró nada, no hubo un antes y decirlo sería inventarlo.
 *
 *  Cuando la persona YA estaba en el destino y lo único que se hace es cerrar las otras abiertas,
 *  el acuse no puede decir «desde hoy»: no empezó hoy, y lo que hay para contar es la limpieza. */
function acuseDe({ destino, seConserva, cerradas, hoy, desde, hasta, vuelve }: {
  destino: { id: string; nombre: string } | null
  seConserva: AsignacionAbierta | null
  cerradas: AsignacionAbierta[]
  hoy: string
  desde: string
  hasta: string | null
  vuelve: AsignacionAbierta | null
}): string {
  const nombres = cerradas.map((a) => a.nombre).join(', ')
  if (destino && seConserva) {
    return `Ya estaba en ${destino.nombre} · se ${cerradas.length === 1 ? 'cerró' : 'cerraron'} ${nombres}.`
  }
  // EL ACUSE DICE LA FECHA REAL, NO «desde hoy» SIEMPRE. Un pase programado que acusa «desde hoy»
  // le hace creer a quien lo programó que la persona ya se movió, y el gesto siguiente es ir a
  // buscarla a la obra equivocada.
  const cuando = desde === hoy
    ? 'Desde hoy'
    : hasta
      ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`
      : `Desde el ${fechaCorta(desde)}`
  const cabeza = destino ? `${cuando} en ${destino.nombre}` : `${cuando} sin obra`
  const regreso = vuelve && vuelve.obra_id !== destino?.id ? ` · vuelve a ${vuelve.nombre}` : ''
  if (cerradas.length === 0) return `${cabeza}${regreso}.`
  // CON REGRESO NO SE ESCRIBE EL «antes»: son la misma obra dicha dos veces, y «antes San Francisco
  // · vuelve a San Francisco» hace dudar de si son dos obras distintas.
  if (regreso) return `${cabeza}${regreso}.`
  return `${cabeza} · antes ${nombres}.`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CANCELAR UN PASE PROGRAMADO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Programar es reversible: el pase todavía no ocurrió, no hay ni una hora imputada contra él, y la
// planificación de la semana cambia. Por eso acá SÍ se borra —al revés que en el cambio de hoy,
// donde cerrar es la regla y borrar destruiría el período que respalda las horas cargadas.
//
// LO QUE YA RIGE NO SE CANCELA, SE CAMBIA. Un tramo con `desde <= hoy` puede tener horas cargadas
// contra él; borrarlo las dejaría sin asignación que las respalde. Para eso está el desplegable.

/** Un tramo de `obra_asignacion` de la persona, tal como está en la base. */
export interface TramoDeAsignacion {
  id: string
  obra_id: string
  /** El nombre real de la obra. Nunca el id. */
  nombre: string
  desde: string | null
  hasta: string | null
}

export interface PlanDeCancelacion {
  /** Los ids que se borran: el tramo programado y —si era un sandwich— su regreso. */
  borrar: string[]
  /** El tramo que se había cerrado para dejarle lugar, que vuelve a quedar abierto. */
  reabrirId: string | null
  /** El texto que lee quien canceló. Con nombres, nunca con ids. */
  acuse: string
  /** Por qué no se pudo. `null` cuando el plan es válido. */
  error: string | null
}

/**
 * Deshacer un pase programado y dejar a la persona como estaba.
 *
 * ═══ TRES ESCRITURAS, Y LAS TRES HACEN FALTA ═══
 *
 * 1. Se borra el tramo programado.
 * 2. Si tenía `hasta`, se borra también el REGRESO —la fila que abría al día siguiente en la obra
 *    de origen—. Dejarlo vivo pondría a la persona sin obra desde mañana hasta esa fecha: un hueco
 *    en el medio, que es peor que el pase que se está cancelando.
 * 3. Se reabre (`hasta = null`) el tramo que se había cerrado en la víspera. Sin esto la persona
 *    queda sin ninguna asignación abierta y la grilla la muestra «Sin obra» — el mismo estado que
 *    el cambio de obra evita a propósito.
 *
 * El paso 3 se hace por FECHA y no por «el último cerrado»: el tramo que cede el lugar es
 * exactamente el que cierra en `desde − 1`. Buscar «el más reciente» tomaría cualquier cierre viejo
 * y reabriría un período que terminó de verdad hace meses.
 */
export function planDeCancelacion(
  { tramos, id, hoy }: { tramos: TramoDeAsignacion[]; id: string; hoy: string },
): PlanDeCancelacion {
  const vacio = { borrar: [], reabrirId: null, acuse: '' }
  const tramo = tramos.find((t) => t.id === id)
  if (!tramo) return { ...vacio, error: 'Ese tramo ya no existe: puede que alguien lo haya cancelado antes.' }
  if (!tramo.desde || tramo.desde <= hoy) {
    return {
      ...vacio,
      error: 'Ese tramo ya rige: no se cancela, se cambia con el desplegable de obra actual. '
        + 'Borrarlo dejaría sin asignación las horas que ya se cargaron contra él.',
    }
  }

  const borrar = [tramo.id]
  if (tramo.hasta) {
    const diaDelRegreso = diaSiguiente(tramo.hasta)
    const regreso = tramos.find((t) =>
      t.id !== tramo.id && t.desde === diaDelRegreso && t.hasta === null)
    if (regreso) borrar.push(regreso.id)
  }

  const vispera = diaAnterior(tramo.desde)
  const cedio = tramos.find((t) => t.id !== tramo.id && t.hasta === vispera)
  return {
    borrar,
    reabrirId: cedio?.id ?? null,
    acuse: cedio
      ? `Se canceló el pase a ${tramo.nombre} · sigue en ${cedio.nombre}.`
      : `Se canceló el pase a ${tramo.nombre}.`,
    error: null,
  }
}

/**
 * Los tramos PROGRAMADOS de la persona: los que empiezan después de hoy.
 *
 * Es la misma lectura que alimenta la línea de la grilla, el panel y la ficha: una definición de
 * «programado», no tres. Ordenados por `desde` para que el primero sea el próximo — la grilla
 * muestra uno solo y tiene que ser el que viene, no el que quedó primero en la lectura.
 */
export function tramosProgramados(tramos: TramoDeAsignacion[], hoy: string): TramoDeAsignacion[] {
  return tramos
    .filter((t) => t.desde != null && t.desde > hoy)
    .sort((a, b) => (a.desde ?? '').localeCompare(b.desde ?? '') || a.id.localeCompare(b.id))
}

/** El papel de un tramo en la línea de tiempo del panel. Lo decide la fecha, nunca el orden. */
export type PapelDeTramo = 'pasado' | 'cierra_hoy' | 'vigente' | 'programado'

/**
 * QUÉ ES CADA TRAMO EN LA LÍNEA DE TIEMPO — y por qué «está acá» es UNO SOLO.
 *
 * ═══ EL DEFECTO (producción, 08/09/2026) ═══
 *
 * El panel rotulaba «está acá» a dos tramos a la vez. Pasa siempre que se corrige la obra el MISMO
 * día: el cambio cierra la anterior con `hasta = hoy` —cuando esa asignación había empezado hoy, el
 * cierre no puede ser ayer— y abre la nueva con `hasta = null`. La regla vieja («ni empieza después
 * de hoy ni terminó antes de hoy → vigente») daba verdadera para las dos, y el panel afirmaba que
 * la persona está en dos obras. Es la pregunta que ese panel existe para contestar.
 *
 * ═══ LA REGLA ═══
 *
 * «Está acá» va al tramo ABIERTO vigente y a uno solo: entre los que rigen hoy gana el `desde` más
 * reciente, y el `id` desempata para que dos lecturas de la misma base no den pantallas distintas.
 * El que cierra HOY se rotula «cierra hoy» — no es pasado (sus horas de hoy son suyas) ni es donde
 * está (ya se decidió que se va), y decirlo es más honesto que elegir cualquiera de los dos.
 *
 * Es la MISMA regla de desempate que `vigenteHoy` y que `obraActivaDe` en `quincenaPorObra.ts`: el
 * panel no puede decir que la persona está en una obra distinta de la que muestra la grilla.
 */
export function papelesDeTramos(
  tramos: TramoDeAsignacion[], hoy: string,
): { tramo: TramoDeAsignacion; papel: PapelDeTramo }[] {
  const rigeHoy = (t: TramoDeAsignacion) => (!t.desde || t.desde <= hoy) && (!t.hasta || t.hasta >= hoy)
  // ABIERTO gana sobre el que cierra hoy, SIEMPRE — aunque el que cierra tenga el `desde` más
  // reciente. Un tramo con `hasta` puesto es una decisión ya tomada de que la persona se va de ahí;
  // el abierto es donde queda. Ordenar sólo por `desde` habría elegido al que se está cerrando.
  const aca = [...tramos]
    .filter((t) => rigeHoy(t) && t.hasta == null)
    .sort((a, b) => (b.desde ?? '').localeCompare(a.desde ?? '') || a.id.localeCompare(b.id))[0]
    // SIN NINGUNO ABIERTO, «está acá» es el que rige hoy aunque cierre hoy: la persona SÍ está ahí
    // hoy, y dejar el panel sin ningún «está acá» diría que no está en ninguna obra.
    ?? [...tramos].filter(rigeHoy)
      .sort((a, b) => (b.desde ?? '').localeCompare(a.desde ?? '') || a.id.localeCompare(b.id))[0]

  const papelDe = (t: TramoDeAsignacion): PapelDeTramo => {
    if (t.desde && t.desde > hoy) return 'programado'
    if (aca && t.id === aca.id) return 'vigente'
    if (t.hasta === hoy) return 'cierra_hoy'
    // Lo que queda es pasado, incluidas las filas abiertas DUPLICADAS que hay en la base y que
    // rigen hoy sin ser la elegida: el panel afirma UNA obra actual, no dos.
    return 'pasado'
  }
  return tramos.map((t) => ({ tramo: t, papel: papelDe(t) }))
}
