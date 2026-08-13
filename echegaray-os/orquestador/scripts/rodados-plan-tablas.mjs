#!/usr/bin/env node
// LAS SIETE TABLAS DEL PLAN DE TRES RODADOS, en markdown listo para publicar.
//
// No calcula nada: pide todo a `rodados-plan.mjs` y `rodados-plan-caja.mjs` y lo formatea. Si un
// número de acá no se puede rastrear hasta una función de esos módulos, está mal puesto.
//
//   node orquestador/scripts/rodados-plan-tablas.mjs            → las 7 tablas
//   node orquestador/scripts/rodados-plan-tablas.mjs 3 5        → sólo la 3 y la 5

import {
  planDeTresUnidades, costoDeCadaUnidad, compararFuentes, calendarioDeCuotas,
  inflacionDeTrabajo,
} from '../lib/rodados-plan.mjs'
import {
  impactoEnCaja, semanaCritica, egresoMensualPromedio, cargaEnRegimen, picoDeCarga,
  alternativasParaLasDos, costoDeLaDemora, correccionUsd,
} from '../lib/rodados-plan-caja.mjs'
import { C31, C32, CAJA, CALENDARIO, CORRECCION_USD, EGRESOS_REALES, FONDEFIN, PRENDARIO_FORD, UVA } from '../lib/rodados-plan-datos.mjs'

// El redondeo a peso ocurre ANTES del signo: sin esto, un −0,000000015 sale impreso como "$-0", que
// es la clase de celda que hace dudar de toda la tabla. Un cero calculado es cero.
const $ = (n) => {
  if (n == null) return '—'
  const r = Math.round(n) + 0
  return `${r < 0 ? '−' : ''}$${Math.abs(r).toLocaleString('es-AR')}`
}
const pct = (f, d = 2) => (f == null ? 'DESCONOCIDO' : `${(f * 100).toFixed(d).replace('.', ',')}%`)
const mes = (m) => {
  const N = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const [a, x] = String(m).split('-')
  return `${N[Number(x) - 1]}-${a.slice(2)}`
}
const tabla = (cabeceras, filas) => [
  `| ${cabeceras.join(' | ')} |`,
  `|${cabeceras.map(() => '---').join('|')}|`,
  ...filas.map((f) => `| ${f.join(' | ')} |`),
].join('\n')

const plan = planDeTresUnidades()
const inf = inflacionDeTrabajo()
const costos = costoDeCadaUnidad(plan)

// ═════ 1 · CRONOGRAMA DE ADQUISICIÓN ═════
function cronograma() {
  const meses = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']
  const cal = calendarioDeCuotas(plan, { desde: '2026-08', hasta: '2026-12' })
  const hitos = {
    '2026-08': ['**presentar la carpeta FONDEFIN**', 'incluida en la carpeta', 'incluida en la carpeta'],
    '2026-09': ['**entrega** · anticipo ' + $(UVA.anticipoEfectivo), 'en trámite', 'en trámite'],
    '2026-10': ['1ª cuota', 'en trámite', 'en trámite'],
    '2026-11': ['2ª cuota', 'en trámite', 'en trámite'],
    '2026-12': ['3ª cuota', '**desembolso + entrega**', '**desembolso + entrega**'],
  }
  return tabla(
    ['Mes', 'U1 · C32 doble cabina (UVA)', 'U2 · C31 cabina simple (FONDEFIN)', 'U3 · C31 cabina simple (FONDEFIN)', 'Sale de caja ese mes'],
    meses.map((m) => {
      const f = cal.find((c) => c.mes === m)
      const anticipo = m === '2026-09' ? UVA.anticipoEfectivo : 0
      const gastos = m === '2026-12' ? plan.gastosRetiroC31.importe * 2 : 0
      return [mes(m), ...hitos[m], $(anticipo + gastos + f.totalUnidades)]
    }),
  )
}

// ═════ 2 · COMPARACIÓN DE TASAS ═════
function tasas() {
  return tabla(
    ['Fuente de fondos', 'TNA', 'IVA s/int.', 'TNA con IVA', 'Efectivo anual', 'TASA REAL', 'Piso o total', '¿Sirve para los rodados?'],
    compararFuentes(inf.anual).map((f) => [
      `**${f.producto}**<br>${f.entidad}`,
      f.indexado ? '0% *(nominal)*' : pct(f.tna),
      f.iva == null ? 'DESCONOCIDO' : pct(f.iva) + (f.ivaEsSupuesto ? ' *(supuesto)*' : ''),
      f.tnaConIva == null ? 'DESCONOCIDO' : pct(f.tnaConIva),
      `${pct(f.efectivoAnual)}<br><sub>${f.origenEfectivo}</sub>`,
      `**${pct(f.tasaReal)}**`,
      f.esPiso ? 'PISO' : 'TOTAL (CFT publicado)',
      `${f.sirveParaRodados ? 'SÍ' : 'NO'} — ${f.nota}`,
    ]),
  )
}

// ═════ 3 · COSTO TOTAL DE CADA UNIDAD ═════
function costoUnidades() {
  const filas = costos.map((c) => [
    `**U${c.unidad}** · ${c.modelo}`,
    $(c.precioContado),
    c.fuente,
    $(c.desembolsoPropio) + (c.unidad > 1 ? ' *(est.)*' : ''),
    $(c.financiado),
    `${c.cuotas} m · ${mes(c.mesPrimeraCuota)}→${mes(c.mesUltimaCuota)}`,
    $(c.cuotaInicial), $(c.cuotaMaxima), $(c.cuotaFinal),
    $(c.totalPagado),
    $(c.costoFinancieroNominal),
    `**${$(c.costoFinancieroReal)}**`,
  ])
  const t = (k) => costos.reduce((s, c) => s + c[k], 0)
  filas.push(['**LAS TRES**', $(t('precioContado')), '—', $(t('desembolsoPropio')), $(t('financiado')), '—', '—', '—', '—',
    $(t('totalPagado')), $(t('costoFinancieroNominal')), `**${$(t('costoFinancieroReal'))}**`])
  return tabla(
    ['Unidad', 'Precio contado', 'Forma de pago', 'Desembolso propio', 'Financiado', 'Plazo', 'Cuota inicial', 'Cuota máxima', 'Cuota final', 'Total pagado', 'Costo fin. nominal', 'Costo fin. EN PESOS DE HOY'],
    filas,
  )
}

// ═════ 4 · CALENDARIO DE CUOTAS ═════
function calendario() {
  const cal = calendarioDeCuotas(plan, { desde: '2026-09', hasta: '2027-12' })
  return tabla(
    ['Mes', 'U1 · UVA', 'U2 · FONDEFIN', 'U3 · FONDEFIN', 'Ford (prendario vigente)', 'TOTAL del mes'],
    cal.map((f) => [
      mes(f.mes),
      f.porUnidad[0].cuota ? $(f.porUnidad[0].cuota) : '—',
      f.porUnidad[1].cuota ? $(f.porUnidad[1].cuota) + (f.porUnidad[1].enGracia ? ' *(gracia)*' : '') : '—',
      f.porUnidad[2].cuota ? $(f.porUnidad[2].cuota) + (f.porUnidad[2].enGracia ? ' *(gracia)*' : '') : '—',
      f.ford ? $(f.ford) + (f.fordCargadoEnElSheet ? '' : ' **⚠ no cargada**') : '—',
      `**${$(f.total)}**`,
    ]),
  )
}

// ═════ 5 · IMPACTO EN CAJA ═════
function caja() {
  const esc = [
    { n: 0, rotulo: 'Sin comprar' },
    { n: 1, rotulo: 'Sólo U1 (efectivo)' },
    { n: 1, rotulo: 'Sólo U1 (6 eCheq)', variante: 'echeq' },
    { n: 2, rotulo: 'U1 + FONDEFIN ×1' },
    { n: 3, rotulo: 'U1 + FONDEFIN ×2 (las tres)' },
  ]
  const meses = ['2026-09', '2026-10', '2026-11', '2026-12']
  const filas = esc.flatMap((e) => {
    const imp = impactoEnCaja(e.n, e.variante ? { variante: e.variante } : {})
    const sc = semanaCritica(e.n, e.variante ? { variante: e.variante } : {})
    const marca = (x) => (x.perforaAcuerdo ? ' 🔴' : x.tocaDescubierto ? ' 🟠' : '')
    return [
      [`**${e.rotulo}**`, 'como está hoy', ...meses.map((m) => { const x = imp.find((y) => y.mes === m); return $(x.comoEsta) + marca(x) }),
        $(sc.comoEsta) + (sc.perforaAcuerdo ? ' 🔴' : sc.tocaDescubierto ? ' 🟠' : '')],
      ['', 'corregida por el USD', ...meses.map((m) => $(imp.find((y) => y.mes === m).corregido)), $(sc.corregido)],
    ]
  })
  return tabla(['Escenario', 'Versión de la caja', ...meses.map(mes), 'Semana del 28/12'], filas)
}

// ═════ 6 · LA CARGA EN RÉGIMEN ═════
function regimen() {
  const r = cargaEnRegimen({ plan, desde: '2027-06', hasta: '2027-12' })
  const pico = picoDeCarga(plan)
  const filas = r.map((f) => [mes(f.mes), $(f.cuotasUnidades), $(f.ford), `**${$(f.total)}**`, $(f.egresoProyectado), pct(f.pesoSobreEgresos)])
  filas.push([`**PICO · ${mes(pico.mes)}**`, $(pico.cuotasUnidades), $(pico.ford), `**${$(pico.total)}**`, $(pico.egresoProyectado), `**${pct(pico.pesoSobreEgresos)}**`])
  return tabla(['Mes', 'Cuotas de los 3 rodados', 'Ford', 'CARGA TOTAL', 'Egreso mensual proyectado', 'Peso'], filas)
}

// ═════ 7 · QUÉ PASA SI NO SE PRESENTA LA CARPETA AHORA ═════
function demora() {
  const alt = alternativasParaLasDos({ plan })
  const d = costoDeLaDemora({ plan })
  const rotulo = { fondefin: 'FONDEFIN 48 m (6 de gracia)', 'prendario-mercado': 'Prendario de mercado 48 m', 'uva-24': 'UVA 0% 24 m + anticipo en efectivo' }
  const a = tabla(
    ['Vía para las unidades 2 y 3', 'Capital tomado (+anticipo)', 'Cuotas', 'Cuota inicial', 'Cuota máxima', 'Desembolso total', 'Costo fin. nominal', 'Costo fin. EN PESOS DE HOY', 'Sobrecosto vs FONDEFIN (pesos de hoy)'],
    alt.alternativas.map((x) => [
      `**${rotulo[x.clave]}**`, $(x.capital + x.anticipoEnEfectivo), x.cuotas, $(x.cuotaInicial), $(x.cuotaMaxima),
      $(x.desembolsoTotal), $(x.costoNominal), `**${$(x.costoReal)}**`,
      x.clave === 'fondefin' ? '—' : x.clave === 'prendario-mercado' ? `**${$(alt.sobrecostoPrendario.real)}**` : `**${$(alt.sobrecostoUva.real)}**`,
    ]),
  )
  const b = tabla(
    ['Meses de demora', 'Desembolso caería en', 'Precio de las 2 unidades', 'Sobrecosto sólo por esperar'],
    d.porMesDeEsperaEnElPrecio.map((x) => [x.meses, mes(x.mesDeDesembolso), $(x.precioNuevo), `**${$(x.sobrecosto)}**`]),
  )
  return `${a}\n\n${b}`
}

const TABLAS = [
  ['1 · CRONOGRAMA DE ADQUISICIÓN', cronograma],
  ['2 · COMPARACIÓN DE TASAS (ordenada por tasa real)', tasas],
  ['3 · COSTO TOTAL DE CADA UNIDAD', costoUnidades],
  ['4 · CALENDARIO DE CUOTAS sep-2026 → dic-2027', calendario],
  ['5 · IMPACTO EN CAJA sep–dic 2026', caja],
  ['6 · LA CARGA MENSUAL EN RÉGIMEN', regimen],
  ['7 · QUÉ CUESTA NO PRESENTAR LA CARPETA AHORA', demora],
]

const pedidas = process.argv.slice(2).map(Number).filter(Boolean)
for (const [i, [titulo, fn]] of TABLAS.entries()) {
  if (pedidas.length && !pedidas.includes(i + 1)) continue
  console.log(`\n### ${titulo}\n`)
  console.log(fn())
}

if (!pedidas.length) {
  const g = plan.garantia
  console.log(`\n### SUPUESTOS Y DESCONOCIDOS\n`)
  console.log([
    `- **Inflación**: ${pct(inf.mensual)} mensual · ${pct(inf.anual)} anual — IPC INDEC ${inf.meses.join(', ')} encadenado y anualizado. Alternativa REM ${pct(inf.remMensual)}/mes = ${pct(inf.remAnual)} anual.`,
    `- **IVA sobre intereses de FONDEFIN**: ${pct(FONDEFIN.ivaSobreInteresesSupuesto)} SUPUESTO (peor caso). El ROP no lo publica y la Fiduciaria no es entidad de la Ley 21.526.`,
    `- **CFT de FONDEFIN**: DESCONOCIDO. Faltan sellos, seguro de vida sobre saldo deudor y tasación del perito. Todo número de FONDEFIN es un PISO.`,
    `- **Gastos de retiro del C31**: ${$(plan.gastosRetiroC31.importe)} por unidad, ESTIMACIÓN por analogía (${pct(plan.gastosRetiroC31.proporcion)} del precio, la proporción real del C32). No hay presupuesto cerrado.`,
    `- **Monto a solicitar por unidad**: ${$(plan.unidades[1].montoSolicitado)} para que al proveedor le lleguen ${$(C31.precioLista)} después del ${pct(FONDEFIN.gastosOtorgamiento)} de otorgamiento.`,
    `- **GARANTÍA — restricción dura**: la prenda debe cubrir el ${pct(FONDEFIN.coberturaPrenda, 0)} del crédito. Por ${$(plan.unidades[1].montoSolicitado * 2)} hacen falta ${$(g.requerida)} y las dos unidades aportan ${$(g.aportanLasUnidades)}: **faltan ${$(g.faltante)}** en otros rodados, hipoteca o aval de SGR.`,
    `- **Corrección del cobro en USD**: ${$(correccionUsd())} = USD ${CORRECCION_USD.usd.toLocaleString('es-AR')} × ${CORRECCION_USD.tipoCambio} − ${$(CORRECCION_USD.yaCargadoEnElSheet)} ya cargados. ${CORRECCION_USD.estado}.`,
    `- **Prendario Ford**: ${PRENDARIO_FORD.limite}`,
    `- **Egreso mensual promedio**: ${$(egresoMensualPromedio().promedio)} (${egresoMensualPromedio().meses} meses cerrados, ${EGRESOS_REALES.fuente}).`,
    `- **UVA sin rezago**: el CER replica al IPC con ~1,5 mes de atraso; acá se lo trata sin rezago.`,
    `- **Sistema de amortización de FONDEFIN**: el ROP no lo publica. Se calcula FRANCÉS.`,
    `- Precios: C32 ${$(C32.total)} (presupuesto Le Pont ${C32.fechaPresupuesto}, vencido el ${C32.vigenciaHasta}) · C31 ${$(C31.precioLista)} (lista publicada, rango ${$(C31.rangoPublicado.min)}–${$(C31.rangoPublicado.max)}).`,
    `- Calendario supuesto: carpeta ${mes(CALENDARIO.mesCarpetaFondefin)} · desembolso ${mes(CALENDARIO.mesDesembolsoFondefin)} (~${CALENDARIO.demoraTramiteDias} días) · 1ª cuota ${mes(CALENDARIO.mesPrimeraCuotaFondefin)}.`,
    `- Caja: ${CAJA.fuente}. Acuerdo de descubierto ${$(CAJA.acuerdoDescubierto)}.`,
  ].join('\n'))
  console.log(`\n<sub>Generado por orquestador/scripts/rodados-plan-tablas.mjs · cada celda calculada, ninguna tipeada.</sub>`)
}
