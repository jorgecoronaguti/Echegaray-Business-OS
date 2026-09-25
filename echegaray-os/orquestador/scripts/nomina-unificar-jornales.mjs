#!/usr/bin/env node
// «NÓMINA» ES LA ÚNICA PESTAÑA DE SUELDOS QUE VE EL DUEÑO (24/09/2026).
//
// Pedido textual: «unificá en "Nómina" lo que es Jornales por Quincena y Nómina (dejar separada Cargas
// Sociales) sin dejar de considerar todo lo que ya está considerando Jornales por Quincena, hacé todos
// los cableados y que se vean los impactos en Cash Flow Semanal y Mensual».
//
// CÓMO, Y POR QUÉ ASÍ. «Jornales por Quincena» no es una planilla muerta: la escribe un generador que
// cruza cada quincena contra el banco, los adelantos, los recibos y la fecha de pago, y 77 archivos del
// OS la leen por nombre (testigos del banco, conciliación de haberes, candados, formato). Renombrarla o
// borrarla hoy desconectaba todo eso. Entonces:
//   · lo que el dueño MIRA y EDITA vive en «Nómina»: se agregan las secciones 7 a 10 — quincenas
//     pagadas (con banco/adelanto/recibo/pagado el), quincenas a pagar, Oficina y jefes por mes,
//     Dirección por mes y el convenio UOCRA — todas VIVAS por fórmula;
//   · lo que falta pagar se muestra con el número de NÓMINA (cuadro 6), el mismo que lee el Cash Flow:
//     no hay dos cifras para la misma quincena;
//   · «Jornales por Quincena» queda OCULTA, como `_MOVIMIENTOS`: sigue haciendo su trabajo de datos.
//
// Toca SÓLO su bloque (anclado por su rótulo, al pie del cuadro 6) y la visibilidad de la otra pestaña.
//   node orquestador/scripts/nomina-unificar-jornales.mjs            → muestra qué escribiría
//   node orquestador/scripts/nomina-unificar-jornales.mjs --aplicar  → escribe, oculta y relee
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { ROTULO_PUENTE } from '../lib/nomina-puente.mjs'
import { formatearNomina } from '../lib/nomina-formato.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Nómina'
const JORNALES = 'Jornales por Quincena'
const APLICAR = process.argv.includes('--aplicar')
export const ROTULO_UNIFICADO = '7 · QUINCENAS PAGADAS'

/** El bloque, fila por fila (A..K). Las fórmulas derraman: una celda por tabla, crecen solas. */
export function bloqueUnificado() {
  const q = (n) => `JORNALES_REAL_${n}`
  const vacio = []
  return [
    [ROTULO_UNIFICADO],
    ['Desde', 'Hasta', 'Se paga el', 'Personas', 'Banco', 'Adelanto', 'Recibo', 'Total', 'Pagado el'],
    [`=IFERROR(FILTER(HSTACK(${q('DESDE')};${q('HASTA')};${q('PAGO')};${q('PERSONAS')};${q('BANCO')};${q('ADELANTO')};${q('RECIBO')};${q('TOTAL')};${q('PAGADO')});ISNUMBER(${q('HASTA')}));"sin quincenas")`],
    ...Array.from({ length: 30 }, () => vacio),
    ['8 · QUINCENAS A PAGAR · lo que dice Nómina'],
    ['Desde', 'Hasta', 'Se paga el', 'Total'],
    // El total de cada quincena a pagar es la parte del mes que dice Nómina (cuadro 6), repartida entre
    // las quincenas de ese mes — exactamente lo que escribe el libro, así el Cash Flow y esta tabla
    // dicen lo mismo.
    ['=IFERROR(FILTER(HSTACK(JORNALES_PROY_DESDE;JORNALES_PROY_HASTA;JORNALES_PROY_PAGO;'
      + 'MAP(JORNALES_PROY_HASTA;LAMBDA(h;IF(ISNUMBER(h);IF(YEAR(h)=2026;INDEX(NOMINA_CF_JORNALES;1;MONTH(h))'
      + '/SUMPRODUCT(ISNUMBER(JORNALES_PROY_HASTA)*(YEAR(JORNALES_PROY_HASTA)=2026)*(MONTH(JORNALES_PROY_HASTA)=MONTH(h)));"");""))));'
      + 'ISNUMBER(JORNALES_PROY_HASTA));"sin quincenas a pagar")'],
    ...Array.from({ length: 9 }, () => vacio),
    ['9 · OFICINA Y JEFES · DIRECCIÓN · POR MES'],
    ['Mes', 'Oficina y jefes · pagado', 'Oficina · se paga el', 'Oficina y jefes · falta pagar', '', 'Dirección · pagado', 'Dirección · se paga el', 'Dirección · falta pagar'],
    ['=ARRAYFORMULA(TEXT(DATE(2026;SEQUENCE(12);1);"mmm yy"))', '=ARRAYFORMULA(IFERROR(OFICINA_PAGADO*1;0))', '=ARRAYFORMULA(OFICINA_PAGO)',
      '=TRANSPOSE(NOMINA_CF_OFICINA)', '', '=ARRAYFORMULA(IFERROR(DIRECCION_PAGADO*1;0))', '=ARRAYFORMULA(DIRECCION_PAGO)', '=TRANSPOSE(NOMINA_CF_DIRECCION)'],
    ...Array.from({ length: 12 }, () => vacio),
    ['10 · CONVENIO UOCRA'],
    [`=ARRAYFORMULA('${JORNALES}'!A77:H102)`],
  ]
}

async function main() {
  // RETIRADO (25/09/2026): las secciones 7–10 dejaron de ser un espejo de «Jornales por Quincena». El
  // registro se mudó a «Nómina» y lo escribe `jornales-pestana.mjs`; la pestaña vieja se eliminó.
  // Correr esto reescribiría encima del registro vivo.
  console.error('✗ retirado el 25/09/2026: el registro de jornales vive en «Nómina» (jornales-pestana.mjs).')
  process.exitCode = 1
  return
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const colA = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:A400`, { render: 'UNFORMATTED_VALUE' })
  const A = colA.map((r) => String(r?.[0] ?? '').trim())
  const iPuente = A.indexOf(ROTULO_PUENTE)
  if (iPuente < 0) throw new Error('no encuentro el cuadro 6 de Nómina: corré primero nomina-puente-cash-flow.mjs --aplicar')
  const iYa = A.indexOf(ROTULO_UNIFICADO)
  const inicio = iYa >= 0 ? iYa + 1 : iPuente + 1 + 7 + 3
  const filas = bloqueUnificado()
  const rango = `'${PESTAÑA}'!A${inicio}:K${inicio + filas.length - 1}`
  console.log(`secciones 7–10 → ${rango} (${iYa >= 0 ? 'reescribe' : 'nuevas, al pie del cuadro 6'})`)
  if (!APLICAR) return
  const ancho = filas.map((f) => Array.from({ length: 11 }, (_, j) => f[j] ?? ''))
  const res = await google.updateSheetValues(ID, rango, ancho, { yaGuardado: true })
  if (res?.protegido) throw new Error(`la guarda no dejó escribir: ${res.motivo ?? ''}`)
  // Relectura: cada tabla tiene que derramar números, no un error.
  const v = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })
  const err = v.flat().filter((x) => typeof x === 'string' && /^#(REF|N\/A|VALUE|NAME|ERROR|DIV)/.test(x))
  const pagadas = v.slice(2, 33).filter((r) => typeof r?.[0] === 'number').length
  const aPagar = v.slice(35, 45).filter((r) => typeof r?.[0] === 'number').length
  console.log(`  quincenas pagadas: ${pagadas} · a pagar: ${aPagar} · errores: ${err.length ? err.join(' ') : 'ninguno'}`)
  if (err.length) { process.exitCode = 1; return }
  // El formato lo pone quien escribe (25/09/2026): ver `lib/nomina-formato.mjs`.
  const fmt = await formatearNomina(google, ID)
  console.log(`  formato: ${fmt.requests.length} pedido(s)${fmt.faltan.length ? ` · sin sección ${fmt.faltan.join(', ')}` : ''}`)
  // «Jornales por Quincena» queda oculta: es la pestaña de datos detrás de Nómina.
  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === JORNALES)
  if (hoja) await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, hidden: true }, fields: 'hidden' } }])
  console.log(`  ✓ «${JORNALES}» oculta`)
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 })
