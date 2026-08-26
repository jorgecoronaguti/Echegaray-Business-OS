#!/usr/bin/env node
// LLENAR EL PORTAL DEL CLIENTE DESDE EL SHEET — obras, cronogramas y carpetas de Drive.
//
// Las obras y sus cronogramas viven en «Flujo de Caja», pestañas OBRAS (bloque 3, «CONTRATO») y
// Cobranzas. El portal las lee de Postgres, así que hay que copiarlas. Este script hace ESO y nada
// más: no escribe en el Sheet, no borra nada, y lo que no puede imputar lo INFORMA.
//
// LO QUE NO IMPUTA. Una fila de Cobranzas que no nombra su obra —«Anticipos San Francisco»,
// «Saldo 50% de todas las obras»— queda afuera y se lista al final. Repartirla por proporción o
// mandarla a la primera obra del cliente pondría plata de una obra en el cronograma de otra, y es el
// cliente el que lo ve.
//
//   node orquestador/scripts/portal-sembrar.mjs          (en seco: dice qué haría)
//   node orquestador/scripts/portal-sembrar.mjs --aplicar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import {
  monto, fecha, partirRotuloDeObra, fechaCorta, imputarObra, palabrasDeObra, estadoDeCobranza, seDescarta,
} from '../lib/portal-siembra.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const ANIO = 2026
const $ = (n) => (n == null ? 'sin cargar' : `$${Math.round(n).toLocaleString('es-AR')}`)

/** Cómo se llama cada cliente en el Sheet contra cómo está en Postgres. Explícito, no por parecido. */
const CLIENTES = {
  'San Francisco': ['imotor', 'javier'],
  'Quattropani - Melisa García SAS': ['quattropani'],
  MESSINA: ['messina'],
  ARCOR: ['arcor'],
  'LA ESTRELLA /ALIMENTOS DEL SUR': ['estrella'],
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { rows: clientes } = await query('select id, nombre_comercial from public.clientes')
  // El Sheet escribe «IMOTOR/San Francisco/JAVI SANCHEZ» donde OBRAS dice «San Francisco»: se busca
  // la pista DENTRO del texto del Sheet, no el texto dentro del nombre de Postgres.
  const hallarCliente = (nombreSheet) => {
    const texto = String(nombreSheet).toLowerCase()
    const clave = Object.keys(CLIENTES).find((k) => texto.includes(k.toLowerCase()) || k.toLowerCase().includes(texto))
    const pistas = CLIENTES[clave ?? nombreSheet] ?? [texto]
    return clientes.find((c) => pistas.some((p) => String(c.nombre_comercial).toLowerCase().includes(p))) ?? null
  }

  // ── 1 · LAS OBRAS, del bloque 3 de OBRAS ────────────────────────────────────────────────────
  // SE CORTA EN EL TOTAL. El bloque 4 («COSTO PROYECTADO») repite los mismos rótulos con otro
  // número —`4.1 · San Francisco — PISOS…`— y sin el corte cada obra entraba dos veces: la segunda
  // sin contrato, y el cliente pasaba a tener 8 obras en vez de 4.
  const filasObra = await g.readSheetValues(ID, 'OBRAS!A22:I40')
  const obras = []
  for (const f of filasObra) {
    if (/⇒\s*TOTAL/i.test(String(f?.[0] ?? ''))) break
    const partido = partirRotuloDeObra(f?.[0])
    if (!partido) continue
    const cliente = hallarCliente(partido.cliente)
    if (!cliente) { console.log(`  ⚠ sin cliente en Postgres: «${partido.cliente}»`); continue }
    obras.push({
      cliente,
      nombre: partido.obra,
      // «Contratado» es la columna G. Sin contrato la obra existe igual: la pantalla dirá «sin cargar».
      contratado: monto(f?.[6]),
      desde: fechaCorta(partido.desde, ANIO),
      hasta: fechaCorta(partido.hasta, ANIO),
      palabras: palabrasDeObra(partido.obra),
    })
  }
  console.log(`OBRAS del Sheet: ${obras.length}`)
  for (const o of obras) console.log(`  ${String(o.cliente.nombre_comercial).slice(0, 22).padEnd(24)} ${o.nombre.padEnd(24)} ${$(o.contratado).padStart(16)}  ${o.desde ?? 'sin inicio'} → ${o.hasta ?? '—'}`)

  if (APLICAR) {
    for (const o of obras) {
      const { rows } = await query('select id from public.obras where cliente_id=$1 and lower(nombre)=lower($2)', [o.cliente.id, o.nombre])
      if (rows[0]) {
        o.id = rows[0].id
        // Sólo se pisa lo que el Sheet declara. Un null del Sheet no borra lo que ya estaba.
        await query(`update public.obras set monto_contratado = coalesce($2, monto_contratado),
                       fecha_inicio = coalesce($3, fecha_inicio), fecha_fin_objetivo = coalesce($4, fecha_fin_objetivo)
                     where id = $1`, [o.id, o.contratado, o.desde, o.hasta])
      } else {
        // `monto_contratado` es NOT NULL con CHECK > 0: una obra sin contrato en el Sheet no se
        // puede crear todavía. Se informa en vez de inventarle un peso.
        if (!o.contratado) { console.log(`  ⚠ «${o.nombre}» no se crea: el Sheet no declara contrato`); continue }
        const r = await query(
          `insert into public.obras (cliente_id, nombre, estado, monto_contratado, fecha_inicio, fecha_fin_objetivo)
           values ($1,$2,'activa',$3,$4,$5) returning id`,
          [o.cliente.id, o.nombre, o.contratado, o.desde ?? `${ANIO}-01-01`, o.hasta])
        o.id = r.rows[0].id
      }
    }
  }

  // ── 2 · EL CRONOGRAMA, de Cobranzas ─────────────────────────────────────────────────────────
  // HASTA AB, NO HASTA W. La moneda vive en AA (índice 26): leyendo hasta W la columna quedaba fuera
  // del rango y TODA fila salía en pesos — U$S 15.400 entraba como $15.400 sin dar un solo error.
  const cob = await g.readSheetValues(ID, 'Cobranzas!A5:AB')
  const porObra = new Map()
  const sinImputar = []
  let orden = new Map()

  for (const f of cob) {
    const [, , fechaFac, tipoCbte, nroCbte, , clienteSheet, concepto, detalle, , , , total, , estado, , fechaCobro] = f
    // Columna AA: la moneda de la fila. Sin esto U$S 15.400 entra como $15.400 y arruina el total.
    const moneda = String(f?.[26] ?? '').trim().toUpperCase() === 'USD' ? 'USD' : 'ARS'
    if (!clienteSheet || !String(clienteSheet).trim()) continue
    if (seDescarta(estado)) continue
    const importe = monto(total)
    const cliente = hallarCliente(String(clienteSheet).trim())
    if (!cliente) continue
    const suyas = obras.filter((o) => o.cliente.id === cliente.id)
    if (!suyas.length) continue

    const imputada = imputarObra({ concepto, detalle }, suyas)
    const fila = {
      cliente: String(clienteSheet).trim(),
      concepto: String(concepto ?? detalle ?? '').trim() || 'Cobranza',
      detalle: String(detalle ?? '').trim(),
      importe,
      factura: nroCbte ? `${tipoCbte ?? ''} ${nroCbte}`.trim() : null,
      prevista: fecha(fechaCobro),
      pago: String(estado ?? '').toLowerCase() === 'cobrado' ? fecha(fechaCobro) : null,
      estado: estadoDeCobranza(estado, null),
      moneda,
      emitida: fecha(fechaFac),
    }
    if (!imputada) { sinImputar.push(fila); continue }
    const lista = porObra.get(imputada.obra) ?? []
    lista.push(fila)
    porObra.set(imputada.obra, lista)
  }

  console.log('\nCRONOGRAMA por obra')
  for (const [o, filas] of porObra) {
    const pagado = filas.filter((x) => x.pago).reduce((s, x) => s + (x.importe ?? 0), 0)
    console.log(`  ${o.nombre.padEnd(24)} ${String(filas.length).padStart(2)} línea(s) · pagado ${$(pagado)}`)
  }
  if (sinImputar.length) {
    console.log(`\n⚠ ${sinImputar.length} fila(s) de Cobranzas SIN IMPUTAR — nombran al cliente pero no a la obra:`)
    for (const f of sinImputar) console.log(`   ${f.cliente.slice(0, 20).padEnd(22)} ${$(f.importe).padStart(15)}  ${(f.concepto || f.detalle).slice(0, 56)}`)
    console.log('   ⇒ SIGUIENTE PASO: decir a qué obra va cada una, o dejarlas fuera del portal.')
  }

  if (!APLICAR) { console.log('\n(en seco: no se escribió nada — agregá --aplicar)'); return }

  for (const [o, filas] of porObra) {
    if (!o.id) continue
    orden = 0
    // Se ordena por fecha para que el número de orden sea el del calendario y no el del Sheet.
    const ordenadas = [...filas].sort((a, b) => String(a.prevista ?? '9999').localeCompare(String(b.prevista ?? '9999')))
    for (const f of ordenadas) {
      orden += 1
      await query(
        `insert into public.pago_programado (obra_id, orden, tipo, rotulo, monto, fecha_prevista, fecha_pago, factura_numero, estado, nota, moneda)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (obra_id, orden) do update set
           rotulo = excluded.rotulo, monto = excluded.monto, fecha_prevista = excluded.fecha_prevista,
           fecha_pago = excluded.fecha_pago, factura_numero = excluded.factura_numero,
           estado = excluded.estado, nota = excluded.nota, moneda = excluded.moneda, updated_at = now()`,
        [o.id, orden, /^anticipo/i.test(f.concepto) ? 'anticipo' : 'certificado',
         f.detalle || f.concepto, f.importe, f.prevista, f.pago, f.factura, f.estado,
         `Cobranzas · ${f.concepto}`.slice(0, 200), f.moneda])
    }
    // Lo que ya no está en el Sheet se va: el Sheet manda.
    await query('delete from public.pago_programado where obra_id=$1 and orden>$2', [o.id, orden])
    const leido = await query('select count(*)::int n, sum(monto) s from public.pago_programado where obra_id=$1', [o.id])
    console.log(`  ✓ ${o.nombre.padEnd(24)} ${leido.rows[0].n} línea(s) en la base · ${$(Number(leido.rows[0].s))}`)
  }
}

main().catch((e) => { console.error('✖', e.message); process.exitCode = 1 }).finally(() => closePool())
