#!/usr/bin/env node
// "IMPUESTOS Y FINANCIEROS" — primero la posición, después el detalle.
//
// EL DUEÑO (06/08): *"la pestaña mezcla posición, deuda, vencimientos, proyecciones y obligaciones.
// Separalas. La pantalla muestra PRIMERO la posición. Después el detalle técnico. Los impuestos
// proyectados salen de obligaciones reales, vencimientos y bases imponibles, NO de un promedio.
// Menos texto, importes protagonistas, menos de cinco segundos. Nada de IFERROR para esconder. No
// romper conexiones."* Y el 09/09: *"un diseño nuevo, unificado, minimalismo extremo, sin
// aclaraciones ni explicaciones de nada"* — de ahí el hero de tres filas y la sección 6 eliminada.
//
// LA PLATA QUE ESTABA MAL, y que los tests de este árbol impiden que vuelva: la cuota del prendario
// salía de un SUMIF sobre TODO el extracto ($2.567.316 donde la cuota es $1.282.811, cinco meses); la
// "deuda pendiente" sumaba las doce cuotas del año, siete YA PAGADAS ($17,5M de más); IIBB no
// proyectaba nada; el impuesto al cheque se calculaba con un AVERAGEIF fuera del total.
//
//   node orquestador/scripts/impuestos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { ventasFacturadasDelMes, creditoDeComprasDelMes, RUBROS_CREDITO_LIBRO, planDeVentas } from '../lib/impuestos-base-libro.mjs'
import { conciliarCobranzasConArca, informarConciliacion } from '../lib/cobranzas-vs-arca.mjs'
import { loadConfig } from '../lib/config.mjs'
import { posicionIvaCompleta } from '../lib/posicion-iva.mjs'
import {
  anclaDeProyeccion, supuestoDelMes, soloLoTipeado, RANGO_ALICUOTA_IVA,
  filasReferenciadas, contratoDeFilas, contratoDeRotulos,
} from '../lib/iva-libre-disponibilidad.mjs'
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
import { crearGrilla, ANCHO, MES, cmes } from '../lib/impuestos-grilla.mjs'
import {
  IIBB_RAW, IIBB_COL, IIBB_FILA0, ARCA_RAW, ARCA_FILA0, BANCO_RAW,
  leerIIBB, leerIVA, leerRetenciones, ventasProyectadas, escribirIIBBRaw,
} from '../lib/impuestos-fuentes.mjs'
import {
  bloqueIva, mesDeLaUltimaDDJJ, bloqueIibb, bloqueRetenciones, bloqueOtros, bloqueDeudaFinanciera,
} from '../lib/impuestos-bloques.mjs'
import {
  obligacionesDelCalendario, mesesDeCadaObligacion, altoDeLaPosicion, filasDeLaPosicion, verificarReferenciasDelHero,
  ALTO_HERO, ROTULO_A_PAGAR_30, hallazgoDeVencimiento, conDecisionesDelDueno,
} from '../lib/impuestos-posicion.mjs'
// Lo que el dueño ya decidió sobre un vencimiento puntual. Ver lib/decisiones-hallazgos.mjs.
import { CONTROLES, decidir, explicarDecisiones } from '../lib/decisiones-hallazgos.mjs'
import { informarProyeccion, informarCalendario } from '../lib/impuestos-informe.mjs'
import { formatear } from '../lib/impuestos-piel.mjs'
export { ubicarLineas, sinSolapamiento } from '../lib/impuestos-base-proyeccion.mjs'
import { alicuotaVigente, publicarAlicuotaEnParametros, ROTULO_ALICUOTA } from '../lib/impuestos-alicuota.mjs'
// EL PARÁMETRO VIVE EN «Parámetros» Y LO ASEGURA EL MISMO MECANISMO QUE LOS DE JORNALES Y CARGAS:
// crea la fila si falta, nunca pisa un valor cargado, y reapunta el rango con nombre por rótulo.
import { asegurarParametros } from './jornales-pestana.mjs'
// EL CUADRO DE PLANES DEL F931 VIVE EN «Cargas Sociales» (09/09/2026): de acá salen el nombre del
// rango que se lee y el MISMO lector que arma aquel cuadro — el paralelo se borró para no tener dos.
import { NOMBRES_CARGAS } from '../lib/libro-extractores-cargas.mjs'
import { planesDePago } from '../lib/cargas-planes.mjs'
import { elLayoutCambio, invalidarHuellasDeFormato } from '../lib/huella-formato-layout.mjs'

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

// La base de la proyección sale del Libro, no del Cash Flow por posición: ver `basesDelLibro`.
const brutoDebitoLibro = (hoy) => (m) => [ventasFacturadasDelMes(AÑO, m, 'iva', { hoy })]
const brutoCreditoLibro = (m) => [creditoDeComprasDelMes(AÑO, m)]

/**
 * LA GRILLA ENTERA. Primero la cabecera, después se RESERVA el espacio de la posición, se escribe el
 * detalle —que es quien sabe en qué fila queda cada total— y recién entonces se llena la posición con
 * referencias. Ni un número pegado arriba.
 */
export function grilla({ anio, C, planes, iibb, ivaOficial, proy, arca, hoy }) {
  const G = crearGrilla(anio)
  G.push([PESTAÑA])  // tipeado aparte decía «Impuestos y financiero»: dos nombres para la misma pestaña
  // LA FRESCURA, POR FUENTE Y COMPACTA. Una sola fecha está prohibida acá: esta pestaña cruza fuentes
  // vivas (ARCA, el extracto, Cobranzas) con congeladas (las DDJJ de PDF, que se quedan en el último
  // período presentado), y un MAX le prestaría la fecha de la viva a la congelada. Con `compacto` cada
  // expresión se evalúa UNA vez dentro de un LET: mismas cuatro fuentes, de 3.029 a 1.239 caracteres.
  // ═══ Y LA PROSA SE FUE DE LA A2 (09/09/2026) ═══
  //
  // Decía «Qué se le debe al fisco, qué está inmovilizado y con qué se cuenta · …»: eso ya lo
  // contestan el nombre en A1 y los cinco títulos de sección. La fila 2 sólo declara PROCEDENCIA y
  // queda `ARCA al dd/mm · IIBB al dd/mm · banco al dd/mm`, igual que las pestañas hermanas.
  //
  // SE FUE TAMBIÉN LA CUARTA FUENTE. «retenciones» miraba `Cobranzas!$Q$5:$Q`, que es la MISMA
  // columna de fecha por la que ya se declara Cobranzas en otras pestañas y cuyo dato acá alimenta
  // un solo cuadro. Tres fechas se leen de un vistazo; cuatro ya es un renglón que se saltea.
  G.push([rotuloPorFuente('', [
    { nombre: 'ARCA', expr: formulaUltimaFecha(`${ARCA_RAW}!$C$${ARCA_FILA0}:$C`) },
    // IIBB: NO la fecha en que se bajó el PDF sino el PERÍODO que la DDJJ cubre. Una DDJJ de junio
    // presentada el 16/07 habla de junio; declarar el 16/07 sería declarar frescura de la gestión.
    { nombre: 'IIBB', expr: formulaUltimoPeriodo(`${IIBB_RAW}!$${IIBB_COL.periodo}$${IIBB_FILA0}:$${IIBB_COL.periodo}`), avisoDias: DIAS_AVISO_MENSUAL },
    { nombre: 'banco', expr: formulaUltimaFecha(`${BANCO_RAW}!$A$4:$A`) },
  ], { compacto: true })])
  G.blanco()

  // QUÉ MESES TIENE CADA OBLIGACIÓN — se necesita ANTES de escribir el detalle. El porqué y la
  // cuenta, en `mesesDeCadaObligacion`, al lado del calendario que los consume.
  const { mesesOf, ...mesesDelCalendario } = mesesDeCadaObligacion({ ivaOficial, proy, iibb, planes })
  // EL ESPACIO DEL HERO YA NO DEPENDE DE CUÁNTOS VENCIMIENTOS HAYA: el calendario dejó de ocupar
  // filas (ver `filasDeLaPosicion`), así que la reserva es constante y no puede quedar corta.
  const alto = altoDeLaPosicion()
  const base = G.reservar(alto)

  // ── EL DETALLE ─────────────────────────────────────────────────────────────────────────────────
  const iva = bloqueIva(G, { anio, ivaOficial, proy, arca, hoy })
  const ibb = bloqueIibb(G, { anio, iibb, proy, hoy })
  bloqueRetenciones(G, { anio })
  bloqueOtros(G, { anio, C })
  // El cuadro de planes se retiró: vive en «Cargas Sociales». Desde el 09/09/2026 tampoco queda la
  // fila mensual de la cuota — era la misma serie de aquella pestaña, publicada dos veces.
  const deuda = bloqueDeudaFinanciera(G, { anio, C })
  // NADA DEBAJO DEL ÚLTIMO BLOQUE. La sección 6 («Supuestos y huecos») se eliminó entera y su
  // parámetro —la alícuota de IVA— vive en «Parámetros». El porqué de cada hueco, en
  // `lib/impuestos-bloques.mjs`, al pie del archivo.

  // ── LA POSICIÓN, RECIÉN AHORA ──────────────────────────────────────────────────────────────────
  const calCrudo = obligacionesDelCalendario({
    hoy, anio, meses: mesesDelCalendario,
    // La cuota de los planes ya no tiene fila acá: entra al calendario por el rango con nombre que
    // publica «Cargas Sociales», dentro de la fórmula del hero. Es lo que impide que «A pagar en 30
    // días» se olvide de una cuota de F931 que sí hay que pagar.
    filas: {
      iva: iva.fAPagar,
      iibb: ibb.fAPagar,
      plan: (m) => `INDEX(${NOMBRES_CARGAS.planes};${m})`,
      prendario: deuda.fCuota,
    },
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
  // El saldo a favor es el del ÚLTIMO MES CERRADO, no el del último del cuadro: de agosto en adelante
  // es proyección y el hero dice la posición HOY. Sale de la CASCADA, no del ancla, que contesta otra
  // pregunta y publicaba el saldo de un mes anterior al último cerrado. Ver `mesDeLaUltimaDDJJ`.
  const mesSaldoIva = mesDeLaUltimaDDJJ(iva.porOrigen) || mesesOf[mesesOf.length - 1] || 0
  const refs = {
    saldoIva: mesSaldoIva ? `$${cmes(mesSaldoIva)}$${iva.fLibre}` : '0',
    saldoIibb: ibb.ultimoReal ? `$${cmes(ibb.ultimoReal)}$${ibb.fSaldo}` : '0',
    prendPend: `$B$${deuda.fPrendPend}`,
    // Ya no es una celda de esta pestaña: es el rango con nombre que publica «Cargas Sociales».
    planesPend: NOMBRES_CARGAS.planesSinPagar,
  }
  const hero = filasDeLaPosicion({ cal, refs })
  G.fijar(base, alto, hero)
  // EL CONTROL SE HACE CONTRA LO ESCRITO, no contra otra cuenta con las mismas constantes.
  verificarReferenciasDelHero(hero, G.filas)

  // LOS MESES PROYECTADOS: GRIS ITÁLICA, NO FONDO ÁMBAR (09/09/2026). El porqué, en la piel.
  const proyectadas = []
  for (const m of proy?.meses ?? []) for (const f of [iva.fDeb, iva.fCred, iva.fAPagar, iva.fLibre, iva.fDDJJ]) proyectadas.push({ fila: f, mes: m })
  for (const m of ibb.proyectados) for (const f of [ibb.fBase, ibb.fAli, ibb.fImp, ibb.fRet, ibb.fAPagar, ibb.fSaldo]) proyectadas.push({ fila: f, mes: m })

  return {
    filas: G.filas,
    // El bloque que la piel jerarquiza distinto del resto: los tres totales con los que se decide.
    hero: { desde: base + 1, hasta: base + ALTO_HERO },
    alicuotas: [ibb.fAli],
    textos: [iva.fDDJJ],
    // La FECHA que el hero publica al lado del importe: un dato, no plata. La fila se BUSCA por su
    // rótulo, nunca por su posición dentro del hero.
    fechasCelda: [{ fila: base + 1 + hero.findIndex((f) => String(f?.[0] ?? '').includes(ROTULO_A_PAGAR_30)), col: 2 }],
    proyectadas,
    // El título, la frescura y el hero ENTERO quedan congelados: la posición no se va al scrollear.
    // Sale del hero, no de un número tipeado.
    congeladas: base + ALTO_HERO,
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
async function planDeProyeccionIva(google, ivaOficial, hoy) {
  // SIN .catch: ESTA LECTURA DECIDE QUÉ SE ESCRIBE. Degradada a [], el ancla desaparece y el cuadro
  // sale sin proyección — o arranca de un saldo que no es: diría que no hay IVA que pagar.
  // SIN FORMATO. La columna A —los rótulos que se buscan acá— es texto y no cambia; el PARÁMETRO de
  // la fila de alícuota, en cambio, se leía con su disfraz puesto: 0,21 con formato de moneda sin
  // decimales devolvía "$0" y apagaba la proyección entera. Ver lib/impuestos-alicuota.mjs.
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:N140`, { render: 'UNFORMATTED_VALUE' })
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const filaDe = (rot) => previo.findIndex((f) => norm(f?.[0]) === norm(rot))
  const iL = filaDe('Saldo de libre disponibilidad (acumulado)')
  const crudoLibre = iL >= 0
    ? ((await google.readSheetValues(ID, `${PESTAÑA}!B${iL + 1}:M${iL + 1}`, { render: 'FORMULA' }))[0] ?? [])
    : []
  const filaLibre = soloLoTipeado(crudoLibre) // sólo lo TIPEADO: una fórmula es proyección propia
  const mesesConDDJJ = (ivaOficial ?? []).filter((d) => d.periodo).map((d) => Number(String(d.periodo).slice(5, 7)))
  const { ultimoMesConDato, libreDisp, mesesAProyectar, textoDondeVaImporte } = anclaDeProyeccion(filaLibre, mesesConDDJJ)
  for (const { mes, valor } of textoDondeVaImporte) {
    console.log(`  ${MES[mes - 1]}: "${valor}" está donde va el saldo de libre disponibilidad y no es un importe`
      + ' — se descarta del ancla y el mes se recalcula.')
  }

  // LA ALÍCUOTA SALE DE LA CELDA, NO DE UNA CONSTANTE: si el dueño la editó, manda la suya
  // («edición manual = verdad definitiva»). Lo que la celda NO puede hacer es apagar el impuesto:
  // un 0 —o un "$0" de un formato equivocado— no es una alícuota, es una celda sin declarar.
  //
  // LA CELDA ES LA DE «Parámetros» DESDE EL 09/09/2026, con la vieja de esta pestaña como fallback de
  // migración. El porqué —y por qué el fallback caduca solo— está en `alicuotaVigente`.
  const iA = filaDe(ROTULO_ALICUOTA)
  const alic = await alicuotaVigente(google, ID, iA >= 0 ? previo[iA]?.[1] : null)
  console.log(`  alícuota de IVA: ${(alic.alicuota * 100).toFixed(2)}% — ${alic.motivo} (${alic.donde})`)

  // LA BASE, DEL LIBRO. Se recalcula en código el mismo número que la fórmula va a calcular en la
  // celda: el --dry exhibe el insumo y un importe fiscal se puede rehacer a mano contra el Libro.
  const lib = (await google.readSheetValues(ID, '_MOVIMIENTOS!A2:P', { render: 'UNFORMATTED_VALUE' }).catch(() => [])) ?? []
  const movs = lib.filter((f) => Number.isFinite(f?.[0]) && Number.isFinite(f?.[2]))
    .map((f) => ({
      fecha: f[0], signo: Number(f[1]), importe: Number(f[2]), rubro: String(f[5] ?? ''),
      origen: String(f[13] ?? ''), fila: Number(f[14]),
    }))

  // El débito sale de Cobranzas, no del Libro: el IVA que cada factura B ya declara, por emisión.
  const cob = (await google.readSheetValues(ID, 'Cobranzas!A5:Q', { render: 'UNFORMATTED_VALUE' }).catch(() => [])) ?? []
  const ventas = planDeVentas(cob, AÑO, hoy)
  // «Lo que aparece en AfipSDK tiene que ser como lo facturado en B»: las diferencias, al log.
  const arcaRaw = (await google.readSheetValues(ID, `${ARCA_RAW}!A${ARCA_FILA0}:L`, { render: 'UNFORMATTED_VALUE' }).catch(() => [])) ?? []
  for (const linea of informarConciliacion(conciliarCobranzasConArca(cob, arcaRaw, { hoy }))) console.log(linea)
  const serialUTC = (y, m, d) => Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
  const enMes = (mv, m) => mv.fecha >= serialUTC(AÑO, m, 1) && mv.fecha < serialUTC(AÑO, m + 1, 1)
  const bases = Object.fromEntries(mesesAProyectar.map((m) => [m, {
    debito: [{
      celda: 'Cobranzas', rotulo: 'IVA declarado por las facturas B emitidas en el mes',
      valor: ventas.iva(m),
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
    alicuotaVigente: alic.alicuota,
    bases,
    brutoDebito: brutoDebitoLibro(hoy), brutoCredito: brutoCreditoLibro,
    sinBase: ventas.sinBase(mesesAProyectar),
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
  const proy = await planDeProyeccionIva(google, ivaOficial, hoy)
  // SÓLO PARA SABER QUÉ MESES TIENEN CUOTA — es lo que el calendario del hero necesita para poner la
  // obligación en su ventana. El IMPORTE lo publica «Cargas Sociales» por `CARGAS_MES_PLANES`.
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
    // La forma la impone `cargas-planes.mjs`, el lector que quedó: `n` cuotas, `saldo` lo que falta.
    for (const p of planes) console.log(`  ${p.nombre.padEnd(30)} ${p.n} cuota(s) · ${p.pagadas} pagada(s) · total ${Math.round(p.total).toLocaleString('es-AR')} · saldo ${Math.round(p.saldo).toLocaleString('es-AR')}`)
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

  // EL PARÁMETRO VA PRIMERO, ANTES DE TOCAR LA PESTAÑA (09/09/2026): `ALICUOTA_IVA` apunta a una fila
  // que este rediseño elimina. El porqué del orden, en `publicarAlicuotaEnParametros`.
  const hojas = await google.getSheetMeta(ID)
  const pub = await publicarAlicuotaEnParametros(google, ID, hojas, asegurarParametros, proy.alicuotaVigente)
  if (!pub.ok) { console.error(`✖ NO escribo ${PESTAÑA}: ${pub.motivo}`); process.exit(1) }
  console.log(`  ✓ ${RANGO_ALICUOTA_IVA} → ${pub.motivo}`)

  // PRIMERO la réplica _IIBB_RAW: las fórmulas del bloque de IIBB la referencian.
  await escribirIIBBRaw(google, ID, iibb)

  // ═══ UNA HUELLA DE FORMATO DE UN LAYOUT QUE YA NO EXISTE NO ES EVIDENCIA (04/09/2026) ═══
  //
  // Cuando esta pestaña pasó de 105 filas a 68, las 350 huellas viejas quedaron describiendo filas
  // que ya no contienen lo que contenían: la guarda las leyó como diseño del dueño y bloqueó los 419
  // rangos de formato de golpe. La pestaña se publicó con los importes crudos —`1419600` en vez de
  // `$1.419.600`— y el bloqueo era permanente, porque sin re-aplicar tampoco se re-sella.
  //
  // VA ANTES DE LA PRIMERA ESCRITURA DE LA CORRIDA, y no antes de `formatear`: el borrado de notas
  // también es un request de formato y quedaba del lado bloqueado. Ver lib/huella-formato-layout.mjs.
  const previoParaLayout = await google.readSheetValues(ID, `${PESTAÑA}!A1:A400`)
  const layout = elLayoutCambio(previoParaLayout, g.filas)
  if (layout.cambio) {
    const n = await invalidarHuellasDeFormato(query, ID, PESTAÑA).catch((e) => { console.warn(`  ⚠ no pude invalidar las huellas de formato: ${e.message}`); return 0 })
    console.log(`  🎨 cambió el layout (${layout.motivo}): invalido ${n} huella(s) de formato y las vuelvo a sellar`)
  }

  const hoja = hojas.find((s) => s.title === PESTAÑA)
  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Las NOTAS viejas del
  // generador se limpian SÓLO en su propia grilla (antes barría 200x26 y se llevaba los comentarios).
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: g.filas.length, startColumnIndex: 0, endColumnIndex: ANCHO }, fields: 'note' } }]).catch(() => {})
  // LA COLA DE LA VERSIÓN ANTERIOR. La grilla se ACORTA sola: cuando un plan de pago termina, su fila
  // deja de emitirse y la vieja quedaría publicada con la cuota de un plan que ya no existe. El
  // mecanismo vive en lib/cola-de-rango.mjs; acá se declara sólo el ancho que ocupa este generador.
  const previoTab = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}400`)
  // `probarPorForma`: esta pestaña bajó de 105 filas a 68 y la cola no se podía borrar. Las celdas
  // que escribió una versión anterior al sistema de huellas no tienen ninguna, así que la guarda
  // respondía «nunca fue mía» y las filas 77, 101, 103 y 105 sobrevivieron a cuatro corridas — con un
  // renglón de 592 caracteres y dos alícuotas sueltas que el censo de números pegados seguía
  // contando. Con la bandera, una celda de la cola cuyo contenido tiene FORMA DE GENERADOR se prueba
  // propia y se limpia; un texto libre del dueño sigue decidiéndolo la guarda. Ver cola-de-rango.mjs.
  const cola = conColaMedida(g.filas, previoTab, { ancho: ANCHO, probarPorForma: true })
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
  // EL RANGO CON NOMBRE `ALICUOTA_IVA` YA NO SE PUBLICA ACÁ: apunta a «Parámetros» y lo dejó apuntado
  // `asegurarParametros`, antes de la primera escritura. Publicarlo después de escribir era correcto
  // mientras la celda vivía en esta pestaña; ahora sería reapuntarlo a una fila que ya no existe.
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
// escribiera el Sheet real. Un módulo se importa; un comando se ejecuta.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
