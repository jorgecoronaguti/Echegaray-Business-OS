#!/usr/bin/env node
// PONE LA SECCIÓN 1 DE PROVEEDORES COMO TABLA DINÁMICA NATIVA.
//
// El pedido del dueño, textual: "no se actualiza sola, y me deja huecos cuando se va uno que fue
// pagado" y "¿no podés hacer esa parte de Proveedores, que es fundamental de la pestaña, como tabla
// dinámica?". Una dinámica la recalcula Google sola: no depende de que un generador corra.
//
// Lo que cede está declarado en `lib/proveedores-pivot-seccion1.mjs`: el importe queda a la derecha
// de todo, porque en un pivot los valores van siempre después de los campos de fila.
//
// ═══ LO QUE NO SE TOCA, Y CÓMO SE PRUEBA ═══
//
// La columna H (los "Comentarios" del dueño) y la sección 2 entera. No alcanza con que el rango
// "no las incluya": un rango mal calculado también cree que no las incluye. Se toma la HUELLA
// antes, se vuelve a tomar después releyendo el archivo, y una sola diferencia aborta con rojo.
//
// ═══ ANTES DE ESCRIBIR SE VERIFICA QUE ENTRE ═══
//
// Si la dinámica no entra en el hueco hasta la sección 2, Google se niega a renderizarla y deja
// "La tabla dinámica sobrescribiría datos" en la celda ancla: falla cerrado, no borra nada. Pero
// deja la sección 1 invisible, así que se avisa antes en vez de descubrirlo mirando.
//
//   node orquestador/scripts/proveedores-pivot-aplicar.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-pivot-aplicar.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { diferenciasDeHuella, huellaProtegida } from '../lib/proveedores-bloque-vivo.mjs'
import {
  anchoDelPivot, cabeEnElHueco, COL, filtrosPorCondicion, formatoDelImporte, fuenteCompras,
  celdasVacias, deudaSinNombre, formatoDeLaCantidad, formatoDeLaFecha, geometriaDeLaSeccion, letraDeLaDeuda,
  nivelesConSubtotal, PENDIENTE, pivotSeccion1, proveedoresQueAgrupan, reapuntarControl, VISTA,
} from '../lib/proveedores-pivot-seccion1.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
// El dueño pidió el proveedor primero y sin comprobante; eso agrupa y deja rótulos en blanco.
// `--por-proveedor` es la salida sin una sola celda vacía, a costa del detalle factura por factura.
// Por defecto UNA LÍNEA POR PROVEEDOR: es la única forma de que no quede una sola celda vacía
// con el proveedor como primera columna. `--detalle` vuelve a factura por factura, con agujeros.
const VISTA_ELEGIDA = process.argv.includes('--detalle') ? VISTA.DETALLE : VISTA.POR_PROVEEDOR

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── 1. El universo, contado desde Compras con el MISMO criterio que los filtros del pivot.
  const compras = await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' })
  const pendientes = (compras ?? []).filter((f) =>
    // Mismo criterio que los filtros del pivot, EXACTAMENTE: estado y comercial, sin exigir
    // nombre. Si el script contara con un criterio más estricto que el del cuadro, su total y el
    // del cuadro dirían cosas distintas y el control no serviría para nada.
    String(f?.[COL.estado] ?? '').trim() === PENDIENTE
    && String(f?.[COL.comercial] ?? '').trim() === '1')
  const totalEsperado = pendientes.reduce((a, f) => a + (Number(f?.[COL.saldo]) || 0), 0)


  // ── 2. La geometría, anclada al TEXTO de los títulos — nunca a un número de fila.
  //
  // Se busca sobre el valor VISIBLE, no sobre las fórmulas: una tabla dinámica no tiene fórmulas.
  // Sus celdas no llevan `userEnteredValue`, así que una lectura FORMULA devuelve el bloque vacío
  // y la fila de rótulos deja de encontrarse — es decir, el script dejaba de poder correr una
  // segunda vez sobre su propio resultado. La huella de lo protegido sí se toma sobre FORMULA:
  // ahí lo que importa es que la fórmula del dueño siga siendo idéntica, carácter por carácter.
  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const antes = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const geo = geometriaDeLaSeccion(visible)

  const meta = await google.getSheetMeta(ID)
  const sheetIdProv = meta.find((s) => s.title === PESTAÑA)?.sheetId
  const sheetIdCompras = meta.find((s) => s.title === 'Compras')?.sheetId
  if (!Number.isInteger(sheetIdProv) || !Number.isInteger(sheetIdCompras)) {
    throw new Error('no encontré el sheetId de Proveedores o de Compras: no escribo a ciegas')
  }

  // LA GRILLA ENTERA, no la última fila con datos: si el origen se corta donde termina lo cargado
  // hoy, la compra de mañana queda afuera y la dinámica deja de ser viva sin dar ningún error.
  const filasCompras = meta.find((s) => s.title === 'Compras')?.rows
  if (!(filasCompras > 3)) throw new Error(`no pude leer cuántas filas tiene la grilla de Compras (${filasCompras}): no escribo a ciegas`)
  const pivot = pivotSeccion1(fuenteCompras({ sheetId: sheetIdCompras, filas: filasCompras }), { vista: VISTA_ELEGIDA })
  const ancho = anchoDelPivot(pivot)

  // ── 3. Las dos trampas, verificadas sobre el objeto que se va a escribir.
  const porCondicion = filtrosPorCondicion(pivot)
  if (porCondicion.length) throw new Error(`filtro por condición en ${porCondicion.join(', ')}: la dinámica saldría VACÍA`)
  const conSubtotal = nivelesConSubtotal(pivot)
  if (conSubtotal.length) throw new Error(`showTotals en ${conSubtotal.join(', ')}: la API no emite ese subtotal`)

  // ── 4. ¿Entra?
  // El alto lo dan las FILAS QUE VA A EMITIR el pivot, no las facturas: en la vista por proveedor
  // nueve proveedores con trece facturas ocupan nueve filas, no trece.
  const grupos = VISTA_ELEGIDA === VISTA.POR_PROVEEDOR
    ? new Set(pendientes.map((f) => String(f?.[COL.proveedor] ?? '').trim())).size
    : pendientes.length
  const hueco = cabeEnElHueco({ facturas: grupos, filaAncla: geo.filaEncabezado, filaLimite: geo.filaLimite })

  console.log(`FACTURAS PENDIENTES  ${pendientes.length}   TOTAL ${plata(totalEsperado)}`)
  console.log(`ANCLA   ${PESTAÑA}!A${geo.filaEncabezado}   ANCHO ${ancho} columnas (A..${String.fromCharCode(64 + ancho)})`)
  console.log(`ALTO    ${hueco.alto} filas · disponibles ${hueco.disponible} hasta la sección 2 (fila ${geo.filaLimite}) · holgura ${hueco.holgura}`)
  console.log('NO SE TOCA  la columna H (Comentarios) ni la sección 2 entera')
  console.log(`VISTA   ${VISTA_ELEGIDA}`)
  console.log(`ORIGEN  Compras!A3:AL${filasCompras} (la grilla entera: una compra nueva entra sola)`)
  // Una deuda SIN NOMBRE de proveedor entra al cuadro con el rótulo en blanco. Una sin NÚMERO de
  // comprobante entra bien y tiene que entrar: son cosas distintas y sólo la primera es un agujero.
  const anonimas = deudaSinNombre(pendientes)
  if (anonimas.length) {
    console.error(`  ✗ ${anonimas.length} deuda(s) SIN NOMBRE de proveedor: harían un rótulo en blanco en la columna A`)
    for (const a of anonimas) console.error(`      comprobante ${a.comprobante} · ${plata(a.saldo)} — completá el proveedor en Compras`)
    process.exitCode = 1
    return
  }
  // Con el proveedor como primer campo, el que repite agrupa y sus filas hermanas quedan sin rótulo.
  // Se imprime ANTES de escribir: una limitación declarada, no una sorpresa al mirar la pantalla.
  if (VISTA_ELEGIDA === VISTA.DETALLE) {
    const agrupan = proveedoresQueAgrupan(pendientes)
    const sinRotulo = agrupan.reduce((a, x) => a + x.sinRotulo, 0)
    if (sinRotulo) {
      console.log(`  ⚠ ${sinRotulo} fila(s) van a quedar SIN el nombre repetido en la columna A (así agrupa una dinámica):`)
      for (const x of agrupan) console.log(`      ${x.proveedor}: ${x.filas} facturas → ${x.sinRotulo} sin rótulo`)
      console.log('      con --por-proveedor no queda ninguna, a costa del detalle factura por factura')
    }
  }
  if (!hueco.cabe) { console.error(`✗ NO ENTRA: ${hueco.motivo}`); process.exitCode = 1; return }
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  // ── 4b. El control de arriba, reapuntado a la columna del importe.
  const iControl = visible.findIndex((f, k) => k < geo.filaEncabezado - 1
    && (f ?? []).some((c) => /cierra con el titular|no cierra con el titular/i.test(String(c ?? ''))))
  if (iControl < 0) throw new Error('no encontré la celda del control arriba del encabezado: no escribo a ciegas')
  const filaControl = iControl + 1
  const colImporte = letraDeLaDeuda({ vista: VISTA_ELEGIDA })
  const controlViejo = String(antes[iControl]?.[0] ?? '')
  const controlReapuntado = reapuntarControl(controlViejo, colImporte, geo)
  if (controlReapuntado === controlViejo) {
    console.log(`  ⚠ el control de A${filaControl} ya apuntaba a la columna ${colImporte}: se deja como está`)
  } else {
    console.log(`CONTROL A${filaControl}  reapuntado a la columna ${colImporte} (era la del bloque de fórmulas)`)
  }

  // ── 5. La huella de lo protegido, ANTES.
  const huellaAntes = huellaProtegida(antes, { ...geo, ancho })
  console.log(`\nHUELLA PROTEGIDA ANTES: ${huellaAntes.size} celdas`)

  // ── 6. Limpiar el bloque viejo y poner la dinámica. El rango se limpia entero: si quedara una
  // fórmula vieja donde la dinámica quiere expandirse, Google se niega a renderizarla.
  const filaIdx = geo.filaEncabezado - 1
  const finIdx = geo.filaLimite - 1
  const vacias = Array.from({ length: finIdx - filaIdx }, () => ({
    values: Array.from({ length: ancho }, () => ({ userEnteredValue: null })),
  }))
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId: sheetIdProv, startRowIndex: filaIdx, endRowIndex: finIdx, startColumnIndex: 0, endColumnIndex: ancho },
      rows: vacias, fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId: sheetIdProv, startRowIndex: filaIdx, endRowIndex: filaIdx + 1, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ pivotTable: pivot }] }], fields: 'pivotTable' } },
    formatoDelImporte({ sheetId: sheetIdProv, filaAncla: geo.filaEncabezado, alto: hueco.alto, ancho, vista: VISTA_ELEGIDA }),
    formatoDeLaFecha({ sheetId: sheetIdProv, filaAncla: geo.filaEncabezado, alto: hueco.alto, vista: VISTA_ELEGIDA }),
    VISTA_ELEGIDA === VISTA.POR_PROVEEDOR
      ? formatoDeLaCantidad({ sheetId: sheetIdProv, filaAncla: geo.filaEncabezado, alto: hueco.alto, ancho })
      : null,
    // EL CONTROL TIENE QUE MIRAR LA COLUMNA DONDE QUEDÓ EL IMPORTE.
    //
    // Sumaba $D$18:$D$37 — la columna del importe en el bloque de fórmulas. Con la dinámica, la D
    // pasó a ser la obra: texto, que suma 0. El control se puso en rojo diciendo "falta
    // $15.716.930", o sea el total entero, y TENÍA RAZÓN sobre lo que estaba mirando. Un control
    // que apunta a la columna equivocada no avisa de menos: avisa cualquier cosa. Se reapunta con
    // la letra CALCULADA del ancho del pivot, no tipeada.
    { updateCells: {
      range: { sheetId: sheetIdProv, startRowIndex: filaControl - 1, endRowIndex: filaControl, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: controlReapuntado } }] }], fields: 'userEnteredValue' } },
  ].filter(Boolean), { espejo: true })

  // ── 7. La evidencia es el dato leído del archivo, nunca la pantalla que respondió que sí.
  const despues = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const dif = diferenciasDeHuella(huellaAntes, huellaProtegida(despues, { ...geo, ancho }))
  if (dif.length) {
    console.error(`\n✗✗ LA ESCRITURA SALIÓ DE SU RANGO — ${dif.length} celda(s) protegidas cambiaron:`)
    for (const d of dif.slice(0, 40)) console.error(`   ${d.dir}: "${d.antes}" → "${d.despues}"`)
    process.exitCode = 1
    return
  }
  console.log('✓ ni una celda protegida cambió (columna H y sección 2, verificadas releyendo)')

  const vista = await google.readSheetValues(ID, `${PESTAÑA}!A${geo.filaEncabezado}:H${geo.filaLimite - 1}`)
  console.log('\nLA DINÁMICA, LEÍDA DEL ARCHIVO:')
  let filas = 0
  for (const f of vista ?? []) {
    const t = (f ?? []).map((c) => String(c ?? '')).join(' | ')
    if (t.replace(/[| ]/g, '')) { console.log('  ' + t); filas++ }
  }
  if (filas === 0) { console.error('  ✗✗ LA DINÁMICA SALIÓ VACÍA — mirá los filtros antes de dar esto por bueno'); process.exitCode = 1; return }

  // EL AGUJERO SE CUENTA RELEYENDO, no se supone. El dueño los reportó tres veces.
  const huecos = celdasVacias(vista ?? [], ancho, geo.filaEncabezado)
  if (huecos.length) {
    console.error(`\n✗✗ QUEDARON ${huecos.length} CELDA(S) VACÍA(S): ${huecos.join(' · ')}`)
    process.exitCode = 1
    return
  }
  console.log(`\n✓ ni una celda vacía en el bloque (${filas - 1} filas × ${ancho} columnas, verificadas releyendo)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
