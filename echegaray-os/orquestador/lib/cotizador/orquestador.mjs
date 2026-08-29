// EL QUOTE ORCHESTRATOR — once etapas, cada una con la forma del contrato (§1).
//
// ═══ QUÉ ORQUESTA Y QUÉ NO REESCRIBE ═══
//
// El tramo DOCUMENTOS → CÓMPUTO → PARTIDA ya existe y funciona: `orquestador/lib/plano/` clasifica
// documentos, interpreta láminas, computa elementos, cruza CAD y pliego, y —lo más importante—
// ELIGE LA PARTIDA con `seleccion.mjs`, que es puro y reproducible. Nada de eso se toca acá:
// `desdePipelineDePlano` lo ADAPTA a la forma del contrato y sigue.
//
// Lo que este módulo agrega es el tramo que no existía: alcance, precios como observaciones, costo
// que se niega a afirmarse, cascada comercial, cola de atención, gate de congelado y salida.
//
// ═══ POR QUÉ EL ORQUESTADOR NO LLAMA A NADIE ═══
//
// No abre Drive, no consulta Postgres, no llama a ningún modelo. Recibe una ENTRADA ya materializada
// y devuelve etapas. Eso es lo que hace posible el CLAUDE-ZERO del §34: la corrida determinística
// completa se prueba pasándole la misma entrada y sin proveedor, y tiene que dar el mismo resultado.
// Un orquestador que trae sus propios datos no se puede probar sin los datos.
//
// ═══ EL CORTE ═══
//
// Una etapa BLOQUEADA no detiene la corrida: las siguientes corren igual, en modo degradado, y
// devuelven lo que pueden. Detenerse en la primera dejaría al que arma el presupuesto sin saber
// cuánto más le falta — y el §22 pide una cola de atención, que es justamente la lista de TODO lo
// que hay que resolver, no del primero.

import { ETAPA, STATUS, ESTADO, resultadoEtapa, ORDEN_ETAPAS } from './contrato.mjs'
import { cruzarAlcance, paraCostear } from './alcance.mjs'
import { costoDePartida, costoDirecto } from './costo.mjs'
import { cascada } from './comercial.mjs'
import { colaDeAtencion, estadoDeCola } from './atencion.mjs'
import { huellaDeEntradas, gateDeCongelado } from './freeze.mjs'
import { metricasDeCorrida } from './metricas.mjs'

/**
 * ADAPTAR EL RESULTADO DEL PIPELINE DE PLANO a la entrada del orquestador. PURA.
 *
 * Es un traductor y nada más: no recalcula ni reinterpreta. Si mañana `plano/pipeline.mjs` cambia
 * de forma, se cambia esta función y no las once etapas — que es el motivo de que exista.
 */
export function desdePipelineDePlano(resultado = {}) {
  const porTarea = new Map()
  for (const m of resultado.mapeo?.mapeos ?? []) {
    if (m.estado !== 'MAPEADA' || !m.tarea) continue
    const k = m.tarea.id
    const p = porTarea.get(k) ?? { codigo: m.tarea.codigo, descripcion: m.tarea.nombre, unidad: m.tarea.unidad, tareaTipoId: k, rubro: null, cantidad: 0, evidencia: null, lineas: [] }
    p.cantidad += Number(m.computo?.cantidad?.valor ?? 0)
    p.evidencia = p.evidencia ?? m.computo?.evidencia ?? null
    p.lineas.push({ elemento: m.computo?.id, cantidad: m.computo?.cantidad?.valor ?? null })
    porTarea.set(k, p)
  }
  return {
    documentos: (resultado.documentos?.insumos ?? []).map((d) => ({ hash: d.drive_file_id ?? d.name, nombre: d.name, parseado: true })),
    elementos: resultado.computo?.items ?? [],
    partidas: [...porTarea.values()],
    composiciones: resultado.composiciones ?? new Map(),
    degradacion: resultado.degradacion ?? null,
    huellaDeSeleccion: resultado.huella ?? null,
  }
}

/**
 * CORRER LAS ONCE ETAPAS. PURA.
 *
 * Devuelve `{etapas, estado, cola, cascada, huella, gate, metricas}`. `etapas` es un array en el
 * ORDEN del contrato y con una entrada por etapa, siempre las once: una etapa que no corrió sale
 * `OMITIDA` y no desaparece. Que falte una entrada y que una etapa no haya encontrado nada se ven
 * iguales desde afuera, y ése es el defecto que el contrato ya evita en el resultado de etapa.
 */
export function correr({
  documentos = [], elementos = [], partidas = [], composiciones = new Map(),
  observaciones = [], alcance = [], politica = null, fx = null,
  degradacion = null, congeladoPor = null, hoy = new Date(),
} = {}) {
  const etapas = []
  const anotar = (r) => { etapas.push(r); return r }
  // Una corrida SIN proveedor de razonamiento es DEGRADADA en todas sus etapas interpretativas, y
  // eso viaja en el status — no en una nota al pie que nadie lee.
  const st = (base) => (degradacion?.hubo && base === STATUS.OK ? STATUS.DEGRADADA : base)

  // ── 1 · INGEST
  anotar(resultadoEtapa({
    etapa: ETAPA.INGEST, status: documentos.length ? STATUS.OK : STATUS.BLOQUEADA,
    result: { total: documentos.length, parseados: documentos.filter((d) => d.parseado !== false).length },
    evidence: documentos.map((d) => ({ hash: d.hash, nombre: d.nombre })),
    blocking_issues: documentos.length ? [] : [{ tipo: 'SIN_DOCUMENTOS', entidad: 'proyecto', detalle: 'no hay ningún documento: no hay de dónde cotizar' }],
  }))

  // ── 2 · INTERPRET (ya la hizo el pipeline de plano; acá se declara su degradación)
  anotar(resultadoEtapa({
    etapa: ETAPA.INTERPRET, status: st(elementos.length ? STATUS.OK : STATUS.BLOQUEADA),
    result: { elementos: elementos.length },
    provenance: degradacion?.motivos?.map((m) => `${m.motivo} (${m.veces}×)`) ?? [],
    missing_data: (degradacion?.laminasNoLeidas ?? []).map((l) => `${l.archivo}: ${l.porQue}`),
    blocking_issues: elementos.length ? [] : [{ tipo: 'SIN_ELEMENTOS', entidad: 'proyecto', detalle: 'no se pudo leer ningún elemento de la documentación' }],
  }))

  // ── 3 · SCOPE
  const conAlcance = cruzarAlcance({ partidas, alcance })
  anotar(resultadoEtapa({
    etapa: ETAPA.SCOPE, status: STATUS.OK,
    result: { incluidas: conAlcance.incluidas, excluidas: conAlcance.excluidas, porDefinir: conAlcance.porDefinir, excluidoEnPlata: conAlcance.excluidoEnPlata },
    conflicts: conAlcance.conflictos,
    missing_data: conAlcance.partidas.filter((p) => p.alcance === 'POR_DEFINIR').map((p) => p.codigo),
    next_actions: conAlcance.porDefinir ? ['include_scope', 'exclude_scope'] : [],
  }))

  // ── 4 · TAKEOFF
  const conCantidad = partidas.filter((p) => p.cantidad !== null && p.cantidad !== undefined)
  anotar(resultadoEtapa({
    etapa: ETAPA.TAKEOFF, status: st(STATUS.OK),
    result: { total: partidas.length, computadas: conCantidad.length },
    missing_data: partidas.filter((p) => p.cantidad === null || p.cantidad === undefined).map((p) => p.codigo),
    confidence: partidas.length ? conCantidad.length / partidas.length : null,
  }))

  // ── 5 · MAP (la decidió `seleccion.mjs`, que es puro: acá sólo se reporta)
  anotar(resultadoEtapa({
    etapa: ETAPA.MAP, status: partidas.length ? STATUS.OK : STATUS.OMITIDA,
    result: { partidas: partidas.length },
    provenance: ['plano/seleccion.mjs — la partida la decide el código, no el modelo'],
  }))

  // ── 6 · COMPOSE
  const aCostear = paraCostear(conAlcance.partidas)
  const sinComposicion = aCostear.filter((p) => !(composiciones.get?.(p.tareaTipoId) ?? p.composicion ?? []).length)
  anotar(resultadoEtapa({
    etapa: ETAPA.COMPOSE, status: aCostear.length ? STATUS.OK : STATUS.OMITIDA,
    result: { conComposicion: aCostear.length - sinComposicion.length, sinComposicion: sinComposicion.length },
    missing_data: sinComposicion.map((p) => p.codigo),
  }))

  // ── 7 · COST
  const costos = aCostear.map((p) => costoDePartida({
    partida: p, composicion: composiciones.get?.(p.tareaTipoId) ?? p.composicion ?? [],
    observaciones, fx, hoy,
  }))
  const cd = costoDirecto(costos)
  anotar(resultadoEtapa({
    etapa: ETAPA.COST, status: cd.total === null ? STATUS.BLOQUEADA : STATUS.OK,
    result: { total: cd.total, parcial: cd.parcial, cajones: cd.cajones, hh: cd.hh },
    missing_data: cd.faltan.map((f) => `${f.partida}: ${(f.porQue ?? []).join(' · ')}`),
    blocking_issues: cd.total === null ? [{ tipo: 'COSTO_NO_AFIRMABLE', entidad: 'cotización', detalle: cd.porQue }] : [],
    confidence: cd.nPartidas ? (cd.nPartidas - cd.nSinCosto) / cd.nPartidas : null,
  }))

  // ── 8 · COMMERCIAL
  const casc = cascada({ costoDirecto: cd.total, politica })
  anotar(resultadoEtapa({
    etapa: ETAPA.COMMERCIAL, status: casc.estado === ESTADO.CALCULADO ? STATUS.OK : STATUS.BLOQUEADA,
    result: casc,
    provenance: politica ? [`política v${politica.version} (${politica.origen}) — ${politica.fuente}`] : [],
    blocking_issues: casc.estado === ESTADO.CALCULADO ? [] : [{ tipo: 'SIN_PRECIO_CALCULABLE', entidad: 'cotización', detalle: casc.porQue }],
  }))

  // ── 9 · VALIDATE
  const cola = colaDeAtencion({
    issues: [...conAlcance.issues, ...costos.flatMap((c) => c.issues ?? [])],
    costoConocido: cd.parcial,
  })
  anotar(resultadoEtapa({
    etapa: ETAPA.VALIDATE, status: cola.nBloqueantes ? STATUS.BLOQUEADA : STATUS.OK,
    result: { total: cola.total, bloqueantes: cola.nBloqueantes, plataEnRiesgo: cola.plataEnRiesgo, sinMedir: cola.bloqueantesSinMedir },
    conflicts: cola.issues.filter((i) => i.type === 'CONFLICTO'),
    blocking_issues: cola.bloqueantes,
    next_actions: [...new Set(cola.bloqueantes.map((i) => i.recommended_action).filter(Boolean))],
  }))

  // ── 10 · FREEZE
  const huella = huellaDeEntradas({ documentos, partidas: conAlcance.partidas, precios: observaciones, politica, alcance, fx })
  const gate = gateDeCongelado({ cascada: casc, cola })
  anotar(resultadoEtapa({
    etapa: ETAPA.FREEZE, status: gate.ready ? STATUS.OK : STATUS.BLOQUEADA,
    result: gate, evidence: [{ huella: huella.sha256, resumen: huella.resumen }],
    blocking_issues: gate.blocking_issues,
    next_actions: gate.ready ? ['freeze'] : [...new Set(gate.blocking_issues.map((b) => b.accion).filter(Boolean))],
  }))

  // ── 11 · OUTPUT
  const metricas = metricasDeCorrida({
    documentos, elementos,
    cantidades: partidas.map((p) => ({ valor: p.cantidad, estado: p.cantidad === null || p.cantidad === undefined ? ESTADO.FALTA_DATO : ESTADO.CALCULADO, porQue: p.porQue ?? (p.cantidad === null ? 'sin cantidad computada' : null) })),
    mapeos: partidas.map(() => ({ estado: 'MAPEADA' })),
    composiciones: aCostear.map((p) => composiciones.get?.(p.tareaTipoId) ?? p.composicion ?? []),
    costosDePartida: costos, cola,
    decisionesDeterministicas: partidas.length + costos.length,
    llamadasLLM: [],
  })
  anotar(resultadoEtapa({
    etapa: ETAPA.OUTPUT, status: gate.ready ? STATUS.OK : STATUS.BLOQUEADA,
    result: { listoParaOfertar: gate.ready, metricas },
    provenance: [huella.resumen],
  }))

  return Object.freeze({
    etapas: Object.freeze(etapas),
    // El orden se verifica acá y no en un test: una etapa fuera de lugar es un bug de este archivo.
    ordenCorrecto: etapas.map((e) => e.etapa).join('|') === ORDEN_ETAPAS.join('|'),
    partidas: conAlcance.partidas,
    costos: Object.freeze(costos),
    costoDirecto: cd,
    cascada: casc,
    cola, huella, gate, metricas,
    estado: estadoDeCola(cola),
    degradada: Boolean(degradacion?.hubo),
    congeladoPor,
  })
}

/** La etapa que se pide por nombre. PURA. Existe para que un consumidor no tenga que conocer el
 *  índice — y para que agregar una etapa no rompa a nadie. */
export const etapa = (corrida, nombre) => corrida.etapas.find((e) => e.etapa === nombre) ?? null
