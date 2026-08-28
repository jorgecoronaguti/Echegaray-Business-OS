#!/usr/bin/env node
// CUÁNTA MANO DE OBRA SE LLEVÓ CADA OBRA EN UNA VENTANA — leído de JORNALES, contra su propio total.
//
//   node orquestador/scripts/jornales-por-obra.mjs --desde 2026-08-16 --hasta 2026-08-28
//   node orquestador/scripts/jornales-por-obra.mjs --desde … --hasta … --cargas 0.3862 --json
//
// SÓLO LEE. No escribe una celda de JORNALES ni de ninguna otra planilla, a propósito y para
// siempre: este archivo contesta una pregunta, no mantiene una pestaña.
//
// POR QUÉ EXISTE. `lib/jornales-por-obra.mjs` era código inalcanzable: nadie lo llamaba con una
// grilla real y nadie le armaba el mapa de clientes, así que la rama NO_VERIFICABLE vivía sólo en
// los tests y `public.cliente_alias` no tenía un solo consumidor. Una capacidad sin puerta de
// entrada no existe.
//
// EL CONTROL QUE NO SE VALIDA CONTRA SÍ MISMO. El total que calcula el OS se compara contra el
// «TOTAL MO» que la PLANILLA ya tiene escrito en cada bloque —otra fuente, calculada por otras
// fórmulas, mantenida por otra persona—. Si coinciden, el número está probado contra algo que el OS
// no produjo. La celda no está clavada: se busca el rótulo dentro del bloque y se lee el número que
// tiene al lado, porque una coordenada escrita a mano envejece sin avisar.

import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import { JORNALES_FILE_ID } from '../lib/espejo-jornales.mjs'
import { detectarBloques, letraColumna, filaSheet, colSheet } from '../lib/jornales-estructura.mjs'
import { costoPorObra } from '../lib/jornales-por-obra.mjs'
import { auditarResumenPorCliente } from '../lib/jornales-resumen.mjs'
import { cargarMapaClientes } from '../lib/cliente-alias.mjs'

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/
const RE_TOTAL_MO = /\bTOTAL\s*MO\b/i

function argumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)$/.exec(argv[i])
    if (!m) continue
    a[m[1]] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  if (!RE_ISO.test(a.desde ?? '') || !RE_ISO.test(a.hasta ?? '')) {
    throw new Error('faltan --desde y --hasta en formato YYYY-MM-DD')
  }
  if (a.desde > a.hasta) throw new Error('--desde es posterior a --hasta')
  const cargas = a.cargas === undefined ? null : Number(String(a.cargas).replace(',', '.'))
  if (cargas != null && !(Number.isFinite(cargas) && cargas >= 0)) throw new Error('--cargas tiene que ser un número ≥ 0')
  return {
    desde: a.desde,
    hasta: a.hasta,
    pestana: typeof a.pestana === 'string' ? a.pestana : 'Obreros 26',
    anio: Number(a.desde.slice(0, 4)),
    cargas,
    json: a.json === true,
  }
}

const $ = (n) => (n == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n))
const hs = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)

/**
 * El «TOTAL MO» que la propia planilla escribió dentro de este bloque: el rótulo se busca, y el
 * número es la primera celda numérica a su derecha. Devuelve null cuando el bloque no lo tiene —que
 * NO es cero: es que este bloque no trae testigo y su total no se puede contrastar.
 */
function testigoTotalMo(grid, desdeFila, hastaFila) {
  for (let i = desdeFila; i < hastaFila; i++) {
    const fila = grid.filas[i] || []
    for (let j = 0; j < fila.length; j++) {
      if (!RE_TOTAL_MO.test(String(fila[j]?.valor ?? ''))) continue
      for (let k = j + 1; k < fila.length; k++) {
        const n = fila[k]?.numero
        if (typeof n === 'number' && Number.isFinite(n)) {
          return { valor: n, celda: `${letraColumna(colSheet(grid, k))}${filaSheet(grid, i)}` }
        }
      }
    }
  }
  return null
}

/** Bloques cuyas fechas caen dentro de la ventana, con su límite de lectura. */
function bloquesDeLaVentana(grid, { desde, hasta, anio }) {
  const bloques = detectarBloques(grid, { anio })
  return bloques
    .map((b, k) => ({
      bloque: b,
      hastaFila: bloques[k + 1]?.fila ?? grid.filas.length,
      bloques,
      // Las fechas del bloque que caen DENTRO de la ventana. Si no son todas, el testigo del bloque
      // —que suma la quincena entera— no es comparable contra lo que el OS leyó de la ventana.
      fechas: (b.fechas || []).filter((f) => f.iso >= desde && f.iso <= hasta),
    }))
    .filter(({ fechas }) => fechas.length > 0)
}

function imprimir(r, testigos, auditorias, mapa) {
  console.log(`\nMANO DE OBRA POR OBRA · ${r.ventana.desde} → ${r.ventana.hasta}`)
  console.log(`${r.ventana.diasEnVentana} día(s) con carga · ${r.control.personas} persona(s) · bloques ${r.ventana.bloques.join(', ')}`)
  if (!r.control.verificable) console.log(`\n⚠ NO VERIFICABLE — ${mapa.motivo}\n  Nada se atribuye: la plata existe y no se le pone dueño.`)

  console.log('\n  OBRA                                   HORAS        JORNAL        COSTO  PERS')
  for (const o of r.porObra) {
    const etiqueta = [o.cliente, o.obra].filter(Boolean).join(' · ').slice(0, 36).padEnd(36)
    console.log(`  ${etiqueta} ${hs(o.horas).padStart(7)} ${$(o.jornal).padStart(13)} ${$(o.costo).padStart(12)} ${String(o.personas).padStart(5)}`)
  }
  const linea = (t, xs) => { if (xs.length) console.log(`\n  ${t}: ${xs.join(' · ')}`) }
  linea('SIN OBRA (no es cliente)', r.sinObra.map((s) => `${s.rotulo} ${$(s.jornal)}`))
  linea('RÓTULOS DESCONOCIDOS', r.desconocidos.map((d) => `«${d.rotulo}» fila ${d.fila} ${$(d.jornal)}`))
  linea('SIN RÓTULO DE CLIENTE', r.sinRotulo.map((s) => `${s.persona} fila ${s.fila} ${$(s.jornal)}`))
  linea('CELDAS ILEGIBLES', r.huecos.filter((h) => h.tipo === 'celda_ilegible').map((h) => `${h.columna}${h.fila} «${h.contenido}»`))
  linea('SIN VALOR HORA', r.huecos.filter((h) => h.tipo === 'sin_valor_hora').map((h) => `${h.persona} fila ${h.fila}`))
  linea('FECHAS EN DOS BLOQUES', r.fechasDuplicadas.map((f) => `${f.fecha} (${f.bloques.join(' y ')})`))
  linea('PERSONAS CONTADAS DOS VECES', r.personasRepetidas.map((p) => `${p.persona} (${p.fechas.join(', ')})`))

  const c = r.control
  console.log('\n  CUADRE DE LA VENTANA')
  console.log(`    total ${$(c.jornalTotal)} = atribuido ${$(c.jornalAtribuido)} + sin obra ${$(c.jornalSinObra)}`)
  console.log(`      + desconocido ${$(c.jornalDesconocido)} + sin rótulo ${$(c.jornalSinRotulo)} + no verificable ${$(c.jornalNoVerificable)}`)
  console.log(`    residuo ${$(c.residuo)} · ${c.cuadra ? '✓ cuadra' : '✗ NO CUADRA'} · ventana ${c.ventanaConsistente ? '✓ sin solapes' : '✗ CON SOLAPES: el total está inflado'}`)

  // EL TESTIGO DE UN BLOQUE SE COMPARA CONTRA LO QUE EL OS LEYO DE ESE BLOQUE, no contra el total
  // de la ventana. Comparar cada testigo contra el total global hacia que una ventana de dos
  // quincenas gritara dos veces con los datos perfectos: 7.318.700 y 6.686.300 contra 14.005.000,
  // cuando la suma de los dos testigos ES 14.005.000 exacto. El unico control externo del trabajo
  // —el unico numero que el OS no produjo— mentia en el caso mas normal de todos: «el mes».
  console.log('\n  CONTRA EL TOTAL QUE ESCRIBIÓ LA PLANILLA')
  let sumaTestigos = 0
  let todosConTestigo = testigos.length > 0
  for (const t of testigos) {
    if (!t.testigo) {
      todosConTestigo = false
      console.log(`    bloque ${t.bloque}: sin «TOTAL MO» — este total no se puede contrastar`)
      continue
    }
    sumaTestigos += t.testigo.valor
    const leido = r.filas.filter((f) => f.bloque === t.bloque).reduce((a, f) => a + (f.jornal ?? 0), 0)
    const d = leido - t.testigo.valor
    const marca = !t.cubierto ? '— ventana parcial, no comparable' : Math.abs(d) < 1 ? '✓' : '✗'
    console.log(`    bloque ${t.bloque}: ${t.testigo.celda} = ${$(t.testigo.valor)} · OS ${$(leido)} · diferencia ${$(d)} ${marca}`)
  }
  if (todosConTestigo && testigos.every((x) => x.cubierto) && testigos.length > 1) {
    const d = r.control.jornalTotal - sumaTestigos
    console.log(`    suma de los ${testigos.length} testigos = ${$(sumaTestigos)} · OS ${$(r.control.jornalTotal)} · diferencia ${$(d)} ${Math.abs(d) < 1 ? '✓' : '✗'}`)
  }

  console.log('\n  EL RESUMEN DE LA PLANILLA, POR BLOQUE')
  for (const a of auditorias) {
    const partes = []
    if (!a.verificable) partes.push('NO VERIFICABLE')
    for (const e of a.erroresDeRotulo) partes.push(`✗ «${e.rotulo}» busca a ${e.cliente} que las filas escriben ${e.rotuloEnFilas.map((x) => `«${x}»`).join('/')} — esconde ${$(e.jornalEscondido)}`)
    for (const f of a.faltantes) partes.push(`✗ «${f.rotulo}» está cargado (${$(f.jornal)}) y el resumen no lo busca`)
    for (const n of a.noLegibles) partes.push(`? ${n.formulaEn} no se pudo leer (${n.motivo})`)
    for (const h of a.huerfanos) partes.push(`? «${h.rotulo}» sin clasificar (${h.clase})`)
    const estado = a.sinActividad.length ? ` · sin actividad: ${a.sinActividad.map((s) => s.rotulo).join(', ')}` : ''
    console.log(`    bloque ${a.bloque}: ${partes.length ? partes.join('\n      ') : '✓ el resumen llega a todos los clientes cargados'}${estado}`)
  }
  console.log('')
}

async function main() {
  const opt = argumentos(process.argv.slice(2))
  const op = await operadorPara()
  if (!op) throw new Error('no hay cuenta de Google autorizada para leer JORNALES')
  const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
  const grid = await google.readSheetGrid(JORNALES_FILE_ID, `'${opt.pestana}'!A1:AC990`)
  if (!grid?.filas?.length) throw new Error(`la pestaña «${opt.pestana}» se leyó vacía`)

  const mapa = await cargarMapaClientes({ fuente: 'JORNALES' })
  const r = costoPorObra(grid, { desde: opt.desde, hasta: opt.hasta, mapa, factorCargas: opt.cargas, anio: opt.anio })
  const enVentana = bloquesDeLaVentana(grid, opt)
  const testigos = enVentana.map(({ bloque, hastaFila, fechas }) => ({
    bloque: bloque.fila1,
    testigo: testigoTotalMo(grid, bloque.fila + 1, hastaFila),
    // El testigo suma el bloque ENTERO. Sólo es comparable si la ventana lo cubre entero: con una
    // ventana parcial la diferencia marca ✗ sin que haya un solo defecto.
    cubierto: (fechas?.length ?? 0) === (bloque.fechas?.length ?? 0),
  }))
  const auditorias = enVentana.map(({ bloque, hastaFila, bloques }) => ({
    bloque: bloque.fila1,
    ...auditarResumenPorCliente(grid, bloque, { hastaFila, bloques, mapa }),
  }))

  if (opt.json) console.log(JSON.stringify({ ...r, testigos, auditorias, mapaLeido: mapa.leido, mapaMotivo: mapa.motivo }, null, 2))
  else imprimir(r, testigos, auditorias, mapa)

  // Sale con error cuando el número no se puede presentar como el costo: sin mapa no hay
  // atribución, con solapes el total está inflado y sin cuadre hay plata sin nombre.
  const ok = r.control.verificable && r.control.cuadra && r.control.ventanaConsistente
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(2) })
