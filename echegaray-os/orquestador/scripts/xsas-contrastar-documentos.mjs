#!/usr/bin/env node
// EL CONTRATO Y LAS MEMORIAS CONTRA LO QUE EL MOTOR LEYÓ DE LOS PLANOS.
//
//   node orquestador/scripts/xsas-contrastar-documentos.mjs quattropani
//   node orquestador/scripts/xsas-contrastar-documentos.mjs quattropani --con-computo=<archivo.json>
//
// ═══ EL DOCUMENTO RESERVADO NO ENTRA COMO INSUMO: ENTRA COMO CONTROL ═══
//
// `partirDocumentos` deja el CONTRATO y las MEMORIAS afuera de la primera pasada a propósito: leer
// el contrato antes de computar es leer la respuesta, y una cotización armada así no prueba nada.
// Esa reserva es correcta y este comando NO la rompe — la usa: corre la ingesta con los MISMOS
// insumos de siempre y recién después abre los documentos reservados para contrastarlos.
//
// Y por eso el resultado de acá NUNCA vuelve al cómputo solo. Es una lista de confirmaciones,
// coincidencias, conflictos y aportes para que alguien decida.
//
// ═══ CERO CLAUDE ═══
//
// No se segmentan láminas ni se mira ninguna imagen: `planosLegibles: []`. Lo que se cruza es lo
// DETERMINÍSTICO —la geometría del CAD y el texto de los documentos—, que es justamente la parte que
// tiene que seguir funcionando sin saldo. Lo que el motor lee MIRANDO una lámina no está en este
// contraste, y eso queda dicho en la salida en vez de disimulado.
import fs from 'node:fs'
import { closePool, query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { carpetaRaiz, documentosDelProyecto } from '../lib/plano/pipeline.mjs'
import { partirDocumentos } from '../lib/plano/documentos.mjs'
import { claseDocumental, ingerir } from '../lib/plano/documental.mjs'
import { consolidar } from '../lib/plano/proyecto.mjs'
import { FORMATO, formatoDe } from '../lib/ingesta/registro.mjs'
import { leerWord } from '../lib/ingesta/word.mjs'
import { leerDocumentoDeProyecto } from '../lib/conocimiento/documento-proyecto.mjs'
import { CRUCE, contrastar } from '../lib/conocimiento/contrastar-documento.mjs'
import { pathToFileURL } from 'node:url'

// ═══ IMPORTAR ESTE ARCHIVO NO PUEDE SALIR A DRIVE NI MATAR EL PROCESO ═══
// Sin la guarda del pie, `import()` corría el contraste entero. Y peor que eso: el `process.exit(1)`
// de abajo corría en tiempo de IMPORT, así que un chequeo de link sobre este módulo mataba el
// proceso sin decir por qué. Mismo defecto de 465b14f1, ya cerrado en los otros tres scripts.
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
const args = process.argv.slice(2)
const termino = args.find((a) => !a.startsWith('--'))
if (ejecutadoDirecto && !termino) { console.error('uso: xsas-contrastar-documentos.mjs <termino> [--con-computo=<archivo.json>]'); process.exit(1) }
const rutaComputo = args.find((a) => a.startsWith('--con-computo='))?.split('=').slice(1).join('=') ?? null

/** Los ítems del cómputo con los que se buscan choques de alcance. Cuando no se pasa ninguno se dice
 *  —y el conteo de choques vale 0 porque no había con qué chocar, no porque no haya choques. */
function itemsDelComputo(ruta) {
  if (!ruta) return { items: [], porQue: 'no se pasó ningún cómputo: los choques de alcance no se pueden buscar y el 0 de esa fila NO significa que no los haya' }
  const d = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  const items = (d.computo?.items ?? d.items ?? []).map((i) => ({ descripcion: i.descripcion ?? i.elemento ?? i.nombre, ...i }))
  return { items, porQue: `${items.length} ítem(s) de ${ruta}` }
}

async function main() {
  const filas = await documentosDelProyecto({ query }, termino)
  const raiz = carpetaRaiz(filas)
  const { insumos, reservados } = partirDocumentos(filas, { carpetaObra: raiz })
  const google = makeGoogleClient({})

  console.log(`\n═══ ${termino.toUpperCase()} · EL DOCUMENTO CONTRA EL PLANO ═══\n`)
  console.log(`${filas.length} documento(s) · ${insumos.length} insumo(s) · ${reservados.length} reservado(s) para validar`)

  // 1. Lo que el motor lee SIN mirar ninguna lámina: la geometría del CAD y el texto de los insumos.
  const ingesta = await ingerir({ google, insumos, planosLegibles: [], escribirTemporal: null, logger: null })
  const proyecto = consolidar(ingesta.hechos)
  console.log(`\n── LO QUE EL MOTOR LEYÓ (sin modelo) ──`)
  console.log(`  ${ingesta.resumen}`)
  console.log(`  ${proyecto.total} hecho(s) consolidados · ${proyecto.conflictos.length} conflicto(s) internos del motor`)
  for (const n of ingesta.noLeidos) console.log(`  SIN LEER  ${n.archivo} — ${String(n.porQue).slice(0, 110)}`)

  // 2. Los documentos RESERVADOS de Word: el contrato y las memorias.
  const word = reservados.filter((d) => formatoDe({ nombre: d.name, mime: d.mime_type }) === FORMATO.DOCUMENTO)
  console.log(`\n── LOS DOCUMENTOS RESERVADOS QUE SE LEEN PARA CONTRASTAR ──`)
  const lecturas = []
  for (const d of word) {
    const bytes = String(d.mime_type ?? '').startsWith('application/vnd.google-apps')
      ? await google.exportarBytesComo(d.drive_file_id, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      : await google.descargarBytes(d.drive_file_id)
    const w = leerWord(bytes, { nombre: d.name })
    if (!w.ok) { console.log(`  ✗ ${d.name} — ${w.porQue.slice(0, 110)}`); continue }
    const l = leerDocumentoDeProyecto(w.texto, { documento: d.name, clase: claseDocumental(d.name), tablas: (w.bloques ?? []).filter((b) => b.tipo === 'tabla') })
    lecturas.push(l)
    console.log(`  · ${d.name} — ${l.resumen}`)
  }

  const { items, porQue } = itemsDelComputo(rutaComputo)
  const r = contrastar({ hechosDelMotor: ingesta.hechos, lecturas, itemsDelComputo: items })

  console.log(`\n── EL CONTRASTE ──\n  ${r.resumen}`)
  console.log(`  cómputo usado para los choques de alcance: ${porQue}`)
  for (const c of r.cruces.filter((x) => x.cruce === CRUCE.CONFLICTO)) console.log(`\n  CONFLICTO   ${c.que}\n              ${c.porQue}`)
  for (const c of r.cruces.filter((x) => x.cruce === CRUCE.CONFIRMA_MEDIDO)) console.log(`  CONFIRMA    ${c.que} = ${c.documento.valor} — ${c.porQue}`)
  for (const c of r.cruces.filter((x) => x.cruce === CRUCE.COINCIDE_CON_INFERENCIA)) console.log(`  COINCIDE*   ${c.que} = ${c.documento.valor} — ${c.porQue}`)
  for (const c of r.cruces.filter((x) => x.cruce === CRUCE.SOLO_MENCIONES)) console.log(`  MENCIONES   ${c.que} — ${c.porQue}`)
  for (const c of r.alcance) console.log(`\n  ALCANCE     ${c.porQue}`)
  for (const g of r.terminosGenericos) console.log(`  (descartado «${g.termino}»: ${g.porQue})`)

  console.log(`\n── LO QUE EL DOCUMENTO APORTA Y EL PLANO NO DICE ──`)
  const aportes = r.cruces.filter((x) => x.cruce === CRUCE.APORTA)
  for (const a of aportes.slice(0, 40)) console.log(`  ${a.que} = ${a.documento.valor}   «${String(a.documento.textoLiteral).slice(0, 110)}»`)
  if (aportes.length > 40) console.log(`  … y ${aportes.length - 40} más`)

  console.log(`\n── LO QUE ESTE CONTRASTE NO MIRÓ ──`)
  console.log('  · las láminas PDF: leerlas exige el modelo de visión y este comando corre con Claude = 0')
  console.log(`  · por lo tanto el cómputo por vistas no está acá${rutaComputo ? '' : ', y sin --con-computo tampoco hay con qué buscar choques de alcance'}`)
}

if (ejecutadoDirecto) {
  main().then(() => closePool()).then(() => process.exit(0))
    .catch((e) => { console.error('ERROR:', e.message, e.stack); process.exit(1) })
}
