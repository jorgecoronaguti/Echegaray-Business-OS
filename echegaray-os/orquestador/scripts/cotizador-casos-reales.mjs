#!/usr/bin/env node
// LOS CASOS REALES DEL COTIZADOR — Quattropani, el caso ciego, y las tres formas de cotizar (§35-§37).
//
//   node orquestador/scripts/cotizador-casos-reales.mjs [--escribir]
//
// Sin `--escribir` imprime el resumen. Con `--escribir` deja el informe en
// `docs/engineering/COTIZADOR-CASOS-REALES.md`.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// LEE. No escribe una sola fila de negocio: ni congela, ni persiste alcance, ni toca el Sheet. La
// única escritura opcional es un archivo de documentación del repo.
//
// ═══ EL MANDATO DEL §35 ═══
//
// «Quattropani sirve para ROMPER el sistema.» Este script NO ajusta un umbral, un patrón ni una
// tolerancia para que el resultado quede lindo. Si el motor bloquea la obra entera, el informe dice
// que la bloquea y por qué. Un caso real que sale perfecto a la primera es un caso que se acomodó.

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getPool } from '../lib/db.mjs'
import { correr } from '../lib/cotizador/orquestador.mjs'
import { leerEstado } from '../lib/cotizador/pg.mjs'
import { delProyecto, exclusionesDelProyecto, issuesDeCandidatas, huecosDelProyecto, clientesDelCorpus } from '../lib/cotizador/corpus.mjs'
import { cuadroDeCorrida, comoMarkdown, bloqueosLegibles } from '../lib/cotizador/reporte.mjs'
import { seleccionarTodas } from '../lib/plano/seleccion.mjs'
import { armarCaso, numerosDelCaso } from '../lib/cotizador/caso-planilla-cliente.mjs'
import { costoDePartida } from '../lib/cotizador/costo.mjs'
import { politicaComercial } from '../lib/cotizador/comercial.mjs'
import { observacionDePrecio } from '../lib/cotizador/precios.mjs'
import { resolvedorDePrecios } from '../lib/cotizador/precio-adaptador.mjs'
import { leerComprasReales, pesosDeCotizacion } from '../lib/cotizador/precio-fuentes.pg.mjs'
import { VIGENCIA_HASTA } from '../lib/uocra-paritaria.mjs'

/** DD/MM/YYYY → YYYY-MM-DD. El tramo de paritaria vive en el formato del acuerdo, no en el de la base. */
const isoDelTramo = (ddmmyyyy) => {
  const [d, m, a] = String(ddmmyyyy).split('/')
  return a && m && d ? `${a}-${m}-${d}` : null
}

/**
 * EL RESOLVEDOR DE PRECIOS DE UNA COTIZACIÓN.
 *
 * Necesita los PESOS de ESTA cotización, no los del catálogo: la materialidad es lo único que separa
 * al panel de chapa que mueve millones del tornillo autoperforante que mueve centavos, y sin ella
 * los dos frenan igual una oferta de $ 80 M. Sin `cotizacionId` no hay pesos y todo cae al piso más
 * exigente — es correcto, y hay que saberlo al leer el número que sale.
 */
export async function resolvedorParaCotizacion(query, { cotizacionId = null, recursos = new Map() } = {}) {
  const compras = await leerComprasReales({ query })
  const pesos = cotizacionId ? (await pesosDeCotizacion({ query }, cotizacionId)).pesos : {}
  return resolvedorDePrecios({ compras, pesos, recursos, tramoParitariaHasta: isoDelTramo(VIGENCIA_HASTA) })
}

const BIBLIOTECA = JSON.parse(readFileSync(new URL('../datos/conocimiento/biblioteca.json', import.meta.url), 'utf8'))

/**
 * LA LECTURA CONGELADA DEL ÁMBITO DE ARCOR QUE ENTRA POR PLANILLAS.
 *
 * La produce `estudiar-ambito-planillas.mjs` y vive en el repo por la misma razón que la biblioteca:
 * este script tiene que correr entero, sin red y sin credenciales. Cada documento lleva adentro el
 * hash de sus bytes y la fecha en que se bajó, así que volver a correr el estudio dice si Drive se
 * movió — un espejo que no puede gritar es una fuente muerta que se lee como viva.
 */
const AMBITO_ARCOR = JSON.parse(readFileSync(new URL('../datos/conocimiento/ambito-arcor-filtro-sanitario.json', import.meta.url), 'utf8'))

/**
 * EL COSTO UNITARIO DE CADA TAREA DEL CATÁLOGO, `{ codigo: costo }`. 0 consultas: usa lo ya leído.
 *
 * Sirve para que la pregunta que cierra un hueco llegue con su plata al lado: «¿la de 0,15 o la de
 * 0,20?» sin decir que una sale $ 17.550 y la otra $ 28.939 traslada la decisión sin trasladar la
 * información. Una tarea que no se puede costear queda AFUERA del mapa, no en cero.
 */
export function costosDelCatalogo({ tareas, composiciones }, { observaciones, resolverPrecio, hoy = new Date() }) {
  const salida = {}
  for (const t of tareas) {
    const c = costoDePartida({
      partida: { codigo: t.codigo, cantidad: 1, unidad: t.unidad, tareaTipoId: t.id },
      composicion: composiciones.get(t.id) ?? [], observaciones, hoy,
      ...(resolverPrecio ? { resolverPrecio } : {}),
    })
    if (c.costoUnitario !== null && Number.isFinite(c.costoUnitario)) salida[t.codigo] = c.costoUnitario
  }
  return salida
}

/** El costo unitario de cada RECURSO, `{ codigo: costo }`, para medir la plata del material que el
 *  cliente ya compró. Un recurso sin precio queda afuera: su riesgo es desconocido, no cero. */
export const costosDeRecursos = (observaciones = []) => Object.fromEntries(
  observaciones.filter((o) => Number.isFinite(Number(o?.precio))).map((o) => [o.recursoCodigo, Number(o.precio)]),
)

/** El catálogo de la Base Maestra con análisis vigente y su composición. UNA consulta cada uno. */
export async function baseMaestraCompleta(query) {
  const tt = await query(`select tt.id, tt.codigo, tt.nombre, tt.unidad
                            from public.tarea_tipo tt
                           where tt.activo is not false
                             and exists (select 1 from public.analisis a where a.tarea_tipo_id = tt.id and a.vigente)
                           order by tt.codigo`)
  const comp = await query(`select a.tarea_tipo_id, a.id analisis_id, r.codigo, r.nombre, r.tipo, r.unidad, r.desperdicio, al.cantidad
                              from public.analisis a
                              join public.analisis_linea al on al.analisis_id = a.id
                              join public.recurso r on r.id = al.recurso_id
                             where a.vigente order by a.tarea_tipo_id, al.orden`)
  const porTarea = new Map()
  for (const l of comp.rows) {
    const lista = porTarea.get(l.tarea_tipo_id) ?? []
    lista.push({ recursoCodigo: l.codigo, nombre: l.nombre, tipo: l.tipo, unidad: l.unidad, cantidad: Number(l.cantidad), desperdicio: l.desperdicio === null ? 0 : Number(l.desperdicio) })
    porTarea.set(l.tarea_tipo_id, lista)
  }
  return { tareas: tt.rows, composiciones: porTarea }
}

/** Todos los precios vigentes, como observaciones. UNA consulta. */
export async function preciosVigentes(query) {
  const r = await query(`select r.codigo, rp.costo, rp.moneda, rp.fuente, rp.proveedor, rp.fecha_precio, rp.vigencia_dias
                           from public.recurso_precio rp join public.recurso r on r.id = rp.recurso_id
                          where rp.costo is not null and rp.fecha_precio is not null`)
  return r.rows.map((x) => observacionDePrecio({
    recursoCodigo: x.codigo, precio: Number(x.costo), moneda: x.moneda ?? 'ARS',
    fuente: x.fuente ?? x.proveedor ?? 'recurso_precio sin fuente declarada',
    observadoEn: (x.fecha_precio instanceof Date ? x.fecha_precio.toISOString() : String(x.fecha_precio)).slice(0, 10),
    vigenciaDias: x.vigencia_dias ?? undefined,
  }))
}

/** La política vigente de la empresa. */
export async function politicaVigente(query) {
  const r = await query(`select * from public.parametro_comercial where vigente`)
  const p = r.rows[0]
  if (!p) return null
  return politicaComercial({
    version: p.version, origen: 'GLOBAL', fuente: p.fuente,
    pctGastosGenerales: Number(p.pct_gastos_generales), pctBeneficio: Number(p.pct_beneficio),
    pctFinanciero: Number(p.pct_financiero), factorFinanciero: Number(p.factor_financiero),
    pctIibb: Number(p.pct_iibb), pctGanancias: Number(p.pct_ganancias),
    pctCheque: Number(p.pct_cheque), pctIva: Number(p.pct_iva),
  })
}

/**
 * UN CÓMPUTO DICTADO A MANO → PARTIDAS. La forma (C) del §37, que es la vida real de ECSAS.
 *
 * El dueño dice «mampostería 520 m², piso 300 m²» y el mapeo lo hace `seleccion.mjs`, que es PURO y
 * ya decide la partida sin modelo. Acá no se agrega ninguna inteligencia: se arma el cómputo con la
 * forma que `seleccionarTodas` espera y se toma lo que devuelve, incluidos sus AMBIGUO.
 */
export function partidasDesdeDictado(dictado = [], catalogo = [], composiciones = new Map()) {
  const computos = dictado.map((d, i) => ({
    id: `DICTADO-${i + 1}`, nombre: d.que, unidad: d.unidad, sistema: d.sistema ?? null,
    cantidad: { valor: d.cantidad, fuente: 'CALCULADO' },
    material: d.material ?? null, especificacion: d.especificacion ?? null, evidencia: null,
  }))
  const sel = seleccionarTodas(computos, catalogo)
  const partidas = []
  const sinMapear = []
  for (const m of sel.mapeos) {
    if (m.estado !== 'MAPEADA') { sinMapear.push({ que: m.computo.nombre, estado: m.estado, porQue: m.porQue, candidatos: (m.candidatos ?? []).slice(0, 3).map((c) => c.codigo) }); continue }
    partidas.push({
      id: m.tarea.id, codigo: m.tarea.codigo, descripcion: m.tarea.nombre, rubro: null,
      unidad: m.tarea.unidad, cantidad: Number(m.computo.cantidad.valor),
      tareaTipoId: m.tarea.id, composicion: composiciones.get(m.tarea.id) ?? [],
      nota: `dictado: «${m.computo.nombre} ${m.computo.cantidad.valor} ${m.computo.unidad}»`,
    })
  }
  return { partidas, sinMapear, mapeadas: sel.mapeadas, ambiguas: sel.ambiguas, candidatas: sel.candidatas }
}

/** Corre un caso y lo cronometra: fría (primera) y tibia (segunda, todo en memoria). */
export function correrCronometrado(entrada) {
  const t0 = performance.now()
  const fria = correr(entrada)
  const t1 = performance.now()
  const tibia = correr(entrada)
  const t2 = performance.now()
  return { corrida: fria, segunda: tibia, msFrio: t1 - t0, msTibio: t2 - t1 }
}

export async function main() {
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)
  const clientes = clientesDelCorpus(BIBLIOTECA)
  const politica = await politicaVigente(query)
  const bm = await baseMaestraCompleta(query)
  const precios = await preciosVigentes(query)
  // El catálogo de recursos por código: el resolvedor lo necesita para saber de qué tipo es cada uno
  // (un jornal de convenio caduca con la paritaria; una bolsa de cemento se degrada con la inflación).
  const recursos = new Map((await query('select codigo, nombre, tipo, unidad from public.recurso')).rows
    .map((r) => [r.codigo, { nombre: r.nombre, tipo: r.tipo, unidad: r.unidad }]))
  // Un dictado telefónico no tiene cotización cargada, así que no hay pesos: sin materialidad todo
  // recurso cae al piso de vigencia más exigente. Es correcto y hay que leerlo sabiéndolo.
  const sinPesos = await resolvedorParaCotizacion(query, { cotizacionId: null, recursos })
  const casos = []

  // ── CASO 1 · QUATTROPANI, PUNTA A PUNTA ────────────────────────────────────────────────────
  const cotQ = (await query(`select id from public.cotizaciones
                              where obra_nombre = 'Salón Comercial' and estado = 'borrador'
                              order by fecha_cotizacion limit 1`)).rows[0]
  const corpusQ = delProyecto(BIBLIOTECA, 'quattropani')
  const estadoQ = await leerEstado({ query }, cotQ.id)
  const resolverPrecioQ = await resolvedorParaCotizacion(query, { cotizacionId: cotQ.id, recursos })
  const exQ = exclusionesDelProyecto(corpusQ.conocimientos, { partidas: estadoQ.partidas })
  const q = correrCronometrado({
    ...estadoQ,
    documentos: corpusQ.documentos,
    alcance: exQ.entradas,
    politica: estadoQ.politica ?? politica,
    cliente: 'FRANCO QUATTROPANI',
    clientesConocidos: clientes,
    issuesHeredados: [...huecosDelProyecto(corpusQ.huecos), ...issuesDeCandidatas(exQ.candidatas)],
    // La partida está CARGADA en COT-2026-001, que es un acto de la empresa. Es el provenance que
    // §5 exige para no dejar las 26 en POR_DEFINIR; lo que el contrato excluye lo sigue excluyendo.
    alcancePorDefecto: { estado: 'INCLUIDO', fuente: 'cargada en el presupuesto COT-2026-001', motivo: 'una partida cargada en el presupuesto está incluida por acto propio de la empresa' },
    resolverPrecio: resolverPrecioQ,
  })
  casos.push({ nombre: 'QUATTROPANI (real)', ...q, corpus: corpusQ, exclusiones: exQ, cotizacionId: cotQ.id })

  // ── CASO 2 · CIEGO · LA ESTRELLA ───────────────────────────────────────────────────────────
  // No tiene presupuesto cargado, así que su cómputo es DICTADO sobre la Base Maestra real. La
  // diferencia se declara: no es el mismo tramo de motor que Quattropani.
  const corpusE = delProyecto(BIBLIOTECA, 'estrella')
  const exE = exclusionesDelProyecto(corpusE.conocimientos)
  const dictadoE = [
    { que: 'MAMPOSTERÍA LADRILLON CERÁMICO', unidad: 'm2', cantidad: 340, sistema: 'mamposteria' },
    { que: 'PISO DE HORMIGON ALISADO MECÁNICO', unidad: 'm2', cantidad: 180, sistema: 'piso' },
    { que: 'REPLANTEO', unidad: 'm2', cantidad: 420, sistema: 'movimiento_suelo' },
  ]
  const mapE = partidasDesdeDictado(dictadoE, bm.tareas, bm.composiciones)
  const e = correrCronometrado({
    documentos: corpusE.documentos, partidas: mapE.partidas, observaciones: precios,
    alcance: exE.entradas, politica, cliente: 'LA ESTRELLA', clientesConocidos: clientes,
    issuesHeredados: huecosDelProyecto(corpusE.huecos),
    alcancePorDefecto: { estado: 'INCLUIDO', fuente: 'dictado del jefe de obra', motivo: 'lo que se dicta se cotiza' },
    resolverPrecio: sinPesos,
  })
  casos.push({ nombre: 'LA ESTRELLA (ciego)', ...e, corpus: corpusE, exclusiones: exE, mapeo: mapE })

  // ── CASO 3 · DOC INCOMPLETA ────────────────────────────────────────────────────────────────
  // El mismo Quattropani SIN su contrato: se le saca el alcance y se ve qué cambia.
  const inc = correrCronometrado({
    ...estadoQ, documentos: corpusQ.documentos.slice(0, 2), alcance: [],
    politica: estadoQ.politica ?? politica, cliente: 'FRANCO QUATTROPANI', clientesConocidos: clientes,
    alcancePorDefecto: { estado: 'INCLUIDO', fuente: 'cargada en el presupuesto COT-2026-001' },
    resolverPrecio: resolverPrecioQ,
  })
  casos.push({ nombre: 'DOC INCOMPLETA', ...inc, corpus: { documentos: corpusQ.documentos.slice(0, 2), conocimientos: [] } })

  // ── CASO 4 · CÓMPUTO MANUAL SIN PLANOS ─────────────────────────────────────────────────────
  const dictadoC = [
    { que: 'MAMPOSTERÍA LADRILLON CERÁMICO', unidad: 'm2', cantidad: 520, sistema: 'mamposteria' },
    { que: 'PISO DE HORMIGON ALISADO MECÁNICO', unidad: 'm2', cantidad: 300, sistema: 'piso' },
  ]
  const mapC = partidasDesdeDictado(dictadoC, bm.tareas, bm.composiciones)
  const c = correrCronometrado({
    documentos: [{ hash: 'dictado', nombre: 'dictado del dueño (sin planos)', parseado: true }],
    partidas: mapC.partidas, observaciones: precios, alcance: [], politica,
    cliente: 'OBRA SIN PLANOS', clientesConocidos: clientes,
    alcancePorDefecto: { estado: 'INCLUIDO', fuente: 'dictado del dueño', motivo: 'lo que se dicta se cotiza' },
    resolverPrecio: sinPesos,
  })
  casos.push({ nombre: 'CÓMPUTO MANUAL', ...c, corpus: { documentos: [], conocimientos: [] }, mapeo: mapC })

  // ── CASO 5 · ARCOR · LA GRILLA LA IMPONE EL CLIENTE ────────────────────────────────────────
  //
  // Es el caso opuesto a Quattropani, y por eso está: ARCOR no manda planos, manda SU planilla.
  // Los 57 documentos del cliente en el corpus son 49 planillas y 8 Word, y los 57 se abren sin un
  // modelo. El ámbito elegido —FILTRO SANITARIO— trae la cadena completa: el pedido del cliente, la
  // cotización interna, el cómputo final y el cómputo de materiales que sostiene los kilos.
  //
  // Nada de este caso ajusta un umbral para que cierre. Al revés: el control de suministro SACA del
  // costo las partidas cuyo análisis compra material que ARCOR ya compró, así que ARCOR cotiza
  // MENOS partidas que si no existiera. Un caso real que sale perfecto es un caso que se acomodó.
  const costosCatalogo = costosDelCatalogo(bm, { observaciones: precios, resolverPrecio: sinPesos })
  const casoA = armarCaso(AMBITO_ARCOR, {
    catalogo: bm.tareas, composiciones: bm.composiciones,
    cliente: 'ARCOR', costoPorRecurso: costosDeRecursos(precios),
  })
  const a = correrCronometrado({
    documentos: casoA.documentos, elementos: casoA.elementos, partidas: casoA.partidas,
    composiciones: bm.composiciones, observaciones: precios, alcance: [], politica,
    cliente: 'ARCOR - SAN JUAN', clientesConocidos: clientes,
    mapeos: casoA.mapeos, costosDeCatalogo: costosCatalogo,
    issuesHeredados: casoA.issues,
    // Lo que el cliente escribió en SU planilla está pedido por acto propio del cliente. No es una
    // suposición nuestra: es el documento con el que nos invitó a cotizar.
    alcancePorDefecto: { estado: 'INCLUIDO', fuente: `planilla del cliente: ${casoA.version.elegido?.nombre ?? 'sin versión'}`, motivo: 'lo que el cliente escribió en su propia planilla de cotización está pedido' },
    resolverPrecio: sinPesos,
  })
  casos.push({
    nombre: 'ARCOR (planilla del cliente)', ...a,
    corpus: { documentos: casoA.documentos, conocimientos: [] },
    ambito: casoA, numeros: numerosDelCaso(casoA),
  })

  await pool.end()
  return { casos, clientes }
}

/**
 * ═══ NADA CORRE AL IMPORTARSE ═══
 *
 * `casos-reales.pg.test.mjs` importa `baseMaestraCompleta`, `preciosVigentes` y
 * `partidasDesdeDictado` de este archivo para no duplicarlas. Sin este guard, importarlo corría el
 * informe entero y —peor— llamaba a `pool.end()`: el test siguiente encontraba la conexión cerrada,
 * `hayBase` daba false y los 18 casos se SALTEABAN en silencio con un «ok 1 # SKIP». Un módulo con
 * efectos al importarse es una trampa, y ésta se veía como verde.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await informe()
}

/**
 * LO QUE EL CUADRO GENERAL NO PUEDE DECIR DE UN ÁMBITO QUE LLEGA POR PLANILLA.
 *
 * El cuadro cuenta PARTIDAS, y en este caso son 2. Leerlo solo hace pensar que la obra son dos
 * renglones: son 12 ítems que el cliente pidió, de los cuales 10 quedaron abiertos. Sin esta
 * sección, el «COSTO DIRECTO» de la columna se lee como el costo de la obra, y es el costo de dos
 * ítems de doce.
 */
function cuadroDelAmbito(caso) {
  if (!caso) return '_ningún caso entró por planilla del cliente_'
  const n = caso.numeros
  const plata = (v) => (v === null ? 'no medida' : `$ ${Math.round(v).toLocaleString('es-AR')}`)
  return [
    `Ámbito: **${caso.ambito.version.elegido?.nombre ?? 'sin versión que rija'}** — ${caso.ambito.version.porQue}`,
    '',
    '| | |',
    '|---|---|',
    `| documentos del ámbito · abiertos sin modelo | ${n.documentos} · **${n.documentosAbiertos}** |`,
    `| ítems que el cliente pidió en su planilla | ${n.itemsDelCliente} |`,
    `| · que llegaron a cómputo | ${n.computos} |`,
    `| · que se perdieron en la lectura | ${n.huecosDeLectura} |`,
    `| mapeadas / ambiguas / sin partida | ${n.mapeadas} / ${n.ambiguas} / ${n.sinPartida} |`,
    `| con material que el cliente ya compró | ${n.choquesDeSuministro} (${plata(n.plataDeSuministro)}) |`,
    `| **partidas que se pueden costear** | **${n.partidasCosteables} de ${n.itemsDelCliente}** |`,
    `| brecha de alcance entre versiones del ámbito | ${plata(n.brechaDeAlcance)} |`,
    '',
    `> El COSTO DIRECTO de la columna es el de ${n.partidasCosteables} ítem(s) de ${n.itemsDelCliente}. **No es el costo de la obra.**`,
  ].join('\n')
}

async function informe() {
  const { casos } = await main()

  const cuadros = casos.map((k) => cuadroDeCorrida(k.corrida, {
    nombre: k.nombre, documentosCorpus: k.corpus.documentos.length,
    conocimientos: k.corpus.conocimientos?.length ?? 0, msFrio: k.msFrio, msTibio: k.msTibio,
  }))

  // La reproducibilidad se prueba contra la huella del RESULTADO, no sólo la de la entrada: hashear
  // el mismo objeto de entrada dos veces es una tautología y decía «iguales» aunque el resultado
  // cambiara (el caso concreto: 2026 vs 2027, cero precios vencidos contra tres).
  const reproducible = casos.every((k) => k.corrida.huella.sha256 === k.segunda.huella.sha256
    && k.corrida.huellaResultado.sha256 === k.segunda.huellaResultado.sha256)

  const md = `# COTIZADOR — LOS CASOS REALES

Generado por \`orquestador/scripts/cotizador-casos-reales.mjs\` el ${new Date().toISOString().slice(0, 10)}.
Documentos y conocimientos de \`orquestador/datos/conocimiento/biblioteca.json\`; partidas, análisis
y precios de las tablas reales. **Ninguna corrida llamó a un modelo.**

## El cuadro

${comoMarkdown(cuadros)}

## Qué bloquea cada caso

${casos.map((k) => `### ${k.nombre}\n\n${bloqueosLegibles(k.corrida).join('\n') || '_sin bloqueos_'}\n`).join('\n')}

## Reproducibilidad (§39)

RUN1 = RUN2 en las ${casos.length} corridas: **${reproducible ? 'SÍ' : 'NO'}**.

${casos.map((k) => `- \`${k.nombre}\` → entrada \`${k.corrida.huella.sha256.slice(0, 16)}\` · resultado \`${k.corrida.huellaResultado.sha256.slice(0, 16)}\``).join('\n')}

## Lo que el dictado NO pudo mapear a la Base Maestra

${casos.filter((k) => k.mapeo).map((k) => `### ${k.nombre}\n\nmapeadas ${k.mapeo.mapeadas} · ambiguas ${k.mapeo.ambiguas} · sin partida ${k.mapeo.candidatas}\n\n${k.mapeo.sinMapear.map((x) => `- **${x.que}** → ${x.estado}: ${String(x.porQue).slice(0, 220)}`).join('\n') || '_todo mapeado_'}\n`).join('\n')}

## El ámbito que entra por la planilla del cliente (ARCOR)

${cuadroDelAmbito(casos.find((k) => k.ambito))}

## El cruce exclusión ↔ cómputo, sobre el contrato REAL

${casos[0].exclusiones ? `- **aplicadas** (corroboradas en ≥2 documentos): ${casos[0].exclusiones.entradas.map((x) => `\`${x.patron}\``).join(', ') || '—'}
- **candidatas** (un solo documento, preguntan en vez de excluir): ${casos[0].exclusiones.candidatas.map((x) => `\`${x.patron}\``).join(', ') || '—'}
- **descartadas** (no alcanzan a ninguna partida): ${casos[0].exclusiones.descartadas.map((x) => `\`${x.termino}\``).join(', ') || '—'}` : ''}
`

  if (process.argv.includes('--escribir')) {
    writeFileSync(new URL('../../docs/engineering/COTIZADOR-CASOS-REALES.md', import.meta.url), md)
    console.log('escrito: docs/engineering/COTIZADOR-CASOS-REALES.md')
  } else {
    console.log(md)
  }

}
