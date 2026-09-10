#!/usr/bin/env node
// LOS PROVEEDORES QUE EL DUEÑO PIDIÓ DAR DE ALTA EN EL PADRÓN. NO TOCA EL SHEET.
//
// Decisión del dueño del 10/09/2026: «dá de alta; buscá en mi mail si no encontrás paridad con
// algún proveedor». Los tres de abajo los nombró él con CUIT; los dos primeros tenían
// transferencias en el mail sin ficha de dónde colgarse, y por eso después de esto corre
// `gmail-transferencias-proveedores.mjs --aplicar`.
//
// EL CUIT ES LA IDENTIDAD (`lib/comprobantes/alta-padron.mjs` explica por qué se valida el dígito
// verificador antes de crear nada). A.C.SAT es el caso que lo justifica: la visión leyó
// 30-71965694-4 en su factura y ese CUIT no existe —el DV no cierra—; el que cierra es el que
// escribió el dueño. La identidad comercial la confirma su propio mail: «Factura RSV» de
// noresponder@avisos.rsvonline.com.ar, que es la fila 783 de Compras anotada «RSV».
//
//   node orquestador/scripts/alta-proveedores-padron.mjs [--dry]

import { query, closePool } from '../lib/db.mjs'
import { planDeAltas, ALTA } from '../lib/comprobantes/alta-padron.mjs'

const DRY = process.argv.includes('--dry')

export const PEDIDOS = [
  { nombre: 'A.C.SAT S.R.L.', razon_social: 'A.C.SAT S.R.L.', cuit: '30-71096504-4',
    fuente: 'dueño 10/09/2026 · su mail confirma AC SAT = RSV Online (hilo «Factura RSV»)',
    notas: 'RSV Online — monitoreo GPS de la flota. Facturas anotadas «RSV» en Compras (fila 783).' },
  { nombre: 'DATA 2000 S.A.', razon_social: 'DATA 2000 S.A.', cuit: '30-99907064-3',
    fuente: 'dueño 10/09/2026 · transferencias en el mail sin ficha donde colgarse', notas: null },
  { nombre: 'Clavero Rogelio e Hijos S.H.', razon_social: 'CLAVERO ROGELIO E HIJOS SOC. DE HECHO', cuit: '30-54958171-0',
    fuente: 'dueño 10/09/2026 · comprobante 0014-00012010 (fila 942)',
    notas: 'Axion Servicentro del Valle — en Compras aparece como «AXION SERVICENTRO MEDIA AGUA».' },
]

async function main() {
  const { rows: padron } = await query('select id, nombre, cuit from public.proveedores')
  const plan = planDeAltas(PEDIDOS, padron)
  for (const p of plan) console.log(`${p.accion.padEnd(14)} ${p.nombre} · ${p.cuit ?? 'sin CUIT'}${p.existente ? ` (ya: ${p.existente})` : ''}`)
  if (DRY) { console.log(`\n[dry] ${plan.filter((p) => p.accion === ALTA.crear).length} alta(s)`); return }

  let creados = 0
  for (const p of plan) {
    if (p.accion !== ALTA.crear && p.accion !== ALTA.sin_cuit) continue
    await query(
      `insert into public.proveedores (nombre, razon_social, cuit, activo, notas)
       values ($1,$2,$3,true,$4)`,
      [p.nombre, p.razon_social ?? p.nombre, p.cuit,
        [p.notas, `alta: ${p.fuente}`, p.accion === ALTA.sin_cuit ? 'SIN CUIT' : null].filter(Boolean).join(' · ')])
    creados++
  }
  console.log(`\n${creados} ficha(s) creada(s)`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(closePool)
