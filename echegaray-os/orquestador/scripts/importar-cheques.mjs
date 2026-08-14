#!/usr/bin/env node
// LA PUERTA DE ENTRADA DE LOS CHEQUES. Hermana de importar-banco.mjs.
//
// POR QUÉ EXISTE (30/07). El dueño trajo las pantallas de eCHEQ del Santander y una orden de pago de
// un cliente con 5 cheques de terceros. No había dónde ponerlos: el único registro de cheques era un
// array ESCRITO A MANO en `lib/cheques-recibidos.mjs` con corte 22/07, y encima registraba
// OPERACIONES (Aceptación/Custodia/Depósito/Endoso) sin número de cheque ni librador — imposible de
// cruzar, e imposible de sumar sin contar el mismo valor tres veces.
//
// ═══ QUÉ HACE, EN ORDEN, Y POR QUÉ ESE ORDEN ═══
//
//   1. VALIDA cada cheque. El que no pasa se DEVUELVE con su motivo, no se descarta en silencio:
//      un importador que come 6 de 8 y no lo dice es peor que uno que falla.
//   2. VERIFICA LA ORDEN DE PAGO si el fajo la declara: la suma de los cheques + los otros
//      componentes tiene que dar el total. Es una identidad, no una estimación. Es el equivalente a
//      la cadena de saldos del extracto.
//   3. DISTINGUE nuevo de CAMBIO DE ESTADO. Un cheque no es un hecho inmutable: pasa de "en
//      custodia" a "depositado" a "pagado". Una relectura no es un duplicado a descartar, es una
//      actualización — y decirlo importa ("2 cambiaron de estado" ≠ "2 duplicados").
//   4. CRUZA contra el extracto (`banco_movimientos`): si un cheque figura depositado, el depósito
//      tiene que estar en el banco. Ahí es donde el dato se vuelve confiable. RECIBIDOS por LOTE (así
//      los acredita el banco); EMITIDOS por (instrumento, número) contra la referencia bancaria.
//   5. Recién ahí escribe, por UPSERT sobre (tipo, banco, número).
//
// ═══ POR QUÉ ESTE ARCHIVO SE ESTUVO PERDIENDO (14/08) ═══
//
// Se escribió el 30/07 en `c9120ab` y esa rama nunca se integró: sólo su migración llegó a main, por
// un rescate posterior. Durante dos semanas cuatro archivos de main nombraron a este script como "la
// puerta de entrada de los cheques" y el script no existía — o sea que `public.cheques` no tenía forma
// documentada de actualizarse, y por eso un echeq quedó "Aceptado" con el banco habiéndolo pagado.
// Un archivo que se nombra y no está es peor que uno que falta: nadie lo busca.
//
//   node orquestador/scripts/importar-cheques.mjs fajo.json
//   node orquestador/scripts/importar-cheques.mjs fajo.json --dry     (no escribe nada)
//   node orquestador/scripts/importar-cheques.mjs --cartera           (sólo mostrar el estado actual)
//
// FORMATO DEL FAJO (lo produce el OS leyendo el documento; ver lib/cheques-importar.mjs):
//   [ {tipo,numero,banco,librador,...}, ... ]
//   ó  { orden_pago, total, cheques:[...], otros:[{descripcion,importe}] }

import { readFileSync } from 'node:fs'
import { query, closePool } from '../lib/db.mjs'
import { validar, aFila, novedades, verificarOrdenPago, cruceEmitidos } from '../lib/cheques-importar.mjs'
import { conciliarDebitosDeCheques } from '../lib/cheques-debito-banco.mjs'
import { instrumentoDe } from '../lib/cheques-emitidos-sync.mjs'

const DRY = process.argv.includes('--dry')
const SOLO_CARTERA = process.argv.includes('--cartera')
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))
const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

/** Acepta el fajo suelto (array) o envuelto en una orden de pago. */
function leerFajo(ruta) {
  const j = JSON.parse(readFileSync(ruta, 'utf8'))
  if (Array.isArray(j)) return { cheques: j, op: null }
  const op = j.total != null ? { total: j.total, cheques: j.cheques ?? [], otros: j.otros ?? [], orden_pago: j.orden_pago } : null
  const cheques = (j.cheques ?? []).map((c) => ({ ...c, orden_pago: c.orden_pago ?? j.orden_pago }))
  return { cheques, op }
}

async function mostrarCartera() {
  const { rows } = await query('select tipo, estado, count(*)::int cantidad, sum(importe)::float8 importe, max(corte)::text corte from public.cheques group by tipo, estado order by 4 desc')
  if (!rows.length) { console.log('No hay cheques cargados todavía.'); return }
  console.log('\nCARTERA DE CHEQUES (una fila = un cheque, se puede sumar):\n')
  for (const t of ['recibido', 'emitido']) {
    const f = rows.filter((r) => r.tipo === t)
    if (!f.length) continue
    const tot = f.reduce((s, r) => s + r.importe, 0)
    console.log(`  ${t.toUpperCase()}S — total ${$(tot)}`)
    for (const r of f) console.log(`     ${String(r.estado).padEnd(14)} ${String(r.cantidad).padStart(3)} cheque(s)  ${$(r.importe).padStart(18)}   (corte ${r.corte})`)
  }
  console.log()
}

/** Busca en el extracto un movimiento por ese importe. null si no hay. */
async function movimientoPor(monto) {
  const { rows } = await query(
    'select fecha::text, concepto, importe::float8 from public.banco_movimientos where abs(abs(importe) - $1) < 0.02 order by fecha desc limit 1',
    [Math.abs(Number(monto))])
  return rows[0] ?? null
}

/**
 * EMITIDOS: un cheque declarado Pagado tiene que tener SU salida en el extracto — la suya, no una
 * cualquiera del mismo importe.
 *
 * POR QUÉ SE SEPARÓ DEL CRUCE POR IMPORTE (14/08). Los cheques 306, 307, 308 y 309 son todos de
 * $317.000 (NEUMAGOM, cuotas iguales). Buscando "algún movimiento por ese importe", el débito del
 * 307 confirmaba también al 306, al 308 y al 309: cuatro cheques verificados por un solo movimiento
 * que sólo explica uno. El extracto SÍ trae el número en la referencia, así que emparejar por
 * (instrumento, número) no cuesta nada y no miente.
 */
async function cruzarEmitidos(filas) {
  if (!filas.length) return
  const { rows: movs } = await query(
    'select fecha::text, concepto, importe::float8, referencia from public.banco_movimientos where importe < 0 order by fecha, id')
  const cheques = filas.map((f) => ({ ...f, instrumento: instrumentoDe(f) }))
  const { resultados } = conciliarDebitosDeCheques(movs, cheques)
  for (const { cheque, movimiento } of cruceEmitidos(cheques, resultados)) {
    if (!cheque.instrumento) {
      console.log(`   ⚠ ${cheque.numero} ${$(cheque.importe)}: no puedo afirmar si es FISICO o ECHEQ (origen: ${cheque.origen}) — sin instrumento no hay cruce posible`)
    } else if (movimiento) {
      console.log(`   ✓ ${cheque.instrumento} ${cheque.numero} ${$(cheque.importe)} → ${movimiento.fecha} "${String(movimiento.concepto).slice(0, 44)}"`)
    } else {
      console.log(`   ⚠ ${cheque.instrumento} ${cheque.numero} ${$(cheque.importe)} figura ${cheque.estado} y el extracto NO tiene una salida con ese número e importe`)
    }
  }
}

/**
 * El cruce que hace confiable el dato: un cheque depositado tiene que estar en el extracto.
 *
 * PERO EL BANCO NO ACREDITA CHEQUE POR CHEQUE. Los 5 cheques de la O/P 4865 entraron como UN solo
 * movimiento ("Deposito e-cheq 48hs presencia bsr $16.807.425,92"), porque se depositan en lote. Un
 * cruce que sólo busca el importe individual grita en falso en cada depósito por lote — y un control
 * que grita en falso se termina ignorando, que es peor que no tenerlo. Entonces: primero se intenta
 * el LOTE (la suma del grupo, que es como el banco lo acredita) y sólo si no cierra se cae al cheque
 * individual. Se declara cuál de los dos matcheó.
 */
async function cruzarConBanco(filas) {
  const salidos = filas.filter((f) => f.tipo === 'emitido' && /pagado/i.test(f.estado))
  const depositados = filas.filter((f) => f.tipo !== 'emitido' && /deposit|pagado/i.test(f.estado))
  if (!salidos.length && !depositados.length) return
  console.log('\nCRUCE CONTRA EL EXTRACTO (banco_movimientos):')
  await cruzarEmitidos(salidos)
  if (!depositados.length) return

  // Agrupar por orden de pago: así se depositan y así los acredita el banco.
  const grupos = new Map()
  for (const f of depositados) {
    const k = f.orden_pago ?? `__suelto__${f.numero}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(f)
  }

  for (const [k, g] of grupos) {
    const suma = Math.round(g.reduce((s, f) => s + Number(f.importe), 0) * 100) / 100
    if (g.length > 1) {
      const m = await movimientoPor(suma)
      if (m) {
        console.log(`   ✓ LOTE ${k} — ${g.length} cheques por ${$(suma)} → ${m.fecha} "${String(m.concepto).slice(0, 48)}"`)
        continue
      }
      console.log(`   ⚠ LOTE ${k} — ${g.length} cheques por ${$(suma)}: no hay un depósito por la suma; reviso uno por uno`)
    }
    for (const f of g) {
      const m = await movimientoPor(f.importe)
      if (m) console.log(`   ✓ ${f.numero} ${$(f.importe)} → ${m.fecha} "${String(m.concepto).slice(0, 48)}"`)
      else console.log(`   ⚠ ${f.numero} ${$(f.importe)} figura ${f.estado} pero NO hay un movimiento por ese importe en el extracto`)
    }
  }
}

async function main() {
  if (SOLO_CARTERA) { await mostrarCartera(); return }
  if (!ARCHIVO) { console.error('Falta el fajo: importar-cheques.mjs fajo.json [--dry]  (o --cartera)'); process.exitCode = 1; return }

  const { cheques, op } = leerFajo(ARCHIVO)
  if (!cheques.length) { console.error('El fajo no tiene cheques.'); process.exitCode = 1; return }

  // 1. VALIDAR — lo que no pasa se devuelve con su motivo.
  const filas = []; const rechazos = []
  cheques.forEach((c, i) => {
    const p = validar(c)
    if (p.length) rechazos.push({ i, numero: c?.numero ?? '(sin número)', problemas: p })
    else filas.push(aFila(c))
  })
  console.log(`fajo: ${cheques.length} cheque(s) · ${filas.length} válido(s) · ${rechazos.length} rechazado(s)`)
  if (rechazos.length) {
    console.log('\n⚠ NO se cargan (dato insuficiente, no se inventa):')
    rechazos.forEach((r) => console.log(`   #${r.i} ${r.numero}: ${r.problemas.join('; ')}`))
  }
  if (!filas.length) { console.log('\nNada cargable.'); return }

  // 2. EL CONTROL de la orden de pago.
  if (op) {
    const v = verificarOrdenPago(op)
    console.log(`\nORDEN DE PAGO ${op.orden_pago ?? ''}: declara ${$(v.declarado)}`)
    console.log(`   cheques ${$(v.suma_cheques)} + otros ${$(v.suma_otros)} = ${$(v.calculado)}`)
    if (v.cierra) console.log('   ✓ cierra al centavo')
    else {
      console.log(`   ✗ NO CIERRA — diferencia ${$(v.diferencia)}. Falta un cheque o hay un importe mal leído.`)
      if (!process.argv.includes('--igual-cargalo')) {
        console.log('   No escribo: meter una orden de pago que no cierra es peor que no cargarla. (--igual-cargalo para forzar)')
        return
      }
    }
  }

  // 3. NUEVO vs CAMBIO DE ESTADO.
  const { rows: existentes } = await query('select tipo, banco, numero, estado, fecha_pago::text, importe::float8, orden_pago, obra from public.cheques')
  const n = novedades(existentes, filas)
  console.log(`\n${n.nuevos.length} nuevo(s) · ${n.actualizados.length} con cambios · ${n.iguales.length} sin cambios`)
  n.nuevos.forEach((f) => console.log(`   + ${f.tipo} ${f.numero} ${String(f.banco ?? '').padEnd(22)} ${$(f.importe).padStart(17)}  ${f.estado}${f.fecha_pago ? ` · paga ${f.fecha_pago}` : ''}`))
  n.actualizados.forEach((a) => console.log(`   ~ ${a.fila.tipo} ${a.fila.numero}: ${a.motivo}`))

  // 4. CRUCE contra el extracto.
  await cruzarConBanco(filas)

  if (DRY) { console.log('\n--dry: no escribí nada.'); return }

  // 5. ESCRIBIR por UPSERT (el estado cambia; una relectura corrige, no duplica).
  let escritos = 0
  for (const f of filas) {
    await query(
      `insert into public.cheques
         (tipo,numero,banco,librador,librador_cuit,contraparte,contraparte_cuit,caracter,
          fecha_pago,importe,estado,cuenta,orden_pago,obra,origen,corte)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (tipo, coalesce(banco,''), numero) do update set
         librador = coalesce(excluded.librador, public.cheques.librador),
         librador_cuit = coalesce(excluded.librador_cuit, public.cheques.librador_cuit),
         contraparte = coalesce(excluded.contraparte, public.cheques.contraparte),
         contraparte_cuit = coalesce(excluded.contraparte_cuit, public.cheques.contraparte_cuit),
         caracter = coalesce(excluded.caracter, public.cheques.caracter),
         fecha_pago = coalesce(excluded.fecha_pago, public.cheques.fecha_pago),
         importe = excluded.importe,
         estado = excluded.estado,
         cuenta = coalesce(excluded.cuenta, public.cheques.cuenta),
         orden_pago = coalesce(excluded.orden_pago, public.cheques.orden_pago),
         obra = coalesce(excluded.obra, public.cheques.obra),
         origen = excluded.origen,
         corte = excluded.corte,
         importado_en = now()`,
      [f.tipo, f.numero, f.banco, f.librador, f.librador_cuit, f.contraparte, f.contraparte_cuit,
        f.caracter, f.fecha_pago, f.importe, f.estado, f.cuenta, f.orden_pago, f.obra, f.origen, f.corte])
    escritos++
  }
  console.log(`\n✓ ${escritos} cheque(s) cargado(s) (upsert sobre tipo+banco+número)`)
  await mostrarCartera()
}

main()
  .catch((e) => { console.error(`Falló: ${String(e?.message ?? e)}`); process.exitCode = 1 })
  .finally(() => closePool().catch(() => {}))
