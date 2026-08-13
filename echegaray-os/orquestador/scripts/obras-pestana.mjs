#!/usr/bin/env node
// `OBRAS` — TODAS LAS OBRAS DEL AÑO EN UNA PESTAÑA. EL ESCRITOR.
//
// QUÉ HACE (07/08/2026). Publica la grilla de lib/obras-grilla.mjs en el Sheet 'Flujo de Caja - Cash
// Flow': la Sección 1 (venta/cobrado/pendiente/materiales por cliente, todo fórmula viva) y la
// Sección 2 (las obras de lib/obras-datos.mjs, con los proyectados del dueño como únicos números
// tipeados).
//
// EL DEFECTO ES NO ESCRIBIR. Sin `--escribir`, la corrida es un ensayo: resuelve las columnas reales
// por rótulo, construye la grilla y muestra el resumen — y no toca el archivo. Es la dirección segura
// para equivocarse: este repo ya pagó seis pérdidas del trabajo del dueño por escrituras que
// "solo probaban".
//
// LAS COLUMNAS SE RESUELVEN POR RÓTULO, NUNCA POR LETRA FIJA. Si "Obra / Cliente" se muda de la G a
// la H, la fórmula tiene que mudarse sola; y si un rótulo no está, el script ROMPE en vez de escribir
// fórmulas que suman la columna equivocada sin un solo error.
//
// LOS TRES MODOS, DE MÁS SEGURO A MENOS:
//
//   --dry       EN SECO. No abre cliente de Google, no lee, no escribe: arma la grilla con las
//               columnas por DEFECTO (REFS_OBRAS) y la imprime entera. Sirve para juzgar la FORMA de
//               la pestaña —filas, bloques, fórmulas— sin el archivo delante. Lo que NO prueba: que
//               los rótulos sigan donde estaban. Eso sólo lo dice el ensayo.
//   (sin flags) ENSAYO. Resuelve las columnas contra los encabezados VIVOS y muestra el resumen. Lee,
//               no escribe.
//   --escribir  PUBLICA en el Sheet real.
//
// Por qué `--dry` no toca ni una lectura: este repo ya pagó el caso contrario. Un `--dry` que cortaba
// antes de la grilla pero no antes de agrandar la hoja llevó dos pestañas reales a otro tamaño desde
// un worktree (ver scripts/cash-flow-vistas.test.mjs). Un ensayo en seco que toca el archivo no sirve
// para decidir si tocar el archivo.
//
//   node orquestador/scripts/obras-pestana.mjs --dry      # en seco, imprime la grilla (offline)
//   node orquestador/scripts/obras-pestana.mjs            # ensayo contra el archivo (no escribe)
//   node orquestador/scripts/obras-pestana.mjs --escribir # publica en el Sheet real

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL, PORCENTAJE } from '../lib/formato-statement.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
import {
  grillaObras, anchoColumnaA, celdasEnError, columnasDesparejas, problemaDeSintaxis, clientesDeCobranzas,
  conColaLimpiable, trabajosFueraDeObra, variantesDe, ANCHO_HISTORICO, ALTO_HISTORICO,
  ANCHO_OBRAS, ANCHOS_OBRAS, PESTANA_OBRAS, REFS_OBRAS, SIN_CONTRATO, saldoContratoMalPublicado,
} from '../lib/obras-grilla.mjs'
import { contratoDeObra, monedasDesconocidas, normalizarMoneda } from '../lib/cobranzas-contrato.mjs'
import { RANGO_TC } from '../lib/caja-disponibilidades.mjs'
import { OBRAS_FUTURAS, totalEgresos } from '../lib/obras-datos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ESCRIBIR = process.argv.includes('--escribir')
const DRY = process.argv.includes('--dry')

/** La letra de una columna 0-based, tolerante a más de 26 (26 → 'AA'). */
export const letra = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

/**
 * Resuelve las columnas de una pestaña buscando cada RÓTULO en sus primeras filas.
 *
 * `rotulos` mapea campo → criterio: un string exige igualdad exacta (trim), una RegExp prueba.
 * La fila de encabezado es la primera que contiene el rótulo ANCLA (el primero de la lista), y todos
 * los demás se exigen EN ESA MISMA FILA: un "Estado" suelto de otra fila no es el Estado del registro.
 * ROMPE si falta alguno — mejor no escribir que sumar la columna equivocada en silencio.
 */
export function resolverColumnas(filas, rotulos) {
  const entradas = Object.entries(rotulos)
  // LOS ESPACIOS DE MÁS NO SON PARTE DEL NOMBRE. El encabezado real dice "ORDEN DE  COMPRA" —con DOS
  // espacios— y por eso un criterio escrito con uno solo no matcheaba: la columna quedaba sin
  // resolver y su `undefined` se interpolaba en la fórmula. Se normaliza cualquier corrida de
  // espacios a uno antes de comparar, de los dos lados.
  const norm = (x) => String(x ?? '').replace(/\s+/g, ' ').trim()
  const matchea = (celda, crit) => {
    const t = norm(celda)
    return crit instanceof RegExp ? crit.test(t) : t === norm(crit)
  }
  const [, ancla] = entradas[0]
  const iFila = (filas ?? []).findIndex((f) => (f ?? []).some((c) => matchea(c, ancla)))
  if (iFila < 0) throw new Error(`no encontré el rótulo ancla ${ancla} en las primeras filas`)
  const fila = filas[iFila]
  const res = { desde: iFila + 2 }
  for (const [campo, crit] of entradas) {
    const iCol = fila.findIndex((c) => matchea(c, crit))
    if (iCol < 0) throw new Error(`el rótulo ${crit} (campo "${campo}") no está en la fila de encabezado ${iFila + 1}`)
    res[campo] = letra(iCol)
  }
  return res
}

const COLS = 'ABCDEFGHI'
const cortar = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)
const izq = (s, n) => cortar(s, n).padEnd(n)
const der = (s, n) => cortar(s, n).padStart(n)

/**
 * Lo que una celda MUESTRA en el ensayo.
 *
 * El centinela `VACIO` se dibuja vacío a propósito: significa "esta celda es mía y va vacía", no es un
 * dato — mostrarlo como texto haría leer la grilla como si tuviera contenido donde no lo tiene.
 */
export function celdaTexto(v) {
  if (v === VACIO || v === undefined || v === null || v === '') return ''
  if (typeof v === 'number') return v.toLocaleString('es-AR')
  return String(v)
}

/**
 * LA GRILLA IMPRESA, PARA JUZGARLA SIN ABRIR EL SHEET.
 *
 * Tres partes: el resumen, la anatomía de cada obra (dónde está la protagonista, qué filas suma y
 * cuál queda AFUERA por ser máquina propia) y la grilla celda por celda. Las fórmulas van marcadas
 * con `ƒ` en la grilla y COMPLETAS al final, con su referencia: recortarlas en la tabla escondería
 * justo lo que hay que revisar (el separador `;`, el rango, el cliente por el que filtra).
 */
export function render(g, obras = []) {
  const L = []
  const proyectado = obras.reduce((s, o) => s + totalEgresos(o), 0)
  L.push(`${PESTANA_OBRAS} — ENSAYO EN SECO. Columnas por DEFECTO (REFS_OBRAS), no las del archivo vivo:`)
  L.push('esto verifica la FORMA de la grilla; que los rótulos sigan en su lugar lo dice el ensayo sin --dry.')
  L.push('')
  L.push(`${g.filas.length} filas × ${ANCHO_OBRAS} columnas · ${obras.length} obras · ${g.tipeadas.length} celdas tipeadas`
    + ` · $${Math.round(proyectado).toLocaleString('es-AR')} proyectados de caja`)
  L.push('')
  L.push('LAS OBRAS QUE SALEN')
  // El ancho sale de los rótulos, no de un número elegido a ojo: con 50 fijos "Quattropani - Melisa
  // García SAS — SALÓN COMERCIAL" se cortaba, y ésta es justo la lista que existe para decir QUÉ obras
  // salen. Una evidencia que recorta el nombre de la obra no es evidencia de esa obra.
  const anchoRotulo = Math.max(0, ...(g.bloques ?? []).map((b) => String(g.filas[b.fProt - 1]?.[0] ?? '').length))
  for (const b of g.bloques ?? []) {
    L.push(`  fila ${String(b.fProt).padStart(3)}  ${izq(String(g.filas[b.fProt - 1]?.[0] ?? ''), anchoRotulo)}`
      + `  detalle ${b.fDetalle[0]}–${b.fDetalle[1]} · MO ${b.fMO}`
      + `${b.fNoCaja ? ` · no-caja ${b.fNoCaja} (FUERA de las sumas)` : ''}`
      + `${b.proyectable ? '' : ' · ⚠ sin fechas, no se proyecta'}`)
  }
  L.push('')
  L.push('GRILLA  (ƒ = fórmula, texto completo abajo)')
  // Los anchos dan para el RÓTULO COMPLETO de cada columna: "Cobrado (total)" son 15 caracteres y
  // con 13 el ensayo mostraba "Cobrado (tot…". Una evidencia que recorta el nombre de la columna que
  // se está juzgando no sirve para juzgarla — es el mismo criterio que la lista de obras de arriba.
  const anchos = [52, 8, 15, 15, 15, 15, 15, 10, 15]
  L.push(`fila │ ${anchos.map((n, i) => izq(COLS[i], n)).join(' │ ')}`)
  const formulas = []
  g.filas.forEach((fila, i) => {
    const celdas = fila.map((v, c) => {
      const t = celdaTexto(v)
      if (!t.startsWith('=')) return t
      formulas.push([`${COLS[c]}${i + 1}`, t])
      return 'ƒ'
    })
    const cuerpo = anchos.map((n, c) => (c === 0 || c === 1 ? izq(celdas[c], n) : der(celdas[c], n))).join(' │ ')
    L.push(`${String(i + 1).padStart(4)} │ ${cuerpo}`)
  })
  L.push('')
  L.push(`FÓRMULAS (${formulas.length})`)
  for (const [ref, f] of formulas) L.push(`  ${ref.padEnd(5)} ${f}`)
  return L.join('\n')
}

/**
 * LOS RÓTULOS DE COBRANZAS QUE ESTA PESTAÑA CITA. Están EXPORTADOS a propósito: el test los importa
 * y los prueba contra el encabezado real, en vez de escribir su propia copia del criterio. Un test
 * que repite el patrón que juzga compara las dos puntas del mismo lado — así ya pasó un `#ERROR!` a
 * las 7 obras del archivo del dueño.
 *
 * `neto` es la columna del IVA hacia abajo: la venta se mide ahí, no en el total. `forma` y
 * `fechaCobro` son lo que el dueño pidió ver por obra (a quién reclamarle y cuándo).
 */
export const ROTULOS_COBRANZAS = {
  cliente: 'Obra / Cliente', concepto: 'Concepto', neto: /^Monto neto/i, categoria: /^Categor/i,
  // La ORDEN DE COMPRA reconoce la obra cuando el Concepto no la nombra. Faltaba acá, y por eso
  // se publicaron 40 celdas con #ERROR!: la grilla la usaba y el escritor no la resolvía.
  oc: /^(OC|ORDEN DE COMPRA)$/i,
  total: /^TOTAL a cobrar/, estado: 'Estado', fechaCobro: /^Fecha de cobro|^Fecha cobro/i,
  // LAS RETENCIONES SUFRIDAS ($7.671.680 en 2026). El criterio es el plural con "s": el archivo
  // tiene además TRES columnas de desglose que empiezan con "Retención" en singular ("Retención
  // 16,8%…", "Ret Ganancias", "Retención 2,5%/3,5%…"), y elegir una de ésas publicaría una parte
  // del retenido sin dar un solo error. Si el rótulo cambia, el escritor ROMPE antes de escribir.
  retenciones: /^Retenciones\b/i,
  // La FECHA DE VENTA acota el año de la venta (devengado); la de cobro, el de la plata.
  fechaVenta: /^Fecha\s*(de\s*)?venta/i, forma: /^Forma de [Cc]obro/,
  // LA MONEDA (13/08). Sin esta columna la pestaña sumaba U$S 15.400 como $15.400 — dólares y pesos
  // en el mismo total. Va con el mismo criterio que las demás: si el rótulo no está, el escritor
  // ROMPE. Publicar la pestaña sin poder distinguir la moneda es peor que no publicarla.
  moneda: /^Moneda$/i,
}

/** El índice 0-based de una letra de columna ('A'→0, 'AA'→26). El inverso de `letra`. */
export const indiceDeLetra = (s) => String(s).toUpperCase().split('')
  .reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1

/**
 * EL CONTRATO DE CADA OBRA, LEÍDO DE COBRANZAS EN ESTA MISMA CORRIDA.
 *
 * POR QUÉ SE LEE Y NO SE DECLARA (13/08). Se le preguntó al dueño si quería declarar el monto
 * contratado por obra y contestó: *"ya tenes todo lo necesario en pestaña cobranzas"*. La columna
 * ORDEN DE COMPRA lo dice fila por fila. Leerlo acá —en vez de tipearlo en `obras-datos.mjs`— es lo
 * que impide que el número se fosilice: el día que el dueño corrija esa celda, la pestaña lo toma en
 * la corrida siguiente sin que nadie toque el código.
 *
 * @returns {{filas:Array<Array>, contratos:Map<string,object>, monedasRaras:Array, hayUSD:boolean}}
 */
export function leerContratos(filas, refs, obras) {
  const cols = {
    cliente: indiceDeLetra(refs.cob.cliente), concepto: indiceDeLetra(refs.cob.concepto),
    oc: indiceDeLetra(refs.cob.oc), moneda: indiceDeLetra(refs.cob.moneda),
  }
  const porCliente = obras.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  const contratos = new Map()
  for (const o of obras) {
    contratos.set(o.clave, contratoDeObra(filas, cols, {
      variantes: variantesDe(o.cliente), needle: o.ventaTexto, unica: porCliente.get(o.cliente) === 1,
    }, refs.cob.desde))
  }
  return {
    contratos,
    monedasRaras: monedasDesconocidas(filas, cols.moneda, refs.cob.desde),
    hayUSD: filas.some((f) => normalizarMoneda(f?.[cols.moneda]) === 'USD'),
  }
}

/**
 * LAS DOS GUARDAS DE MONEDA. Las dos fallan CERRADAS, y por el mismo motivo: la pestaña suma pesos.
 *
 * 1 · UNA MONEDA QUE NO SE ENTIENDE. La fórmula reparte en dos baldes —lo que dice "USD" se valúa y
 *   todo lo demás se suma como pesos—, así que un "EUR" tipeado mañana entraría al total como pesos
 *   sin un solo error a la vista. Es el mismo defecto que este trabajo vino a arreglar, con otro
 *   código. El `0` de las filas ID 35/36 NO cae acá: está declarado como basura de formato y se lee
 *   como pesos, que es lo que esas dos filas son.
 *
 * 2 · EL TIPO DE CAMBIO TIENE QUE ESTAR, HAYA DÓLARES O NO. No es exceso de celo: TODAS las sumas de
 *   la pestaña citan `TIPO_CAMBIO_USD`, aunque el importe en dólares sea cero. Si el rango con nombre
 *   no existe, las celdas de plata publican `#NAME?`; si existe y está vacío, `#VALUE!` (en Sheets un
 *   número por "" no es cero, es un error). El escritor releería el desastre y abortaría DESPUÉS de
 *   haberlo escrito — o sea, con la pestaña ya rota en la cara del dueño.
 *
 *   La fórmula NO se blinda con un `N()` que convierta el vacío en cero, a propósito: eso publicaría
 *   una venta $22,9M corta con cara de número sano. Que grite es la conducta correcta; lo que hay que
 *   evitar es que llegue a gritar en el archivo del dueño, y para eso está esta guarda.
 */
export async function verificarMoneda(google, { monedasRaras, hayUSD }) {
  if (monedasRaras.length) {
    throw new Error(`${monedasRaras.length} fila(s) de ${REFS_OBRAS.cob.hoja} declaran una moneda que no entiendo: `
      + `${monedasRaras.slice(0, 6).map((m) => `fila ${m.fila}="${m.valor}"`).join(' · ')}. `
      + 'Se sumarían como PESOS sin dar error. NO escribo hasta que la columna diga USD o quede vacía.')
  }
  const leido = await google.readSheetValues(ID, RANGO_TC, { render: 'UNFORMATTED_VALUE' }).catch(() => null)
  const tc = Number(leido?.[0]?.[0])
  if (!Number.isFinite(tc) || tc <= 0) {
    throw new Error(`el rango con nombre ${RANGO_TC} no trae un tipo de cambio (leí ${JSON.stringify(leido)}). `
      + 'Lo publica el bloque de CAJA y TODA suma de esta pestaña lo cita: sin él las celdas de plata '
      + `quedarían en #NAME?/#VALUE!${hayUSD ? ', y además hay filas en USD que no se podrían valuar' : ''}. NO escribo.`)
  }
  console.log(`  ✓ ${RANGO_TC} = ${tc.toLocaleString('es-AR')}`
    + `${hayUSD ? ' — hay filas en USD y se valúan a ese tipo de cambio' : ' — sin filas en USD, pero toda suma lo cita'}`)
  return tc
}

/** Las referencias REALES del archivo, resueltas por rótulo contra los encabezados vivos. */
async function refsReales(google) {
  const [cob, cmp, matColA] = await Promise.all([
    google.readSheetValues(ID, `${REFS_OBRAS.cob.hoja}!A1:AB8`),
    google.readSheetValues(ID, `${REFS_OBRAS.cmp.hoja}!A1:AJ8`),
    google.readSheetValues(ID, `${REFS_OBRAS.mat.hoja}!A1:A100`),
  ])
  const refs = {
    cob: {
      hoja: REFS_OBRAS.cob.hoja,
      ...resolverColumnas(cob, ROTULOS_COBRANZAS),
    },
    cmp: {
      hoja: REFS_OBRAS.cmp.hoja,
      // "Importe" es el NETO de Compras (M = Total − IVA); "Total" (O) lleva el IVA. El costo se mide
      // en el neto porque la venta también: el IVA de compras es crédito fiscal, no costo.
      ...resolverColumnas(cmp, {
        proveedor: 'Proveedor', cliente: 'Cliente / Asignación', fecha: 'Fecha factura',
        // El neto es "Importe"; el IVA hace falta para la regla "M si está, si no O − N".
        neto: 'Importe', iva: 'IVA', total: 'Total', familia: 'Familia de material',
      }),
    },
    mat: REFS_OBRAS.mat,
  }
  // Los anclajes de Materiales se verifican por TEXTO: la fórmula INDEX/MATCH que la grilla escribe
  // depende de que existan, y un MATCH que no encuentra deja "—" en seis celdas sin gritar.
  const colA = (matColA ?? []).map((f) => String(f?.[0] ?? '').trim())
  for (const r of [REFS_OBRAS.mat.filaTotal, REFS_OBRAS.mat.filaCabecera]) {
    if (!colA.includes(r)) throw new Error(`la pestaña ${REFS_OBRAS.mat.hoja} no tiene el rótulo "${r}": la columna de materiales quedaría muda`)
  }
  return refs
}

async function main() {
  // LOS DOS MODOS JUNTOS NO SIGNIFICAN NADA, así que no se elige por mí: aborta. Adivinar cuál gana es
  // exactamente cómo un "sólo estaba probando" termina escribiendo.
  if (DRY && ESCRIBIR) throw new Error('--dry y --escribir son incompatibles: elegí uno.')
  if (DRY) {
    const seco = grillaObras({ obras: OBRAS_FUTURAS })
    if (!seco.filas.length) throw new Error('la grilla salió vacía: no hay nada que mostrar ni que escribir.')
    return console.log(render(seco, OBRAS_FUTURAS))
  }

  const google = ESCRIBIR
    ? makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
    : makeGoogleClient({})
  const refs = await refsReales(google)
  // SE LISTAN TODAS. El log anterior nombraba cuatro columnas elegidas a mano y la que faltaba —la
  // Orden de Compra— no aparecía: la pista estaba en pantalla y pasó de largo por no estar listada.
  for (const [hoja, r] of [['Cobranzas', refs.cob], ['Compras', refs.cmp]]) {
    const cols = Object.entries(r).filter(([k]) => !['hoja', 'desde'].includes(k)).map(([k, v]) => `${k}=${v}`)
    console.log(`columnas resueltas por rótulo · ${hoja}: ${cols.join(' ')} (desde ${r.desde})`)
  }

  // LOS CLIENTES SE LEEN DEL ARCHIVO, NO SE TIPEAN. Una lista escrita en el código deja fuera del
  // cuadro a todo cliente nuevo —y nadie se entera—: es el defecto que el dueño cazó mirando la
  // pestaña. Rango abierto: el que se factura mañana entra solo en la próxima corrida.
  // SE LEE LA PESTAÑA ENTERA, NO SÓLO LA COLUMNA DE CLIENTE: el contrato de cada obra vive en la
  // Orden de Compra y la moneda en la col AA, y las tres cosas salen de la MISMA lectura — así no
  // puede pasar que el contrato se derive de un estado del archivo y la lista de clientes de otro.
  const datos = await google.readSheetValues(ID, `${refs.cob.hoja}!A${refs.cob.desde}:${refs.cob.moneda}`,
    { render: 'UNFORMATTED_VALUE' }) ?? []
  const iCli = indiceDeLetra(refs.cob.cliente)
  const clientes = clientesDeCobranzas(datos.map((f) => f?.[iCli]))
  if (!clientes.length) throw new Error(`no leí un solo cliente en ${refs.cob.hoja}!${refs.cob.cliente}: NO escribo una Sección 1 vacía.`)
  console.log(`clientes derivados de ${refs.cob.hoja}: ${clientes.length} · ${clientes.join(' · ')}`)

  const { contratos, monedasRaras, hayUSD } = leerContratos(datos, refs, OBRAS_FUTURAS)
  await verificarMoneda(google, { monedasRaras, hayUSD })
  const obras = OBRAS_FUTURAS.map((o) => ({ ...o, contrato: contratos.get(o.clave)?.contrato ?? null }))
  for (const o of obras) {
    const c = contratos.get(o.clave)
    console.log(`  contrato · ${o.clave}: ${o.contrato === null ? 'NO DECLARADO en ninguna fila — publico "—"'
      : `$${o.contrato.toLocaleString('es-AR')}${c.partido ? ` (PARTIDO: ${c.distintos.map((d) => `$${d.toLocaleString('es-AR')}`).join(' + ')})` : ''}`
        + ` · declarado en ${c.valores.length} fila(s): ${c.valores.map((v) => v.fila).join(', ')}`}`)
  }

  const g = grillaObras({ obras, refs, clientes })
  // GUARDA FAIL-CLOSED. Una grilla sin obras no es "una pestaña con poco": es el insumo que no cargó.
  // Escribirla dejaría la pestaña en blanco, que es la forma que tomaron las pérdidas de este repo.
  if (!g.bloques.length) throw new Error('la grilla no trajo ni una obra: NO escribo una pestaña vacía.')
  // UNA FÓRMULA QUE NO PARSEA NO SE ESCRIBE. Sheets la publica como #ERROR! —ya pasó, en las 7 obras—
  // y esto se puede saber ANTES de tocar el archivo: es texto, y el texto se cuenta.
  const rotas = g.filas.flatMap((fila, i) => fila
    .map((v, c) => (typeof v === 'string' && v.startsWith('=') ? [`${letra(c)}${i + 1}`, problemaDeSintaxis(v)] : null))
    .filter((x) => x && x[1]))
  if (rotas.length) throw new Error(`${rotas.length} fórmula(s) no parsean y Sheets las publicaría como #ERROR!: `
    + `${rotas.slice(0, 5).map(([ref, why]) => `${ref} (${why})`).join(' · ')}. NO escribo.`)
  const proyectado = OBRAS_FUTURAS.reduce((s, o) => s + totalEgresos(o), 0)
  console.log(`${PESTANA_OBRAS}: ${g.filas.length} filas · ${OBRAS_FUTURAS.length} obras · ${g.tipeadas.length} celdas tipeadas (los proyectados del dueño) · $${Math.round(proyectado).toLocaleString('es-AR')} proyectados`)
  if (!ESCRIBIR) return console.log('ENSAYO (sin --escribir): no escribí nada.')

  const hojas = await google.getSheetMeta(ID)
  let hoja = hojas.find((h) => h.title === PESTANA_OBRAS)
  // LA PESTAÑA SE CREA CON ALTO DE SOBRA: un batch que apunta más allá del alto real aborta ENTERO.
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTANA_OBRAS, gridProperties: { rowCount: g.filas.length + 40, columnCount: ANCHO_OBRAS, frozenRowCount: 2 } } },
    }])
    hoja = hallarPestana(await google.getSheetMeta(ID), PESTANA_OBRAS)
    console.log(`  ✚ creé la pestaña ${PESTANA_OBRAS}`)
  }
  const alto = Math.max(ALTO_HISTORICO + 20, hoja.rows ?? 0)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' },
    }])
  }

  // Una fila más ancha que la tabla hace que la API rechace el batch ENTERO. Se verifica ANTES.
  const malas = g.filas.map((f, i) => (f.length > ANCHO_OBRAS ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que ${ANCHO_OBRAS} columnas: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA: sin esta lectura la Regla 0 decide a ciegas.
  const actual = await google.readSheetValues(ID, `${PESTANA_OBRAS}!A1:${letra(ANCHO_OBRAS - 1)}`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA_OBRAS}" (${e.message}). NO escribo.`)
  })
  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA_OBRAS, g.filas, actual)
  g.filas = grid
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}")`)
  // SE ESCRIBE CON LA COLA, EN LOS DOS EJES: las columnas que este generador dejó de usar y las filas
  // que dejó de emitir van con el centinela VACIO para que la fusión las LIMPIE. Sacar algo del
  // código no lo saca de la pestaña — la columna I quedó publicada una vez y la fila 62, otra.
  const filasEmitidas = g.filas.length
  g.filas = conColaLimpiable(g.filas, ANCHO_HISTORICO, ALTO_HISTORICO)
  const escritura = await escribirPreservando(google, ID, PESTANA_OBRAS, g.filas, { respetar: false, anchoHoja: Math.max(ANCHO_HISTORICO, hoja.cols ?? ANCHO_HISTORICO) })
  // UNA PESTAÑA QUE NO SE ESCRIBIÓ NO CAMBIÓ DE FORMA: si el candado la retuvo, tampoco se formatea.
  if (escritura?.bloqueada || escritura?.editadaPorHumano) {
    console.log(`  🔒 "${PESTANA_OBRAS}" bajo tu control: no escribí, NO le toco el formato.`)
    return
  }

  await formatear(google, hoja.sheetId, g)
  const quedo = await google.readSheetValues(ID, `${PESTANA_OBRAS}!A1:${letra(ANCHO_OBRAS - 1)}${g.filas.length}`,
    { render: 'FORMATTED_VALUE' }).catch(() => [])
  await guardarRegistro(ID, PESTANA_OBRAS, g.filas, ediciones, quedo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  // ═══ LO QUE SHEETS EVALUÓ, NO LO QUE YO ESCRIBÍ ═══
  //
  // Este es el único paso que puede desmentirme. Los tests comparan el texto que emito contra el
  // texto que espero —las dos puntas del mismo lado— y por eso dejaron pasar un #ERROR! a las 7
  // obras del archivo del dueño. Acá se relee lo PUBLICADO, ya evaluado por Sheets, y si hay un solo
  // error la corrida termina en rojo diciendo en qué celda. Una pestaña que publica #ERROR! es peor
  // que una que no se escribió: la primera se lee como un dato.
  if (!quedo.length) throw new Error('escribí pero no pude releer la pestaña: no puedo afirmar que quedó sana.')
  const enError = celdasEnError(quedo)
  if (enError.length) {
    throw new Error(`QUEDÓ PUBLICADO CON ${enError.length} CELDA(S) EN ERROR: `
      + `${enError.slice(0, 8).map((x) => `${x.ref}=${x.valor}`).join(' · ')}`
      + `${enError.length > 8 ? ` … y ${enError.length - 8} más` : ''}.\n`
      + `LA PESTAÑA "${PESTANA_OBRAS}" QUEDÓ ROTA EN EL ARCHIVO Y HAY QUE VOLVER ATRÁS A MANO: no existe\n`
      + 'un rollback automático — este escritor no guarda la versión previa. En el Sheet:\n'
      + '  Archivo → Historial de versiones → Ver historial de versiones → restaurar la anterior a esta corrida.\n'
      + 'Después corregir la fórmula y correr primero SIN --escribir (el ensayo resuelve las columnas\n'
      + 'contra el archivo vivo y aborta si alguna no resuelve, que es donde se caza esta clase de defecto).')
  }
  // UN VACÍO NO ES UN #ERROR!, Y MIENTE MÁS: se lee como un dato. Si una columna salió llena en unas
  // obras y vacía en otras, alguna fórmula se rompió en silencio — pasó con `Próx. cobro`, 4 de 7.
  const desparejas = columnasDesparejas(g.filas, quedo, g.protagonistas ?? [])
  if (desparejas.length) {
    throw new Error(`QUEDÓ PUBLICADO CON COLUMNA(S) DESPAREJA(S): `
      + desparejas.map((d) => `${d.columna} vacía en ${d.filas.length} de ${d.de} obras (filas ${d.filas.join(', ')})`).join(' · ')
      + '. Una fórmula devolvió vacío donde las demás dieron valor: revisala antes de creerle a la pestaña.')
  }
  // ═══ EL CONTROL DE LAS COLUMNAS DEL CONTRATO, QUE `columnasDesparejas` YA NO PUEDE HACER ═══
  //
  // Ese control sólo mira columnas donde TODAS las obras llevan fórmula, y desde hoy la B y la I son
  // mixtas: la obra sin contrato declarado publica el guion. Perder la verificación no es una opción
  // —la pestaña ya publicó una columna en blanco en 4 de 7 obras sin que nada gritara— así que se
  // reemplaza por una más específica: cada obra tiene que haber publicado EXACTAMENTE lo que su
  // contrato permite. Con contrato, su fórmula viva; sin contrato, el guion. Nada intermedio.
  //
  // SE RELEE LA FÓRMULA, NO LO QUE SE VE. El formato de moneda dibuja el CERO como "—", el mismo
  // glifo que `SIN_CONTRATO`: mirando la pantalla, una obra 100% facturada (saldo cero) es
  // indistinguible de una que no declara contrato. Este control abortó cinco obras sanas por eso.
  // El motivo entero está en `saldoContratoMalPublicado`.
  const formulas = await google.readSheetValues(ID, `${PESTANA_OBRAS}!A1:${letra(ANCHO_OBRAS - 1)}${g.filas.length}`,
    { render: 'FORMULA' }).catch(() => [])
  if (!formulas.length) throw new Error('escribí pero no pude releer las FÓRMULAS: no puedo verificar la columna del contrato.')
  const malCont = saldoContratoMalPublicado(g.bloques, formulas)
  if (malCont.length) throw new Error(`LA COLUMNA "Saldo contrato" NO QUEDÓ COMO CORRESPONDE: ${malCont.join(' · ')}.`)
  const conContrato = g.bloques.filter((b) => b.contrato).length
  console.log(`  ✓ saldo de contrato publicado en ${conContrato} de ${g.bloques.length} obras `
    + `(las otras no declaran contrato en ninguna fila de ${REFS_OBRAS.cob.hoja} y publican "${SIN_CONTRATO}")`)

  // ═══ EL CONTROL QUE ANTES ERA UNA FILA DE LA PESTAÑA ═══
  //
  // El dueño sacó "⇒ sin ubicar" dos veces: un renglón que dice $0 todos los días no es información.
  // La verificación no se perdió, se mudó acá: si la suma de los clientes no da el total de la
  // fuente, hay plata facturada que no entró en ninguna fila y el generador lo dice. Vive en el log
  // y no en la portada, que es donde el dueño quería que no estuviera.
  const num = (v) => Number(String(v ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [cli0, cli1] = g.fClientes
  const sumaClientes = quedo.slice(cli0 - 1, cli1).reduce((s, f) => s + num(f?.[2]), 0)
  const totalFuente = num(quedo[g.totales[0] - 1]?.[2])
  const sinUbicar = Math.round((totalFuente - sumaClientes) * 100) / 100
  if (Math.abs(sinUbicar) > 1) {
    throw new Error(`SIN UBICAR $${sinUbicar.toLocaleString('es-AR')}: la venta de los ${cli1 - cli0 + 1} clientes `
      + `($${sumaClientes.toLocaleString('es-AR')}) no da el total de Cobranzas ($${totalFuente.toLocaleString('es-AR')}). `
      + 'Hay un cliente que el mecanismo no supo ubicar — revisar ALIAS_CLIENTE y la lista derivada.')
  }
  console.log(`  ✓ sin ubicar: $0 — la suma de los ${cli1 - cli0 + 1} clientes da el total de Cobranzas`)

  // ═══ EL CONTROL QUE ANTES ERA LA FILA "Otros trabajos…" DE LA SECCIÓN 2 ═══
  //
  // El dueño sacó la fila; la identidad que verificaba sigue viva acá y contra lo YA PUBLICADO. Las
  // obras declaradas son un subconjunto de lo que se le factura a sus clientes, así que el sobrante
  // es normal — lo IMPOSIBLE es que sea negativo, y eso ya se publicó una vez ($692.395.550 donde
  // iban $125.680.764) sin que Sheets diera un solo error.
  if (g.totales[1]) {
    const conObra = [...new Set(OBRAS_FUTURAS.map((o) => o.cliente))]
    const sinFila = conObra.filter((c) => !g.filaDeCliente?.[c])
    if (sinFila.length) throw new Error(`no puedo controlar el doble conteo: ${sinFila.join(' · ')} tiene obra `
      + 'declarada y no salió como fila de cliente en la Sección 1. NO afirmo que la pestaña cierre.')
    const ventaClientes = conObra.reduce((s, c) => s + num(quedo[g.filaDeCliente[c] - 1]?.[2]), 0)
    const ventaObras = num(quedo[g.totales[1] - 1]?.[2])
    const { fuera, problema } = trabajosFueraDeObra(ventaClientes, ventaObras)
    if (problema) throw new Error(`DOBLE CONTEO EN LA SECCIÓN 2: ${problema}.`)
    console.log(`  ✓ las ${g.bloques.length} obras suman $${Math.round(ventaObras).toLocaleString('es-AR')} dentro de los `
      + `$${Math.round(ventaClientes).toLocaleString('es-AR')} de sus ${conObra.length} clientes `
      + `— $${Math.round(fuera).toLocaleString('es-AR')} son trabajos fuera de obra`)
  }
  console.log(`QUEDÓ ESCRITO — releí ${quedo.length} filas (${filasEmitidas} con contenido): sin celdas en error y sin columnas desparejas.`)
}

/**
 * EL FORMATO — el mismo lenguaje que CAJA y su anexo: encabezado chico, importes protagonistas, el
 * "$" sólo en las filas de cierre, la prosa gris y al final. SE RESETEA TODO AL ESTÁNDAR y recién
 * después se pintan las excepciones: un formateador que sólo aplica apila corridas.
 */
async function formatear(google, sheetId, g) {
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO_OBRAS) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [
    { unmergeCells: { range: r(0, Math.max(n, 40)) } },
    E.reset(sheetId, Math.max(n + 20, 120), ANCHO_OBRAS),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 2 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } },
  ]
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })
  const borde = (rg) => req.push({ updateBorders: { range: rg, bottom: { style: 'SOLID', color: HAIR } } })

  // Los importes: C..G y la I (Saldo contrato), a la derecha, sin "$" en el cuerpo. El "$" es del
  // cierre, no de cada celda. La I entra a la lista y no a un caso aparte: es plata como las otras.
  const PLATA = [2, 3, 4, 5, 6, 8]
  for (const c of PLATA) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  for (const f of [...(g.totales ?? []), ...(g.protagonistas ?? [])]) {
    for (const c of PLATA) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  // La B dejó de ser un glifo y pasó a ser el % cobrado: se dibuja como porcentaje, no como texto.
  fmt(r(0, n, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: PORCENTAJE, horizontalAlignment: 'RIGHT' })
  fmt(r(0, n, 7, 8), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  // …salvo en la Sección 1, donde la H lleva el RETENIDO. La columna está declarada como fecha por
  // el detalle de egresos de la Sección 2, y $7.671.680 con formato de fecha se dibuja como un día
  // del año 2110 — un dato correcto que se lee como basura hace desconfiar de la pestaña entera.
  for (const f of g.importeEnH ?? []) {
    fmt(r(f - 1, f, 7, 8), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: (g.totales ?? []).includes(f) ? MONEDA_TOTAL : MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })

  g.filas.forEach((fila, i) => {
    const t = String(fila[0] ?? '')
    if (/^\d · /.test(t)) { // '1 · OBRAS DEL AÑO' — el título del bloque no necesita línea propia
      fmt(r(i, i + 1), 'userEnteredFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK }, horizontalAlignment: 'LEFT' })
    }
    if (/^(Cliente|Obra)$/.test(t.trim())) { // los encabezados de sección: texto, nunca plata
      fmt(r(i, i + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
      fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
        { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    if (/^⇒/.test(t)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
  })
  // ═══ MÁXIMO DATA-INK (Tufte): la línea que no estructura, no va ═══
  //
  // La protagonista se distingue por TIPOGRAFÍA Y AIRE, no por una línea debajo. Antes cada obra
  // llevaba su propio borde: siete líneas horizontales que dibujaban una reja y competían con los
  // importes. Quedan sólo las que separan una idea de otra —bajo cada encabezado y sobre los dos
  // cierres—, que son las que el ojo necesita para no perderse.
  for (const f of g.protagonistas ?? []) {
    fmt(r(f - 1, f, 0, 2), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK } })
  }
  // La línea va ARRIBA del total: cierra el bloque que se venía leyendo.
  for (const f of g.totales ?? []) {
    req.push({ updateBorders: { range: r(f - 1, f), top: { style: 'SOLID', color: HAIR } } })
  }
  for (const f of g.detalles ?? []) {
    fmt(r(f - 1, f, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { fontFamily: E.FUENTE, fontSize: E.TAM.nota, foregroundColor: MUTED } })
  }

  // NINGUNA FILA OCULTA Y NI UNA NOTA: lo que existe se ve, y una nota sobrevive a la reescritura
  // salvo que se borre explícitamente.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(n + 40, 120) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  req.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: n, startColumnIndex: 0, endColumnIndex: ANCHO_OBRAS },
      rows: Array.from({ length: n }, () => ({ values: Array.from({ length: ANCHO_OBRAS }, () => ({ note: '' })) })),
      fields: 'note',
    },
  })
  // La columna A se dimensiona con los rótulos REALES de esta corrida: el estilo de la casa pone CLIP
  // en toda la hoja, así que un rótulo más largo que su columna no se derrama — desaparece.
  const anchos = ANCHOS_OBRAS.map((px, i) => (i === 0 ? anchoColumnaA(g) : px))
  anchos.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  const { requests: rTxt } = requestsTextoPorContenido(sheetId, g.filas || [])
  req.push(...rTxt)
  // ═══ EL ENCABEZADO SE ALINEA CON SU COLUMNA, Y VA ÚLTIMO A PROPÓSITO ═══
  //
  // `requestsTextoPorContenido` manda a la IZQUIERDA toda celda de texto, y los rótulos de columna
  // lo son: "Venta (neto)" quedaba pegado al borde izquierdo sobre importes alineados a la derecha,
  // así que el ojo tenía que buscar a qué columna pertenecía cada número. En un estado financiero el
  // rótulo de una columna de cifras va del mismo lado que las cifras. Va DESPUÉS del pase de texto
  // porque el último request gana: adelantarlo lo dejaría sin efecto.
  for (const [i, fila] of (g.filas ?? []).entries()) {
    if (!/^(Cliente|Obra)$/.test(String(fila?.[0] ?? '').trim())) continue
    fmt(r(i, i + 1, 1, ANCHO_OBRAS), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
  }
  await google.spreadsheetBatchUpdate(ID, req)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
