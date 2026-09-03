// COTIZAR UN PLANO ES UN TRABAJO ASÍNCRONO — la web ya no espera la corrida en la misma conexión.
//
// El pipeline llama al modelo DOS veces por lámina (interpretar + medir): minutos, no segundos.
// `POST /api/xsas` tenía un techo de 55s que ninguna lectura real podía respetar. Esta tarea
// (`type='cotizacion.plano'`, encolada por `public.cotizacion_encolar_lectura`) es lo que el
// worker 24×7 corre en su lugar: busca los adjuntos que la web dejó en `orq.xsas_adjunto`, corre
// el MISMO pipeline que ya cotiza (`lib/plano/pipeline.mjs`) y publica el progreso en
// `public.cotizacion_lectura` a medida que avanza — la pantalla LEE esa fila, no espera una
// respuesta.
//
// ═══ EL TRABAJO SE MIDE, SE VE AVANZAR, SE CANCELA Y NO QUEDA COLGADO ═══
//
// Las cuatro cosas que hacen falta para operarlo sin una sesión de Claude Code abierta:
//
//  · MEDIR — `correr()` devuelve `ia` (llamadas, tokens, usd y ms por llamada, cuántas salieron del
//    caché) y `metricas`, y acá se guardan en la columna `medicion`. Sin eso no hay contra qué
//    comparar ninguna mejora de velocidad o de costo. Se guarda también cuando la corrida termina
//    en ERROR o CANCELADO: la corrida que falló a los cuatro minutos es la que hay que mirar.
//
//  · VER AVANZAR — `onProgreso` escribe «leyendo lámina 2 de 5» por cada unidad TERMINADA (~20 por
//    corrida, no un tick por segundo). Antes, la etapa «leyendo N documento(s)» cubría la corrida
//    entera: un texto congelado durante minutos es indistinguible de un sistema colgado.
//
//  · CANCELAR — `cancelado` consulta el estado de la fila entre unidades. Subir el legajo
//    equivocado costaba minutos y todas las llamadas de visión que se pagaran mientras tanto.
//
//  · NO QUEDAR COLGADO — un latido de 60 s prueba que el proceso sigue vivo. Si el worker muere, la
//    fila deja de latir y `public.cotizacion_lectura_vencer()` la cierra como ERROR a los 10
//    minutos. El latido NO depende de `onProgreso`: si el pipeline todavía no lo llama, la fila late
//    igual y un trabajo vivo no vence nunca.
//
// `onProgreso`, `cancelado` y `topeUsd` son parámetros OPCIONALES de `correr()`: mientras el
// pipeline no los lea, la corrida se comporta como antes y esta capa sigue siendo correcta —
// simplemente no hay progreso fino ni corte anticipado. Lo que sí funciona desde el primer día es
// la medición, el latido, el vencimiento y que cancelar libere la pantalla.
//
// ═══ POR QUÉ NO SE RELANZA EL ERROR (mismo criterio que operation_execute.mjs) ═══
//
// Un fallo del pipeline casi nunca es transitorio, y cada reintento del worker paga de nuevo las
// llamadas de visión. Se marca la fila en ERROR con el motivo y se corta ahí — igual que
// `operation_execute` no relanza tras marcar `failed`.
import { query as queryDb } from '../lib/db.mjs'
import { correr as correrPipeline } from '../lib/plano/pipeline.mjs'
import { bytesPorHash } from '../lib/xsas-archivos.mjs'
import { razonar } from '../lib/plano/razonamiento.mjs'
import { vistaDePasos, certezaDeLectura, pasoDeItem, ESQUELETO } from '../lib/plano/pasos-vista.mjs'
import { agruparPartidas, armar, persistir, cascadaDe } from '../lib/plano/cotizacion-v0.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'

const redondear2 = (n) => Math.round(Number(n) * 100) / 100
const jsonb = (v) => (v === null || v === undefined ? null : JSON.stringify(v))

/** Cada cuánto el handler prueba que sigue vivo. Diez de éstos perdidos seguidos es lo que la
 *  migración considera un trabajo muerto (10 minutos) — el umbral vive en SQL, no acá. */
export const MS_LATIDO = 60_000

/** UPDATE parametrizado sobre columnas conocidas — nunca sobre nombres que vengan de afuera.
 *  `soloVivo` respeta una cancelación ya escrita: la decisión del dueño de frenar no la pisa un
 *  progreso ni un error que llegó tarde. */
async function actualizar(query, id, campos, { soloVivo = false } = {}) {
  const cols = Object.keys(campos)
  if (!cols.length) return
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
  const freno = soloVivo ? " and estado <> 'CANCELADO'" : ''
  await query(`update public.cotizacion_lectura set ${sets}, actualizado = now() where id = $1${freno}`, [id, ...cols.map((c) => campos[c])])
}

/**
 * EL LATIDO. Un `update` chico y periódico que sólo mueve `actualizado`: es la diferencia entre
 * «este trabajo tarda» y «este trabajo se murió», y sin él el vencimiento tendría que elegir entre
 * matar corridas vivas o no destrabar nada. No falla ruidoso —si Postgres no contesta, el trabajo
 * real puede seguir— y se apaga siempre en el `finally` del handler.
 */
export function latir(query, id, ms = MS_LATIDO) {
  const t = setInterval(() => {
    Promise.resolve(query("update public.cotizacion_lectura set actualizado = now() where id = $1 and estado = 'LEYENDO'", [id])).catch(() => {})
  }, ms)
  if (typeof t.unref === 'function') t.unref()
  return () => clearInterval(t)
}

const UNIDAD = { laminas: 'lámina', vistas: 'vista' }
const VERBO = { laminas: 'leyendo', vistas: 'midiendo' }

/**
 * EL TEXTO QUE VE EL DUEÑO MIENTRAS ESPERA. Corto, en castellano y con la cuenta real: «leyendo
 * lámina 2 de 5». Sin total no se inventa uno («leyendo lámina 3»), y una fase que este handler no
 * conoce no rompe la pantalla — se describe genérica en vez de mentir el nombre de la unidad.
 */
export function etapaDeProgreso({ fase, hecho, total, que } = {}) {
  const n = Number(hecho)
  const t = Number(total)
  const cuenta = Number.isFinite(t) && t > 0 ? `${Number.isFinite(n) ? n : 0} de ${t}` : `${Number.isFinite(n) ? n : 0}`
  const unidad = UNIDAD[fase]
  const cabeza = unidad ? `${VERBO[fase]} ${unidad} ${cuenta}` : `procesando ${cuenta}`
  const detalle = typeof que === 'string' && que.trim() ? ` · ${que.trim().slice(0, 60)}` : ''
  return `${cabeza}${detalle}`
}

/**
 * LO QUE COSTÓ LA CORRIDA, en una forma que se consulta con SQL: `medicion->'ia'->>'usd'`,
 * `->>'ms'`, `->'ia'->>'llamadas'`, `->'ia'->>'deCache'`. Los totales se derivan de `usos` —la
 * lista real de llamadas al modelo—, nunca se declaran a mano.
 *
 * REGLA DE ORO 1: sin llamadas no hay costo CONOCIDO, y eso es `null`, no `0`. Una corrida que
 * murió antes de llamar al modelo y una que salió entera del caché no pueden verse iguales.
 */
export function resumirMedicion({ ia = null, metricas = null, ms = null, cancelada = false, progreso = null } = {}) {
  const usos = Array.isArray(ia?.usos) ? ia.usos : []
  const suma = (campo) => usos.reduce((a, u) => a + (Number(u?.[campo]) || 0), 0)
  const hubo = usos.length > 0
  return {
    ms: Number.isFinite(ms) ? Math.round(ms) : null,
    cancelada: cancelada === true,
    ia: {
      llamadas: Number.isFinite(ia?.llamadas) ? ia.llamadas : (hubo ? usos.length : null),
      deCache: Number.isFinite(ia?.deCache) ? ia.deCache : null,
      usd: hubo ? Math.round(suma('usd') * 1e6) / 1e6 : null,
      tokensIn: hubo ? suma('tokensIn') : null,
      tokensOut: hubo ? suma('tokensOut') : null,
      msIa: hubo ? Math.round(suma('ms')) : null,
      usos,
    },
    metricas: metricas ?? null,
    progreso,
  }
}

/**
 * EL TOPE DE GASTO POR CORRIDA, en dólares, desde el entorno del worker (`COTIZACION_TOPE_USD`).
 * Un valor ausente o ilegible es SIN TOPE declarado, nunca un tope de 0 —que abortaría toda
 * corrida— ni un número inventado: un límite de plata que nadie escribió no se fabrica acá.
 */
export function topeUsdDeEntorno(env = {}) {
  const crudo = env?.COTIZACION_TOPE_USD
  if (crudo === undefined || crudo === null || String(crudo).trim() === '') return null
  const n = Number(String(crudo).trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * EL CÓMPUTO AGRUPADO POR PASO. Cada línea de cada partida —con precio o sin él— y cada elemento
 * SIN partida (candidata) caen en el mismo paso que usa `vistaDePasos`: los dos números que ve el
 * dueño (el paso a paso y este cómputo) salen de la MISMA función (`pasoDeItem`) y no pueden
 * divergir. Un elemento sin costo unitario da `p: null, imp: null` — nunca 0.
 */
export function computoPorPaso(cot) {
  const grupos = new Map()
  const grupoDe = (pasoId) => {
    if (!grupos.has(pasoId)) {
      const e = ESQUELETO.find((x) => x.id === pasoId)
      grupos.set(pasoId, { pasoId, rotulo: e?.etiqueta ?? pasoId, titulo: e?.titulo ?? 'Sin paso asignado', items: [] })
    }
    return grupos.get(pasoId)
  }
  for (const partida of cot.partidas ?? []) {
    for (const l of partida.lineas ?? []) {
      const imp = partida.costoUnitario !== null && typeof l.cantidad === 'number' ? redondear2(partida.costoUnitario * l.cantidad) : null
      grupoDe(pasoDeItem({ id: l.elemento, nombre: l.nombre })).items.push({
        d: l.nombre, c: l.cantidad, u: l.unidad, p: partida.costoUnitario, imp, nota: l.criterio ?? null,
      })
    }
  }
  for (const cand of cot.candidatas ?? []) {
    const it = cand.computo ?? {}
    grupoDe(pasoDeItem({ id: it.id, nombre: it.nombre })).items.push({
      d: it.nombre ?? cand.elemento ?? 's/d', c: it.cantidad?.valor ?? null, u: it.unidad ?? null,
      p: null, imp: null, nota: 'sin partida de la Base Maestra que la cubra',
    })
  }
  return {
    grupos: [...grupos.values()].map((g) => ({
      ...g,
      subtotal: g.items.some((i) => i.imp !== null) ? redondear2(g.items.reduce((a, i) => a + (i.imp ?? 0), 0)) : null,
    })),
  }
}

/** Qué documentación se leyó, con qué láminas y qué NO se pudo abrir — de la respuesta real del
 *  pipeline, nunca inferido ni completado a mano. */
export function documentosLeidos(r) {
  const laminaDe = (nombreArchivo) => r.laminas.filter((l) => l.archivo === nombreArchivo).map((l) => l.lamina?.codigo ?? l.archivo)
  return [
    ...r.documentos.planos.legibles.map((d) => ({ nombre: d.name, laminas: laminaDe(d.name), leido: true, porQue: null })),
    ...r.documentos.planos.noLegibles.map((d) => ({ nombre: d.name, laminas: [], leido: false, porQue: d.porQueNoLegible ?? 'no se pudo leer' })),
  ]
}

/** El cliente de Google REAL, para lectura. Con adjuntos (`conDrive: false`) el pipeline no debería
 *  necesitarlo —los bytes ya están en memoria—, pero se construye igual por paridad con
 *  `plano-tool.mjs`: un insumo adicional en el mismo lote (un PDF de pliego, por ejemplo) sí puede
 *  requerirlo. */
async function clienteGoogleReal(ctx) {
  const op = await operadorEmail()
  return op
    ? makeGoogleClient({ config: ctx.config, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
    : makeGoogleClient({ config: ctx.config })
}

/** De la respuesta del pipeline a las columnas que la pantalla lee. Publica su propia etapa antes
 *  de cada tramo: son segundos, no minutos, pero sin ellas el salto del último «midiendo vista N»
 *  al LISTO parece un cuelgue más. */
async function cosechar({ query, r, termino, publicar }) {
  await publicar('razonando el plano: armando los siete pasos')
  const rz = { ...razonar(r), procedencia: { soloAdjuntos: r.soloAdjuntos === true, documentos: r.documentos.planos.legibles.map((d) => d.name) } }
  const pasos = vistaDePasos(rz, { items: r.computo.items })
  const certeza = certezaDeLectura(pasos)

  await publicar('mapeando contra la Base Maestra y armando el cómputo')
  const { partidas, candidatas } = agruparPartidas(r.mapeo.mapeos)
  const cot = armar({
    cliente: r.laminas[0]?.proyecto?.propietario ?? null,
    obraNombre: r.laminas[0]?.proyecto?.nombre ?? termino,
    partidas, composiciones: r.composiciones, candidatas,
  })

  await publicar('guardando la cotización')
  const numero = `COT-XSAS-${termino.toUpperCase().slice(0, 12).replace(/[^A-Z0-9]+/g, '-')}-${Date.now().toString(36).slice(-4)}`
  const { cotizacionId } = await persistir({ query }, cot, {
    numero,
    notas: `generada por XSAS desde ${r.documentos.planos.legibles.map((d) => d.name).join(' + ')} · fuente: SÓLO ADJUNTOS (no se consultó Drive)`,
    razonamiento: rz,
  })
  // La cascada sale de `cotizacion_cascada` — la vista canónica del motor de cotización real. Si la
  // cotización no tiene una política comercial vigente que aplicarle, sale `null`: nunca se fabrica
  // un porcentaje para que la pantalla tenga algo que mostrar.
  const cascada = await cascadaDe({ query }, cotizacionId)
  return { pasos, certeza, computo: computoPorPaso(cot), cascada, documentos: documentosLeidos(r), cotizacionId }
}

const ETAPA_INICIAL = 'buscando los adjuntos que se subieron'

/**
 * EL TABLERO DE UNA CORRIDA: todo lo que se publica sobre ella mientras avanza —la etapa visible,
 * lo que lleva gastado, si el dueño la frenó— con el estado mutable que esas cinco funciones
 * comparten. Vive fuera del handler para que el handler se lea de corrido: el flujo de la lectura
 * es una cosa y la contabilidad de la corrida es otra.
 */
function tableroDeCorrida({ query, lecturaId, ctx, ahora }) {
  const arranque = ahora()
  let medido = { ia: null, metricas: null }
  let progreso = null
  let ultimaEtapa = null

  const medicion = (extra) => jsonb(resumirMedicion({ ...medido, ms: ahora() - arranque, progreso, ...extra }))

  // Una escritura POR UNIDAD TERMINADA, y sólo si el texto cambió: el sondeo de la pantalla es cada
  // 1,5 s y no necesita más resolución que ésa.
  const publicar = async (etapa) => {
    if (etapa === ultimaEtapa) return
    ultimaEtapa = etapa
    await actualizar(query, lecturaId, { etapa }, { soloVivo: true })
  }

  return {
    medicion,
    publicar,
    /** El primer estado que ve la pantalla: ya en LEYENDO, con etapa y sin el error de un intento
     *  anterior. */
    arrancar: async () => {
      await actualizar(query, lecturaId, { estado: 'LEYENDO', etapa: ETAPA_INICIAL, error: null }, { soloVivo: true })
      ultimaEtapa = ETAPA_INICIAL
    },
    /** Un progreso que no se pudo escribir NO puede tirar abajo una corrida que ya pagó sus
     *  llamadas de visión: se avisa por log y el trabajo sigue. Para el vencimiento está el latido. */
    onProgreso: async (p) => {
      progreso = { fase: p?.fase ?? null, hecho: p?.hecho ?? null, total: p?.total ?? null }
      try { await publicar(etapaDeProgreso(p ?? {})) } catch (e) { ctx.logger?.warn?.(`cotizacion.plano: progreso no publicado: ${e?.message ?? e}`) }
    },
    cancelado: async () => {
      const { rows } = await query('select estado from public.cotizacion_lectura where id = $1', [lecturaId])
      return rows[0]?.estado === 'CANCELADO'
    },
    marcarError: async (mensaje) => {
      await actualizar(query, lecturaId, { estado: 'ERROR', etapa: null, error: String(mensaje).slice(0, 2000), medicion: medicion() }, { soloVivo: true })
    },
    /** Lo que el pipeline devolvió sobre su propio consumo. Se registra apenas vuelve, para que un
     *  fallo POSTERIOR (persistir, la cascada) no borre la medición de lo que ya se pagó. */
    registrarConsumo: (r) => { medido = { ia: r?.ia ?? null, metricas: r?.metricas ?? null } },
  }
}

/** Las columnas que la pantalla lee, ya serializadas. `soloVivo` en el UPDATE que las usa: si el
 *  dueño canceló mientras se persistía, su decisión gana — la cotización queda en la base, pero la
 *  lectura no se declara LISTA a espaldas de quien la frenó. */
function columnasDeLectura(cosecha) {
  return {
    estado: 'LISTO', etapa: null, error: null,
    pasos: jsonb(cosecha.pasos), certeza: jsonb(cosecha.certeza), computo: jsonb(cosecha.computo),
    cascada: jsonb(cosecha.cascada), documentos: jsonb(cosecha.documentos), presupuesto_id: cosecha.cotizacionId,
  }
}

/**
 * `crearHandler` inyecta cada dependencia externa — DB, el pipeline, el cliente de Google — para
 * que el handler se pruebe con un pipeline FALSO: sin red, sin IA, sin Drive. El export de más
 * abajo (`cotizacionPlanoHandler`) usa las dependencias reales; es lo que el worker registra.
 */
export function crearHandler({
  query = queryDb, correr = correrPipeline, crearGoogle = clienteGoogleReal,
  msLatido = MS_LATIDO, ahora = () => Date.now(), topeUsd = topeUsdDeEntorno(process.env),
} = {}) {
  return async function cotizacionPlanoHandler(task, ctx) {
    const lecturaId = task.inputs?.lectura_id
    const actorId = task.inputs?.actor_id
    const hashes = Array.isArray(task.inputs?.hashes) ? task.inputs.hashes : []
    if (!lecturaId) throw new Error("cotizacion.plano: falta 'lectura_id' en inputs")

    const { medicion, publicar, arrancar, onProgreso, cancelado, marcarError, registrarConsumo } =
      tableroDeCorrida({ query, lecturaId, ctx, ahora })

    const detenerLatido = latir(query, lecturaId, msLatido)
    try {
      // CANCELADA ANTES DE QUE EL WORKER LA TOMARA. Pasa de verdad: la tarea espera en cola mientras
      // el worker termina otra lectura, y en ese rato el dueño se da cuenta de que subió el legajo
      // equivocado. Sin esta comprobación, el worker la revivía a LEYENDO y la leía igual — pagando
      // las llamadas de visión que la cancelación venía a evitar.
      if (await cancelado()) return { result: { ok: false, motivo: 'cancelada' } }
      await arrancar()

      const adjuntos = await bytesPorHash(query, { actorId: String(actorId ?? ''), hashes })
      if (!adjuntos.length) {
        await marcarError('no encontré los adjuntos de esta lectura — puede que ya no estén disponibles')
        return { result: { ok: false, motivo: 'sin_adjuntos' } }
      }

      await publicar(`leyendo ${adjuntos.length} documento(s) — puede tardar varios minutos`)

      const { rows } = await query('select mensaje from public.cotizacion_lectura where id = $1', [lecturaId])
      const termino = String(rows[0]?.mensaje ?? '').trim() || 'plano adjunto'
      const google = await crearGoogle(ctx)

      const r = await correr({ query, google, termino, adjuntos, conDrive: false, logger: ctx.logger, onProgreso, cancelado, topeUsd })
      registrarConsumo(r)

      // La cancelación se comprueba TAMBIÉN acá y contra la base: mientras el pipeline no lea
      // `cancelado`, `r.cancelada` no existe y ésta es la única forma de no pisar con LISTO un
      // trabajo que el dueño frenó hace tres minutos.
      if (r.cancelada === true || await cancelado()) {
        await actualizar(query, lecturaId, { estado: 'CANCELADO', etapa: null, medicion: medicion({ cancelada: true }) })
        return { result: { ok: false, motivo: 'cancelada' } }
      }

      if (!r.documentos.planos.legibles.length) {
        await marcarError(`ninguno de los ${adjuntos.length} adjunto(s) es un plano que se pueda abrir`)
        return { result: { ok: false, motivo: 'sin_planos_legibles' } }
      }

      const cosecha = await cosechar({ query, r, termino, publicar })
      await actualizar(query, lecturaId, { ...columnasDeLectura(cosecha), medicion: medicion() }, { soloVivo: true })
      return { result: { ok: true, presupuesto_id: cosecha.cotizacionId, pasos: cosecha.pasos.length } }
    } catch (e) {
      const mensaje = e?.message ? String(e.message) : String(e)
      await marcarError(`no pude cotizar el plano: ${mensaje.slice(0, 300)}`)
      return { result: { ok: false, motivo: 'excepcion', error: mensaje } }
    } finally {
      detenerLatido()
    }
  }
}

export const cotizacionPlanoHandler = crearHandler()
