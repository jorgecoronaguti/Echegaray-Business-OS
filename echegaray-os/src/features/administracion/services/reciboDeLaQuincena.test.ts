import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarRecibo, conceptosDisponibles, desglosarBancoSellado, eleccionInicial, ROTULO } from './reciboDeLaQuincena.ts'
import { conArrastre } from './liquidacionArrastre.ts'
import { sellarRecibo } from './reciboEmitido.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

const fmt = (n: number) => `$${n}`

// Un jornalero: 45 h en blanco (bruto 300.000, neto 230.000 por banco) y 51 h en negro × 6.000 = 306.000.
const jornalero = {
  porBanco: 230000, enEfectivo: 306000, pagadoBanco: 0, pagadoEfectivo: 100000,
  sueldo: { horasBlanco: 45, valorHoraCategoria: 6666.67, bruto: 300000, horasNegro: 51, valorHoraNegro: 6000, negro: 306000 },
  pago: pagoDeLaLinea({ banco: 230000, negro: 306000, pagadoEfectivo: 100000 }),
} as unknown as LineaConOverrides

const mensual = {
  porBanco: 500000, enEfectivo: 200000, cobra: 700000, adelanto: 0, yaTransferido: 0,
  pagadoBanco: 0, pagadoEfectivo: 0, sueldo: null, reciboNeto: null, sello: null, manual: {},
  pago: pagoDeLaLinea({ banco: 500000, negro: 200000 }),
} as unknown as LineaConOverrides

test('el papel dice las horas TOTALES y los dos medios, sin abrir blanco y negro', () => {
  const r = armarRecibo(jornalero, eleccionInicial(jornalero), fmt)
  // 45 en blanco + 51 en negro = 96 h trabajadas. El reparto no se imprime: es una cuenta interna.
  assert.deepEqual(r.horas.map((h) => [h.rotulo, h.horas, h.importe]), [['Horas trabajadas', 96, null]])
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [['Depósito en banco', 230000], ['Efectivo', 306000]])
  assert.equal(r.total, 536000)
})

test('lo que no se tilda no se imprime ni se suma', () => {
  const r = armarRecibo(jornalero, { horas: false, horasRecibo: false, horasFuera: false, banco: false, efectivo: true, pagado: false }, fmt)
  assert.deepEqual(r.horas.map((h) => h.rotulo), [])
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Efectivo'])
  assert.equal(r.total, 306000)
})

test('«lo ya pagado» agrega, debajo de cada medio, el adelanto y lo que resta, sin tocar el total', () => {
  const r = armarRecibo(jornalero, { horas: false, horasRecibo: false, horasFuera: false, banco: false, efectivo: true, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe, !!m.sub]), [['Efectivo', 306000, false], ['ya pagado', 100000, true], ['resta', 206000, true]])
  assert.equal(r.total, 306000)
})

test('un medio sin número no se imprime como $ 0: el total queda sin dato', () => {
  const sinNegro = { ...jornalero, pago: { ...jornalero.pago, negro: null } } as LineaConOverrides
  assert.equal(armarRecibo(sinNegro, eleccionInicial(sinNegro), fmt).total, null)
})

test('el mensual no tiene horas en blanco ni en negro: se dice por qué y paga banco + efectivo', () => {
  const d = conceptosDisponibles(mensual, true)
  assert.match(d.horas ?? '', /cobra por mes/)
  assert.equal(eleccionInicial(mensual, true).horas, false)
  const r = armarRecibo(mensual, { ...eleccionInicial(mensual, true), horas: true }, fmt, true)
  assert.equal(r.horas.length, 0)
  assert.equal(r.total, 700000)
})

// ═══ LO QUE ENCONTRÓ LA AUDITORÍA DEL 22/09/2026 ═══


test('a un jornalero de una quincena cerrada NO se le dice «cobra por mes»', () => {
  const cerrada = { ...mensual, sueldo: null, horas: null } as unknown as LineaConOverrides
  assert.match(conceptosDisponibles(cerrada, false).horas ?? '', /sin horas cargadas/)
})

test('lo cobrado de más se escribe en el papel, no queda escondido en un «resta $ 0»', () => {
  const l = {
    ...jornalero, pago: pagoDeLaLinea({ banco: 0, negro: 41262, pagadoEfectivo: 100000 }),
  } as unknown as LineaConOverrides
  const r = armarRecibo(l, { horas: false, horasRecibo: false, horasFuera: false, banco: false, efectivo: true, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Efectivo', 'ya pagado', 'cobró de más', 'resta'])
  assert.equal(r.medios.find((m) => m.rotulo === 'cobró de más')?.importe, 58738)
})

test('el blanco dice que es bruto, y lo pagado de más en efectivo se escribe debajo del banco que lo absorbe', () => {
  // Real, 22/09 (Agüero 16–30/09): efectivo 41.262 con 51.000 ya pagados → 9.738 de más, que baja el banco.
  const l = {
    ...jornalero, sueldo: { ...(jornalero.sueldo as object), negro: 41262 },
    pago: pagoDeLaLinea({ banco: 230240.12, negro: 41262, pagadoEfectivo: 51000 }),
  } as unknown as LineaConOverrides
  const r = armarRecibo(l, { horas: true, horasRecibo: false, horasFuera: false, banco: true, efectivo: false, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [
    ['Depósito en banco', 230240.12], ['ya pagado', 0], ['menos lo pagado de más en efectivo', -9738], ['resta', 220502.12],
  ])
})



// ═══ LA RAMA SIN MODELO BLANCO + NEGRO (mensual sellado, Oficina, finales, quincena cerrada) ═══
//
// Dos vueltas de auditoría el 22/09/2026: primero el adelanto se descontaba dos veces; después lo YA
// TRANSFERIDO se contaba de los dos lados y el papel declaraba $ 50.000 menos de deuda. El papel imprime la
// misma cadena que el panel: cobra − adelanto − ya transferido = banco + efectivo.
const cerrada = (extra = {}) => ({
  sueldo: null, cobra: 500000, porBanco: 200000, adelanto: 100000, yaTransferido: 50000, enEfectivo: 150000,
  pagadoBanco: 0, pagadoEfectivo: 0, pago: pagoDeLaLinea({ banco: null, negro: null }), ...extra,
} as unknown as LineaConOverrides)

test('el papel imprime lo que se paga hoy: banco + efectivo, sin contar dos veces el adelanto ni lo transferido', () => {
  const r = armarRecibo(cerrada(), { horas: false, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: false }, fmt, false)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [['Depósito en banco', 200000], ['Efectivo', 150000]])
  assert.equal(r.total, 350000, 'cobra 500.000 − adelanto 100.000 − transferido 50.000')
})

test('con «lo ya pagado» tildado, lo cobrado antes se dice UNA vez y arriba', () => {
  const r = armarRecibo(cerrada(), { horas: false, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: true }, fmt, false)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [
    ['Cobra la quincena', 500000], ['menos el adelanto', -100000], ['menos lo ya transferido', -50000],
    ['Depósito en banco', 200000], ['Efectivo', 150000],
  ])
  assert.equal(r.total, 350000)
  const pagado = r.medios.filter((m) => m.rotulo === 'ya pagado')
  assert.equal(pagado.length, 0, 'sin un «ya pagado» por medio que vuelva a restar lo mismo')
})

test('sin adelantos ni transferencias, el papel no agrega renglones que no dicen nada', () => {
  const r = armarRecibo(cerrada({ adelanto: 0, yaTransferido: 0, enEfectivo: 300000 }),
    { horas: false, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: true }, fmt, false)
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Depósito en banco', 'Efectivo'])
  assert.equal(r.total, 500000)
})

// ═══ LAS DOS OPCIONES DEL 22/09/2026 ═══
//
// «en recibo quiero dos opciones adicionales q sean hs trabajadas por recibo y hs trabajadas fuera de
// recibo». Son el reparto, dicho por lo que el papel del estudio cubre — y por eso no pueden salir solas ni
// llamarse blanco y negro: el control de emisión rebota esas dos palabras y el recibo no se podría guardar.

test('las dos opciones nuevas están APAGADAS por defecto: el papel sigue diciendo sólo el total', () => {
  const e = eleccionInicial(jornalero)
  assert.equal(e.horasRecibo, false)
  assert.equal(e.horasFuera, false)
  const r = armarRecibo(jornalero, e, fmt)
  assert.deepEqual(r.horas.map((h) => h.rotulo), ['Horas trabajadas'])
})

test('tildadas, el reparto va debajo del total y sangrado, y las partes suman el total', () => {
  const r = armarRecibo(jornalero, { ...eleccionInicial(jornalero), horasRecibo: true, horasFuera: true }, fmt)
  assert.deepEqual(r.horas.map((h) => [h.rotulo, h.horas, h.sub]), [
    ['Horas trabajadas', 96, undefined],
    ['Horas trabajadas por recibo', 45, true],
    ['Horas trabajadas fuera de recibo', 51, true],
  ])
  assert.equal(45 + 51, 96, 'las partes son las de la cifra de arriba, no otra cuenta')
})

test('ninguno de los dos rótulos nuevos dice «blanco» ni «negro»: si lo dijeran, el recibo no se podría emitir', () => {
  assert.equal(/blanc[oa]s?|negr[oa]s?/i.test(ROTULO.horasRecibo), false)
  assert.equal(/blanc[oa]s?|negr[oa]s?/i.test(ROTULO.horasFuera), false)
})

test('sin reparto cargado no se ofrece la opción, y se dice por qué — nunca «0 h fuera de recibo»', () => {
  const d = conceptosDisponibles(mensual, true)
  assert.equal(d.horasRecibo, 'cobra por mes: no se liquida por hora')
  const r = armarRecibo(mensual, { ...eleccionInicial(mensual, true), horasRecibo: true, horasFuera: true }, fmt, true)
  assert.deepEqual(r.horas, [], 'tildada a la fuerza, tampoco imprime un cero inventado')
})

// ═══ EL PAPEL DEBE COINCIDIR CON EL RECIBO DEL ESTUDIO (dueño, 02/10/2026) ═══
//
// *«no me coinciden con lo que envían por recibo de liquidación los contadores»*. Caso real anonimizado (Q2-09): el
// recibo del estudio dice $234.963,32; la quincena arrastra $54.580,48 del recibo de la Q1; la persona cobra $669.801,32.
// El papel decía «Depósito en banco $289.543,80»: el arrastre venía metido dentro del renglón del banco y no
// coincidía con el recibo. El neto del estudio entra acá COMO DATO APARTE (`NETO_DEL_ESTUDIO`, tal como lo carga
// `nomina_recibo_neto`), no se lee del mismo campo que el papel imprime.
const NETO_DEL_ESTUDIO = 234963.32
const ARRASTRE = 54580.48
const TOTAL = 669801.32
const EFECTIVO_SIN_ARRASTRE = 434838

const lineaDelEstudio = (origenNeto: 'recibo' | 'estimado', arrastre: number | null) => {
  const base = {
    personaId: 'p1', porBanco: NETO_DEL_ESTUDIO, enEfectivo: EFECTIVO_SIN_ARRASTRE,
    sueldo: { horasBlanco: 45, horasNegro: 51, origenNeto, estado: origenNeto, neto: NETO_DEL_ESTUDIO },
    pago: pagoDeLaLinea({ banco: NETO_DEL_ESTUDIO, negro: EFECTIVO_SIN_ARRASTRE }),
  } as unknown as LineaConOverrides
  return arrastre == null ? base : conArrastre(base, { importe: arrastre, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' })
}
const pesosAR = (n: number) => n.toFixed(2)
const eleccion = { ...eleccionInicial(lineaDelEstudio('recibo', null)), horas: false }

test('con arrastre: un renglón con el neto del recibo del estudio y OTRO con el saldo de la quincena anterior', () => {
  const r = armarRecibo(lineaDelEstudio('recibo', ARRASTRE), eleccion, pesosAR)
  const [banco, delRecibo, delSaldo, efectivo] = r.medios
  assert.equal(banco.rotulo, ROTULO.banco)
  assert.equal(banco.importe, 289543.8)
  assert.equal(delRecibo.importe, NETO_DEL_ESTUDIO, 'el renglón del recibo de sueldo es el neto del estudio, al centavo')
  assert.match(delRecibo.rotulo, /recibo de sueldo/)
  assert.equal(delSaldo.importe, ARRASTRE)
  assert.match(delSaldo.rotulo, /saldo del recibo de la 1ª quincena de septiembre/)
  assert.equal(delRecibo.importe! + delSaldo.importe!, banco.importe, 'el subtotal del banco es la suma de los dos')
  assert.equal(efectivo.rotulo, ROTULO.efectivo)
  assert.equal(efectivo.importe, 380257.52)
  assert.match(efectivo.detalle ?? '', /669801\.32/)
  assert.match(efectivo.detalle ?? '', /289543\.80/)
  assert.equal(r.total, TOTAL, 'lo pagado no cambia: sólo cómo se muestra')
  assert.equal(r.estimado, false)
})

test('el papel nunca dice blanco ni negro, ni siquiera en el desglose', () => {
  const r = armarRecibo(lineaDelEstudio('recibo', ARRASTRE), eleccion, pesosAR)
  for (const m of r.medios) assert.doesNotMatch(`${m.rotulo} ${m.detalle ?? ''}`, /blanc|negr/i)
})

test('sin arrastre: el depósito en banco ES el neto del estudio y no se agrega ningún renglón', () => {
  const r = armarRecibo(lineaDelEstudio('recibo', null), eleccion, pesosAR)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [[ROTULO.banco, NETO_DEL_ESTUDIO], [ROTULO.efectivo, EFECTIVO_SIN_ARRASTRE]])
  assert.equal(r.total, TOTAL)
})

test('sin el recibo del estudio el banco va rotulado ESTIMADO y el recibo no es sellable', () => {
  const r = armarRecibo(lineaDelEstudio('estimado', null), eleccion, pesosAR)
  assert.equal(r.estimado, true)
  assert.match(r.medios[0].detalle ?? '', /ESTIMADO/)
  assert.equal(r.medios[0].rotulo, ROTULO.banco, 'el rótulo no cambia: el sello busca el renglón por él')
  assert.equal(sellarRecibo({ personaId: 'p1', nombre: 'A', categoria: null, desde: '2026-09-16', hasta: '2026-09-30' }, r).estimado, true)
})

test('la quincena CERRADA desglosa igual que la abierta: mismos renglones, mismos importes, mismo total', () => {
  const abierta = lineaDelEstudio('recibo', ARRASTRE)
  // Cerrada: el banco sellado ya trae el arrastre adentro, la línea no tiene modelo de sueldo y conserva el neto del
  // estudio en `reciboNeto`; el arrastre viaja sólo como dato (`arrastreIncluido`), nunca como suma.
  const cerrada = {
    ...abierta, sueldo: null, reciboNeto: NETO_DEL_ESTUDIO, arrastre: undefined,
    arrastreIncluido: { importe: ARRASTRE, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' },
  } as unknown as LineaConOverrides
  const a = armarRecibo(abierta, eleccion, pesosAR)
  const c = armarRecibo(cerrada, eleccion, pesosAR)
  assert.deepEqual(c.medios.map((m) => [m.rotulo, m.importe]), a.medios.map((m) => [m.rotulo, m.importe]))
  assert.deepEqual(c.medios.map((m) => m.importe), [289543.8, 234963.32, 54580.48, 380257.52])
  assert.equal(c.total, TOTAL)
  assert.equal(a.total, c.total)
})

test('si el banco no cierra con el neto del estudio, el papel lo dice: neto del estudio + «diferencia a revisar»', () => {
  // Caso real (RP-000001): sellado 258.066,48 contra neto 243.158,36 + saldo 16.558,72 → residuo −1.650,60.
  const base = {
    personaId: 'p2', porBanco: 241507.76, enEfectivo: 300000,
    sueldo: { horasBlanco: 45, horasNegro: 51, origenNeto: 'recibo', estado: 'recibo', neto: 243158.36 },
    pago: pagoDeLaLinea({ banco: 241507.76, negro: 300000 }),
  } as unknown as LineaConOverrides
  const l = conArrastre(base, { importe: 16558.72, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' })
  const r = armarRecibo(l, eleccion, pesosAR)
  assert.deepEqual(r.medios.slice(0, 4).map((m) => m.importe), [258066.48, 243158.36, 16558.72, -1650.6])
  assert.match(r.medios[3].rotulo, /diferencia a revisar/)
})

test('reimprimir un recibo sellado con el banco junto lo desglosa, sin tocar importes ni total', () => {
  const sellado = [{ rotulo: ROTULO.banco, importe: 289543.8 }, { rotulo: ROTULO.efectivo, importe: 380257.52 }]
  const arrastre = { importe: ARRASTRE, periodoOrigen: 'Q1-09/2026' }
  const d = desglosarBancoSellado(sellado, { netoDelEstudio: NETO_DEL_ESTUDIO, arrastre }, pesosAR)
  assert.deepEqual(d.map((m) => m.importe), [289543.8, NETO_DEL_ESTUDIO, ARRASTRE, 380257.52])
  // Si el neto del estudio no cierra con el banco sellado, el residuo se dice, no se disimula.
  const raro = desglosarBancoSellado(sellado, { netoDelEstudio: 234000, arrastre }, pesosAR)
  assert.equal(raro[3].importe, 963.32)
  assert.match(raro[3].rotulo, /diferencia a revisar/)
  assert.deepEqual(desglosarBancoSellado(sellado, { netoDelEstudio: null, arrastre }, pesosAR), sellado)
})
