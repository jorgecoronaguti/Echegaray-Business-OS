#!/usr/bin/env node
// EL PLAN PARA QUE PROVEEDORES SE ACTUALICE SOLA — QUE SE MIRA ANTES DE ESCRIBIR NADA.
//
// ESTE SCRIPT NO ESCRIBE. No importa una sola función de escritura de `google.mjs`: sólo
// `readSheetValues`. Es a propósito y no es una formalidad — el 02/08 el dueño dio de baja al agente
// que mantenía el Sheet ("no quiero q nunca mas borre nada de lo q hice") y la escritura está
// congelada. Lo que este script produce es EL PLAN: qué celda se escribiría, con qué fórmula, sobre
// qué filas, y qué columnas quedan intactas. Lo mira él desde el árbol principal y decide.
//
// QUÉ CONTESTA, EN ORDEN:
//   1. el auditor: cuáles de las celdas que hoy tiene el bloque dejan hueco y cuáles están ciegas;
//   2. el plan: ancla, rango, reserva, y las columnas que NO se tocan;
//   3. las dos fórmulas enteras, para leerlas antes de que existan.
//
//   node orquestador/scripts/proveedores-plan-vivo.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { defectosDeBloque, geometriaSeccion1, planDeEscritura } from '../lib/proveedores-bloque-vivo.mjs'
import { formulaControl, formulaPorFactura, rangosCompras } from '../lib/proveedores-deuda-viva.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ═══ LAS COLUMNAS DE COMPRAS, POR ENCABEZADO ═══
  // Misma disciplina que el generador: el dueño edita Compras y una columna borrada corre todas las
  // que siguen. Las que nunca se movieron (proveedor, total, estado, comprobante, obra, categoría)
  // conservan su posición histórica; las que sí, se ubican por su nombre.
  const cab = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const buscar = (nombre) => cab.findIndex((c) => String(c ?? '').trim().toLowerCase() === nombre.toLowerCase())
  const porNombre = (nombre, fallback) => {
    const i = buscar(nombre)
    if (i < 0) { console.warn(`  ⚠ no encontré "${nombre}" en el encabezado de Compras; uso ${fallback}`); return fallback }
    return `Compras!$${letra(i)}$4:$${letra(i)}`
  }
  const rangos = rangosCompras({
    prov: 'Compras!$E$4:$E',
    estado: 'Compras!$X$4:$X',
    total: 'Compras!$O$4:$O',
    comprobante: 'Compras!$H$4:$H',
    obra: 'Compras!$J$4:$J',
    categoria: 'Compras!$B$4:$B',
    comercial: porNombre('¿Proveedor comercial? (OS)', 'Compras!$AJ$4:$AJ'),
    pagado: porNombre('Monto Pagado', 'Compras!$T$4:$T'),
    parcial1: porNombre('Monto Parcial 1', 'Compras!$U$4:$U'),
    parcial2: porNombre('Monto Parcial 2', 'Compras!$W$4:$W'),
    fecha: porNombre('Fecha de caja', 'Compras!$AD$4:$AD'),
    tipoPago: porNombre('Tipo pago', 'Compras!$P$4:$P'),
  })
  console.log('COLUMNAS DE COMPRAS (todas abiertas)')
  for (const [k, v] of Object.entries(rangos)) console.log(`  ${k.padEnd(12)} ${v}`)

  // ═══ CUÁNTAS FACTURAS PENDIENTES HAY HOY — es lo que dimensiona la reserva ═══
  const iCol = (ref) => {
    const m = /\$([A-Z]{1,3})\$/.exec(ref)
    let n = 0
    for (const ch of m?.[1] ?? 'A') n = n * 26 + (ch.charCodeAt(0) - 64)
    return n - 1
  }
  const compras = await google.readSheetValues(ID, 'Compras!A4:BZ')
  const pendientes = compras.filter((f) => String(f?.[iCol(rangos.estado)] ?? '').trim() === 'Pendiente'
    && String(f?.[iCol(rangos.comercial)] ?? '').trim() === '1'
    && String(f?.[iCol(rangos.prov)] ?? '').trim() !== '').length
  console.log(`\nPENDIENTES COMERCIALES EN COMPRAS: ${pendientes}`)

  // ═══ LA PESTAÑA COMO ESTÁ HOY ═══
  const filas = await google.readSheetValues(ID, `${PESTAÑA}!A1:R120`, { render: 'FORMULA' })
  const geo = geometriaSeccion1(filas)
  console.log(`\nGEOMETRÍA (anclada al texto del dueño)`)
  console.log(`  rótulos en la fila ${geo.filaEncabezado}: ${geo.encabezados.filter(Boolean).join(' | ')}`)
  console.log(`  la sección 2 empieza en la fila ${geo.filaLimite}`)

  // ═══ 1 · EL AUDITOR SOBRE LO QUE HAY ═══
  const celdas = []
  for (let r = geo.filaEncabezado; r < geo.filaLimite - 1; r++) {
    const fila = filas[r] ?? []
    fila.forEach((v, j) => { if (String(v ?? '').startsWith('=')) celdas.push({ dir: `${letra(j)}${r + 1}`, formula: String(v) }) })
  }
  const audit = defectosDeBloque(celdas, { colProv: rangos.prov })
  console.log(`\n1 · AUDITOR DEL BLOQUE DE HOY (${celdas.length} celdas con fórmula entre la ${geo.filaEncabezado + 1} y la ${geo.filaLimite - 1})`)
  if (audit.ok) console.log('  ✓ ningún defecto: el bloque ya es vivo')
  else {
    console.log(`  ✗ ${audit.huecos.length} celda(s) DEJAN HUECO — el proveedor está cableado y su fila no se puede ir cuando se le paga:`)
    for (const h of audit.huecos) console.log(`      ${h.dir}  →  "${h.proveedor}"`)
    console.log(`  ✗ ${audit.ciegas.length} referencia(s) CIEGAS — apuntan a una fila fija de Compras y no ven lo nuevo:`)
    const porCelda = new Map()
    for (const c of audit.ciegas) porCelda.set(c.dir, [...(porCelda.get(c.dir) ?? []), c.ref])
    for (const [dir, refs] of porCelda) console.log(`      ${dir}  →  ${refs.join(' , ')}`)
  }

  // ═══ 2 · EL PLAN ═══
  const plan = planDeEscritura({ ...geo, pendientes })
  console.log('\n2 · PLAN DE ESCRITURA')
  if (!plan.ok) { console.log(`  ✗ NO HAY PLAN: ${plan.motivo}`); return }
  console.log(`  ancla:   ${PESTAÑA}!${plan.ancla}   (una sola celda; el resto es derrame)`)
  console.log(`  rango:   ${PESTAÑA}!${plan.rango}   (${plan.reserva} filas de reserva para ${pendientes} pendientes)`)
  console.log(`  ancho:   ${plan.ancho} columnas — ${plan.contrato.join(' | ')}`)
  console.log(`  NO SE TOCA: ${plan.columnasDelDueño.map((c) => `${c.columna} (${c.rotulo})`).join(' · ') || '—'}`)
  console.log(`  NO SE TOCA: la sección 2 entera desde la fila ${geo.filaLimite} — ahí vive la columna B (CUIT), que es del dueño`)
  for (const a of plan.avisos) console.log(`  ⚠ ${a}`)

  // ═══ 3 · LAS DOS CELDAS QUE SE ESCRIBIRÍAN, ENTERAS ═══
  // La segunda es el CONTROL, y va donde hoy está el aviso "⚠ Faltan N factura(s)…". Ese aviso
  // describe el defecto en vez de exigir que no exista, y además suma sobre rangos CERRADOS
  // (`$D$18:$D$36`): el día que el bloque cambie de alto deja de cuadrar sin decir nada. El control
  // nuevo compara el titular contra lo que el bloque muestra y tiene que dar $0.
  const finSaldo = Number(/:[A-Z]+(\d+)$/.exec(plan.rango)?.[1] ?? 0)
  const filaAviso = filas.findIndex((f) => (f ?? []).some((c) => /Faltan .*factura/i.test(String(c ?? ''))))
  console.log(`\n3 · LAS CELDAS QUE SE ESCRIBIRÍAN`)
  console.log(`\n  ${PESTAÑA}!${plan.ancla}  ← la tabla entera (derrame)`)
  console.log(formulaPorFactura({ rangos, reserva: plan.reserva }))
  console.log(`\n  ${PESTAÑA}!A${filaAviso + 1}  ← el control, en la celda donde hoy vive el aviso`)
  console.log(formulaControl({ rangos, rangoSaldo: `$D$${plan.ancla.slice(1)}:$D$${finSaldo}`, que: 'el detalle factura por factura' }))
  console.log('\n(este script no escribió nada)')
}

main().catch((e) => { console.error(e); process.exit(1) })
