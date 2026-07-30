// MOTIVOS DE NOVEDAD — por qué un trabajador no hizo su jornada completa.
//
// POR QUÉ EXISTE. Hasta acá el módulo registraba CUÁNTAS horas hizo cada uno. Eso alcanza
// para liquidar y no alcanza para nada más: "0 horas" no distingue al que faltó sin avisar
// del que estaba de vacaciones, del suspendido, del que se accidentó en obra. Son cuatro
// hechos con consecuencias distintas —económica, laboral, de ART y de planificación— y hoy
// se guardan todos como el mismo cero.
//
// El catálogo NO se inventó: la leyenda de la propia planilla "Obreros 26" nombra
// FALTA / TARDANZA / SE RETIRA ANTES / ENFERMEDAD / PERMISO. A eso se le agregan los cuatro
// casos que la empresa vive todos los meses y que la leyenda no cubre: accidente (ART),
// vacaciones, suspensión y franco.
//
// Y a esos, seis casos de OBRA que ninguna leyenda de planilla contempla y que hoy se estaban
// escondiendo dentro de `franco` o de `otro` —es decir, dentro de un texto libre que nadie
// puede sumar. Cada uno se agrega porque cambia una decisión distinta:
//
//   · LLUVIA — la obra para por clima. No es responsabilidad del trabajador, se presentó y el
//     jornal se paga. Es la causa de desvío de plazo más frecuente de una constructora, y
//     mientras viva dentro de "otro" nadie puede contestar cuántos días de obra costó el
//     invierno ni cargarlo a una ampliación de plazo.
//   · SIN TAREA (obra parada / sin material) — el trabajador vino y no había qué hacer. Se
//     paga igual. La diferencia con la lluvia es de quién es la culpa: acá es NUESTRA, y cada
//     hora es una falla de compras o de planificación que se está pagando en efectivo.
//   · PARO — medida gremial. Ausencia colectiva, no imputable a la persona y con tratamiento de
//     haberes propio. Contarla como falta injustificada mancharía el legajo de toda la cuadrilla
//     el mismo día.
//   · ACCIDENTE IN ITINERE — accidente yendo o volviendo del trabajo. Es ART igual que el de
//     obra, pero NO ocurrió en obra: no entra en el índice de siniestralidad del obrador ni
//     dispara la misma investigación interna. Sumarlos juntos falsea las dos lecturas.
//   · LICENCIA ESPECIAL — fallecimiento, matrimonio, nacimiento, examen (LCT art. 158). Es
//     licencia PAGA y OBLIGATORIA por ley, con plazos tasados. No es un permiso que la empresa
//     concede: es un derecho que la empresa no puede negar, y confundirlos es un riesgo legal.
//   · FALTA CON AVISO — sigue siendo injustificada, pero avisar cambia lo que el jefe puede
//     hacer esa mañana: mover gente, reprogramar la tarea, llamar a un reemplazo. Sin el dato,
//     la planificación del día siguiente no puede aprender nada.
//
// DÓNDE VIVE EL DATO. El motivo y la aclaración se guardan en Postgres
// (`comunicacion.asistencia_novedades`), NO en la planilla: la celda de JORNALES sigue
// recibiendo sólo horas. Escribir texto ahí rompería las fórmulas de suma de la quincena y
// el camino de escritura ya validado. Ver las migraciones 20260731090000 (la tabla) y
// 20260731120000 (la marca de obra parada) para el detalle.
//
// NADA DE ESTO TOCA red, base ni fecha del sistema: es puro. Los dos flujos (pantalla web y
// conversación en Mattermost) llaman a estas mismas funciones — la regla se escribe una vez.

import { normalizarHoras } from './horas-extra.mjs'

/** Claves estables del motivo. Es lo que se guarda en la base; las etiquetas pueden cambiar. */
export const MOTIVO = Object.freeze({
  FALTA: 'falta',
  FALTA_CON_AVISO: 'falta_con_aviso',
  ENFERMEDAD: 'enfermedad',
  PERMISO: 'permiso',
  LICENCIA_ESPECIAL: 'licencia_especial',
  ACCIDENTE: 'accidente',
  ACCIDENTE_IN_ITINERE: 'accidente_in_itinere',
  VACACIONES: 'vacaciones',
  SUSPENSION: 'suspension',
  FRANCO: 'franco',
  LLUVIA: 'lluvia',
  SIN_TAREA: 'sin_tarea',
  PARO: 'paro',
  LLEGO_TARDE: 'llego_tarde',
  SE_RETIRO_ANTES: 'se_retiro_antes',
  OTRO: 'otro',
})

/** Contexto en el que un motivo tiene sentido. */
export const AMBITO = Object.freeze({
  AUSENCIA: 'ausencia', // no vino: 0 horas
  PARCIAL: 'parcial', // vino, pero hizo menos que la jornada
})

/**
 * El catálogo. Campos del contrato congelado (`clave`, `etiqueta`, `requiere_aclaracion`,
 * `implica_horas_cero`, `orden`) más cuatro que necesita la auditoría y que no se pueden
 * derivar del resto:
 *
 *  - `ambitos`: en qué contexto se ofrece. Un "llegó tarde" con 0 horas no es tarde, es falta.
 *  - `falta_injustificada`: sólo las dos formas de faltar lo son —con aviso y sin aviso—.
 *    Franco, vacaciones y suspensión también dan 0 horas y NO son faltas: contarlas juntas
 *    inflaría el ausentismo y castigaría a alguien por estar de licencia. Enfermedad,
 *    accidente, licencia especial, lluvia, obra parada y paro tampoco: cada una tiene su
 *    propio tratamiento y ninguna es responsabilidad de la persona.
 *  - `art`: el accidente —de obra o in itinere— dispara denuncia a la ART y plazos que no
 *    dependen de esta planilla. Queda marcado para poder aislarlo sin buscar por texto.
 *  - `paraliza_obra`: la obra no produjo, y no porque faltara la persona: estaba, y no hubo
 *    trabajo. Separa la lectura de RECURSOS HUMANOS (¿quién falta?) de la de PRODUCCIÓN
 *    (¿cuántos días perdimos y por culpa de quién?). Mezcladas, el ausentismo miente hacia
 *    arriba y el desvío de plazo queda sin causa.
 *
 * `orden` es el orden de presentación en pantalla, elegido para que las dos listas que
 * devuelve `motivosPara` se lean naturales: en una ausencia arranca por "faltó", en una
 * jornada parcial por "llegó tarde", y en las dos las causas de obra parada quedan juntas y
 * arriba, porque un día de lluvia se carga cuarenta veces seguidas.
 */
export const CATALOGO = Object.freeze([
  {
    clave: MOTIVO.FALTA,
    etiqueta: 'Faltó sin avisar',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 1,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: true,
    art: false,
    paraliza_obra: false,
  },
  {
    // Avisar no justifica la falta: sigue siendo injustificada. Lo que cambia es lo que el
    // jefe pudo hacer esa mañana —mover gente, reprogramar— y eso es lo que hay que poder
    // separar después para saber si la planificación del día reacciona o no.
    clave: MOTIVO.FALTA_CON_AVISO,
    etiqueta: 'Faltó con aviso',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 2,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: true,
    art: false,
    paraliza_obra: false,
  },
  {
    clave: MOTIVO.LLEGO_TARDE,
    etiqueta: 'Llegó tarde',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 3,
    ambitos: [AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    clave: MOTIVO.SE_RETIRO_ANTES,
    etiqueta: 'Se retiró antes',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 4,
    ambitos: [AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    // Puede parar el día entero o a media mañana: por eso NO implica 0. El jornal se paga —el
    // trabajador se presentó— y el día perdido es insumo de ampliación de plazo.
    clave: MOTIVO.LLUVIA,
    etiqueta: 'Lluvia · obra parada',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 5,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: true,
  },
  {
    // La diferencia con la lluvia es de quién es la culpa: acá es nuestra. Cada hora es una
    // falla de compras o de planificación que se está pagando en efectivo.
    clave: MOTIVO.SIN_TAREA,
    etiqueta: 'Obra parada · sin material o sin frente',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 6,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: true,
  },
  {
    clave: MOTIVO.PARO,
    etiqueta: 'Paro gremial',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 7,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: true,
  },
  {
    // Puede ser el día entero o media jornada (se descompuso y se fue): por eso NO implica 0.
    clave: MOTIVO.ENFERMEDAD,
    etiqueta: 'Enfermedad',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 8,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    // Aclaración OBLIGATORIA: un accidente sin una línea de qué pasó no sirve para la
    // denuncia a la ART, y esa línea se escribe el mismo día o no se escribe nunca.
    clave: MOTIVO.ACCIDENTE,
    etiqueta: 'Accidente de trabajo (en obra)',
    requiere_aclaracion: true,
    implica_horas_cero: false,
    orden: 9,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: true,
    paraliza_obra: false,
  },
  {
    // Cubierto por la ART igual que el de obra, pero NO ocurrió en el obrador: no entra en el
    // índice de siniestralidad de la obra ni dispara la misma investigación interna.
    clave: MOTIVO.ACCIDENTE_IN_ITINERE,
    etiqueta: 'Accidente in itinere (yendo o volviendo)',
    requiere_aclaracion: true,
    implica_horas_cero: false,
    orden: 10,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: true,
    paraliza_obra: false,
  },
  {
    clave: MOTIVO.PERMISO,
    etiqueta: 'Permiso',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 11,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    // Fallecimiento, matrimonio, nacimiento, examen (LCT art. 158). NO es un permiso que la
    // empresa concede: es un derecho que no puede negar, es paga y tiene plazos tasados. La
    // aclaración es obligatoria porque de CUÁL sea depende cuántos días corresponden.
    clave: MOTIVO.LICENCIA_ESPECIAL,
    etiqueta: 'Licencia especial (fallecimiento, matrimonio, examen…)',
    requiere_aclaracion: true,
    implica_horas_cero: true,
    orden: 12,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    clave: MOTIVO.VACACIONES,
    etiqueta: 'Vacaciones',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 13,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    clave: MOTIVO.SUSPENSION,
    etiqueta: 'Suspensión',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 14,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    // "Día no laborable" salió de la etiqueta a propósito: desde el calendario completo esa es
    // otra figura —turísticos, Jueves Santo, día del gremio— donde la obra SÍ trabaja.
    clave: MOTIVO.FRANCO,
    etiqueta: 'Franco / feriado',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 15,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
  {
    clave: MOTIVO.OTRO,
    etiqueta: 'Otro',
    requiere_aclaracion: true,
    implica_horas_cero: false,
    orden: 16,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
    paraliza_obra: false,
  },
].map(Object.freeze))

const POR_CLAVE = new Map(CATALOGO.map((m) => [m.clave, m]))

/** Ficha del motivo, o `null` si la clave no existe. Nunca elige un motivo "parecido". */
export function motivoDe(clave) {
  return POR_CLAVE.get(String(clave ?? '').trim().toLowerCase()) ?? null
}

const texto = (v) => String(v ?? '').trim()
const vacio = (v) => texto(v) === ''

/**
 * Qué ámbito corresponde a esta marca. `null` = no corresponde ningún motivo.
 *
 * Sin jornada conocida (sábado, o día sin calibración ni configuración) NO se puede saber si
 * una jornada es parcial: se ofrecen los motivos parciales, pero `validarNovedad` no los
 * exige. Inventar una jornada para poder exigir un motivo sería fabricar el dato que falta.
 */
function ambitoDe({ presente, horas, jornada }) {
  const j = Number.isFinite(jornada) ? Number(jornada) : null
  const h = Number.isFinite(horas) ? Number(horas) : null
  if (presente === false) return AMBITO.AUSENCIA
  if (h != null && h === 0) return AMBITO.AUSENCIA // "presente" con 0 horas es una ausencia
  if (j == null) return AMBITO.PARCIAL // no se puede comparar: se ofrece, no se exige
  if (h == null) return AMBITO.PARCIAL
  if (h > j) return null // horas extra: las calcula el núcleo, nunca se pide motivo
  if (h === j) return null // jornada completa: no hay novedad que explicar
  return AMBITO.PARCIAL
}

/**
 * Motivos aplicables a una marca concreta, ya ordenados para mostrar.
 *
 * Devuelve `[]` cuando no corresponde ningún motivo: jornada completa, u horas por encima de
 * la jornada (eso son horas extra, no una novedad).
 */
export function motivosPara({ presente, horas, jornada } = {}) {
  const ambito = ambitoDe({ presente, horas, jornada })
  if (!ambito) return []
  return CATALOGO.filter((m) => m.ambitos.includes(ambito)).sort((a, b) => a.orden - b.orden)
}

/**
 * ¿El motivo es OBLIGATORIO en esta marca? Distinto de "¿corresponde ofrecerlo?".
 *
 * Sin jornada conocida no se exige: no hay contra qué comparar, y exigir una explicación
 * por una diferencia que el sistema no puede demostrar es pedirle al jefe que justifique
 * un número inventado. Se ofrece igual, por si la novedad existió.
 */
export function exigeMotivo({ presente, horas, jornada } = {}) {
  if (presente === false) return true
  const j = Number.isFinite(jornada) ? Number(jornada) : null
  const h = Number.isFinite(horas) ? Number(horas) : null
  if (j == null || h == null) return false
  return h < j
}

/** Si se exige un motivo, mostrar cuáles se aceptan: un "motivo inválido" a secas no ayuda. */
function listaDe(ambito) {
  return CATALOGO.filter((m) => m.ambitos.includes(ambito))
    .sort((a, b) => a.orden - b.orden)
    .map((m) => m.etiqueta)
    .join(', ')
}

/** Horas normalizadas, o el mensaje de por qué no se pueden usar. */
function leerHoras(entrada) {
  const r = normalizarHoras(entrada, { permitirVacio: false })
  if (r.ok) return { ok: true, horas: r.horas }
  const MENSAJES = {
    vacio: 'Faltan las horas.',
    no_numerico: 'Las horas tienen que ser un número (por ejemplo 9 u 8,5).',
    negativo: 'Las horas no pueden ser negativas.',
    mayor_al_maximo: `Las horas no pueden superar ${r.max} en un día.`,
  }
  return { ok: false, error: MENSAJES[r.motivo] ?? 'No entendí las horas.' }
}

/** Coherencia entre presente/horas antes de mirar el motivo. */
function validarMarca({ presente, horas }) {
  if (presente !== true && presente !== false) {
    return 'Falta indicar si el trabajador estuvo o no.'
  }
  if (presente === false && horas > 0) {
    return 'Si no estuvo, las horas tienen que ser 0.'
  }
  if (presente === true && horas === 0) {
    return 'Si no trabajó ninguna hora, marcalo como ausente en vez de presente.'
  }
  return null
}

/** Reglas del motivo elegido contra el ámbito de la marca. */
function validarMotivo({ ficha, ambito, horas, aclaracion }) {
  if (!ficha.ambitos.includes(ambito)) {
    return ambito === AMBITO.AUSENCIA
      ? `«${ficha.etiqueta}» no corresponde para alguien que no vino. Elegí uno de: ${listaDe(AMBITO.AUSENCIA)}.`
      : `«${ficha.etiqueta}» corresponde a un día completo, no a una jornada parcial. Elegí uno de: ${listaDe(AMBITO.PARCIAL)}.`
  }
  if (ficha.implica_horas_cero && horas !== 0) {
    return `Con «${ficha.etiqueta}» las horas del día tienen que ser 0.`
  }
  if (ficha.requiere_aclaracion && vacio(aclaracion)) {
    return ficha.clave === MOTIVO.ACCIDENTE
      ? 'Contá en una línea qué pasó: el accidente hay que denunciarlo a la ART.'
      : `Con «${ficha.etiqueta}» hace falta una aclaración.`
  }
  return null
}

/**
 * Valida una novedad completa y devuelve el registro normalizado listo para guardar.
 *
 * Reglas (todas del contrato, más las de coherencia que la operación exige):
 *   - no vino                     → 0 horas y motivo OBLIGATORIO
 *   - vino e hizo menos           → motivo OBLIGATORIO
 *   - vino e hizo la jornada       → motivo VACÍO
 *   - vino e hizo de más           → motivo VACÍO: son horas extra, las calcula el núcleo
 *   - motivo «otro»                → aclaración obligatoria
 *   - accidente y licencia especial→ aclaración obligatoria
 *   - franco / vacaciones / susp.  → 0 horas, y NO cuentan como falta injustificada
 *   - lluvia / sin tarea / paro    → la obra no produjo con la gente presente: no es ausentismo
 *
 * NO MIRA LA FECHA. Cargar un día de la semana pasada valida exactamente igual que cargar hoy:
 * la edición histórica es un caso normal (el jefe carga el lunes lo que pasó el viernes) y la
 * ventana de fechas permitida es una decisión de la pantalla, no de las reglas del motivo.
 *
 * Nunca lanza. Devuelve `{ok:true, novedad}` o `{ok:false, error}` con un mensaje que se le
 * puede mostrar tal cual al jefe de obra.
 *
 * @param {{presente:boolean, horas:any, jornada:number|null, motivo?:string,
 *          aclaracion?:string, obra_realizada?:string}} entrada
 */
export function validarNovedad(entrada = {}) {
  const { presente, jornada = null, motivo, aclaracion, obra_realizada } = entrada
  const h = leerHoras(entrada.horas)
  if (!h.ok) return { ok: false, error: h.error }
  const horas = h.horas

  const problema = validarMarca({ presente, horas })
  if (problema) return { ok: false, error: problema }

  const j = Number.isFinite(jornada) ? Number(jornada) : null
  const ambito = ambitoDe({ presente, horas, jornada: j })
  const clave = texto(motivo).toLowerCase()

  if (!ambito) {
    if (clave) {
      return {
        ok: false,
        error: j != null && horas > j
          ? 'Trabajó más que la jornada: eso son horas extra, no una novedad. No pongas motivo.'
          : 'Hizo la jornada completa: no hace falta motivo.',
      }
    }
    return { ok: true, novedad: armar({ presente, horas, jornada: j, ficha: null, aclaracion, obra_realizada }) }
  }

  if (!clave) {
    if (!exigeMotivo({ presente, horas, jornada: j })) {
      return { ok: true, novedad: armar({ presente, horas, jornada: j, ficha: null, aclaracion, obra_realizada }) }
    }
    return {
      ok: false,
      error: ambito === AMBITO.AUSENCIA
        ? `Falta el motivo de la ausencia. Elegí uno de: ${listaDe(AMBITO.AUSENCIA)}.`
        : `Hizo menos que la jornada: falta el motivo. Elegí uno de: ${listaDe(AMBITO.PARCIAL)}.`,
    }
  }

  const ficha = motivoDe(clave)
  if (!ficha) return { ok: false, error: `No conozco el motivo «${texto(motivo)}».` }

  const malMotivo = validarMotivo({ ficha, ambito, horas, aclaracion })
  if (malMotivo) return { ok: false, error: malMotivo }

  if (horas === 0 && !vacio(obra_realizada)) {
    return { ok: false, error: 'Si no trabajó, no corresponde indicar en qué obra estuvo.' }
  }

  return { ok: true, novedad: armar({ presente, horas, jornada: j, ficha, aclaracion, obra_realizada }) }
}

/** Registro normalizado. Lo que se guarda: claves estables, textos recortados, sin `undefined`. */
function armar({ presente, horas, jornada, ficha, aclaracion, obra_realizada }) {
  return {
    presente,
    horas,
    jornada,
    motivo: ficha?.clave ?? null,
    etiqueta: ficha?.etiqueta ?? null,
    aclaracion: vacio(aclaracion) ? null : texto(aclaracion).slice(0, 500),
    obra_realizada: vacio(obra_realizada) ? null : texto(obra_realizada).slice(0, 200),
    falta_injustificada: ficha?.falta_injustificada ?? false,
    art: ficha?.art ?? false,
    paraliza_obra: ficha?.paraliza_obra ?? false,
  }
}
