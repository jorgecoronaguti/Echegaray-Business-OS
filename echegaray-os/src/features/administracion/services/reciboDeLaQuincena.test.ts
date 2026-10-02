import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarRecibo, conceptosDisponibles, desglosarBancoSellado, eleccionInicial, limpiarMediosSellados, ROTULO } from './reciboDeLaQuincena.ts'
import { efectivoMostrado } from './efectivoRedondeado.ts'
import { efectivoDelRedondeo } from './liquidacionPorTipo.ts'
import { conArrastre, conArrastres } from './liquidacionArrastre.ts'
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
  assert.match(delRecibo.rotulo, /^Recibo de sueldo$/)
  assert.equal(delSaldo.importe, ARRASTRE)
  assert.match(delSaldo.rotulo, /^Saldo 1ª quincena de septiembre$/)
  assert.equal(delRecibo.importe! + delSaldo.importe!, banco.importe, 'el subtotal del banco es la suma de los dos')
  assert.equal(efectivo.rotulo, ROTULO.efectivo)
  assert.equal(efectivo.importe, 380000)
  assert.equal(efectivo.detalle, undefined, "ninguna cuenta escrita junto al importe")
  assert.equal(r.total, 669543.8, 'el efectivo se muestra redondeado; el banco no cambia')
  assert.equal(r.estimado, false)
})

test('el papel nunca dice blanco ni negro, ni siquiera en el desglose', () => {
  const r = armarRecibo(lineaDelEstudio('recibo', ARRASTRE), eleccion, pesosAR)
  for (const m of r.medios) assert.doesNotMatch(`${m.rotulo} ${m.detalle ?? ''}`, /blanc|negr/i)
})

test('sin arrastre: el depósito en banco ES el neto del estudio y no se agrega ningún renglón', () => {
  const r = armarRecibo(lineaDelEstudio('recibo', null), eleccion, pesosAR)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [[ROTULO.banco, NETO_DEL_ESTUDIO], [ROTULO.efectivo, 435000]])
  assert.equal(r.total, 669963.32)
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
  assert.deepEqual(c.medios.map((m) => m.importe), [289543.8, 234963.32, 54580.48, 380000])
  assert.equal(c.total, 669543.8)
  assert.equal(a.total, c.total)
})

test('de punta a punta: `conArrastres` en la cerrada carga `arrastreIncluido`, no mueve ninguna suma y el recibo desglosa', () => {
  // La línea cerrada tal como sale del cierre: el banco sellado YA trae el arrastre; sin modelo de sueldo.
  const cerradaOriginal = {
    personaId: 'p1', porBanco: 289543.8, enEfectivo: 380257.52, reciboNeto: NETO_DEL_ESTUDIO, sueldo: null,
    pago: pagoDeLaLinea({ banco: 289543.8, negro: 380257.52 }),
  } as unknown as LineaConOverrides
  const arrastres = {
    entrantes: new Map([['p1', { importe: ARRASTRE, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' }]]),
    salientes: new Map(), error: null,
  }
  const l = conArrastres(cerradaOriginal, arrastres, false)
  assert.equal(l.arrastreIncluido?.importe, ARRASTRE)
  assert.equal(l.arrastre, undefined, 'no es `arrastre`: los totales sí suman ése')
  assert.equal(l.porBanco, cerradaOriginal.porBanco)
  assert.equal(l.enEfectivo, cerradaOriginal.enEfectivo)
  assert.deepEqual(l.pago, cerradaOriginal.pago)
  const r = armarRecibo(l, eleccion, pesosAR)
  assert.deepEqual(r.medios.map((m) => m.importe), [289543.8, 234963.32, 54580.48, 380000])
  assert.equal(r.total, 669543.8)
})

// ═══ EL EFECTIVO DEL RECIBO ES EL «EFECT. RED.» DEL CUADRO (dueño, 02/10/2026) ═══
//
// *«necesito que los recibos muestren el efectivo redondeado»*. No hay redondeo nuevo: el renglón toma el MISMO valor
// que la celda «Efect. red.» (`efectivoMostrado`, sobre `efectivoDelRedondeo`): el guardado por el dueño, o el sugerido.
test('el renglón Efectivo es el «Efect. red.» del cuadro, un número redondo, y el Total suma lo que se ve', () => {
  const l = lineaDelEstudio('recibo', ARRASTRE)
  const delCuadro = efectivoMostrado({ efectivoRedondeado: null, enEfectivo: efectivoDelRedondeo({ linea: l, celdas: [] } as never) }).valor
  const r = armarRecibo(l, eleccion, pesosAR)
  const ef = r.medios.find((m) => m.rotulo === ROTULO.efectivo)!
  assert.equal(ef.importe, delCuadro, 'misma fuente que la celda del cuadro')
  assert.equal(ef.importe! % 1000, 0, 'bajo «redondeado» no puede haber centavos')
  assert.equal(ef.importe, 380000)
  assert.equal(ef.detalle, undefined)
  assert.equal(r.total, r.medios.find((m) => m.rotulo === ROTULO.banco)!.importe! + ef.importe!, 'Total = banco + efectivo mostrado')
})

test('el efectivo redondeado GUARDADO por el dueño manda, aunque difiera del sugerido', () => {
  const l = { ...lineaDelEstudio('recibo', ARRASTRE), efectivoRedondeado: 381000 } as unknown as LineaConOverrides
  const r = armarRecibo(l, eleccion, pesosAR)
  assert.equal(r.medios.find((m) => m.rotulo === ROTULO.efectivo)!.importe, 381000)
  assert.equal(r.total, 289543.8 + 381000)
})

test('sin efectivo no aparece nada de redondeo', () => {
  const base = { personaId: 'p3', porBanco: 100000, enEfectivo: 0, sueldo: null, pago: pagoDeLaLinea({ banco: 100000, negro: 0 }) } as unknown as LineaConOverrides
  const r = armarRecibo(base, eleccion, pesosAR)
  const ef = r.medios.find((m) => m.rotulo === ROTULO.efectivo)!
  assert.equal(ef.importe, 0)
  assert.equal(ef.detalle, undefined)
  assert.equal(r.total, 100000)
})

// ═══ «NO ME GUSTAN LAS ACLARACIONES EXTRAS… CONFUNDEN» (dueño, 02/10/2026) ═══
// El caso que pegó: banco 396.076,68 = recibo de sueldo 341.496,20 + saldo 54.580,48; efectivo exacto 417.919,52 con
// 286.000 ya pagados. El «Efect. red.» del cuadro redondea el SALDO que resta (131.919,52): «resta» es ese número y
// «Efectivo» = ya pagado + resta. Se afirma contra la función del cuadro, no contra una cuenta propia.
const lineaDelDueno = (pagadoEfectivo: number) => {
  const base = {
    personaId: 'p9', porBanco: 341496.2, enEfectivo: 472500 - 54580.48,
    sueldo: { horasBlanco: 45, horasNegro: 51, origenNeto: 'recibo', estado: 'recibo', neto: 341496.2 },
    pago: pagoDeLaLinea({ banco: 341496.2, negro: 472500, pagadoEfectivo }),
  } as unknown as LineaConOverrides
  return conArrastre(base, { importe: 54580.48, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' })
}
const conPagado = { ...eleccion, pagado: true }

test('el caso del dueño: renglones limpios, efectivo y resta redondos, sin texto de cuenta', () => {
  const l = lineaDelDueno(286000)
  const delCuadro = efectivoMostrado({ efectivoRedondeado: null, enEfectivo: efectivoDelRedondeo({ linea: l, celdas: [] } as never) }).valor!
  const r = armarRecibo(l, conPagado, pesosAR)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe, !!m.sub]), [
    [ROTULO.banco, 396076.68, false],
    ['Recibo de sueldo', 341496.2, true],
    ['Saldo 1ª quincena de septiembre', 54580.48, true],
    ['ya pagado', 0, true],
    ['resta', 396076.68, true],
    [ROTULO.efectivo, 286000 + delCuadro, false],
    ['ya pagado', 286000, true],
    ['resta', delCuadro, true],
  ])
  assert.equal(delCuadro % 1000, 0)
  assert.equal(r.total, r2t(396076.68 + 286000 + delCuadro))
})

const r2t = (n: number) => Math.round(n * 100) / 100

test('ningún renglón trae detalle ni cuenta, y los sub-renglones no repiten «Depósito en banco»', () => {
  for (const l of [lineaDelDueno(286000), lineaDelDueno(0), lineaDelEstudio('recibo', ARRASTRE), lineaDelEstudio('recibo', null)]) {
    const r = armarRecibo(l, conPagado, pesosAR)
    for (const m of r.medios) {
      assert.equal(m.detalle, undefined, `detalle en «${m.rotulo}»`)
      assert.doesNotMatch(m.rotulo, /−|=|·|redondeado/)
      if (m.sub) assert.doesNotMatch(m.rotulo, /Depósito en banco/)
    }
    assert.ok(r.medios.some((m) => !m.sub && m.rotulo === ROTULO.banco), 'el sello sigue encontrando «Depósito en banco»')
  }
})

test('lo ya pagado supera lo que correspondía: se muestra lo pagado y resta 0, sin inventar', () => {
  const l = lineaDelDueno(500000)
  const r = armarRecibo(l, conPagado, pesosAR)
  const i = r.medios.findIndex((m) => m.rotulo === ROTULO.efectivo)
  assert.equal(r.medios[i].importe, 500000)
  assert.equal(r.medios[i + 2].rotulo, 'resta')
  assert.equal(r.medios[i + 2].importe, 0)
})

test('banco pagado de más: el cuadro lo descuenta del efectivo y el papel lo dice; Efectivo y resta salen redondos y suman', () => {
  // aPagarEfectivo del cuadro = 400.257,52 − 30.000 = 370.257,52 (el exceso de banco se descuenta del efectivo).
  const l = {
    personaId: 'p5', porBanco: 300000, enEfectivo: 400257.52,
    sueldo: { horasBlanco: 45, horasNegro: 51, origenNeto: 'recibo', estado: 'recibo', neto: 300000 },
    pago: pagoDeLaLinea({ banco: 300000, negro: 400257.52, pagadoBanco: 330000 }),
  } as unknown as LineaConOverrides
  const delCuadro = efectivoMostrado({ efectivoRedondeado: null, enEfectivo: l.pago.aPagarEfectivo }).valor!
  const r = armarRecibo(l, conPagado, pesosAR)
  const i = r.medios.findIndex((m) => m.rotulo === ROTULO.efectivo)
  const [ef, pagado, absorbido, resta] = r.medios.slice(i, i + 4)
  assert.equal(resta.rotulo, 'resta')
  assert.equal(resta.importe, delCuadro)
  assert.equal(ef.importe! % 1000, 0)
  assert.equal(resta.importe! % 1000, 0)
  assert.equal(ef.importe, r2t(pagado.importe! + -absorbido.importe! + resta.importe!), 'lo que se ve suma')
  assert.equal(r.total, r2t(r.medios[0].importe! + ef.importe!))
})

test('si ni así cierra la cadena del cuadro, igual se aplica su función al saldo del papel: nunca centavos', () => {
  const base = lineaDelDueno(286000)
  const l = { ...base, pago: { ...base.pago, aPagarEfectivo: 123456.78 } } as unknown as LineaConOverrides
  const r = armarRecibo(l, conPagado, pesosAR)
  const i = r.medios.findIndex((m) => m.rotulo === ROTULO.efectivo)
  assert.equal(r.medios[i].importe! % 1000, 0)
  assert.equal(r.medios[i + 2].importe! % 1000, 0)
  assert.equal(r.total, r2t(r.medios[0].importe! + r.medios[i].importe!))
})

test('reimprimir un papel sellado con los rótulos largos los limpia, sin tocar importes', () => {
  const viejo = [
    { rotulo: ROTULO.banco, importe: 289543.8 },
    { rotulo: 'Depósito en banco · recibo de sueldo', importe: 234963.32, sub: true },
    { rotulo: 'Depósito en banco · saldo del recibo de la 1ª quincena de septiembre', importe: 54580.48, sub: true },
    { rotulo: ROTULO.efectivo, importe: 380000, detalle: 'total $669.801,32 − depósito en banco $289.543,80 = $380.257,52 · se paga redondeado' },
  ]
  const n = limpiarMediosSellados(viejo)
  assert.deepEqual(n.map((m) => [m.rotulo, m.importe]), [[ROTULO.banco, 289543.8], ['Recibo de sueldo', 234963.32], ['Saldo 1ª quincena de septiembre', 54580.48], [ROTULO.efectivo, 380000]])
  assert.equal(n[3].detalle, undefined)
})

test('con banco 0 nada se rotula ESTIMADO', () => {
  const l = { ...lineaDelEstudio('estimado', null), porBanco: 0, pago: pagoDeLaLinea({ banco: 0, negro: 100 }) } as unknown as LineaConOverrides
  const r = armarRecibo(l, eleccion, pesosAR)
  assert.equal(r.estimado, false)
  assert.equal(r.medios[0].detalle, undefined)
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
  assert.match(r.medios[3].rotulo, /^Diferencia a revisar$/)
})

test('reimprimir un recibo sellado con el banco junto lo desglosa, sin tocar importes ni total', () => {
  const sellado = [{ rotulo: ROTULO.banco, importe: 289543.8 }, { rotulo: ROTULO.efectivo, importe: 380257.52 }]
  const arrastre = { importe: ARRASTRE, periodoOrigen: 'Q1-09/2026' }
  const d = desglosarBancoSellado(sellado, { netoDelEstudio: NETO_DEL_ESTUDIO, arrastre })
  assert.deepEqual(d.map((m) => m.importe), [289543.8, NETO_DEL_ESTUDIO, ARRASTRE, 380257.52])
  // Si el neto del estudio no cierra con el banco sellado, el residuo se dice, no se disimula.
  const raro = desglosarBancoSellado(sellado, { netoDelEstudio: 234000, arrastre })
  assert.equal(raro[3].importe, 963.32)
  assert.match(raro[3].rotulo, /^Diferencia a revisar$/)
  assert.deepEqual(desglosarBancoSellado(sellado, { netoDelEstudio: null, arrastre }), sellado)
})
