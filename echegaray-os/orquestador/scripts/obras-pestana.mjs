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
// EL CUADRO 5 NO SE REGENERA: SE FUSIONA (24/08/2026). La fecha y el importe de cada material
// previsto los edita EL DUEÑO en la pestaña, y desde el 24/08 el libro de movimientos los lee de ahí.
// Este script se los pisaba en cada corrida con las constantes de obras-datos.mjs —por eso el timer
// del flujo de caja quedó detenido—. Ahora lee la pestaña ANTES de armar la grilla y fusiona:
// `lib/materiales-fusion.mjs`. `obras-datos.mjs` sólo siembra ítems nuevos.
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
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
// EL CUADRO 5 NO SE REGENERA: SE FUSIONA. La pestaña es el origen de la fecha y el importe de cada
// material previsto desde el 24/08 — este script se los pisaba en cada corrida. Ver materiales-fusion.
// EL FORMATO DE NÚMERO SALE DE LA ESPECIE QUE DECLARA LA GRILLA. Ver `obras-especies.mjs`.
import { matrizDeEspecies, requestsDeEspecie } from '../lib/obras-especies.mjs'
import {
  grillaObras, anchoColumnaA, celdasEnError, columnasDesparejas, problemaDeSintaxis, clientesDeCobranzas,
  conColaLimpiable, variantesDe, ANCHO_HISTORICO, ALTO_HISTORICO,
  ANCHO_OBRAS, ANCHOS_OBRAS, PESTANA_OBRAS, REFS_OBRAS, SIN_CONTRATO, contratoMalPublicado,
} from '../lib/obras-grilla.mjs'
import { contratoDeObra, monedasDesconocidas, normalizarMoneda } from '../lib/cobranzas-contrato.mjs'
import { certificadoDeObra } from '../lib/obras-certificado.mjs'
// El ⚠ del log sale de su única fuente, no tipeado: el guardián de `glifos-generadores.test.mjs`
// existe porque un glifo tipeado ya se coló en una celda y el PDF no lo dibujaba.
import { ALERTA } from '../lib/glifos.mjs'
import { leerTipoCambio, RANGO_TC } from '../lib/tipo-cambio.mjs'
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
  // ═══ UNA COLUMNA NO PUEDE QUEDAR ASIGNADA A DOS CAMPOS (04/09/2026) ═══
  //
  // Cuando el archivo renombró los encabezados —C de «Fecha de emisión» a «Fecha de Venta», P de
  // «Fecha de Venta» a «Fecha de Factura»— los dos criterios de fecha pasaron a poder matchear la
  // misma celda. Sin esta guarda hay que elegir entre dos males: criterios excluyentes, que dejan
  // de reconocer el encabezado anterior y rompieron seis tests de Cobranzas; o criterios amplios,
  // donde `findIndex` devuelve el primero y `fechaVenta` saltaba de P a C, moviendo el año de la
  // venta sin que nadie lo pidiera.
  //
  // Reservando la columna se resuelve solo y con los DOS encabezados: `fechaEmision` toma la
  // primera fecha que le corresponde, y `fechaVenta` sigue buscando a partir de ahí.
  //
  // Y UN CRITERIO PUEDE SER UNA LISTA EN ORDEN DE PREFERENCIA. Hace falta cuando el archivo trae
  // las DOS fechas: con un criterio plano, `fechaEmision` se quedaba con «Fecha de Venta» por estar
  // primera en la fila y `fechaVenta` no encontraba nada. Con la lista, cada campo se queda con su
  // rótulo propio si existe, y sólo cae en el alternativo cuando el suyo no está.
  const usadas = new Set()
  for (const [campo, crit] of entradas) {
    const opciones = Array.isArray(crit) ? crit : [crit]
    let iCol = -1
    for (const o of opciones) {
      iCol = fila.findIndex((c, i) => !usadas.has(i) && matchea(c, o))
      if (iCol >= 0) break
    }
    if (iCol < 0) throw new Error(`el rótulo ${opciones[0]} (campo "${campo}") no está en la fila de encabezado ${iFila + 1}`)
    usadas.add(iCol)
    res[campo] = letra(iCol)
  }
  return res
}

const COLS = 'ABCDEFGHI'

/**
 * EL RÓTULO DE LA COLUMNA A EN UNA FILA DE ENCABEZADO. Es cómo el formateador reconoce las tres filas
 * de encabezado sin anclarse a un número de fila — la misma regla que el resto de la pestaña.
 *
 * `Cartera` entró el 14/08 con el titular de antigüedad. Sin agregarlo, esa fila no se dibujaba como
 * encabezado: sus rótulos quedaban alineados a la izquierda sobre importes alineados a la derecha, y
 * el "Total pendiente" se leía sobre otra columna.
 */
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
  for (const b of (g.bloques ?? [])) {
    // Ya no hay filas de detalle que listar: cada obra es UNA fila en el cuadro de contrato y UNA en
    // el de costo. Lo que sigue importando para juzgar la corrida es si la obra declara contrato
    // —sin él las dos celdas del contrato salen en "—"— y si es proyectable.
    L.push(`  fila ${String(b.fProt).padStart(3)}  ${izq(String(g.filas[b.fProt - 1]?.[0] ?? ''), anchoRotulo)}`
      + `  contrato ${b.contrato ? `$${b.contrato.toLocaleString('es-AR')}` : 'NO DECLARADO'}`
      + `${b.proyectable ? '' : ' · ▲ sin fechas, no se proyecta'}`)
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
  // LA FECHA DE EMISIÓN ES EL RELOJ DE LO VENCIDO (14/08). Es la única de las tres fechas de una fila
  // que no se re-escribe cuando el cobro se posterga: la fila ID 41 de MESSINA la conserva en
  // 31/12/2024 mientras su "Fecha de Venta" y su "Fecha cobro" ya se movieron a agosto y septiembre
  // de 2026. Si el rótulo cambia, el escritor ROMPE antes de publicar una columna de alarma en cero.
  //
  // ═══ EL RÓTULO CAMBIÓ EN EL ARCHIVO Y ROMPIÓ DOS PESTAÑAS (04/09/2026) ═══
  //
  // Entre las 06:56 y las 08:59 del 04/09 los encabezados de Cobranzas se renombraron: la columna C
  // pasó de "Fecha de emisión" a "Fecha de Venta", y la P de "Fecha de Venta" a "Fecha de Factura".
  // El escritor hizo lo que promete —ROMPER en vez de publicar una alarma en cero— y OBRAS y
  // Calendario de Cobros dejaron de generarse en las tres corridas siguientes.
  //
  // Acá se actualiza SÓLO el rótulo por el que se busca cada columna. Las columnas siguen siendo las
  // mismas —C y P— así que ni un número de esta pestaña cambia: es restaurar el servicio, no
  // redefinir un criterio.
  //
  // LO QUE QUEDA ABIERTO Y NO LO DECIDE EL CÓDIGO: con los nombres nuevos, «el reloj de lo vencido»
  // debería ser la Fecha de FACTURA (P) y no la de Venta (C) — el plazo de cobro corre desde que se
  // factura. Cambiarlo mueve la antigüedad de la cartera y la columna de vencidos, que es plata: lo
  // decide el dueño, es la misma pregunta que el traspaso dejó abierta para la base del IVA.
  fechaEmision: [/^Fecha\s*(de\s*)?emisi/i, /^Fecha\s*(de\s*)?venta/i],
  // LAS RETENCIONES SUFRIDAS ($7.671.680 en 2026). El criterio es el plural con "s": el archivo
  // tiene además TRES columnas de desglose que empiezan con "Retención" en singular ("Retención
  // 16,8%…", "Ret Ganancias", "Retención 2,5%/3,5%…"), y elegir una de ésas publicaría una parte
  // del retenido sin dar un solo error. Si el rótulo cambia, el escritor ROMPE antes de escribir.
  retenciones: /^Retenciones\b/i,
  // La FECHA DE VENTA acota el año de la venta (devengado); la de cobro, el de la plata.
  // ACEPTA LOS DOS RÓTULOS, Y NO COLISIONA CON `fechaEmision` PORQUE LA COLUMNA YA ESTÁ RESERVADA.
  // Con el encabezado de hoy toma «Fecha de Factura» (P); con el anterior, «Fecha de Venta» (P).
  // En los dos casos es la misma columna, que es lo único que importa: ningún número se mueve.
  fechaVenta: [/^Fecha\s*(de\s*)?factura/i, /^Fecha\s*(de\s*)?venta/i], forma: /^Forma de [Cc]obro/,
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
  // LO CERTIFICADO SALE DE LA MISMA LECTURA Y DEL MISMO SELECTOR QUE EL CONTRATO, y eso no es
  // comodidad: si el contrato se midiera sobre un universo de filas y lo certificado sobre otro, el
  // saldo saldría mal sin dar error. Es la misma razón por la que el contrato se lee acá y no se
  // tipea. El porqué del cálculo está en `obras-certificado.mjs`.
  const certificados = new Map()
  for (const o of obras) {
    const selector = {
      variantes: variantesDe(o.cliente), needle: o.ventaTexto, unica: porCliente.get(o.cliente) === 1,
    }
    const c = contratoDeObra(filas, cols, selector, refs.cob.desde)
    contratos.set(o.clave, c)
    certificados.set(o.clave, certificadoDeObra(filas, cols, selector, c.contrato, refs.cob.desde))
  }
  return {
    contratos,
    certificados,
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
  // La lectura vive en `lib/tipo-cambio.mjs` desde el 13/08: el extractor de Cobranzas del Libro
  // necesita el MISMO tipo de cambio y qué cuenta como válido no puede decidirse en dos lados.
  const { tc, crudo: leido } = await leerTipoCambio(google, ID)
  if (tc === null) {
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
        // "Detalles / Obra" es la ÚNICA columna de Compras donde consta a qué obra va un gasto, y
        // desde el 14/08 es de la que sale la columna "Comprado (real)" del cuadro 4. Si el rótulo
        // cambiara, `abierto()` rompe la construcción de la grilla y el escritor aborta ANTES de
        // tocar el archivo — que es lo que corresponde: sin ella el cuadro vuelve a publicar $0.
        obra: 'Detalles / Obra',
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
    console.log(render(seco, OBRAS_FUTURAS))
    // EL CUADRO 5 DE ESTA SALIDA NO ES EL QUE SE ESCRIBIRÍA, y decirlo es obligatorio: `--dry` es
    // offline, así que dibuja la SEMILLA de obras-datos. Lo que se escribe de verdad sale de fusionar
    // esa semilla con la pestaña, donde vive la fecha que el dueño editó. El ensayo de esa fusión —con
    // el archivo delante y sin escribir— es `scripts/obras-cuadro5-ensayo.mjs`.
    return console.log('\n⚠ el cuadro 5 de arriba es la SEMILLA de obras-datos.mjs, no lo que se escribiría: '
      + '--dry es offline y la fusión necesita leer la pestaña.\n'
      + '  Para ver el cuadro 5 real: node orquestador/scripts/obras-cuadro5-ensayo.mjs')
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

  const { contratos, certificados, monedasRaras, hayUSD } = leerContratos(datos, refs, OBRAS_FUTURAS)
  await verificarMoneda(google, { monedasRaras, hayUSD })
  const obras = OBRAS_FUTURAS.map((o) => ({
    ...o, contrato: contratos.get(o.clave)?.contrato ?? null, cert: certificados.get(o.clave) ?? null,
  }))
  for (const o of obras) {
    const c = contratos.get(o.clave)
    console.log(`  contrato · ${o.clave}: ${o.contrato === null ? 'NO DECLARADO en ninguna fila — publico "—"'
      : `$${o.contrato.toLocaleString('es-AR')}${c.partido ? ` (PARTIDO: ${c.distintos.map((d) => `$${d.toLocaleString('es-AR')}`).join(' + ')})` : ''}`
        + ` · declarado en ${c.valores.length} fila(s): ${c.valores.map((v) => v.fila).join(', ')}`}`)
    // LOS HITOS SE LOGUEAN UNO POR UNO. La `C` publica un total; el que audita necesita ver de qué
    // filas salió y qué filas quedaron AFUERA del contrato, porque ahí es donde vivía el defecto:
    // una fila puede facturar el hito Y algo que el contrato no incluye (Quattropani, materiales).
    if (o.cert?.certificado !== null && o.cert) {
      console.log(`  certificado · ${o.clave}: $${Math.round(o.cert.certificado).toLocaleString('es-AR')}`
        + ` = ${(o.cert.fraccion * 100).toFixed(1)}% del contrato · ${o.cert.hitos.length} hito(s)`
        + `${o.cert.cubreElContrato ? '' : ` ${ALERTA} LOS HITOS NO CUBREN EL CONTRATO`}`)
      for (const h of o.cert.hitos) {
        console.log(`      ${h.num}/${h.den} de ${h.base ? `$${h.base.toLocaleString('es-AR')}` : 'el contrato'}`
          + ` · fila(s) ${h.filas.join(', ')} · "${h.clave}"`)
      }
      if (o.cert.sinHito.length) {
        console.log(`      fuera del contrato (no certifican): fila(s) ${o.cert.sinHito.map((s) => s.fila).join(', ')}`)
      }
    }
  }

  // ═══ EL CUADRO 5 SE RETIRÓ, Y SU FUENTE SE MUDÓ ANTES DE SACARLO (07/09/2026) ═══
  //
  // El dueño: *"el cuadro 5 de materiales previstos en pestaña obras no esta siendo actualizado con
  // la informacion q corresponde, si no va a ser util, quitarlo"*, y después eligió el rediseño de
  // dos cuadros. Acá vivía la fusión que preservaba las fechas que él editó a mano el 24/08.
  //
  // ESAS FECHAS NO SE PERDIERON, Y ESO SE HIZO PRIMERO. Los 17 ítems ($18.880.836) y las 7 filas de
  // mano de obra ($126.974.442) están en `public.obra_egreso_proyectado`, cargados con su celda de
  // origen y su fecha de lectura por `scripts/obras-previstos-cargar.mjs`. El Libro de Movimientos
  // los lee de ahí: si se hubiera borrado el cuadro sin mudar la fuente, el Cash Flow habría perdido
  // $18,9M de egresos proyectados sin un solo error.
  //
  // LO QUE SÍ SE PIERDE, DICHO EN VOZ ALTA: el dueño ya no tiene una CELDA donde corregir la fecha de
  // un material. Hasta que exista esa pantalla, se corrige en `obra_egreso_proyectado`.
  const hojas = await google.getSheetMeta(ID)

  const g = grillaObras({ obras, refs })
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

  // `hojas` se leyó arriba, antes de la grilla: la misma lectura decide si la pestaña EXISTE (y por
  // lo tanto si el cuadro 5 se fusiona o se siembra) y si hay que crearla.
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
  // ═══ LA MEMORIA DEL CUADRO 5 VIAJA EN EL MISMO REGISTRO ═══
  //
  // Sin ella la fusión no puede distinguir un ítem NUEVO de obras-datos de uno que el dueño BORRÓ, y
  // peor: un borrado respetado hoy volvería mañana, porque al no escribirlo desaparece de todo rastro.
  // Se guarda como una edición más —`sheet_rotulos` conserva las ediciones aunque el generador deje de
  // escribir ese texto (es su regla explícita)— bajo una marca que ninguna celda puede tener, así que
  // `respetarEdiciones` nunca la va a encontrar en una celda generada. Las claves de la corrida
  // anterior se PODAN antes: si no, un ítem sacado de obras-datos quedaría recordado para siempre.
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
  const desparejas = columnasDesparejas(g.filas, quedo, (g.bloques ?? []).map((b) => b.fProt))
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
  // El motivo entero está en `contratoMalPublicado`.
  const formulas = await google.readSheetValues(ID, `${PESTANA_OBRAS}!A1:${letra(ANCHO_OBRAS - 1)}${g.filas.length}`,
    { render: 'FORMULA' }).catch(() => [])
  if (!formulas.length) throw new Error('escribí pero no pude releer las FÓRMULAS: no puedo verificar la columna del contrato.')
  const malCont = contratoMalPublicado(g.bloques, formulas)
  if (malCont.length) throw new Error(`LA COLUMNA "Contratado" NO QUEDÓ COMO CORRESPONDE: ${malCont.join(' · ')}.`)
  const conContrato = g.bloques.filter((b) => b.contrato).length
  console.log(`  ✓ contrato publicado en ${conContrato} de ${g.bloques.length} obras `
    + `(las otras no declaran contrato en ninguna fila de ${REFS_OBRAS.cob.hoja} y publican "${SIN_CONTRATO}")`)

  // ═══ EL CONTROL DEL DOBLE CONTEO, DESPUÉS DE QUE EL CUADRO DE CLIENTES SALIERA (07/09/2026) ═══
  //
  // Hasta hoy había cuatro controles apoyados en cuadros que el dueño mandó sacar: la suma de los
  // clientes contra Cobranzas entera, los cinco tramos de cartera contra la Resta, las obras dentro
  // de la venta de SUS clientes, y el residuo del costo. Los cuatro miraban celdas que ya no existen.
  //
  // LO QUE SE CONSERVA ES LA INVARIANTE QUE ATRAPÓ EL DEFECTO REAL: las obras declaradas son un
  // SUBCONJUNTO de Cobranzas, así que su cierre NUNCA puede superar al del año. Cuando dos obras del
  // mismo cliente emparejan la misma factura —el defecto que publicó $692.395.550 donde iban
  // $125.680.764— la suma de las obras se va por arriba del universo y esto lo dice. Sheets no da
  // ningún error en ese caso: devuelve un número creíble.
  //
  // ES MÁS DÉBIL QUE EL ANTERIOR Y HAY QUE DECIRLO. El control viejo comparaba obra contra la venta de
  // SU cliente; éste compara contra el año entero, así que un doble conteo en MESSINA puede quedar
  // tapado por el margen que dejan los demás clientes. Con los ocho clientes del año y diez obras
  // declaradas ese margen es chico, pero existe. Se cambió alcance por la pestaña que pidió el dueño.
  const num = (v) => Number(String(v ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  if (g.fTotObras && g.fAno) {
    // Las tres columnas que significan lo MISMO arriba y abajo. La D no entra: arriba es lo vendido
    // (devengado, de Cobranzas) y abajo lo contratado (de la Orden de Compra) — dos magnitudes
    // distintas, y compararlas sería inventar una identidad que nadie declaró.
    for (const [col, nombre] of [[4, 'Cobrado'], [5, 'Por cobrar'], [6, 'Vencido']]) {
      const enObras = num(quedo[g.fTotObras - 1]?.[col])
      const enAno = num(quedo[g.fAno - 1]?.[col])
      if (enObras - enAno > 1) {
        throw new Error(`DOBLE CONTEO: la columna "${nombre}" suma $${Math.round(enObras).toLocaleString('es-AR')} `
          + `en las ${g.bloques.length} obras y el año entero da $${Math.round(enAno).toLocaleString('es-AR')}. `
          + 'Las obras son un subconjunto de Cobranzas: no pueden sumar más. Hay una factura que dos '
          + 'obras del mismo cliente se están llevando — revisar los `ventaTexto` de obras-datos.mjs, '
          + 'que uno no puede contener a otro.')
      }
    }
    const cobradoObras = num(quedo[g.fTotObras - 1]?.[4])
    const cobradoAno = num(quedo[g.fAno - 1]?.[4])
    console.log(`  ✓ las ${g.bloques.length} obras cobraron $${Math.round(cobradoObras).toLocaleString('es-AR')} `
      + `dentro de los $${Math.round(cobradoAno).toLocaleString('es-AR')} del año `
      + `— $${Math.round(cobradoAno - cobradoObras).toLocaleString('es-AR')} son trabajos fuera de obra`)
  }
  console.log(`QUEDÓ ESCRITO — releí ${quedo.length} filas (${filasEmitidas} con contenido): sin celdas en error y sin columnas desparejas.`)
}

/**
 * EL FORMATO — el mismo lenguaje que CAJA y su anexo: encabezado chico, importes protagonistas, el
 * "$" sólo en las filas de cierre, la prosa gris y al final. SE RESETEA TODO AL ESTÁNDAR y recién
 * después se pintan las excepciones: un formateador que sólo aplica apila corridas.
 *
 * ESTÁ EXPORTADA PARA PODER JUZGARLA SIN TOCAR EL ARCHIVO. Un formateador que aplica en capas —la
 * primera declara moneda, la última puede pisarla con texto— no se puede verificar leyendo el código:
 * hay que aplicar sus requests en orden y mirar con qué queda cada celda, que es lo que hace
 * `obras-especies.test.mjs`. Escribir en el Sheet para averiguarlo es exactamente lo que este repo no
 * puede hacer.
 */
export async function formatear(google, sheetId, g) {
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
  // QUIÉN ES ENCABEZADO LO DICE LA GRILLA, no una expresión regular sobre el texto de la columna A:
  // el encabezado del cuadro del año deja la A vacía a propósito (sus cuatro números se alinean con
  // las columnas del cuadro de abajo) y con el reconocimiento por texto quedaba sin formato de
  // encabezado — la fila se dibujaba como plata. Ver `hoja().encabezados`.
  const encabezados = new Set(g.encabezados ?? [])

  // ═══ EL FORMATO DE NÚMERO SALE DE LA ESPECIE DE LA CELDA, NO DE UNA LISTA DE RANGOS (14/08) ═══
  //
  // Acá vivían seis listas escritas a mano —`PLATA`, `F_VENCIDO`, `textoEnF`, `importeEnH`, más
  // `totales` y `protagonistas`— que decidían el formato de cada celda desde 200 líneas de distancia
  // del lugar donde se escribe su valor. Dos lugares que tienen que decir lo mismo sobre la misma
  // celda divergen apenas alguien agrega una columna, y divergieron: `Vencido` publicó
  // `17449303,3143` crudo mientras sus vecinas mostraban "—". El porqué entero, con la medición sobre
  // el archivo, está en `obras-especies.mjs`.
  //
  // AHORA LA GRILLA DECLARA QUÉ ES CADA CELDA y esto es su proyección a formato. Cubre las NUEVE
  // columnas en TODAS las filas —incluida la A, que hasta hoy no recibía `numberFormat` en ninguna
  // corrida— porque un formato que nadie repone es estado que sobrevive para siempre.
  // La matriz se arma con el alto REAL que se va a escribir —`n` incluye la cola limpiable—, no con
  // el de la grilla: una fila de la cola sin formato es donde sobrevive el TEXTO de la corrida vieja.
  req.push(...requestsDeEspecie(sheetId, matrizDeEspecies(n, g.especiesDeclaradas ?? [], ANCHO_OBRAS)))
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })

  g.filas.forEach((fila, i) => {
    const t = String(fila[0] ?? '')
    if (/^\d · /.test(t)) { // '1 · OBRAS DEL AÑO' — el título del bloque no necesita línea propia
      // La máscara nombra los campos: un `userEnteredFormat` a secas BORRA todo lo que no declare, y
      // se llevaba puesto el `numberFormat` de la fila entera — el agujero por donde una celda queda
      // sin formato de número y se dibuja cruda.
      // NO SE TOCA LA ALINEACIÓN DE LA FILA: la del rótulo ya la da su especie, y las columnas de
      // plata de esta fila están vacías HOY — alinearlas a la izquierda las deja preparadas para
      // dibujar el primer importe que caiga ahí como si fuera prosa.
      fmt(r(i, i + 1), 'userEnteredFormat.textFormat',
        { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK } })
    }
    if (encabezados.has(i + 1)) { // los encabezados de columna: texto, nunca plata
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

  // ═══ LA NOTACIÓN DEL ESCENARIO: UN HECHO NO SE DIBUJA COMO UNA ESTIMACIÓN (14/08) ═══
  //
  // Es la regla UNIFY de IBCS, hoy ISO 24896 «Notation for business reporting» (publicada el
  // 11/06/2026): el escenario es una DIMENSIÓN del dato, con notación propia y la MISMA en todos los
  // cuadros — no una nota al pie. Acá se usan las dos marcas que "Jornales por Quincena" ya publica,
  // porque una notación que cambia de pestaña en pestaña no es una notación:
  //
  //   · LO REAL         → negrita, tinta plena. `Cobrado` es plata que entró: es un hecho.
  //   · LO PROYECTADO   → itálica, tinta apagada. `Pendiente pago` y el monto tipeado de cada egreso
  //                       son la explosión de gastos que el dueño estimó, no una factura.
  //   · LO COMPROMETIDO → redonda. `Venta`, `Resta` y `Vencido` son hechos (se vendió, se certificó,
  //                       se venció) cuya plata todavía no se movió. Ni negrita ni itálica.
  //
  // NO LLEVA LEYENDA, A PROPÓSITO: los encabezados ya dicen "Cobrado" y "Pendiente pago". Una fila
  // que explique la itálica sería la prosa que el dueño mandó sacar de esta misma pestaña.
  const escenario = (f0, f1, c, { bold = false, italic = false }) => {
    if (!(f1 >= f0)) return
    fmt(r(f0 - 1, f1, c, c + 1), 'userEnteredFormat.textFormat',
      { textFormat: { bold, italic, fontFamily: E.FUENTE, foregroundColor: italic ? MUTED : INK } })
  }
  // LAS COLUMNAS DEL CUADRO DE OBRAS, CON EL RESTO DE LOS CUADROS YA RETIRADOS (07/09/2026):
  //   D contratado · E cobrado · F por cobrar · G vencido · H costo proyectado.
  const [E_COBRADO, H_COSTO] = [4, 7]
  for (const f of [...(g.protagonistas ?? []), ...(g.totales ?? [])]) {
    // `E` es lo que YA entró: un HECHO, y se dibuja como tal en negrita.
    escenario(f, f, E_COBRADO, { bold: true })
    // `H` es la explosión de gastos que el dueño ESTIMÓ: la única columna de la pestaña que no es un
    // hecho, y por eso la única en itálica apagada. El cuadro del año no la tiene: su fila la deja
    // vacía y `escenario` sobre una celda vacía no dibuja nada.
    escenario(f, f, H_COSTO, { italic: true })
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
  // ═══ ACÁ CORRÍA `requestsTextoPorContenido`, Y ERA LA SEGUNDA MITAD DEL DEFECTO (14/08) ═══
  //
  // Decidía si una celda era texto OLFATEANDO su string, y corría último: ganaba siempre. Su propia
  // documentación declara el límite —*"una celda cuyo valor lo produce una FÓRMULA no se puede
  // clasificar sin evaluarla"*— y en esta pestaña casi todo es fórmula. Un importe releído ya
  // formateado ("▲ 17.449.303") o el guion literal que publica una obra sin contrato ("—") no le
  // parecen números, así que los marcaba TEXTO: eso es lo que quedó escrito en `G27`/`H27` del
  // archivo del 14/08, en medio de una columna de moneda. Con la especie declarada por quien escribe
  // el valor, adivinar sobra — y adivinar mal cuesta la pestaña.
  // ═══ EL ENCABEZADO SE ALINEA CON SU COLUMNA, Y VA ÚLTIMO A PROPÓSITO ═══
  //
  // La especie `rotulo` alinea a la IZQUIERDA, y los rótulos de columna lo son: "Venta (neto)"
  // quedaba pegado al borde izquierdo sobre importes alineados a la derecha, así que el ojo tenía que
  // buscar a qué columna pertenecía cada número. En un estado financiero el rótulo de una columna de
  // cifras va del mismo lado que las cifras. Va DESPUÉS del pase de especies porque el último request
  // gana: adelantarlo lo dejaría sin efecto.
  for (const f of encabezados) {
    fmt(r(f - 1, f, 1, ANCHO_OBRAS), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
  }
  await google.spreadsheetBatchUpdate(ID, req)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
