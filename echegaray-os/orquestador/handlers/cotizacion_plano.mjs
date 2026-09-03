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
// ═══ LÍMITE DECLARADO: EL PROGRESO ES DE GRANO GRUESO, NO POR LÁMINA ═══
//
// Este handler publica cinco etapas (buscar adjuntos → leer y razonar → mapear y computar →
// guardar → listo), no «leyendo la lámina B-01» lámina por lámina. Eso requeriría un hook DENTRO
// del loop de `pipeline.correr()` que hoy no existe, y agregarlo sin su propio test dirigido —sin
// poder correr el pipeline real, que está prohibido en este repo— hubiera sido una promesa sin
// evidencia. Queda declarado, no hecho.
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

/** UPDATE parametrizado sobre columnas conocidas — nunca sobre nombres que vengan de afuera. */
async function actualizar(query, id, campos) {
  const cols = Object.keys(campos)
  if (!cols.length) return
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
  await query(`update public.cotizacion_lectura set ${sets}, actualizado = now() where id = $1`, [id, ...cols.map((c) => campos[c])])
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

/**
 * `crearHandler` inyecta cada dependencia externa — DB, el pipeline, el cliente de Google — para
 * que el handler se pruebe con un pipeline FALSO: sin red, sin IA, sin Drive. El export de más
 * abajo (`cotizacionPlanoHandler`) usa las dependencias reales; es lo que el worker registra.
 */
export function crearHandler({ query = queryDb, correr = correrPipeline, crearGoogle = clienteGoogleReal } = {}) {
  return async function cotizacionPlanoHandler(task, ctx) {
    const lecturaId = task.inputs?.lectura_id
    const actorId = task.inputs?.actor_id
    const hashes = Array.isArray(task.inputs?.hashes) ? task.inputs.hashes : []
    if (!lecturaId) throw new Error("cotizacion.plano: falta 'lectura_id' en inputs")

    const marcarError = async (mensaje) => {
      await actualizar(query, lecturaId, { estado: 'ERROR', etapa: null, error: String(mensaje).slice(0, 2000) })
    }

    try {
      await actualizar(query, lecturaId, { estado: 'LEYENDO', etapa: 'buscando los adjuntos que se subieron', error: null })

      const adjuntos = await bytesPorHash(query, { actorId: String(actorId ?? ''), hashes })
      if (!adjuntos.length) {
        await marcarError('no encontré los adjuntos de esta lectura — puede que ya no estén disponibles')
        return { result: { ok: false, motivo: 'sin_adjuntos' } }
      }

      await actualizar(query, lecturaId, { etapa: `leyendo ${adjuntos.length} documento(s) — puede tardar varios minutos` })

      const { rows } = await query('select mensaje from public.cotizacion_lectura where id = $1', [lecturaId])
      const termino = String(rows[0]?.mensaje ?? '').trim() || 'plano adjunto'
      const google = await crearGoogle(ctx)

      const r = await correr({ query, google, termino, adjuntos, conDrive: false, logger: ctx.logger })

      if (!r.documentos.planos.legibles.length) {
        await marcarError(`ninguno de los ${adjuntos.length} adjunto(s) es un plano que se pueda abrir`)
        return { result: { ok: false, motivo: 'sin_planos_legibles' } }
      }

      await actualizar(query, lecturaId, { etapa: 'razonando el plano: armando los siete pasos' })
      const rz = { ...razonar(r), procedencia: { soloAdjuntos: r.soloAdjuntos === true, documentos: r.documentos.planos.legibles.map((d) => d.name) } }
      const pasos = vistaDePasos(rz, { items: r.computo.items })
      const certeza = certezaDeLectura(pasos)

      await actualizar(query, lecturaId, { etapa: 'mapeando contra la Base Maestra y armando el cómputo' })
      const { partidas, candidatas } = agruparPartidas(r.mapeo.mapeos)
      const cot = armar({
        cliente: r.laminas[0]?.proyecto?.propietario ?? null,
        obraNombre: r.laminas[0]?.proyecto?.nombre ?? termino,
        partidas, composiciones: r.composiciones, candidatas,
      })
      const computo = computoPorPaso(cot)
      const documentos = documentosLeidos(r)

      await actualizar(query, lecturaId, { etapa: 'guardando la cotización' })
      const numero = `COT-XSAS-${termino.toUpperCase().slice(0, 12).replace(/[^A-Z0-9]+/g, '-')}-${Date.now().toString(36).slice(-4)}`
      const { cotizacionId } = await persistir({ query }, cot, {
        numero,
        notas: `generada por XSAS desde ${r.documentos.planos.legibles.map((d) => d.name).join(' + ')} · fuente: SÓLO ADJUNTOS (no se consultó Drive)`,
        razonamiento: rz,
      })
      // La cascada sale de `cotizacion_cascada` — la vista canónica del motor de cotización real.
      // Si la cotización no tiene una política comercial vigente que aplicarle, sale `null`: nunca
      // se fabrica un porcentaje para que la pantalla tenga algo que mostrar.
      const cascada = await cascadaDe({ query }, cotizacionId)

      await actualizar(query, lecturaId, {
        estado: 'LISTO', etapa: null, error: null,
        pasos: jsonb(pasos), certeza: jsonb(certeza), computo: jsonb(computo), cascada: jsonb(cascada),
        documentos: jsonb(documentos), presupuesto_id: cotizacionId,
      })
      return { result: { ok: true, presupuesto_id: cotizacionId, pasos: pasos.length } }
    } catch (e) {
      const mensaje = e?.message ? String(e.message) : String(e)
      await marcarError(`no pude cotizar el plano: ${mensaje.slice(0, 300)}`)
      return { result: { ok: false, motivo: 'excepcion', error: mensaje } }
    }
  }
}

export const cotizacionPlanoHandler = crearHandler()
