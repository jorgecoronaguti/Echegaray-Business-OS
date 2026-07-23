#!/usr/bin/env node
// ¿HAY UNA FACTURA CARGADA DOS VECES EN "Compras"? — EL CONTROL SOBRE LO QUE YA ESTÁ CARGADO.
//
// El cruce de `cargar-comprobantes-compras.mjs` mira el fajo que ENTRA. Éste mira lo que YA ESTÁ:
// agrupa las filas que comparten proveedor + N° de comprobante y le pregunta a ARCA quién tiene
// razón. La regla vive en lib/compras-duplicados.mjs — acá no se decide nada, sólo se lee y se
// muestra.
//
// NO BORRA NI PISA NINGUNA FILA. `Compras` es carga manual del dueño: el OS informa y, con
// --marcar, agrega UNA columna propia («¿Comprobante repetido? (OS)») con una ARRAYFORMULA viva
// que señala el N° repetido de acá en adelante. Ningún dato del dueño se toca.
//
//   node orquestador/scripts/auditar-duplicados-compras.mjs           # informe
//   node orquestador/scripts/auditar-duplicados-compras.mjs --marcar  # + la columna del OS

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { resolverColumnas, letra } from '../lib/compras-columnas.mjs'
import {
  claveComprobante, agrupar, veredicto, resumen, formulaMarca,
  valoresQueRompenCountifs, COL_MARCA,
} from '../lib/compras-duplicados.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const MARCAR = process.argv.includes('--marcar')

/** Los encabezados que este control necesita. Se piden POR NOMBRE: el dueño mueve columnas. */
const NOMBRES = {
  fecha: 'Fecha factura', proveedor: 'Proveedor', numero: 'N° Comprobante',
  unidad: 'Unidad de Negocio', obra: 'Cliente / Asignación',
  neto: 'Importe', iva: 'IVA', total: 'Total',
}

const aNumero = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[^\d.,-]/g, '')
  if (!s) return 0
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Serial de Sheets (o dd/mm/yyyy) → 'YYYY-MM-DD'. Sirve para saber si una fila es posterior al
 *  corte de ARCA, que es lo único que decide si el fisco puede opinar. */
export function aISO(v) {
  if (typeof v === 'number' && v > 0) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(String(v ?? '').trim())
  if (!m) return ''
  const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
  return `${a}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: MARCAR ? WRITE_SCOPES : undefined })
  const [enc, datos, arca] = await Promise.all([
    google.readSheetValues(ID, 'Compras!A3:BZ3'),
    // UNFORMATTED_VALUE, no el valor formateado: el Sheet MUESTRA el IVA redondeado a pesos y leer
    // lo que se ve daba diferencias de centavos que se acumulaban en el veredicto. Se lee el número.
    google.readSheetValues(ID, 'Compras!A4:BZ', { render: 'UNFORMATTED_VALUE' }),
    query(`select punto_venta, numero, tipo_comprobante, emisor_nombre, fecha_emision,
                  imp_total::float8 imp_total, neto_gravado::float8 neto_gravado, total_iva::float8 total_iva
             from comprobantes_arca where tipo_libro = 'R'`).then((r) => r.rows).catch(() => []),
  ])
  const { idx, faltan } = resolverColumnas(enc[0] || [], NOMBRES)
  if (faltan.length) {
    console.error(`✖ Compras no tiene estas columnas: ${faltan.join(' · ')}. El control NO corre a ciegas.`)
    process.exitCode = 1; await closePool(); return
  }

  const filas = datos.map((r, i) => ({
    fila: i + 4,
    proveedor: String(r[idx.proveedor] ?? '').trim(),
    numero: String(r[idx.numero] ?? '').trim(),
    fechaISO: aISO(r[idx.fecha]),
    obra: [r[idx.unidad], r[idx.obra]].map((x) => String(x ?? '').trim()).filter(Boolean).join(' / '),
    neto: aNumero(r[idx.neto]), iva: aNumero(r[idx.iva]), total: aNumero(r[idx.total]),
  })).filter((f) => f.proveedor || f.total)

  // ARCA por clave canónica. El corte es la última emisión sincronizada: después de esa fecha,
  // "no está en ARCA" no prueba nada y el control lo dice en vez de acusar.
  const porClave = new Map()
  for (const a of arca) porClave.set(claveComprobante(a.punto_venta, a.numero), a)
  const corteArca = arca.reduce((m, a) => {
    const d = a.fecha_emision?.toISOString?.().slice(0, 10) || ''
    return d > m ? d : m
  }, '')

  const grupos = agrupar(filas)
  const vs = grupos.map((g) => {
    const a = porClave.get(claveComprobante(g.numero)) || null
    return { ...g, ...veredicto(g, a, { corteArca }), arca: a }
  })

  const sinNumero = filas.filter((f) => !f.numero).length
  console.log(`Compras: ${filas.length} filas · ${sinNumero} SIN N° de comprobante (fuera del alcance de este control)`)
  console.log(`ARCA (libro de compras): ${arca.length} comprobantes, sincronizado hasta ${corteArca || '(desconocido)'}\n`)

  const ORDEN = ['doble_conteo', 'exceso_sin_explicar', 'carga_incompleta', 'no_concluyente', 'factura_partida']
  const ICONO = { doble_conteo: '✖ DOBLE CONTEO', exceso_sin_explicar: '⚠ EXCESO SIN EXPLICAR', carga_incompleta: '⚠ CARGA INCOMPLETA', no_concluyente: '· no concluyente', factura_partida: '✔ factura partida' }
  for (const tipo of ORDEN) {
    const l = vs.filter((v) => v.veredicto === tipo)
    if (!l.length) continue
    console.log(`\n═══ ${ICONO[tipo]} (${l.length}) ═══`)
    for (const v of l) {
      console.log(`  filas ${v.filas.join('/')} · ${v.proveedor} N° ${v.numero} · Sheet: Importe $${v.neto.toLocaleString('es-AR')} + IVA $${v.iva.toLocaleString('es-AR')} = Total $${v.total.toLocaleString('es-AR')}${v.arca ? ` · ARCA: neto $${v.arca.neto_gravado.toLocaleString('es-AR')} + IVA $${v.arca.total_iva.toLocaleString('es-AR')} (imp_total $${v.arca.imp_total.toLocaleString('es-AR')})` : ''}`)
      console.log(`     ${v.motivo}`)
      if (v.senales?.length) console.log(`     señales: ${v.senales.join(' · ')}`)
      if (v.veredicto === 'doble_conteo') console.log(`     obras: ${[...new Set(v.items.map((i) => i.obra))].join(' · ')}`)
    }
  }

  const r = resumen(vs)
  console.log(`\n═══ RESUMEN ═══`)
  console.log(`  grupos con N° repetido: ${r.grupos}`)
  console.log(`  facturas partidas (están bien): ${r.partidas}`)
  console.log(`  DOBLE CONTEO probado por ARCA: ${r.dobleConteo}  ·  exceso sin explicar: ${r.excesoSinExplicar}`)
  console.log(`  COSTO de más: $${r.plataDeMas.toLocaleString('es-AR')}  ·  IVA crédito de más: $${r.ivaDeMas.toLocaleString('es-AR')}`)
  console.log(`  falta cargar (el Sheet suma menos que ARCA): $${r.faltaCargar.toLocaleString('es-AR')}`)
  console.log(`  no concluyentes (hay que mirar el papel): ${r.noConcluyentes}`)

  if (MARCAR) await marcar(google, enc[0] || [], filas)
  else console.log(`\n(--marcar agrega la columna «${COL_MARCA}» con la fórmula viva. Ninguna fila del dueño se toca.)`)
  await closePool()
}

/** Agrega/actualiza la columna del OS. Sólo encabezado + ARRAYFORMULA: cero números pegados, cero
 *  filas del dueño tocadas. Si la columna ya existe, se reescribe la misma — no se agrega otra. */
async function marcar(google, encabezado, filas) {
  const rompen = valoresQueRompenCountifs(filas)
  if (rompen.length) {
    console.error(`\n✖ NO se escribe la fórmula: ${rompen.length} fila(s) tienen * ? o ~ en Proveedor/N°.`)
    console.error(`  COUNTIFS los tomaría como comodines y devolvería un número MAL sin avisar. Filas: ${rompen.map((x) => x.fila).join(', ')}`)
    process.exitCode = 1
    return
  }
  const { idx } = resolverColumnas(encabezado, { prov: 'Proveedor', num: 'N° Comprobante' })
  let destino = encabezado.findIndex((c) => String(c ?? '').trim() === COL_MARCA)
  if (destino < 0) {
    destino = encabezado.length
    while (String(encabezado[destino - 1] ?? '').trim() === '') destino--
  }
  const L = letra(destino)
  const formula = formulaMarca({ prov: letra(idx.prov), num: letra(idx.num) })
  // La grilla tiene que alcanzar ANTES de escribir: Compras termina exactamente en la última
  // columna usada, así que la primera columna del OS cae fuera y el batch falla entero.
  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === 'Compras')
  if ((hoja?.cols ?? 0) <= destino) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: {
        properties: { sheetId: hoja.sheetId, gridProperties: { columnCount: destino + 1 } },
        fields: 'gridProperties.columnCount',
      },
    }])
  }
  await google.batchUpdateValues(ID, [
    { range: `Compras!${L}3`, values: [[COL_MARCA]] },
    { range: `Compras!${L}4`, values: [[formula]] },
  ])
  // Verificar: una ARRAYFORMULA que no derrama devuelve un valor y nadie se entera.
  const check = await google.readSheetValues(ID, `Compras!${L}3:${L}`)
  const marcadas = check.slice(1).filter((r) => String(r[0] ?? '').includes('repetido')).length
  console.log(`\n✔ Columna «${COL_MARCA}» en ${L}. Derrama sobre ${check.length - 1} filas · ${marcadas} marcadas como N° repetido.`)
  if (/#(ERROR|REF|N\/A|VALUE|NAME)/i.test(check.slice(1).map((r) => r[0]).join(' '))) {
    console.error('✖ La fórmula quedó en error. Revisar el separador es-AR (;) antes de confiar en la columna.')
    process.exitCode = 1
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
