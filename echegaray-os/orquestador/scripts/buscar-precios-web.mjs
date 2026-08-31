#!/usr/bin/env node
// LA CAMPAÑA AUTÓNOMA DE PRECIOS — XSAS sale a buscar solo, por orden de plata en riesgo.
//
//   node orquestador/scripts/buscar-precios-web.mjs --cotizacion <uuid>          # informe, no escribe
//   node orquestador/scripts/buscar-precios-web.mjs --cotizacion <uuid> --top 4  # sólo los N primeros
//   node orquestador/scripts/buscar-precios-web.mjs --cotizacion <uuid> --observar   # guarda las OBSERVACIONES
//   node orquestador/scripts/buscar-precios-web.mjs --cotizacion <uuid> --aplicar    # + escribe el catálogo
//   node orquestador/scripts/buscar-precios-web.mjs --cotizacion <uuid> --ensayo     # aplica y HACE ROLLBACK
//
// ═══ POR QUÉ NO CORRE SOBRE EL CATÁLOGO ENTERO ═══
//
// Buscar el precio de los 406 recursos son 406 búsquedas y unas 3.000 lecturas de página, para
// resolver un catálogo donde el 90% de la plata está en veinte ítems. La campaña se corre SOBRE UNA
// COTIZACIÓN porque la materialidad sólo existe ahí: fuera de una oferta el tornillo y el panel
// pesan lo mismo, que es nada.
//
// ═══ LO QUE ESTE SCRIPT NO PUEDE HACER, POR DISEÑO ═══
//
// No congela nada, no firma nada y no escribe el catálogo sin `--aplicar`. Con `--aplicar` escribe
// SÓLO lo que la governance haya autorizado por REGLA — que hoy, con la política sin aprobar, es
// nada material. Eso no es una falla del mecanismo: es el mecanismo diciendo que le falta una firma.
// `--ensayo` corre el camino de escritura entero dentro de una transacción y la revierte: prueba que
// el `--aplicar` funciona sin tocar producción.

import { getPool } from '../lib/db.mjs'
import { leerUrl } from '../lib/web/web-lectura.mjs'
import { resolverCatalogo, pesosDeCotizacion } from '../lib/cotizador/precio-fuentes.pg.mjs'
import { riesgoDeRecurso, priorizar } from '../lib/cotizador/precio-materialidad.mjs'
import { buscador, observarPrecioWeb, consultasDeEspecificacion } from '../lib/cotizador/precio-buscador-web.mjs'
import { observarEnCatalogos, PROVEEDORES } from '../lib/cotizador/precio-catalogo-proveedor.mjs'
import { seleccionar, aplicar } from '../lib/cotizador/precio-observacion.mjs'
import { poderDeObservacion, autorizacion, PODER, POLITICA_WEB } from '../lib/cotizador/precio-governance.mjs'
import { guardarObservaciones, aplicarObservacion } from '../lib/cotizador/precio-observacion.pg.mjs'

const args = process.argv.slice(2)
const tiene = (f) => args.includes(f)
const valor = (f, d = null) => (tiene(f) ? args[args.indexOf(f) + 1] ?? d : d)
const $ = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** La regla de selección, versionada. Va escrita al lado de cada precio que elija. */
const REGLA_SELECCION = Object.freeze({ id: 'JERARQUIA_FUENTE', version: 1 })

/** La alícuota con la que se netea un precio publicado con IVA. Es un dato de la empresa, no una
 *  suposición del módulo: si no se pasa, un precio CON IVA no se puede netear y no produce
 *  observación — que es lo correcto. */
const ALICUOTA_IVA = Number(process.env.ORQ_ALICUOTA_IVA ?? 0.21)

async function main() {
  const cotizacionId = valor('--cotizacion')
  if (!cotizacionId) { console.error('falta --cotizacion <uuid>: la materialidad sólo existe dentro de una oferta'); process.exit(2) }
  const top = Number(valor('--top', 6))
  const objetivo = Number(valor('--objetivo', 0.92))
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)
  const hoy = new Date()

  const { pesos, total, porQue } = await pesosDeCotizacion({ query }, cotizacionId)
  console.log('═'.repeat(96))
  console.log('CAMPAÑA AUTÓNOMA DE PRECIOS · XSAS busca solo, por orden de plata en riesgo')
  console.log(`cotización ${cotizacionId} · ${porQue}`)
  console.log('═'.repeat(96))

  const { resoluciones } = await resolverCatalogo({ query }, { pesos, codigos: Object.keys(pesos), hoy })
  const bloqueados = resoluciones.filter(({ resolucion }) => resolucion.resultado !== 'VIGENTE')
  const riesgos = bloqueados.map(({ recurso, resolucion }) => ({
    ...riesgoDeRecurso({ recurso, resolucion, impacto: (pesos[recurso.codigo] ?? 0) * total, hoy }),
    recurso, resolucion,
  }))
  const plan = priorizar(riesgos, { objetivo, tope: top })

  console.log(`  bloqueados                 ${String(bloqueados.length).padStart(5)} de ${resoluciones.length}`)
  console.log(`  riesgo económico medido    $${$(plan.riesgoTotal)}`)
  console.log(`  se van a consultar         ${String(plan.elegidos.length).padStart(5)}   ${plan.porQue}`)
  if (plan.noMedidosPorQue) console.log(`  NO MEDIDO                  ${String(plan.noMedidos.length).padStart(5)}   ${plan.noMedidosPorQue}`)
  console.log('─'.repeat(96))

  const buscar = buscador({})
  const leer = (u) => leerUrl(u)
  const salida = []

  for (const item of plan.elegidos) {
    const r = riesgos.find((x) => x.codigo === item.codigo)
    console.log(`\n▸ ${item.codigo}  ${String(r.recurso.nombre).slice(0, 56)}`)
    console.log(`   ${r.porQue}`)

    // ═══ EL ORDEN ES LA JERARQUÍA, NO UNA OPTIMIZACIÓN ═══
    //
    // El catálogo del proveedor es nivel 4 y el buscador general nivel 5. Se prueba el fuerte
    // primero y, si contesta, NO se baja el escalón: bajar sin necesidad degrada la procedencia de
    // un número que ya teníamos con mejor respaldo, y esa degradación no se ve en el total.
    const cat = await observarEnCatalogos({ recurso: r.recurso, terminos: terminosDeCatalogo(r.recurso), hoy })
    for (const p of cat.recorrido) {
      console.log(`   · catálogo ${String(p.proveedor).padEnd(9)} «${p.termino}» → ${p.productos} producto(s), ${p.observaciones} observación(es)`)
      for (const d of p.descartes.slice(0, 3)) console.log(`       descarta ${d.motivo}: ${String(d.porQue).slice(0, 96)}`)
    }
    for (const o of cat.observaciones) console.log(`   · PRECIO    $${$(o.valor)} ${o.moneda}/${o.unidad}  ${String(o.descripcion).slice(0, 44)}  ${o.url}`)

    let web = { observaciones: [], recorrido: [], consultas: [], porQue: 'no hizo falta: el catálogo del proveedor ya contestó' }
    if (!cat.observaciones.length) {
      web = await observarPrecioWeb({ recurso: r.recurso, buscar, leer, alicuotaIva: ALICUOTA_IVA, hoy })
      console.log(`   consulta web: «${web.consultas[0]}»`)
      for (const p of web.recorrido) {
        if (p.paso === 'BUSCAR') console.log(`   · buscar   ${p.motor ?? 'ningún motor'} → ${p.encontradas} página(s)`)
        else console.log(`   · ${p.ok ? 'PRECIO   ' : 'descarta '} ${String(p.url).slice(0, 62)}${p.ok ? `  $${$(p.valor)} ${p.moneda} · ${p.autoridad}` : `  ${p.motivo ?? ''} ${String(p.porQue ?? '').slice(0, 70)}`}`)
      }
    }
    const observaciones = cat.observaciones.length ? cat.observaciones : web.observaciones
    salida.push({
      item, riesgo: r, via: cat.observaciones.length ? 'CATALOGO_PROVEEDOR' : 'BUSCADOR_WEB',
      web: { observaciones, recorrido: [...cat.recorrido, ...web.recorrido], consultas: web.consultas, porQue: cat.observaciones.length ? cat.porQue : web.porQue },
      veredicto: gobernar({ web: { observaciones }, material: true }),
    })
  }

  informar(salida)
  if (tiene('--observar') || tiene('--aplicar') || tiene('--ensayo')) await persistir({ pool, salida, cotizacionId })
  await pool.end()
}

/**
 * LOS TÉRMINOS CON LOS QUE SE LE PREGUNTA A UN CATÁLOGO. De más específico a más flojo.
 *
 * Un catálogo hace coincidencia literal sobre el título del producto: el nombre entero del recurso
 * («Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco») no está en ningún título y devuelve cero. Se
 * empieza por las tres primeras palabras con la medida principal y se va acortando.
 */
function terminosDeCatalogo(recurso) {
  const { spec } = consultasDeEspecificacion({ recurso })
  const nucleo = spec.termino.split(' ').filter((w) => !/^[\d.]+$/.test(w))
  const medida = spec.numeros[0] ?? spec.atributos[0]?.replace(/^d/, '') ?? null
  return [...new Set([
    medida ? `${nucleo.slice(0, 3).join(' ')} ${medida}` : null,
    nucleo.slice(0, 3).join(' '),
    nucleo.slice(0, 2).join(' '),
  ].filter((t) => t && t.trim().length > 3))]
}

/** La governance sobre TODAS las observaciones del recurso a la vez: las de otros dominios son las
 *  coincidencias que hacen falta para subir de escalón. */
function gobernar({ web, material }) {
  const [primera, ...resto] = web.observaciones
  if (!primera) return null
  return poderDeObservacion({
    observacion: primera, material,
    coincidencias: resto.map((o) => ({ url: o.url, valor: o.valor, moneda: o.moneda })),
    autoridad: primera.confianza,
  })
}

function informar(salida) {
  const conPrecio = salida.filter((s) => s.web.observaciones.length)
  const porCatalogo = conPrecio.filter((s) => s.via === 'CATALOGO_PROVEEDOR')
  const resuelven = salida.filter((s) => s.veredicto?.poder === PODER.RESOLVER)
  const proponen = salida.filter((s) => s.veredicto?.poder === PODER.PROPONER)
  console.log(`\n${'═'.repeat(96)}`)
  console.log('QUÉ CONSIGUIÓ XSAS SOLO')
  console.log('═'.repeat(96))
  console.log(`  consultados                        ${String(salida.length).padStart(4)}`)
  console.log(`  PRECIOS NUEVOS OBTENIDOS SOLO      ${String(conPrecio.length).padStart(4)}   (observaciones citables con URL, unidad, IVA y fecha)`)
  console.log(`    · vía catálogo de proveedor      ${String(porCatalogo.length).padStart(4)}   nivel 4 de la jerarquía: el que vende, con su URL de producto`)
  console.log(`    · que RESUELVEN                  ${String(resuelven.length).padStart(4)}   entran al costo y no frenan el congelado`)
  console.log(`    · que PROPONEN                   ${String(proponen.length).padStart(4)}   entran al costo y SÍ frenan el congelado: falta una firma`)
  console.log(`  siguen necesitando una persona     ${String(salida.length - conPrecio.length).padStart(4)}`)
  const riesgoTocado = conPrecio.reduce((a, s) => a + (s.riesgo.riesgo ?? 0), 0)
  const riesgoTotal = salida.reduce((a, s) => a + (s.riesgo.riesgo ?? 0), 0)
  console.log(`  riesgo económico alcanzado         $${$(riesgoTocado)} de $${$(riesgoTotal)} consultado`)
  console.log(`  política de precio web             ${POLITICA_WEB.id} v${POLITICA_WEB.version} · aprobada por ${POLITICA_WEB.aprobadaPor ?? 'NADIE TODAVÍA — el techo es PROPONER'}`)
  for (const s of salida) {
    const v = s.veredicto
    console.log(`\n  ${s.item.codigo}  ${v ? v.poder : 'SIN OBSERVACIÓN'}`)
    console.log(`      ${v ? v.porQue.slice(0, 180) : s.web.porQue.slice(0, 180)}`)
  }
}

/**
 * ESCRIBIR. Tres modos y ninguno se confunde con otro:
 *
 *   --observar  guarda las OBSERVACIONES (acto 1). No toca el catálogo. Es siempre seguro: una
 *               observación es un hecho del mundo, no una decisión sobre el costo.
 *   --ensayo    hace el camino entero de aplicación DENTRO de una transacción y la revierte. Es la
 *               prueba de que `--aplicar` funciona, sin producción de por medio.
 *   --aplicar   escribe de verdad, y sólo lo que la governance autorizó por REGLA.
 */
async function persistir({ pool, salida, cotizacionId }) {
  const cliente = await pool.connect()
  const ensayo = tiene('--ensayo')
  try {
    if (ensayo) await cliente.query('begin')
    const q = (s, p) => cliente.query(s, p)
    let obs = 0
    let aplicados = 0
    const rechazos = []
    for (const s of salida) {
      if (!s.web.observaciones.length) continue
      obs += (await guardarObservaciones({ query: q }, { observaciones: s.web.observaciones, cotizacionId })).length
      if (!(tiene('--aplicar') || ensayo)) continue
      const sel = seleccionar({ observaciones: s.web.observaciones, regla: REGLA_SELECCION })
      const auth = autorizacion({ observacion: sel.elegida, veredicto: s.veredicto })
      try {
        const acto = aplicar({ seleccion: sel, autorizacion: auth, destino: 'public.recurso_precio' })
        await aplicarObservacion({ query: q }, { recursoId: s.riesgo.recurso.id, acto })
        aplicados += 1
      } catch (e) {
        rechazos.push(`${s.item.codigo}: ${String(e.message).slice(0, 150)}`)
      }
    }
    console.log(`\n✓ observaciones guardadas: ${obs}`)
    if (tiene('--aplicar') || ensayo) {
      console.log(`✓ precios aplicados al catálogo: ${aplicados}`)
      for (const r of rechazos) console.log(`  ✗ NO aplicado — ${r}`)
    }
    if (ensayo) {
      await cliente.query('rollback')
      console.log('↩ ENSAYO: la transacción se revirtió. Nada de esto quedó en la base.')
    }
  } finally {
    if (ensayo) { try { await cliente.query('rollback') } catch { /* ya revertida */ } }
    cliente.release()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
