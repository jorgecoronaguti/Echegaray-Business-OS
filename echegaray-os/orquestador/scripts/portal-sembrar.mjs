#!/usr/bin/env node
// LLENAR EL PORTAL DEL CLIENTE DESDE EL SHEET — obras y cronograma de cobros.
//
// Las obras y sus cobros viven en «Flujo de Caja», pestañas OBRAS (bloque 3, «CONTRATO») y
// Cobranzas. El portal las lee de Postgres, así que hay que copiarlas. Este script hace ESO y nada
// más: NO ESCRIBE EN EL SHEET, y lo que no puede imputar con certeza lo INFORMA.
//
// TRES REGLAS QUE MANDAN, porque las tres ya se rompieron y el cliente lo vio:
//
//  1. LA CATEGORÍA CONTABLE NO SALE AL PORTAL. La columna B vale B o N —facturado o efectivo no
//     declarado— y los conceptos repiten esos términos. Antes de escribir se revisa cada rótulo y
//     cada nota; si aparece uno, la corrida se ABORTA entera.
//  2. UNA CERTIFICACIÓN PARTIDA EN DOS FILAS ES UN SOLO COBRO. Mismo cliente, misma obra, mismo
//     rótulo y misma fecha ⇒ una línea por la suma.
//  3. LO QUE NO SE PUEDE IMPUTAR NO SE ADIVINA. Una fila que no nombra su obra —«Anticipos San
//     Francisco», «Saldo 50% de todas las obras»— queda afuera y se lista al final.
//
//   node orquestador/scripts/portal-sembrar.mjs          (en seco: dice qué haría)
//   node orquestador/scripts/portal-sembrar.mjs --aplicar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import {
  monto, fecha, partirRotuloDeObra, fechaCorta, imputarObra, palabrasDeObra, estadoDeCobranza,
  seDescarta, terminoProhibido, sinCategoriaContable, clasificar, montoUsdPorTipoDeCambio,
  fusionarImportes, numerarRepetidos, depurarRotulo,
} from '../lib/portal-siembra.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
/** Hoy en San Juan: comparar un vencimiento contra UTC lo corre tres horas. */
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const APLICAR = process.argv.includes('--aplicar')
const ANIO = 2026
const $ = (n, m = 'ARS') => (n == null ? 'sin cargar' : `${m === 'USD' ? 'U$S' : '$'}${Math.round(n).toLocaleString('es-AR')}`)

/** Cómo se llama cada cliente en el Sheet contra cómo está en Postgres. Explícito, no por parecido. */
const CLIENTES = {
  'San Francisco': ['imotor', 'javier'],
  'IMOTOR/San Francisco/JAVI SANCHEZ': ['imotor', 'javier'],
  'Quattropani - Melisa García SAS': ['quattropani'],
  MESSINA: ['messina'],
  ARCOR: ['arcor'],
  'LA ESTRELLA /ALIMENTOS DEL SUR': ['estrella'],
}

// ── 1 · LAS OBRAS ──────────────────────────────────────────────────────────────────────────────

/**
 * El bloque 3 de OBRAS: las obras que el Sheet declara EN CURSO.
 *
 * SE CORTA EN EL TOTAL. El bloque 4 («COSTO PROYECTADO») repite los mismos rótulos con otro número
 * —`4.1 · San Francisco — PISOS…`— y sin el corte cada obra entraba dos veces.
 */
function obrasDelBloque(filas, hallarCliente) {
  const obras = []
  for (const f of filas) {
    if (/⇒\s*TOTAL/i.test(String(f?.[0] ?? ''))) break
    const partido = partirRotuloDeObra(f?.[0])
    if (!partido) continue
    const cliente = hallarCliente(partido.cliente)
    if (!cliente) { console.log(`  ⚠ sin cliente en Postgres: «${partido.cliente}»`); continue }
    obras.push({
      cliente,
      nombre: partido.obra,
      contratado: monto(f?.[6]),
      desde: fechaCorta(partido.desde, ANIO),
      hasta: fechaCorta(partido.hasta, ANIO),
      palabras: palabrasDeObra(partido.obra),
      declaradaEnElSheet: true,
    })
  }
  return obras
}

/** Baja a Postgres lo que el Sheet declara. Un null del Sheet no borra lo que ya estaba. */
async function bajarObras(obras) {
  for (const o of obras) {
    const { rows } = await query('select id from public.obras where cliente_id=$1 and lower(nombre)=lower($2)', [o.cliente.id, o.nombre])
    if (rows[0]) {
      o.id = rows[0].id
      await query(`update public.obras set monto_contratado = coalesce($2, monto_contratado),
                     fecha_inicio = coalesce($3, fecha_inicio), fecha_fin_objetivo = coalesce($4, fecha_fin_objetivo)
                   where id = $1`, [o.id, o.contratado, o.desde, o.hasta])
    } else {
      // `monto_contratado` es NOT NULL con CHECK > 0: una obra sin contrato en el Sheet no se puede
      // crear todavía. Se informa en vez de inventarle un peso.
      if (!o.contratado) { console.log(`  ⚠ «${o.nombre}» no se crea: el Sheet no declara contrato`); continue }
      const r = await query(
        `insert into public.obras (cliente_id, nombre, estado, monto_contratado, fecha_inicio, fecha_fin_objetivo)
         values ($1,$2,'activa',$3,$4,$5) returning id`,
        [o.cliente.id, o.nombre, o.contratado, o.desde ?? `${ANIO}-01-01`, o.hasta])
      o.id = r.rows[0].id
    }
  }
}

/**
 * El universo de obras contra el que se imputa: las del Sheet MÁS las vivas de Postgres.
 *
 * Con sólo las del Sheet, ARCOR y La Estrella —que tienen obra en Postgres pero no en el bloque—
 * perdían TODAS sus cobranzas en silencio: ni una línea en el portal, ni un aviso. Las cerradas
 * quedan fuera a propósito: una obra terminada no absorbe un cobro nuevo.
 */
async function universoDeObras(delSheet) {
  // `obra_canonica` Y NO `public.obras` (26/08/2026). El esquema de pago que administración edita en
  // la ficha del cliente apunta ahí —`esquema_pago.obra_id` es FK a `obra_canonica`—, así que sembrar
  // contra otra tabla dejaba dos registros de obra y un cronograma que la ficha no podía mostrar.
  const { rows } = await query(`select o.id, o.nombre, o.estado, o.cliente_id, c.nombre_comercial
                                from public.obra_canonica o join public.clientes c on c.id = o.cliente_id
                                where coalesce(o.estado,'activa') <> 'cancelada'`)
  const universo = [...delSheet]
  for (const r of rows) {
    const ya = universo.find((o) => o.cliente.id === r.cliente_id && o.nombre.toLowerCase() === String(r.nombre).toLowerCase())
    if (ya) { ya.id = ya.id ?? r.id; continue }
    universo.push({
      cliente: { id: r.cliente_id, nombre_comercial: r.nombre_comercial },
      // LAS CERRADAS ENTRAN, y no es un descuido. ARCOR es un cliente de mantenimiento: su única obra
      // está cerrada y sus trece cobranzas son órdenes de compra sueltas. Excluirlas hacía
      // desaparecer $49,8 M del portal sin que nadie lo viera. Una obra terminada sigue teniendo
      // historia que el cliente puede mirar, y el portal ya tiene su pantalla para eso.
      cerrada: String(r.estado ?? 'activa') === 'cerrada',
      // SÓLO LAS DE `obra_canonica` SE PUEDEN ESCRIBIR: `esquema_pago.obra_id` es FK contra esa
      // tabla. Una obra que el Sheet declara y el registro no tiene existe para IMPUTAR —así se ve
      // cuánto cae en ella— pero no se guarda, y el informe lo dice en vez de romper con un error
      // de clave foránea a mitad de la corrida.
      canonica: true,
      nombre: r.nombre, id: r.id, palabras: palabrasDeObra(r.nombre), declaradaEnElSheet: false,
    })
  }
  return universo
}

// ── 2 · LAS FILAS DE COBRANZAS ─────────────────────────────────────────────────────────────────

/**
 * Una fila de Cobranzas traducida a lo que el cliente vería, todavía sin obra.
 *
 * HASTA AB, NO HASTA W: la moneda vive en AA (índice 26) y leyendo hasta W queda fuera del rango
 * —U$S 15.400 entraba como $15.400 sin dar un solo error—. Y la fórmula del neto se lee aparte
 * porque `=3500*TIPO_CAMBIO_USD` es la prueba de que la fila es una obligación en DÓLARES.
 */
function lineaDeFila(valores, formulas, nroFila) {
  const v = valores, f = formulas
  const concepto = sinCategoriaContable(v?.[8])
  const ordenCompra = sinCategoriaContable(v?.[7])
  const { tipo, rotulo } = clasificar(concepto, ordenCompra)
  const total = monto(v?.[12])
  const usd = montoUsdPorTipoDeCambio({ formulaNeto: f?.[9], neto: monto(v?.[9]), total })
  const cobrado = String(v?.[14] ?? '').trim().toLowerCase() === 'cobrado'
  return {
    fila: nroFila,
    clienteSheet: String(v?.[6] ?? '').trim(),
    conceptoCrudo: String(v?.[8] ?? '').trim(),
    concepto, ordenCompra, tipo, rotulo,
    monto: usd ?? total,
    moneda: usd != null ? 'USD' : (String(v?.[26] ?? '').trim().toUpperCase() === 'USD' ? 'USD' : 'ARS'),
    factura: v?.[4] ? `${v?.[3] ?? ''} ${v?.[4]}`.trim() : null,
    prevista: fecha(v?.[16]),
    pago: cobrado ? fecha(v?.[16]) : null,
    estado: estadoDeCobranza(v?.[14], null),
  }
}

/** Cada fila a su obra. Lo que no calza no se reparte: se devuelve para que salga por pantalla. */
function imputarTodas(valores, formulas, obras, hallarCliente) {
  const porObra = new Map()
  const sinImputar = []
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i]
    if (!v || !String(v?.[6] ?? '').trim()) continue
    if (seDescarta(v?.[14])) continue
    const l = lineaDeFila(v, formulas[i] ?? [], i + 5)
    const cliente = hallarCliente(l.clienteSheet)
    if (!cliente) { sinImputar.push({ ...l, porque: 'el cliente no está en Postgres' }); continue }
    const suyas = obras.filter((o) => o.cliente.id === cliente.id)
    if (!suyas.length) { sinImputar.push({ ...l, porque: 'el cliente no tiene obras vivas' }); continue }
    const imputada = imputarObra(l, suyas)
    if (!imputada) { sinImputar.push({ ...l, porque: 'ninguna obra del cliente calza con el concepto' }); continue }
    const lista = porObra.get(imputada.obra) ?? []
    lista.push(l)
    porObra.set(imputada.obra, lista)
  }
  return { porObra, sinImputar }
}

/**
 * Las filas de una obra convertidas en las líneas que ve el cliente.
 *
 * Mismo rótulo + misma fecha ⇒ UN cobro: la certificación que el Sheet parte en dos filas por
 * categoría contable es una sola para quien la paga. El orden es el del calendario, no el del Sheet.
 */
function lineasDeObra(filas, nombreObra) {
  const grupos = new Map()
  for (const f of filas) {
    const clave = `${f.tipo}|${f.rotulo}|${f.prevista ?? '—'}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), f])
  }
  const lineas = []
  const conflictos = []
  for (const partes of grupos.values()) {
    const sumado = fusionarImportes(partes)
    if (sumado.conflicto) { conflictos.push({ partes, porque: sumado.conflicto }); continue }
    // `monto` tiene CHECK >= 0 en la base: una nota de crédito no es una línea del cronograma del
    // cliente. Se informa en vez de reventar la corrida entera contra la restricción.
    if (sumado.monto != null && sumado.monto < 0) { conflictos.push({ partes, porque: 'el importe es negativo' }); continue }
    const p = partes[0]
    lineas.push({
      tipo: p.tipo, rotulo: depurarRotulo(p.rotulo, nombreObra), monto: sumado.monto, moneda: sumado.moneda,
      prevista: p.prevista, factura: partes.map((x) => x.factura).find(Boolean) ?? null,
      // PAGADO SÓLO SI TODAS LAS PARTES SE COBRARON: media certificación cobrada no es un cobro.
      pago: partes.every((x) => x.pago) ? p.pago : null,
      estado: partes.every((x) => x.pago) ? 'pagado' : p.estado,
      // La nota guarda de qué filas del Sheet salió la línea y qué decían: es el único hilo para
      // volver del portal a Cobranzas cuando alguien pregunte por un importe.
      nota: `Cobranzas fila${partes.length > 1 ? 's' : ''} ${partes.map((x) => x.fila).join('+')} · ${[...new Set(partes.map((x) => x.concepto).filter(Boolean))].join(' + ')}`.slice(0, 200),
      filas: partes.map((x) => x.fila),
    })
  }
  lineas.sort((a, b) => String(a.prevista ?? '9999').localeCompare(String(b.prevista ?? '9999')))
  return { lineas: numerarRepetidos(lineas), conflictos }
}

// ── 3 · EL FRENO ───────────────────────────────────────────────────────────────────────────────

/**
 * NADA SE ESCRIBE SI UN SOLO RÓTULO O UNA SOLA NOTA LLEVA LA CATEGORÍA CONTABLE.
 *
 * Falla CERRADA y falla ENTERA: saltear la línea ofensora dejaría el resto publicado y el hueco
 * pasaría por «esa obra no tenía ese cobro». Un término que llega al portal lo lee un tercero.
 */
function revisarQueNadaInternoSalga(porObra) {
  const sucias = []
  for (const [o, lineas] of porObra) {
    for (const l of lineas) {
      for (const [campo, texto] of [['rótulo', l.rotulo], ['nota', l.nota]]) {
        const t = terminoProhibido(texto)
        if (t) sucias.push(`${o.nombre} · fila ${l.filas.join('+')} · ${campo} «${texto}» ⇒ «${t}»`)
      }
    }
  }
  return sucias
}

// ── 4 · LO QUE VA A LA BASE ────────────────────────────────────────────────────────────────────

/**
 * IDEMPOTENTE POR CONSTRUCCIÓN: se reescribe orden 1..N y se borra todo lo que sobra.
 *
 * El barrido alcanza a TODAS las obras del universo, no sólo a las que hoy tienen líneas: una obra
 * que dejó de recibir cobranzas tiene que quedar vacía, no con la foto de la corrida anterior.
 */
async function escribir(obras, porObra) {
  for (const o of obras) {
    if (!o.id || !o.canonica) continue
    const lineas = porObra.get(o) ?? []
    let orden = 0
    for (const l of lineas) {
      orden += 1
      // LOS CINCO ESTADOS DE `esquema_pago` son otros que los del portal: se traduce acá, una vez.
      const estado = l.pago ? 'cobrado'
        : l.tipo === 'fondo_reparo' ? 'retenido'
        : !l.prevista ? 'previsto'
        : l.prevista < HOY ? 'vencido' : 'a_vencer'
      // `visible_portal` NO se pisa si la fila ya existe: apagar una línea es una decisión de
      // administración y una corrida del sembrador no puede deshacerla en silencio.
      await query(
        `insert into public.esquema_pago
           (cliente_id, obra_id, orden, concepto, monto, moneda, fecha, estado, factura_numero,
            nota_interna, origen, visible_portal, publicado_at, sincronizado_en)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sync_cobranzas', true, now(), now())
         on conflict (obra_id, orden) where origen = 'sync_cobranzas' do update set
           concepto = excluded.concepto, monto = excluded.monto, moneda = excluded.moneda,
           fecha = excluded.fecha, estado = excluded.estado, factura_numero = excluded.factura_numero,
           nota_interna = excluded.nota_interna, sincronizado_en = now(), actualizado_at = now()`,
        [o.cliente.id, o.id, orden, l.rotulo, l.monto, l.moneda, l.prevista, estado, l.factura, l.nota])
    }
    const { rowCount } = await query(
      `delete from public.esquema_pago where obra_id=$1 and orden>$2 and origen='sync_cobranzas'`, [o.id, orden])
    if (rowCount) console.log(`  · ${o.nombre}: ${rowCount} línea(s) vieja(s) borrada(s)`)
  }
}

/** LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO, no el «ok» de la escritura. */
async function releerDeLaBase() {
  const { rows } = await query(`select c.nombre_comercial cli, o.nombre obra, p.orden, p.estado tipo,
                                       p.concepto rotulo, p.moneda, p.monto,
                                       p.fecha fecha_prevista, null::date fecha_pago
                                from public.esquema_pago p
                                join public.obra_canonica o on o.id = p.obra_id
                                join public.clientes c on c.id = p.cliente_id
                                order by c.nombre_comercial, o.nombre, p.orden`)
  console.log('\n══ LEÍDO DE esquema_pago ═════════════════════════════════════════════════════════')
  const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '—')
  let obra = null
  for (const r of rows) {
    if (obra !== r.obra) { obra = r.obra; console.log(`\n  ${r.cli} · ${r.obra}`) }
    console.log(`   ${String(r.orden).padStart(2)}  ${r.tipo.padEnd(12)} ${r.rotulo.slice(0, 34).padEnd(36)} ${$(Number(r.monto), r.moneda).padStart(16)}  prevista ${d(r.fecha_prevista)}  pago ${d(r.fecha_pago)}`)
  }
  console.log(`\n  ${rows.length} línea(s) en la base.`)
  return rows
}

// ── 5 · LO QUE SE INFORMA ──────────────────────────────────────────────────────────────────────

function informar(obras, porObra, sinImputar, conflictos) {
  console.log('\n══ CRONOGRAMA por obra ═══════════════════════════════════════════════════════════')
  for (const o of obras) {
    const lineas = porObra.get(o) ?? []
    const marca = o.canonica ? '' : '  ⚠ NO está en el registro de obras del OS: se imputa pero no se publica'
    console.log(`\n  ${o.cliente.nombre_comercial} · ${o.nombre} — ${lineas.length} línea(s)${marca}`)
    for (const l of lineas) {
      console.log(`   ${l.tipo.padEnd(12)} ${l.rotulo.slice(0, 36).padEnd(38)} ${$(l.monto, l.moneda).padStart(16)}  ${l.prevista ?? 'sin fecha'}  ${l.pago ? 'cobrado' : (l.estado ?? 'a vencer')}  [fila ${l.filas.join('+')}]`)
    }
  }
  if (conflictos.length) {
    console.log('\n⚠ COBROS QUE NO SE PUBLICAN — el Sheet los parte y las partes no cierran:')
    for (const c of conflictos) console.log(`   filas ${c.partes.map((p) => p.fila).join('+')} · ${c.porque}`)
  }
  if (sinImputar.length) {
    console.log(`\n⚠ ${sinImputar.length} fila(s) de Cobranzas SIN IMPUTAR — no se adivina a qué obra van:`)
    for (const f of sinImputar) {
      console.log(`   fila ${String(f.fila).padStart(3)}  ${f.clienteSheet.slice(0, 18).padEnd(20)} ${$(f.monto, f.moneda).padStart(15)}  ${(f.conceptoCrudo || f.ordenCompra).slice(0, 46).padEnd(48)} ${f.porque}`)
    }
    console.log('   ⇒ SIGUIENTE PASO: decir a qué obra va cada una, o dejarlas fuera del portal.')
  }
}

/** Un control no se valida contra lo que él mismo produce: se compara el portal CONTRA Cobranzas. */
function conciliar(porObra, sinImputar) {
  const suma = (m, k, n) => m.set(k, (m.get(k) ?? 0) + n)
  const publicado = new Map()
  const afuera = new Map()
  for (const [o, lineas] of porObra) {
    for (const l of lineas) if (l.moneda === 'ARS' && l.monto != null) suma(publicado, o.cliente.nombre_comercial, l.monto)
  }
  for (const f of sinImputar) if (f.moneda === 'ARS' && f.monto != null) suma(afuera, f.clienteSheet, f.monto)
  console.log('\n══ EL PORTAL CONTRA COBRANZAS (sólo pesos; los dólares no se suman) ═══════════════')
  for (const [cli, n] of publicado) console.log(`   ${cli.slice(0, 26).padEnd(28)} publicado ${$(n).padStart(16)}`)
  if (afuera.size) {
    console.log('   — y lo que Cobranzas tiene para esos clientes y el portal NO muestra:')
    for (const [cli, n] of afuera) console.log(`   ${cli.slice(0, 26).padEnd(28)} sin imputar ${$(n).padStart(15)}`)
  }
  console.log('   ⇒ la diferencia es exactamente la lista de arriba: no está tapada, está declarada.')
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

  const delSheet = obrasDelBloque(await g.readSheetValues(ID, 'OBRAS!A22:I40'), hallarCliente)
  console.log(`OBRAS declaradas en el Sheet: ${delSheet.length}`)
  if (APLICAR) await bajarObras(delSheet)
  const obras = await universoDeObras(delSheet)

  const valores = await g.readSheetValues(ID, 'Cobranzas!A5:AB')
  const formulas = await g.readSheetValues(ID, 'Cobranzas!A5:AB', { render: 'FORMULA' })
  const { porObra, sinImputar } = imputarTodas(valores, formulas, obras, hallarCliente)

  const conflictos = []
  for (const [o, filas] of [...porObra]) {
    const r = lineasDeObra(filas, o.nombre)
    porObra.set(o, r.lineas)
    conflictos.push(...r.conflictos)
  }
  informar(obras, porObra, sinImputar, conflictos)

  const sucias = revisarQueNadaInternoSalga(porObra)
  if (sucias.length) {
    console.error('\n✖ LA CORRIDA SE ABORTA: contabilidad interna a punto de salir al portal del cliente.')
    for (const s of sucias) console.error(`   ${s}`)
    process.exitCode = 1
    return
  }

  conciliar(porObra, sinImputar)
  if (!APLICAR) { console.log('\n(en seco: no se escribió nada — agregá --aplicar)'); return }
  await escribir(obras, porObra)
  await releerDeLaBase()
}

main().catch((e) => { console.error('✖', e.message); process.exitCode = 1 }).finally(() => closePool())
