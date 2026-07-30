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
// DÓNDE VIVE EL DATO. El motivo y la aclaración se guardan en Postgres
// (`comunicacion.asistencia_novedades`), NO en la planilla: la celda de JORNALES sigue
// recibiendo sólo horas. Escribir texto ahí rompería las fórmulas de suma de la quincena y
// el camino de escritura ya validado. Ver la migración 20260731090000 para el detalle.
//
// NADA DE ESTO TOCA red, base ni fecha del sistema: es puro. Los dos flujos (pantalla web y
// conversación en Mattermost) llaman a estas mismas funciones — la regla se escribe una vez.

import { normalizarHoras } from './horas-extra.mjs'

/** Claves estables del motivo. Es lo que se guarda en la base; las etiquetas pueden cambiar. */
export const MOTIVO = Object.freeze({
  FALTA: 'falta',
  ENFERMEDAD: 'enfermedad',
  PERMISO: 'permiso',
  ACCIDENTE: 'accidente',
  VACACIONES: 'vacaciones',
  SUSPENSION: 'suspension',
  FRANCO: 'franco',
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
 * `implica_horas_cero`, `orden`) más tres que necesita la auditoría y que no se pueden
 * derivar del resto:
 *
 *  - `ambitos`: en qué contexto se ofrece. Un "llegó tarde" con 0 horas no es tarde, es falta.
 *  - `falta_injustificada`: SÓLO `falta` lo es. Franco, vacaciones y suspensión también dan
 *    0 horas y NO son faltas: contarlas juntas inflaría el ausentismo y castigaría a alguien
 *    por estar de licencia. Enfermedad y accidente tampoco (tienen su propio tratamiento).
 *  - `art`: el accidente de trabajo dispara denuncia a la ART y plazos que no dependen de
 *    esta planilla. Queda marcado para poder aislarlo en la auditoría sin buscar por texto.
 *
 * `orden` es el orden de presentación en pantalla, elegido para que las dos listas que
 * devuelve `motivosPara` se lean naturales: en una ausencia arranca por "faltó", en una
 * jornada parcial por "llegó tarde".
 */
export const CATALOGO = Object.freeze([
  {
    clave: MOTIVO.FALTA,
    etiqueta: 'Faltó',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 1,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: true,
    art: false,
  },
  {
    clave: MOTIVO.LLEGO_TARDE,
    etiqueta: 'Llegó tarde',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 2,
    ambitos: [AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
  },
  {
    clave: MOTIVO.SE_RETIRO_ANTES,
    etiqueta: 'Se retiró antes',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 3,
    ambitos: [AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
  },
  {
    // Puede ser el día entero o media jornada (se descompuso y se fue): por eso NO implica 0.
    clave: MOTIVO.ENFERMEDAD,
    etiqueta: 'Enfermedad',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 4,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
  },
  {
    // Aclaración OBLIGATORIA: un accidente sin una línea de qué pasó no sirve para la
    // denuncia a la ART, y esa línea se escribe el mismo día o no se escribe nunca.
    clave: MOTIVO.ACCIDENTE,
    etiqueta: 'Accidente de trabajo',
    requiere_aclaracion: true,
    implica_horas_cero: false,
    orden: 5,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: true,
  },
  {
    clave: MOTIVO.PERMISO,
    etiqueta: 'Permiso',
    requiere_aclaracion: false,
    implica_horas_cero: false,
    orden: 6,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
  },
  {
    clave: MOTIVO.VACACIONES,
    etiqueta: 'Vacaciones',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 7,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: false,
    art: false,
  },
  {
    clave: MOTIVO.SUSPENSION,
    etiqueta: 'Suspensión',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 8,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: false,
    art: false,
  },
  {
    clave: MOTIVO.FRANCO,
    etiqueta: 'Franco / día no laborable',
    requiere_aclaracion: false,
    implica_horas_cero: true,
    orden: 9,
    ambitos: [AMBITO.AUSENCIA],
    falta_injustificada: false,
    art: false,
  },
  {
    clave: MOTIVO.OTRO,
    etiqueta: 'Otro',
    requiere_aclaracion: true,
    implica_horas_cero: false,
    orden: 10,
    ambitos: [AMBITO.AUSENCIA, AMBITO.PARCIAL],
    falta_injustificada: false,
    art: false,
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
 *   - franco / vacaciones / susp.  → 0 horas, y NO cuentan como falta injustificada
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
  }
}
