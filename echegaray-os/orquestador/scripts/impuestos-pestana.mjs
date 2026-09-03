#!/usr/bin/env node
// "IMPUESTOS Y FINANCIEROS" — primero la posición, después el detalle.
//
// ═══ LA ORDEN DEL DUEÑO (06/08) ═══
//
// *"La pestaña mezcla posición, deuda, vencimientos, proyecciones y obligaciones. Separalas. La
// pantalla muestra PRIMERO: posición actual · próximos vencimientos · riesgo · proyección 30 días ·
// 60 · 90. Después el detalle técnico. Los impuestos proyectados salen de obligaciones reales,
// vencimientos y bases imponibles, NO de un promedio. Menos texto, importes protagonistas, menos de
// cinco segundos. Nada de IFERROR para esconder. No romper conexiones."*
//
// ═══ LO QUE CAMBIÓ, Y LA PLATA QUE ESTABA MAL ═══
//
//   · La cuota del prendario salía de un SUMIF sobre TODO el extracto: declaraba $2.567.316 donde la
//     cuota es $1.282.811, cinco meses seguidos. $6,4M de salida financiera que no existe.
//   · La "deuda pendiente" sumaba las doce cuotas del año, siete YA PAGADAS: el hero decía
//     $31.895.983 donde lo pendiente son $14.372.450. $17,5M de sobredeclaración.
//   · IIBB no proyectaba nada: seis meses en blanco y cero filas en el Libro.
//   · El impuesto al cheque proyectaba con un AVERAGEIF en una fila fuera del total.
//   · No había calendario de vencimientos: toda la noción de vencimiento del OS era `EOMONTH+20`.
//   · El título dice "y Financieros" y faltaban dos de las cuatro fuentes de financiamiento.
//
//   node orquestador/scripts/impuestos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { terminoLibro } from '../lib/libro-sumas.mjs'
import { loadConfig } from '../lib/config.mjs'
import { posicionIvaCompleta } from '../lib/posicion-iva.mjs'
import {
  anclaDeProyeccion, aNumero, supuestoDelMes, RANGO_ALICUOTA_IVA,
  filasReferenciadas, contratoDeFilas, contratoDeRotulos,
} from '../lib/iva-libre-disponibilidad.mjs'
import { publicar as publicarNombres } from '../lib/rangos-nombrados.mjs'
import { query } from '../lib/db.mjs'
import { conColaMedida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { vaciarColumnaDeProsa } from '../lib/nota-celda.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { auditarPatron } from '../lib/patron-pestana.mjs'
import { resolverColumnas } from '../lib/compras-columnas.mjs'
// LOS DOS RÓTULOS QUE CINCO CONSUMIDORES BUSCAN EN ESTA PESTAÑA. No se escriben a mano acá: se ubican
// POR TEXTO en la columna A, así que el texto es el contrato y tiene una sola definición.
import { CALENDARIO_IMPUESTOS, CUADRO } from '../lib/cash-flow-lineas.mjs'
import { formulaUltimaFecha, formulaUltimoPeriodo, rotuloPorFuente, DIAS_AVISO_MENSUAL } from '../lib/fecha-de-frescura.mjs'
import { ACUERDO, TARJETA } from '../lib/banco-santander.mjs'
import { crearGrilla, ANCHO, M12, MES, cmes } from '../lib/impuestos-grilla.mjs'
import {
  IIBB_RAW, IIBB_COL, IIBB_FILA0, ARCA_RAW, ARCA_FILA0, BANCO_RAW,
  leerIIBB, leerIVA, leerRetenciones, ventasProyectadas, planesDePago, escribirIIBBRaw, filasFacturadas,
} from '../lib/impuestos-fuentes.mjs'
import {
  bloqueIva, mesDelSaldoVigente, bloqueIibb, bloqueRetenciones, bloqueOtros, bloquePlanes, bloqueDeudaFinanciera, bloqueCierre,
} from '../lib/impuestos-bloques.mjs'
import {
  obligacionesDelCalendario, altoDeLaPosicion, filasDeLaPosicion, formulaOtrosSinFecha,
  OFFSET_TITULAR, ALTO_HERO, hallazgoDeVencimiento, conDecisionesDelDueno,
} from '../lib/impuestos-posicion.mjs'
// Lo que el dueño ya decidió sobre un vencimiento puntual. Ver lib/decisiones-hallazgos.mjs.
import { CONTROLES, decidir, explicarDecisiones } from '../lib/decisiones-hallazgos.mjs'
import { IIBB_SUPUESTO } from '../lib/vencimientos-fiscales.mjs'
import { informarProyeccion, informarCalendario } from '../lib/impuestos-informe.mjs'
import { formatear } from '../lib/impuestos-piel.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Impuestos y Financieros'
const DRY = process.argv.includes('--dry')
const AÑO = 2026

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const hoyISO = () => new Date().toISOString().slice(0, 10)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS LÍNEAS DEL CASH FLOW DE LAS QUE SALE LA PROYECCIÓN DE IVA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// SE UBICAN POR SU RÓTULO, NUNCA POR SU FILA. Escribir 'Cash Flow Mensual'!I$24 acá es fabricar un
// rango fosilizado: el cash flow se regenera entero y una fila insertada arriba convierte esa
// referencia en otra cosa, en silencio y sin error.
//
// EL CRÉDITO NO USA EL TOTAL DE PROVEEDORES. "Cheques sin factura cargada" y "Cuotas de tarjeta sin
// factura cargada" son plata que sale SIN comprobante, y sin comprobante no hay crédito fiscal
// computable. Meterlas inflaría el crédito y haría desaparecer un pago de IVA que sí va a ocurrir.
const CF = 'Cash Flow Mensual'
/**
 * LOS NOMBRES SALEN DEL CUADRO, NO SE TIPEAN ACÁ (05/08). Estaban escritos a mano y uno derivó. Se
 * resuelve por PREFIJO contra `CUADRO`, que es quien escribe esos rótulos: si el cuadro le agrega o
 * le saca palabras al final, esto lo sigue encontrando, y si la línea DESAPARECE rompe acá —con el
 * nombre que no encontró— en vez de escribir una referencia a la nada.
 */
const delCuadro = (prefijo) => {
  const nombres = []
  const bajar = (x) => {
    if (Array.isArray(x)) return x.forEach(bajar)
    if (!x || typeof x !== 'object') return
    if (typeof x.nombre === 'string') nombres.push(x.nombre)
    for (const v of Object.values(x)) if (v && typeof v === 'object') bajar(v)
  }
  bajar(CUADRO)
  const halladas = nombres.filter((n) => String(n).startsWith(prefijo))
  if (halladas.length !== 1) {
    throw new Error(`impuestos-pestana: "${prefijo}…" no identifica UNA línea del cuadro `
      + `(encontré ${halladas.length}). El cuadro es la fuente de los rótulos: revisá cash-flow-lineas.mjs.`)
  }
  return halladas[0]
}
const LINEAS_DEBITO = [
  'Cobros por ventas y servicios (ya cobrado)',
  delCuadro('Cobranzas esperadas — de este mes en adelante'),
]
const LINEAS_CREDITO = [
  'Materiales e insumos de obra civil',
  'Materiales de mantenimiento',
  'Gastos de estructura y administración',
  'Servicios recurrentes',
]

// ═══ LA BASE DE LA PROYECCIÓN SALE DEL LIBRO (05/08) ═══
//
// Las celdas del IVA proyectado apuntaban por POSICIÓN al Cash Flow Mensual. El rediseño por bloques
// puso otra cosa en esas coordenadas y la fórmula habría leído el egreso proyectado de enero como
// débito fiscal — sin un solo error. La base se calcula sobre `_MOVIMIENTOS` con `terminoLibro`, la
// misma fuente única que alimenta las vistas.
const RUBROS_CREDITO_LIBRO = ['Materiales Civil', 'Materiales Mantenimiento', 'Estructura', 'Servicios recurrentes']
const ventanaDelMes = (m) => ({ desde: `DATE(${AÑO};${m};1)`, hasta: `EOMONTH(DATE(${AÑO};${m};1);0)+1` })
const brutoDebitoLibro = (m) => [terminoLibro({ ...ventanaDelMes(m), signo: 1, rubros: ['Cobranzas'], medida: 'magnitud' })]
const brutoCreditoLibro = (m) => [`-(${terminoLibro({ ...ventanaDelMes(m), rubros: RUBROS_CREDITO_LIBRO })})`]

/** La fila de cada rótulo en la columna A del cash flow. Rompe si falta alguno. */
export function ubicarLineas(colA = [], rotulos = []) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const idx = new Map(colA.map((f, i) => [norm(f?.[0]), i + 1]))
  const filas = rotulos.map((r) => ({ rotulo: r, fila: idx.get(norm(r)) ?? null }))
  const faltan = filas.filter((f) => !f.fila).map((f) => f.rotulo)
  if (faltan.length) {
    throw new Error(`impuestos-pestana: no encuentro en "${CF}" la(s) línea(s): ${faltan.join(' · ')}. `
      + 'Sin ellas la proyección de IVA saldría $0 — no escribo una referencia muerta.')
  }
  return filas.map((f) => f.fila)
}

/**
 * NINGUNA BASE PUEDE LLEVAR UN TOTAL Y UNO DE SUS COMPONENTES A LA VEZ.
 *
 * El cuadro tiene totales sin sangría y componentes indentados debajo. Sumar un total Y uno de sus
 * hijos cuenta esa plata dos veces, y el resultado NO se delata: no hay #ERROR, no hay negativo
 * imposible, sólo un impuesto más grande. El parentesco se lee de la SANGRÍA, que es como el cuadro
 * lo expresa: un rótulo indentado pertenece al último rótulo sin indentar que tiene arriba.
 */
export function sinSolapamiento(colA = [], filas = []) {
  const texto = (f) => String(colA[f - 1]?.[0] ?? '')
  const esComponente = (f) => /^\s{2,}/.test(texto(f))
  const padreDe = (f) => {
    if (!esComponente(f)) return null
    for (let i = f - 1; i >= 1; i--) if (texto(i).trim() && !esComponente(i)) return i
    return null
  }
  const elegidas = new Set(filas)
  const choques = []
  for (const f of filas) {
    const p = padreDe(f)
    if (p && elegidas.has(p)) choques.push(`la fila ${f} ("${texto(f).trim()}") es COMPONENTE de la ${p} ("${texto(p).trim()}")`)
  }
  if (choques.length) {
    throw new Error('impuestos-pestana: doble conteo en la base de la proyección de IVA — '
      + `${choques.join(' · ')}. Sumar un total y uno de sus componentes cuenta esa plata dos veces `
      + 'y el resultado sigue pareciendo un importe razonable. Elegí el total O sus componentes, nunca los dos.')
  }
  return filas
}

/**
 * LA GRILLA ENTERA. Primero la cabecera, después se RESERVA el espacio de la posición, se escribe el
 * detalle —que es quien sabe en qué fila queda cada total— y recién entonces se llena la posición con
 * referencias. Ni un número pegado arriba.
 */
export function grilla({ anio, C, planes, iibb, ivaOficial, proy, arca, hoy }) {
  const G = crearGrilla(anio)
  G.push(['Impuestos y financiero'])
  // LA FRESCURA, POR FUENTE Y COMPACTA. Una sola fecha está prohibida acá: esta pestaña cruza fuentes
  // vivas (ARCA, el extracto, Cobranzas) con congeladas (las DDJJ de PDF, que se quedan en el último
  // período presentado), y un MAX le prestaría la fecha de la viva a la congelada. Con `compacto` cada
  // expresión se evalúa UNA vez dentro de un LET: mismas cuatro fuentes, de 3.029 a 1.239 caracteres.
  G.push([rotuloPorFuente('Qué se le debe al fisco, qué está inmovilizado y con qué se cuenta', [
    { nombre: 'IVA de ARCA', expr: formulaUltimaFecha(`${ARCA_RAW}!$C$${ARCA_FILA0}:$C`) },
    // IIBB: NO la fecha en que se bajó el PDF sino el PERÍODO que la DDJJ cubre. Una DDJJ de junio
    // presentada el 16/07 habla de junio; declarar el 16/07 sería declarar frescura de la gestión.
    { nombre: 'IIBB', expr: formulaUltimoPeriodo(`${IIBB_RAW}!$${IIBB_COL.periodo}$${IIBB_FILA0}:$${IIBB_COL.periodo}`), avisoDias: DIAS_AVISO_MENSUAL },
    { nombre: 'banco', expr: formulaUltimaFecha(`${BANCO_RAW}!$A$4:$A`) },
    { nombre: 'retenciones', expr: formulaUltimaFecha('Cobranzas!$Q$5:$Q') },
  ], { compacto: true })])
  G.blanco()

  // ── QUÉ MESES TIENE CADA OBLIGACIÓN ────────────────────────────────────────────────────────────
  // Se necesita ANTES de escribir para saber cuántas filas ocupa el calendario, y las FECHAS no
  // dependen de en qué fila quede el detalle: por eso el calendario se arma dos veces, la primera
  // sólo para contar. Reservar de menos pisaría el bloque de abajo; reservar de más deja un hueco.
  const mesesOf = M12.filter((m) => (ivaOficial ?? []).some((d) => Number(String(d.periodo).slice(5, 7)) === m))
  const anclaIva = proy?.ultimoMesConDato ?? 0
  const mesesIvaTodos = [...new Set([...mesesOf, ...M12.filter((m) => m <= anclaIva), ...(proy?.meses ?? [])])].sort((a, b) => a - b)
  const mesesIibbReales = M12.filter((m) => iibb.some((d) => Number(String(d.periodo ?? '').slice(5, 7)) === m))
  const ultimoIibb = mesesIibbReales[mesesIibbReales.length - 1] ?? 0
  const hastaIibb = Math.max(proy?.meses?.length ? proy.meses[proy.meses.length - 1] : 0, ultimoIibb)
  const mesesIibbTodos = M12.filter((m) => mesesIibbReales.includes(m) || (m > ultimoIibb && m <= hastaIibb))
  const mesesPlan = M12.filter((m) => planes.some((p) => p.porMes[m]))
  const mesesDelCalendario = { iva: mesesIvaTodos, iibb: mesesIibbTodos, plan: mesesPlan, prendario: M12 }
  const calParaContar = obligacionesDelCalendario({ hoy, anio, meses: mesesDelCalendario, filas: { iva: 0, iibb: 0, plan: 0, prendario: 0 } })
  const alto = altoDeLaPosicion(calParaContar)
  const base = G.reservar(alto)

  // ── EL DETALLE ─────────────────────────────────────────────────────────────────────────────────
  const iva = bloqueIva(G, { anio, ivaOficial, proy, arca, hoy })
  const ibb = bloqueIibb(G, { anio, iibb, proy })
  bloqueRetenciones(G, { anio })
  const otros = bloqueOtros(G, { anio, C })
  const pln = bloquePlanes(G, { anio, C, planes })
  const deuda = bloqueDeudaFinanciera(G, { anio, C, planes, fPlanTotal: pln.fTotal })
  const cierre = bloqueCierre(G, {
    proy,
    vencimientos: { iibb: `día ${IIBB_SUPUESTO.dia} de cada mes, ${IIBB_SUPUESTO.porQue}. Lo cierra una consulta a la DGR o al estudio contable.` },
  })

  // ── LA POSICIÓN, RECIÉN AHORA ──────────────────────────────────────────────────────────────────
  const calCrudo = obligacionesDelCalendario({
    hoy, anio, meses: mesesDelCalendario,
    filas: { iva: iva.fAPagar, iibb: ibb.fAPagar, plan: pln.fTotal, prendario: deuda.fCuota },
  })
  // ═══ LO QUE EL DUEÑO YA MIRÓ NO VUELVE A GRITAR (13/08) ═══
  //
  // El IIBB del 16/07 y el IVA del 21/07 salían "⚠ VENCIDO" cada dos horas después de que él dijera
  // "no afectan". El hecho no se borra —siguen vencidos, siguen en el calendario con su importe— pero
  // la marca pasa a decir quién los revisó y cuándo. Se libera ESE impuesto de ESE período con ESA
  // fecha de vencimiento: si ARCA o la DGR mueven la fecha, la decisión caduca sola y el ⚠ vuelve.
  const decVenc = decidir(CONTROLES.vencimientoVencido,
    calCrudo.filter((o) => o.vencido).map(hallazgoDeVencimiento), { hoy })
  explicarDecisiones(decVenc, console.log, { detalle: (h) => `el vencimiento ${h.clave} (${h.forma.fecha})` })
  const cal = conDecisionesDelDueno(calCrudo, new Map(decVenc.silenciados.map((s) => [s.clave, s.decision])))
  // El saldo a favor es el del ÚLTIMO MES CERRADO, no el del último mes del cuadro: de agosto en
  // adelante es proyección, y el hero dice cuál es la posición HOY. Sale de la CASCADA —que ya sabe
  // qué mes es un hecho y cuál un supuesto— y no del ancla de la proyección, que contesta otra
  // pregunta y venía publicando el saldo de un mes anterior al último cerrado. Ver `mesDelSaldoVigente`.
  const mesSaldoIva = mesDelSaldoVigente(iva.porOrigen) || mesesOf[mesesOf.length - 1] || 0
  const refs = {
    saldoIva: mesSaldoIva ? `$${cmes(mesSaldoIva)}$${iva.fLibre}` : '0',
    saldoIibb: ibb.ultimoReal ? `$${cmes(ibb.ultimoReal)}$${ibb.fSaldo}` : '0',
    prendPend: `$B$${deuda.fPrendPend}`,
    planesPend: `$B$${deuda.fPlanesPend}`,
    otrosSinFecha: formulaOtrosSinFecha([otros.fCheque, otros.fGanancias], hoy, anio, 3),
  }
  G.fijar(base, alto, filasDeLaPosicion({ cal, base: base + 1, hoy, refs, acuerdo: ACUERDO, tarjeta: TARJETA }))

  // Los meses PROYECTADOS en ámbar, celda por celda: una proyección que se ve igual que un hecho
  // termina leyéndose como un hecho.
  const ambar = []
  for (const m of proy?.meses ?? []) for (const f of [iva.fDeb, iva.fCred, iva.fAPagar, iva.fLibre, iva.fDDJJ]) ambar.push({ fila: f, mes: m })
  for (const m of ibb.proyectados) for (const f of [ibb.fBase, ibb.fAli, ibb.fImp, ibb.fRet, ibb.fAPagar, ibb.fSaldo]) ambar.push({ fila: f, mes: m })

  return {
    filas: G.filas,
    // `base` es 0-based y la primera fila del hero es la siguiente: +1 para pasar a 1-based, y
    // OFFSET_TITULAR lo declara el propio hero. Antes decía `base + 2` — un número que había que
    // recordar mover a mano cada vez que el hero cambiaba de orden.
    titular: base + 1 + OFFSET_TITULAR,
    // El bloque que la piel jerarquiza distinto del resto: importes grandes, desgloses apagados.
    hero: { desde: base + 1, hasta: base + ALTO_HERO },
    alicuotas: [ibb.fAli, cierre.fAlic],
    textos: [iva.fDDJJ],
    ambar,
    // El título, la frescura y el hero ENTERO quedan congelados: la posición no se va al scrollear.
    // Sale del hero, no de un 12 tipeado — un renglón más en el hero y el 12 se lo dejaba afuera.
    congeladas: base + ALTO_HERO,
    filaAlicuotaIva: cierre.fAlic,
    cal,
    refs,
    filasCalendario: { iva: iva.fAPagar, iibb: ibb.fAPagar },
    // De dónde sale cada mes del cuadro 4. Se devuelve para poder EXHIBIRLO: un cuadro que cambió de
    // fuente sin decirlo es la forma más barata de que nadie lo revise.
    origenIva: iva.porOrigen,
  }
}

/**
 * QUÉ MESES SE PROYECTAN, DESDE QUÉ SALDO, CON QUÉ ALÍCUOTA.
 *
 * Se lee la pestaña ANTES de escribirla: el ancla de toda la proyección es la libre disponibilidad
 * del último mes cargado, y ese mes puede haberlo escrito una persona. Si se anclara en la última
 * F.2051 de Drive, la proyección arrancaría de un saldo que ya se consumió.
 */
async function planDeProyeccionIva(google, ivaOficial) {
  // SIN .catch: ESTA LECTURA DECIDE QUÉ SE ESCRIBE. Si la API falla y esto se degrada a [], el ancla
  // desaparece y el generador escribe la pestaña SIN proyección — o peor, arranca de un saldo que no
  // es. Un error de red terminaría produciendo un cuadro que dice que no hay IVA que pagar.
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:N140`)
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const filaDe = (rot) => previo.findIndex((f) => norm(f?.[0]) === norm(rot))
  const iL = filaDe('Saldo de libre disponibilidad (acumulado)')
  const filaLibre = iL >= 0 ? (previo[iL] || []).slice(1, 13) : []
  const mesesConDDJJ = (ivaOficial ?? []).filter((d) => d.periodo).map((d) => Number(String(d.periodo).slice(5, 7)))
  const { ultimoMesConDato, libreDisp, mesesAProyectar, textoDondeVaImporte } = anclaDeProyeccion(filaLibre, mesesConDDJJ)
  // Un texto sentado en una celda de plata no puede irse sin dejar rastro: se avisa acá para el --dry
  // y viaja a la sección 10, que es donde la pestaña declara sus huecos.
  for (const { mes, valor } of textoDondeVaImporte) {
    console.log(`  ${MES[mes - 1]}: "${valor}" está donde va el saldo de libre disponibilidad y no es un importe`
      + ' — se descarta del ancla y el mes se recalcula.')
  }

  // LA ALÍCUOTA VIGENTE SALE DE LA CELDA, NO DE UNA CONSTANTE. Si el dueño ya la editó, manda la
  // suya: es la regla de "edición manual = verdad definitiva". Sólo la primera vez se siembra 0,21.
  const iA = filaDe('Alícuota general de IVA')
  const crudo = iA >= 0 ? previo[iA]?.[1] : null
  const alicuotaVigente = aNumero(crudo) !== null ? aNumero(crudo) / (String(crudo).includes('%') ? 100 : 1) : null

  // LA BASE, DEL LIBRO. Se recalcula en código el mismo número que la fórmula va a calcular en la
  // celda: el --dry exhibe el insumo y un importe fiscal se puede rehacer a mano contra el Libro.
  const lib = (await google.readSheetValues(ID, '_MOVIMIENTOS!A2:P', { render: 'UNFORMATTED_VALUE' }).catch(() => [])) ?? []
  const movs = lib.filter((f) => Number.isFinite(f?.[0]) && Number.isFinite(f?.[2]))
    .map((f) => ({
      fecha: f[0], signo: Number(f[1]), importe: Number(f[2]), rubro: String(f[5] ?? ''),
      origen: String(f[13] ?? ''), fila: Number(f[14]),
    }))

  // ═══ EL DÉBITO SÓLO MIRA LO FACTURADO (03/09/2026) ═══
  //
  // El dueño: «las proyecciones de IVA están tomando de manera exagerada; lo indicado con B en
  // cobranzas es lo que tiene que considerar siempre». Cobranzas marca la venta facturada con `B` y
  // la que no lleva factura con `N`. El Libro no arrastra esa marca —sólo la pestaña y la fila de
  // origen—, así que el puente se hace acá.
  //
  // MEDIDO sobre los 92 movimientos de rubro Cobranzas: 60 facturados por $562.605.362 y 32 sin
  // factura por $291.473.901. En los meses que se proyectan, la base del débito bajaba así:
  //
  //     sep-26   $217.961.520 → $132.752.129
  //     oct-26    $95.601.045 →  $62.421.413
  //     nov-26    $24.690.667 →  $12.775.852
  //     dic-26    $19.163.777 →  $19.163.777   (no tiene ninguna sin factura)
  //
  // $130.303.837 de base inventada, que a la alícuota vigente son unos $22,6M de IVA a pagar que
  // nunca se iban a devengar. La plata de esos cobros ES real y sigue entera en la caja: lo único
  // que no existe es su IVA. Por eso el filtro va acá y NO en el extractor del Libro.
  const catCobranzas = (await google.readSheetValues(ID, 'Cobranzas!B5:B', { render: 'UNFORMATTED_VALUE' }).catch(() => [])) ?? []
  const { facturadas, sinFactura, sinCategoria } = filasFacturadas(catCobranzas)
  // Un movimiento de Cobranzas cuyo origen no sea esa pestaña no se puede clasificar: su número de
  // fila apunta a otro lado. Medido hoy: cero. Se cuenta para que deje de ser cero con ruido.
  const cobranzasSinOrigen = movs.filter((x) => x.signo === 1 && x.rubro === 'Cobranzas' && x.origen !== 'Cobranzas')
  const debitoFacturado = (x) => x.rubro === 'Cobranzas' && x.origen === 'Cobranzas' && facturadas.has(x.fila)
  console.log(`  débito del Libro: ${facturadas.size} filas de Cobranzas facturadas · ${sinFactura} sin factura (fuera del IVA, dentro de la caja)`
    + `${sinCategoria ? ` · ⚠ ${sinCategoria} SIN CATEGORÍA` : ''}`
    + `${cobranzasSinOrigen.length ? ` · ⚠ ${cobranzasSinOrigen.length} cobro(s) sin origen en Cobranzas, no clasificables` : ''}`)
  const serialUTC = (y, m, d) => Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
  const enMes = (mv, m) => mv.fecha >= serialUTC(AÑO, m, 1) && mv.fecha < serialUTC(AÑO, m + 1, 1)
  const bases = Object.fromEntries(mesesAProyectar.map((m) => [m, {
    debito: [{
      celda: '_MOVIMIENTOS', rotulo: 'Cobranzas FACTURADAS del Libro (cobrado + esperado del mes)',
      valor: movs.filter((x) => enMes(x, m) && x.signo === 1 && debitoFacturado(x)).reduce((a, x) => a + x.importe, 0),
    }],
    credito: [{
      celda: '_MOVIMIENTOS', rotulo: 'Compras con factura del Libro (4 rubros, netas de NC)',
      valor: movs.filter((x) => enMes(x, m) && RUBROS_CREDITO_LIBRO.includes(x.rubro)).reduce((a, x) => a - x.signo * x.importe, 0),
    }],
  }]))
  return {
    meses: mesesAProyectar,
    ultimoMesConDato,
    libreDisp,
    textoDondeVaImporte,
    alicuotaVigente,
    bases,
    brutoDebito: brutoDebitoLibro,
    brutoCredito: brutoCreditoLibro,
    supuesto: supuestoDelMes({ cobranzas: LINEAS_DEBITO, compras: LINEAS_CREDITO })
      + ` Arranca del saldo a favor de ${MES[(ultimoMesConDato ?? 1) - 1]} ($${Math.round(libreDisp ?? 0).toLocaleString('es-AR')}).`
      + ' Es un CÁLCULO, no un hecho: el débito fiscal de una obra se devenga con el certificado aprobado, que puede caer antes que el cobro.',
  }
}

/** Las dos pestañas que podrían leer el calendario por número de fila. */
const CASH_FLOWS = ['Cash Flow Mensual', 'Cash Flow Semanal']

/**
 * ¿SE PUEDE ESCRIBIR SIN ROMPER A QUIEN LEE ESTA PESTAÑA?
 *
 * ═══ LA GUARDA QUE PASABA SIEMPRE (defecto C) ═══
 *
 * Esto verificaba SÓLO el consumo por número de fila, y ese consumo se terminó: hoy cero celdas de
 * los cash flow y de CAJA referencian esta pestaña por fórmula. Con la lista vacía, `contratoDeFilas`
 * devolvía ok incondicionalmente y la guarda más cara del script —dos lecturas de A1:BZ60 por
 * corrida— no protegía nada.
 *
 * El consumo real es POR RÓTULO, en JavaScript, en cinco lugares. Así que primero se verifica lo que
 * de verdad se consume (el texto, presente y único) y sólo después, y sólo si alguien todavía apunta
 * por número, se verifica la fila. La guarda barata corre siempre; la cara, cuando hace falta.
 */
async function verificarContrato(google, g) {
  const porRotulo = contratoDeRotulos(g.filas, CALENDARIO_IMPUESTOS.rotulos)
  if (!porRotulo.ok) return porRotulo
  const formulas = []
  for (const hoja of CASH_FLOWS) {
    const grid = await google.readSheetGrid(ID, `'${hoja}'!A1:BZ60`)
    for (const fila of grid.filas || []) for (const c of fila || []) if (c?.formula) formulas.push(c.formula)
  }
  const referenciadas = filasReferenciadas(formulas, PESTAÑA)
  if (!referenciadas.length) return { ok: true, motivo: `${porRotulo.motivo}; ningún cash flow la referencia por número de fila` }
  return contratoDeFilas(referenciadas, porRotulo.destino)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hoy = hoyISO()
  const iibb = await leerIIBB(google)
  const ivaOficial = await leerIVA(google)
  const ventas = await ventasProyectadas(google, ID)
  const fi = await query("select periodo, factor_acumulado from public.factor_ajuste where indice='ipc' order by periodo")
  const factor = Object.fromEntries(fi.rows.map((r) => [r.periodo, Number(r.factor_acumulado)]))
  const ret = await leerRetenciones(google, ID)
  const retIva = Object.fromEntries(Object.entries(ret.porMes)
    .filter(([k]) => k.startsWith('iva|')).map(([k, v]) => [k.slice(4), v]))
  // LA POSICIÓN TÉCNICA DE ARCA SIGUE CALCULÁNDOSE COMO CONTROL de los meses que SÍ tienen DDJJ: es
  // una segunda medición, independiente, y si las dos se separan mucho alguna está mal.
  //
  // PARA LOS MESES SIN DDJJ YA NO ES SÓLO UN CONTROL (07/08): de ahí sale QUÉ MESES tienen
  // comprobantes, y el cuadro los calcula con una fórmula sobre _ARCA_RAW. Con lo cual, para esos
  // meses, el control y el dato pasan a compartir fuente — y un control no se valida contra la
  // información que produce. Queda declarado: el contraste válido es contra la F.2051 cuando se
  // presente, no contra este mismo cálculo.
  const iva = await posicionIvaCompleta(AÑO, ventas, factor, retIva)
  // QUÉ MESES TIENE ARCA. `disponible` quiere decir que el período tiene comprobantes cargados; no
  // quiere decir que estén TODOS. El mes en curso es parcial por construcción y el cuadro lo declara.
  const arca = { meses: iva.filter((m) => m.disponible).map((m) => Number(String(m.periodo).slice(5, 7))) }
  const proy = await planDeProyeccionIva(google, ivaOficial)
  const planes = await planesDePago(AÑO)
  const cabCompras = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const { col: C, faltan } = resolverColumnas(cabCompras, {
    total: 'Total', concepto: 'Concepto', fecha: 'Fecha de caja', rubro: 'Rubro de caja', fechaPrev: 'Fecha prevista de pago (día)', detalle: 'Detalles / Obra',
  })
  if (faltan.length) { console.error(`⚠ faltan columnas en Compras: ${faltan.join(', ')} — no escribo con referencias inventadas`); process.exit(1) }
  console.log(`  Compras por encabezado: Total=${C.total} · Concepto=${C.concepto} · Rubro=${C.rubro} · Fecha prevista=${C.fechaPrev}`)

  const g = grilla({ anio: AÑO, C, planes, iibb, ivaOficial, proy, arca, hoy })
  if (ret.sospechosas.length) {
    console.error(`  ⚠ ${ret.sospechosas.length} retención(es) con alícuota que no encaja con ningún régimen — NO se computaron:`)
    for (const x of ret.sospechosas) console.error(`     fila ${x.fila} ${x.cliente}: ${x.regimen} ${Math.round(x.monto).toLocaleString('es-AR')} = ${(x.alicuota * 100).toFixed(2)}%`)
  }
  console.log(`  retenciones sufridas: ${Math.round(ret.total).toLocaleString('es-AR')} · IVA ${Math.round(ret.porRegimen.iva ?? 0).toLocaleString('es-AR')} · Ganancias ${Math.round(ret.porRegimen.ganancias ?? 0).toLocaleString('es-AR')} · IIBB ${Math.round(ret.porRegimen.iibb ?? 0).toLocaleString('es-AR')}`)
  console.log(`${PESTAÑA}: ${g.filas.length} filas · ${planes.length} planes · IVA de ${iva.filter((m) => m.disponible).length} meses reales · ${g.cal.length} vencimientos en el calendario`)
  const nombresDeMes = (ms) => (ms.length ? ms.map((m) => MES[m - 1]).join(', ') : '—')
  console.log(`  cuadro 4 · DDJJ: ${nombresDeMes(g.origenIva.ddjj)} · ARCA: ${nombresDeMes(g.origenIva.arca)}`
    + ` · ARCA parcial (mes en curso): ${nombresDeMes(g.origenIva['arca-parcial'])}`
    + ` · proyección del Libro: ${nombresDeMes(g.origenIva.proyeccion)} · del dueño: ${nombresDeMes(g.origenIva.ajeno)}`)
  if (DRY) {
    // ORQ_VOLCAR_GRILLA=<ruta>: el --dry vuelca la grilla intendida en JSON — para reparar por bloque lo que la Regla 0 conserva corrupto como «del dueño» (02/09).
    if (process.env.ORQ_VOLCAR_GRILLA) {
      ;(await import('node:fs')).writeFileSync(process.env.ORQ_VOLCAR_GRILLA, JSON.stringify({ filas: g.filas, filaAlicuotaIva: g.filaAlicuotaIva ?? null }))
    }
    console.log('\n  ══ CONTROL (NO se escribe) — posición técnica sobre comprobantes de ARCA ══')
    console.log('  Otro método y otra fuente que la proyección de abajo: sirve para contrastar la DDJJ,')
    console.log('  no para llenar el cuadro. Que no coincida con la proyección es lo esperado.')
    for (const m of iva.filter((x) => x.disponible || x.es_proyeccion)) {
      console.log(`  [control] ${m.periodo}  débito ${Math.round(m.debito_fiscal).toLocaleString('es-AR').padStart(12)}  crédito ${Math.round(m.credito_fiscal).toLocaleString('es-AR').padStart(12)}  a pagar ${Math.round(m.a_pagar_real ?? 0).toLocaleString('es-AR').padStart(12)}  saldo a favor ${Math.round(m.saldo_queda).toLocaleString('es-AR').padStart(12)}${m.es_proyeccion ? '  (proyección técnica)' : ''}`)
    }
    for (const p of planes) console.log(`  ${p.nombre.padEnd(42)} ${p.cuotas} cuotas x ${p.monto_cuota.toLocaleString('es-AR')} = ${Math.round(p.total).toLocaleString('es-AR')}`)
    informarCalendario(g, hoy)
    informarProyeccion(proy)
    const est = await verificarContrato(google, g)
    console.log(`\n  ${est.ok ? '✓' : '✖'} contrato con quien lee esta pestaña: ${est.motivo}`)
    return
  }

  const estable = await verificarContrato(google, g)
  if (!estable.ok) {
    console.error(`✖ NO escribo ${PESTAÑA}: ${estable.motivo}`)
    process.exit(1)
  }
  console.log(`  ✓ contrato con quien lee esta pestaña: ${estable.motivo}`)

  // PRIMERO la réplica _IIBB_RAW: las fórmulas del bloque de IIBB la referencian.
  await escribirIIBBRaw(google, ID, iibb)

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Las NOTAS viejas del
  // generador se limpian SÓLO en su propia grilla (antes barría 200x26 y se llevaba los comentarios).
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: g.filas.length, startColumnIndex: 0, endColumnIndex: ANCHO }, fields: 'note' } }]).catch(() => {})
  // LA COLA DE LA VERSIÓN ANTERIOR. La grilla se ACORTA sola: cuando un plan de pago termina, su fila
  // deja de emitirse y la vieja quedaría publicada con la cuota de un plan que ya no existe. El
  // mecanismo vive en lib/cola-de-rango.mjs; acá se declara sólo el ancho que ocupa este generador.
  const previoTab = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}400`)
  const cola = conColaMedida(g.filas, previoTab, { ancho: ANCHO })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  g.filas = cola.filas

  // REGLA 0 — si el dueño reescribió un rótulo, lo reencuadró o lo borró, gana lo suyo.
  const { grid: gridFinal, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTAÑA, g.filas, previoTab)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)
  g.filas = gridFinal
  vaciarColumnaDeProsa(g.filas, ANCHO - 1)
  const escritura = await escribirPreservando(google, ID, PESTAÑA, g.filas, { respetar: false, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA (31/07). Una pestaña que no se escribió no
  // cambió de forma: su formato y sus nombres son los de su última escritura y así tienen que quedar.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato ni sus rangos con nombre.')
  const { conservadas } = salteada ? { conservadas: [] } : escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  if (!salteada) await formatear(google, ID, hoja.sheetId, g, hoja.rows ?? 0)
  // EL NOMBRE SE PUBLICA DESPUÉS DE ESCRIBIR, NUNCA ANTES: un nombre que apunta a una fila que no
  // existe se resuelve a una celda vacía, y las fórmulas leerían alícuota cero.
  if (!salteada && g.filaAlicuotaIva) {
    await publicarNombres(google, ID, hoja.sheetId, [{ name: RANGO_ALICUOTA_IVA, fila: g.filaAlicuotaIva, col: 2 }])
      .then(() => console.log(`  ${RANGO_ALICUOTA_IVA} → ${PESTAÑA}!B${g.filaAlicuotaIva}`))
      .catch((e) => console.warn(`  ⚠ no pude publicar ${RANGO_ALICUOTA_IVA}: ${e.message} — la proyección de IVA quedaría en $0`))
  }
  informarCalendario(g, hoy)
  informarProyeccion(proy)

  // VERIFICAR MIRANDO LA PESTAÑA, no confiando en que la escritura salió bien.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|VALOR|¡|¿|DIV|NAME|NUM|NULL)/i.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `⚠ ${err.length} celdas en error: ${err.slice(0, 6).join(' ')}` : '✓ ninguna celda en error')
  const defectos = auditarPatron(v)
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
  for (const f of v) if (/^(⇒|LA POSICIÓN)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 52).padEnd(54)}${String(f[1] ?? '').padStart(16)}`)
  await guardarRegistro(ID, PESTAÑA, g.filas, ediciones, v, candidatos).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  if (err.length || defectos.length) process.exitCode = 1
}

// SÓLO CUANDO SE LO INVOCA COMO COMANDO. Sin esta guarda bastaba `import` para que el archivo
// escribiera el Sheet real: un test que quisiera probar una función pura de acá corría la pestaña
// entera contra producción. Un módulo se importa; un comando se ejecuta.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
