#!/usr/bin/env node
// ESTADO DE CUENTA Y CALENDARIO DE COBROS — una hoja por cliente, lista para que la firme Dirección.
//
//   node orquestador/scripts/estado-de-cuenta-cliente.mjs --cliente "San Francisco" \
//        --corte 2026-08-24 --salida /ruta/de/salida
//
// ═══ QUÉ HACE Y QUÉ NO ═══
//
// LEE `Cobranzas`, `OBRAS` y `Calendario de Cobros` del Sheet real, y `clientes` y
// `cuentas_financieras` de Postgres. NO ESCRIBE NADA en ninguna de las dos. Es un lector: el
// documento que produce es un archivo suelto que después alguien mira, y si algo no cierra, el PDF
// sale con una banda que dice que no se envíe.
//
// NO MANDA EL DOCUMENTO. El envío a un cliente es Nivel E —comunicación externa con efecto
// económico— y lo autoriza el dueño. Este script prepara; el pie del PDF lo dice con todas las
// letras y no hay bandera para sacarlo.
//
// ═══ POR QUÉ EXISTE ═══
//
// A Javier Sánchez se le mandaban "Recibo N.pdf" armados a mano en Excel: dieciséis versiones que
// no salían de Cobranzas. El Recibo 16 declaraba un saldo de Mampostería de $9.273.576 y Cobranzas
// cobró $8.758.810 — $514.766 que nadie cruzó nunca porque vivían en archivos distintos. El
// documento que arma este script sale de las mismas filas que mueven la caja, o no sale.
//
// ═══ EL LOGO ═══
//
// Se copia una sola vez a `orquestador/assets/` y se embebe como data URI. Sin archivo de logo el
// documento igual sale, sin marca: un estado de cuenta que no se puede emitir porque falta un PNG
// sería el peor de los dos males.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

import { loadConfig } from '../lib/config.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { query } from '../lib/db.mjs'
import { CLIENTES, clienteCanonico } from '../lib/libro-clientes.mjs'
import { armarEstadoDeCuenta, fechaAR, serialDeISO } from '../lib/estado-de-cuenta.mjs'
import { contratoDeclarado } from '../lib/estado-de-cuenta-contratos.mjs'
import { documentoHtml } from '../lib/estado-de-cuenta-html.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHEET = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const LOGO_ORIGEN = '/home/jorge/echegaray-design/logo-echegaray.png'
const LOGO = join(RAIZ, 'assets', 'logo-echegaray.png')

/**
 * LOS ARGUMENTOS SE VALIDAN ANTES DE TOCAR NADA.
 *
 * `--corte` mal escrito no puede convertirse en "hoy" en silencio: un estado de cuenta con la fecha
 * de corte equivocada compara la deuda del cliente contra un día que no es. Zod lo rechaza y el
 * script no llega ni a abrir el Sheet.
 */
const Argumentos = z.object({
  cliente: z.string().min(2, 'falta --cliente'),
  corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '--corte va como AAAA-MM-DD').optional(),
  salida: z.string().min(1).optional(),
  nombre: z.string().min(2).optional(),
})

/** Los `--clave valor` de la línea de comandos, sin librería: son cuatro. */
function leerArgumentos(argv) {
  const crudo = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const clave = argv[i].slice(2)
    const valor = argv[i + 1]
    if (valor === undefined || valor.startsWith('--')) continue
    crudo[clave] = valor
    i++
  }
  return Argumentos.parse(crudo)
}

/**
 * EL CLIENTE CANÓNICO A PARTIR DE LO QUE SE TIPEÓ.
 *
 * Se acepta cualquiera de sus alias de `Cobranzas!G` —"IMOTOR/San Francisco/JAVI SANCHEZ" también
 * llega a "San Francisco"— y también el nombre con el que sale el documento. Un cliente que no está
 * en el catálogo corta acá: generar una hoja vacía con el membrete de la empresa es peor que un
 * error, porque parece un documento.
 */
function resolverCliente(texto) {
  const directo = clienteCanonico(texto)
  if (directo) return directo
  const porNombre = CLIENTES.find((c) => contratoDeclarado(c.nombre).identidad?.nombre === texto)
  if (porNombre) return porNombre.nombre
  throw new Error(`No conozco al cliente "${texto}". Los del catálogo son: `
    + CLIENTES.map((c) => c.nombre).join(' · '))
}

/** El logo como data URI, copiándolo a `assets/` la primera vez. Null si no existe el archivo. */
function logoEmbebido() {
  if (!existsSync(LOGO)) {
    if (!existsSync(LOGO_ORIGEN)) return null
    mkdirSync(dirname(LOGO), { recursive: true })
    writeFileSync(LOGO, readFileSync(LOGO_ORIGEN))
  }
  return `data:image/png;base64,${readFileSync(LOGO).toString('base64')}`
}

/** Las tres pestañas, de una sola lectura. SÓLO LECTURA: este script no escribe en el Sheet. */
async function leerSheet() {
  const g = makeGoogleClient({ config: loadConfig() })
  const [cobranzas, obras, calendario] = await Promise.all([
    g.readSheetValues(SHEET, 'Cobranzas!A1:AB400', { render: 'UNFORMATTED_VALUE' }),
    g.readSheetValues(SHEET, 'OBRAS!A1:AB200'),
    g.readSheetValues(SHEET, 'Calendario de Cobros!A2:A2'),
  ])
  return { cobranzas, obras, calendarioA2: calendario?.[0]?.[0] ?? '' }
}

/**
 * LA IDENTIDAD DEL CLIENTE: Postgres primero, el documento declarado después.
 *
 * `clientes` es la fuente única y gana siempre que tenga el dato. Hoy tiene el nombre pero no el
 * CUIT de ninguno de los dos, así que el CUIT sale de la factura — y cuando tampoco está ahí, el
 * documento imprime "a confirmar por Administración" en vez de un número.
 */
async function identidadDe(canonico) {
  const declarada = contratoDeclarado(canonico).identidad ?? {}
  const { rows } = await query(
    'select nombre_comercial, razon_social, cuit from public.clientes where nombre_comercial = $1',
    [canonico])
  const pg = rows[0] ?? {}
  return {
    nombre: declarada.nombre ?? pg.nombre_comercial ?? canonico,
    razonSocial: pg.razon_social ?? declarada.razonSocial ?? null,
    cuit: formatearCuit(pg.cuit) ?? declarada.cuit ?? null,
    domicilio: declarada.domicilio ?? null,
    fuente: declarada.fuente ?? 'public.clientes',
  }
}

/** "30716699648" → "30-71669964-8". Null se propaga: no hay CUIT por defecto. */
const formatearCuit = (v) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : null
}

/**
 * LA CUENTA PARA TRANSFERENCIAS.
 *
 * `cuentas_financieras` guarda el nombre de la cuenta pero NO tiene columnas de CBU ni alias
 * (verificado el 24/08/2026 sobre el esquema real). Así que el bloque sale con el banco que sí
 * consta y "a confirmar por Administración" en lo que falta. Un CBU inventado en un documento de
 * cobranza manda una transferencia a ninguna parte.
 */
async function cuentaBancaria() {
  const { rows } = await query(
    `select nombre from public.cuentas_financieras
      where tipo = 'banco' and nombre ilike '%santander%' order by nombre limit 1`)
  return {
    titular: 'Echegaray Construcciones SAS',
    cuit: '30-71630464-3',
    cuenta: rows[0]?.nombre ?? null,
    cbu: null,
    alias: null,
  }
}

/** El HTML al PDF, con el chromium que el repo ya usa para los tests de navegador. */
async function aPdf(html, destino) {
  const { chromium } = await import('playwright')
  const navegador = await chromium.launch()
  try {
    const pagina = await navegador.newPage()
    await pagina.setContent(html, { waitUntil: 'load' })
    await pagina.pdf({ path: destino, format: 'A4', printBackground: true })
  } finally {
    await navegador.close()
  }
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2))
  const cliente = resolverCliente(args.cliente)
  const corte = serialDeISO(args.corte ?? new Date().toISOString().slice(0, 10))
  const salida = resolve(args.salida ?? join(RAIZ, '..', 'salida', 'estados-de-cuenta'))
  mkdirSync(salida, { recursive: true })

  const { cobranzas, obras, calendarioA2 } = await leerSheet()
  const [identidad, cuenta] = await Promise.all([identidadDe(cliente), cuentaBancaria()])
  if (args.nombre) identidad.nombre = args.nombre

  const modelo = armarEstadoDeCuenta({
    cliente, corte, filasCobranzas: cobranzas, filasObras: obras, calendarioA2, identidad, cuenta,
  })
  const iso = fechaAR(corte).split('/').reverse().join('-')
  const archivo = join(salida, `Estado de cuenta · ${identidad.nombre} · ${iso}.pdf`)
  const html = documentoHtml(modelo, logoEmbebido())
  writeFileSync(archivo.replace(/\.pdf$/, '.html'), html)
  await aPdf(html, archivo)

  console.log(`✓ ${archivo}`)
  console.log(`  obras ${modelo.obras.length} · cobros ${modelo.movimientos.length} `
    + `· vencimientos ${modelo.vencimientos.length} · saldo ${modelo.aging.total.toLocaleString('es-AR')}`)
  // LOS CONTROLES SE GRITAN TAMBIÉN EN LA CONSOLA. Quien corre el script tiene que enterarse sin
  // abrir el PDF de que ese archivo NO se puede mandar.
  for (const c of modelo.controles) console.log(`  ▲ CONTROL INTERNO — ${c}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error(`✖ ${e.message}`)
    process.exit(1)
  })
}

export { leerArgumentos, resolverCliente, formatearCuit }
