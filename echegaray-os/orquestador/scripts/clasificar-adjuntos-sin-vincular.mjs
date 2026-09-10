#!/usr/bin/env node
// LOS PAPELES DEL CANAL QUE NO CUELGAN DE NINGUNA FILA, REPARTIDOS EN LAS TRES LISTAS QUE IMPORTAN.
//
// «Faltan 35» manda a cargar 35 gastos, y la mayoría ya está cargada: son el mismo fajo reenviado.
// Este script separa, con la evidencia YA guardada (la lectura del bot o la del repaso con visión),
// qué papel es una copia de uno que ya está a la vista, cuál es de un gasto que SÍ está en Compras
// pero anotado con otra clave, y cuál puede ser un gasto sin cargar.
//
// SÓLO LECTURA: no baja, no sube, no lee con el modelo, no toca el Sheet y no escribe un vínculo.
// Lo que decide es una persona — la lista es para que pueda decidir mirando el papel.
//
//   node orquestador/scripts/clasificar-adjuntos-sin-vincular.mjs [--json]

import { query, closePool } from '../lib/db.mjs'
import { lecturaPorArchivo } from './vincular-adjuntos-huerfanos.mjs'
import { claveComprobante } from '../lib/comprobantes/lectura.mjs'
import { clasificarSueltos, CLASE, ORDEN, QUE_HACER } from '../lib/comprobantes/papel-sin-vincular.mjs'

const pesos = (n) => (Number.isFinite(Number(n)) ? `$${Number(n).toLocaleString('es-AR')}` : '-')

async function main() {
  const [{ rows: sueltos }, { rows: fajos }, { rows: vinculados }, { rows: espejo }, { rows: edad }] = await Promise.all([
    query(`select id, origen_file_id, origen_post_id, nombre, lectura, creado_at
             from public.compra_adjunto where compra_clave is null and origen_file_id is not null
            order by creado_at`),
    query('select items, filas from comunicacion.comprobante_fajos'),
    query(`select a.compra_clave, a.fila_compras, s.proveedor
             from public.compra_adjunto a
             left join public.compra_sheet s on s.clave = a.compra_clave
            where a.compra_clave is not null`),
    query('select fila, clave, proveedor, total::float8 total from public.compra_sheet where clave is not null'),
    query('select max(sincronizado_en) sync from public.compra_sheet'),
  ])

  const porArchivo = lecturaPorArchivo(fajos)
  const papeles = sueltos.map((s) => {
    // LAS DOS LECTURAS CUENTAN. La del bot vive en el fajo; la del repaso con visión, en el adjunto.
    // Mirar sólo una hace que un papel recién leído vuelva a salir «nadie lo leyó».
    const l = porArchivo.get(String(s.origen_file_id))
    const propia = s.lectura ? claveComprobante(s.lectura) : null
    return {
      file_id: String(s.origen_file_id), post_id: s.origen_post_id, nombre: s.nombre,
      fecha: s.creado_at?.toISOString?.().slice(0, 10) ?? null,
      clave: l?.clave ?? propia?.clave ?? null,
      proveedor: l?.proveedor ?? s.lectura?.proveedor ?? null,
      total: l?.total ?? (Number.isFinite(Number(s.lectura?.total)) ? Number(s.lectura.total) : null),
      motivoSinLectura: s.lectura ? 'se leyó el papel y no dice número ni CUIT' : 'nadie leyó el papel',
    }
  })

  const r = clasificarSueltos({ papeles, vinculados, espejo })
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); await closePool(); return }

  console.log(`espejo compra_sheet sincronizado ${edad[0].sync?.toISOString?.() ?? edad[0].sync}`)
  console.log(`papeles guardados sin vínculo: ${r.total}\n`)
  for (const c of ORDEN) console.log(`  ${c.padEnd(12)}${String(r.resumen[c]).padStart(3)}   ${QUE_HACER[c]}`)
  console.log(`\ngastos distintos detrás de otra_clave + no_esta: ${r.gastosDistintos}`)

  for (const c of ORDEN) {
    const suyos = r.filas.filter((f) => f.clase === c)
    if (!suyos.length) continue
    console.log(`\n══ ${c.toUpperCase()} (${suyos.length}) — ${QUE_HACER[c]}`)
    for (const f of suyos) {
      console.log(`  ${f.fecha} ${f.nombre} · ${f.clave ?? 'sin clave'} · ${f.proveedor ?? '-'} · ${pesos(f.total)}`)
      console.log(`      post ${f.post_id} · ${f.motivo}`)
      for (const k of f.candidatas) {
        console.log(`      candidata: fila ${k.fila} · ${k.proveedor ?? '-'} · ${k.clave} · ${pesos(k.total)}`
          + `${k.coincideTotal ? ' · MISMO IMPORTE' : ''}${k.coincideProveedor ? ' · mismo proveedor' : ''}`)
      }
    }
  }
  console.log(`\n══ LOS GASTOS DISTINTOS (${r.gastosDistintos}) — esto es lo que hay que decidir, no ${r.resumen[CLASE.OTRA_CLAVE] + r.resumen[CLASE.NO_ESTA]} archivos`)
  for (const g of r.porGasto) {
    console.log(`  [${g.clase}] ${g.clave} · ${g.proveedor ?? '-'} · ${pesos(g.total)} · ${g.copias} archivo(s)`)
    for (const k of g.candidatas) console.log(`      candidata: fila ${k.fila} · ${k.proveedor ?? '-'} · ${pesos(k.total)}${k.coincideTotal ? ' · MISMO IMPORTE' : ''}`)
  }

  console.log(`\nNada de esto se carga solo: ${r.resumen[CLASE.NO_ESTA]} papeles podrían ser gastos sin cargar y los decide el dueño.`)
  await closePool()
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    console.error('clasificar-adjuntos-sin-vincular falló:', e.message)
    await closePool().catch(() => {}); process.exit(1)
  })
}
