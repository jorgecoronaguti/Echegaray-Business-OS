// EL ALCANCE — qué entra, qué no entra, y qué todavía no se decidió (§5).
//
// ═══ EL LÍMITE QUE ESTE ARCHIVO CIERRA ═══
//
// El cruce EXCLUSIÓN ↔ CÓMPUTO estaba declarado como límite abierto: el sistema podía tener una
// exclusión escrita («pintura no se incluye») y al mismo tiempo una partida de pintura computada y
// cotizada. Las dos cosas convivían sin que nadie las comparara, y el que revisa la oferta ve un
// precio con pintura adentro debajo de una nota que dice que la pintura no va.
//
// Y hay un caso REAL en este repo: el contrato de Quattropani excluye el entrepiso y la escalera, y
// se computaron igual porque nadie leyó el contrato antes de computar. Ese es el defecto, con
// nombre y apellido.
//
// ═══ QUÉ HACE UNA EXCLUSIÓN ═══
//
// **Bloquea partidas.** No las borra —borrar esconde el trabajo de haberlas computado y hace
// imposible reactivarlas si el alcance cambia— y no las ignora. Las marca `EXCLUIDO`, las saca del
// total, y deja el cómputo intacto con su evidencia. Si el cliente después dice «la pintura sí va»,
// la partida vuelve entera, con su cantidad y su origen.
//
// ═══ POR QUÉ TODA ENTRADA DE ALCANCE EXIGE PROVENANCE ═══
//
// Una exclusión mueve plata. «Sacá pintura» dicho en una reunión y «el pliego art. 4.2 excluye las
// terminaciones» valen distinto delante de un cliente que reclama, y la diferencia es exactamente
// de dónde salió. Sin `fuente` no se construye.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue } from './contrato.mjs'

/** Los tres estados de una partida frente al alcance. `POR_DEFINIR` es el default y no es una
 *  omisión: es la respuesta honesta antes de que alguien lea el pliego. */
export const ALCANCE = Object.freeze({
  INCLUIDO: 'INCLUIDO',
  EXCLUIDO: 'EXCLUIDO',
  POR_DEFINIR: 'POR_DEFINIR',
})

/**
 * UNA ENTRADA DE ALCANCE. PURA, congelada.
 *
 * `patron` es lo que identifica QUÉ está incluido o excluido, y se compara contra el nombre de la
 * partida, su código y su rubro. Es texto y no un id porque el alcance se declara ANTES de que
 * existan las partidas: el pliego dice «no incluye pintura» sin saber qué código le va a tocar.
 */
export function entradaDeAlcance({ patron, estado = ALCANCE.POR_DEFINIR, fuente, textoLiteral = null, decididoPor = null, motivo = null } = {}) {
  if (!patron) throw new Error('una entrada de alcance sin patrón no se puede cruzar contra ninguna partida')
  if (!Object.values(ALCANCE).includes(estado)) throw new Error(`estado de alcance desconocido: ${estado}`)
  if (!fuente) throw new Error(`«${patron}» se declaró ${estado} sin decir de dónde sale. Una exclusión mueve plata: sin fuente no se construye`)
  return Object.freeze({
    patron: String(patron), estado, fuente: String(fuente),
    textoLiteral: textoLiteral ? String(textoLiteral).slice(0, 300) : null,
    decididoPor, motivo,
  })
}

const normal = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * ¿ESTA ENTRADA DE ALCANCE HABLA DE ESTA PARTIDA? PURA.
 *
 * El patrón se busca como subcadena en nombre, código y rubro normalizados. Es deliberadamente
 * GRUESO: preferimos que una exclusión toque de más y aparezca la pregunta, a que toque de menos y
 * el precio salga con lo que el cliente sacó. Un falso positivo se resuelve mirando; un falso
 * negativo se resuelve pagando.
 */
export function alcanza(entrada, partida) {
  const p = normal(entrada.patron)
  if (!p) return false
  return [partida?.descripcion, partida?.nombre, partida?.codigo, partida?.rubro]
    .filter(Boolean).some((c) => normal(c).includes(p))
}

/**
 * EL CRUCE EXCLUSIÓN ↔ CÓMPUTO. PURA. Es lo que este archivo existe para hacer.
 *
 * Devuelve, por partida, su estado de alcance y la entrada que lo decidió. Y devuelve los
 * CONFLICTOS: una partida alcanzada por dos entradas que dicen cosas opuestas no se resuelve por
 * orden de llegada ni por la última que ganó — sale `CONFLICTO` con las dos a la vista, que es la
 * misma regla que `plano/proyecto.mjs` aplica a los hechos documentales («elegir una en silencio es
 * inventar el resultado de una discusión que todavía no ocurrió»).
 */
export function cruzarAlcance({ partidas = [], alcance = [], porDefecto = null } = {}) {
  // ═══ EL DEFAULT NO ES UN DEFAULT: ES UNA DECLARACIÓN CON FUENTE ═══
  //
  // Sobre el presupuesto REAL de Quattropani, sus 26 partidas quedaban POR_DEFINIR —el contrato
  // dice qué NO va, no enumera qué sí— y el motor no costeaba ninguna. La lectura correcta es que
  // una partida CARGADA en el presupuesto está incluida por acto propio de la empresa, pero eso es
  // una afirmación y §5 exige provenance: por eso `porDefecto` lleva `fuente` obligatoria y no hay
  // ningún valor implícito. Sin él, POR_DEFINIR sigue siendo la respuesta.
  if (porDefecto && !porDefecto.fuente) {
    throw new Error('el alcance por defecto exige fuente: decir que todo está incluido es una afirmación, no una ausencia de decisión')
  }
  const resueltas = []
  const issues = []
  const conflictos = []

  for (const partida of partidas) {
    const tocan = alcance.filter((e) => alcanza(e, partida))
    const estados = [...new Set(tocan.map((e) => e.estado))]

    if (estados.length > 1) {
      const detalle = tocan.map((e) => `«${e.patron}» → ${e.estado} (${e.fuente})`).join(' vs ')
      conflictos.push({ partida: partida.codigo ?? partida.id, entradas: tocan, porQue: detalle })
      resueltas.push({ ...partida, alcance: ALCANCE.POR_DEFINIR, estadoAlcance: ESTADO.CONFLICTO, porAlcance: tocan, cuentaEnElTotal: false })
      issues.push(issue({
        type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.BLOQUEANTE,
        entity: String(partida.codigo ?? partida.id), impact: partida.subtotal ?? null,
        detalle: `el alcance dice dos cosas distintas sobre esta partida: ${detalle}`,
        recommended_action: 'include_scope',
      }))
      continue
    }

    const estado = estados[0] ?? (porDefecto ? porDefecto.estado : ALCANCE.POR_DEFINIR)
    const porDefault = !estados.length && Boolean(porDefecto)
    const excluida = estado === ALCANCE.EXCLUIDO
    resueltas.push({
      ...partida, alcance: estado,
      estadoAlcance: excluida ? ESTADO.CONFIRMADO : (estado === ALCANCE.INCLUIDO ? ESTADO.CONFIRMADO : ESTADO.FALTA_DATO),
      porAlcance: porDefault ? [{ patron: '(por defecto)', estado, fuente: porDefecto.fuente, motivo: porDefecto.motivo ?? null }] : tocan,
      // ═══ LA EXCLUSIÓN NO BORRA: SACA DEL TOTAL ═══
      // El cómputo queda entero, con su evidencia. Si el cliente cambia de idea, la partida vuelve
      // completa en vez de volver a computarse.
      cuentaEnElTotal: !excluida,
    })

    if (excluida && partida.subtotal !== null && partida.subtotal !== undefined) {
      // Ésta es la señal que faltaba: hay una exclusión Y hay un cómputo valorizado. No es un error
      // —computar y después excluir es lo normal— pero tiene que quedar DICHO, porque la plata que
      // sale del total es exactamente esa.
      issues.push(issue({
        type: TIPO_ISSUE.EXCLUSION_CON_COMPUTO, severity: SEVERIDAD.MEDIA,
        entity: String(partida.codigo ?? partida.id), impact: partida.subtotal,
        evidence: { fuente: tocan[0].fuente, textoLiteral: tocan[0].textoLiteral },
        detalle: `«${partida.descripcion ?? partida.codigo}» está computada y valorizada, y el alcance la EXCLUYE por «${tocan[0].patron}» (${tocan[0].fuente}): sale del total y el cómputo se conserva`,
        recommended_action: 'include_scope',
      }))
    }
    if (estado === ALCANCE.POR_DEFINIR) {
      issues.push(issue({
        type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.MEDIA,
        entity: String(partida.codigo ?? partida.id), impact: partida.subtotal ?? null,
        detalle: `nadie declaró si «${partida.descripcion ?? partida.codigo}» entra o no en el alcance`,
        recommended_action: 'include_scope',
      }))
    }
  }

  return {
    partidas: resueltas,
    incluidas: resueltas.filter((p) => p.alcance === ALCANCE.INCLUIDO).length,
    excluidas: resueltas.filter((p) => p.alcance === ALCANCE.EXCLUIDO).length,
    porDefinir: resueltas.filter((p) => p.alcance === ALCANCE.POR_DEFINIR).length,
    conflictos,
    issues,
    /** La plata que sale del total por exclusión. Se publica porque es el número que el cliente va
     *  a preguntar cuando compare esta oferta con otra que sí la incluía. */
    excluidoEnPlata: resueltas
      .filter((p) => p.alcance === ALCANCE.EXCLUIDO && Number.isFinite(Number(p.subtotal)))
      .reduce((a, p) => a + Number(p.subtotal), 0),
  }
}

/**
 * LAS PARTIDAS QUE ENTRAN AL COSTO. PURA.
 *
 * Sólo `INCLUIDO`. `POR_DEFINIR` NO entra: si nadie dijo que va, cotizarla es decidir por el cliente
 * — y si al final va, aparece como diferencia contra la oferta, que es peor que preguntarlo antes.
 * Es la misma lógica que hace que un empate de partida salga AMBIGUO en vez de elegir la primera.
 */
export const paraCostear = (resueltas = []) => resueltas.filter((p) => p.alcance === ALCANCE.INCLUIDO)
