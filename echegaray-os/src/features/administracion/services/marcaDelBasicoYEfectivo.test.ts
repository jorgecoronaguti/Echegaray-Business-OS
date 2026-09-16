// LA MARCA DEL BÁSICO COMPARA EL RECIBO, Y EL EFECTIVO NEGATIVO NO SE ESCONDE (coordinador, 14/09/2026).
//
// 1. La marca «−N% UOCRA» comparaba el $/h NEGRO con el básico, y marcaba en rojo a casi todo el plantel:
//    el negro no se paga a categoría, el blanco sí. Ahora se compara el $/h del RECIBO real contra el piso
//    —en el cuadro y en Convenios, con la misma `compararConElPiso`—; el estimado usa el piso y nunca marca.
//    MUTACIÓN: volver a comparar el $/h negro.
// 2. González Tobares Emiliano, 01/09: pagado en efectivo $140.000 contra un negro de $123.750. El saldo queda
//    en −$16.250: se marca en ámbar, el pie lo suma igual, el exceso se descuenta del banco, y el redondeado
//    sugerido de un negativo queda vacío. (Hasta el 15/09/2026 esto se llamaba «Total efectivo»: ver el test.)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compararConElPiso, exponerAlPiso, valorHoraAComparar, type FilaEscala } from './exposicionConvenio.ts'
import { marcaDeCategoria, sueldoBlancoNegro, ultimoReciboHasta, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { efectivoMostrado, efectivoSugerido, sumaDelRedondeo } from './efectivoRedondeado.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import { avisoDeExcedente, pagoDeLaLinea } from './pagoDeLaQuincena.ts'

const RECIBO: ReciboDeSueldo = {
  personaId: 'p', cuil: null, periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6000, horasBlanco: 50,
  bruto: 300000, neto: 220000, driveFileId: null,
}

test('EL RECIBO BAJO EL PISO SE MARCA; EL $/H NEGRO BAJO EL PISO NO', () => {
  // Recibo a $6.000 con piso $6.348: marca. $/h negro $5.874 (debajo del piso): no importa.
  const bajo = sueldoBlancoNegro({ horas: 94, valorHoraNegro: 5874, recibo: RECIBO, netoDeNomina: null, pisoCategoria: 6348, proporcion: null })
  const m = marcaDeCategoria(bajo)
  assert.equal(m?.valorHora, 6000, 'MUTACIÓN: comparar el $/h negro daría 5.874')
  assert.equal(m?.piso, 6348)
  // Recibo a categoría ($6.348) y negro a $5.874: sin marca. Con la comparación vieja marcaba −7 %.
  const alDia = sueldoBlancoNegro({ horas: 94, valorHoraNegro: 5874, recibo: { ...RECIBO, valorHora: 6348 }, netoDeNomina: null, pisoCategoria: 6348, proporcion: null })
  assert.equal(marcaDeCategoria(alDia), null, 'MUTACIÓN: el negro bajo el piso no es una infracción del blanco')
})

test('EL ESTIMADO NUNCA MARCA: usa el piso', () => {
  const est = sueldoBlancoNegro({ horas: 62, valorHoraNegro: 4000, recibo: null, netoDeNomina: null, pisoCategoria: 6348, proporcion: null })
  assert.equal(marcaDeCategoria(est), null)
  assert.equal(marcaDeCategoria(null), null)
})

test('CONVENIOS COMPARA CON LA MISMA FUNCIÓN: el $/h del recibo, y el vigente sólo sin recibo', () => {
  assert.deepEqual(valorHoraAComparar(6000, 5874), { valorHora: 6000, origen: 'recibo' })
  assert.deepEqual(valorHoraAComparar(null, 5874), { valorHora: 5874, origen: 'vigente' })
  assert.deepEqual(valorHoraAComparar(null, null), { valorHora: null, origen: null })
  const ESCALA: FilaEscala[] = [{ convenio: 'UOCRA', categoria: 'oficial', desde: '2026-08-01', valorHora: 6348, fuente: 't' }]
  const l = exponerAlPiso({ personaId: 'p', nombre: 'P', convenio: 'UOCRA', categoria: 'oficial', valorHora: 6000, origenTarifa: 'recibo Q2-08/2026', origenValorHora: 'recibo' }, ESCALA, '2026-09-15', 97)
  assert.deepEqual({ bajo: l.bajoElPiso, dif: l.diferenciaHora, brecha: l.brechaPct },
    { bajo: true, dif: compararConElPiso(6000, 6348)!.diferenciaHora, brecha: compararConElPiso(6000, 6348)!.brechaPct })
  // El servicio pide la función, no la reimplementa.
  const SERVICIO = readFileSync(new URL('./exposicionConvenioService.ts', import.meta.url), 'utf8')
  assert.match(SERVICIO, /valorHoraAComparar\(recibo\?\.valorHora \?\? null, vigente\?\.valorHora \?\? null\)/)
  assert.match(readFileSync(new URL('./exposicionConvenio.ts', import.meta.url), 'utf8'), /const c = compararConElPiso\(p\.valorHora, piso\.valorHora\)/)
})

test('EL ÚLTIMO RECIBO HASTA LA QUINCENA: incluye la del período y no mira el futuro', () => {
  const r = [RECIBO, { ...RECIBO, periodo: 'Q1-09/2026', valorHora: 6500 }, { ...RECIBO, periodo: 'FINAL-09/2026', valorHora: 1 }]
  assert.equal(ultimoReciboHasta(r, 'p', null, 'Q2-08/2026')?.valorHora, 6000)
  assert.equal(ultimoReciboHasta(r, 'p', null, 'Q2-09/2026')?.valorHora, 6500)
  assert.equal(ultimoReciboHasta(r, 'otro', null, 'Q2-09/2026'), null)
})

test('PAGADO DE MÁS: se marca en ámbar, el pie lo suma y NO se netea a cero', () => {
  // CAMBIÓ EL 15/09/2026. Antes acá se probaba `efectivoSuperado`, el ámbar de un «Total efectivo» negativo.
  // El dueño rechazó esa columna con todas las letras: *«no considera adelantos en efectivo y resta del
  // efectivo total»*. El control equivalente —y el que dice qué pasa con la plata— es el saldo.
  const pago = pagoDeLaLinea({ banco: 96443.74, negro: 123750, pagadoEfectivo: 140000 })
  assert.equal(pago.saldoEfectivo, -16250, 'MUTACIÓN: netear a cero borraría que cobró de más')
  assert.equal(avisoDeExcedente(pago), 'pagado de más: pasa al otro lado (se descuenta del banco)')
  assert.equal(pago.aPagarEfectivo, 0)
  assert.equal(pago.aPagarBanco, 80193.74, 'los 16.250 de más salen del banco, no se pierden')
  // EL REDONDEADO SUGERIDO NUNCA ES NEGATIVO.
  assert.equal(efectivoSugerido(-16250), null)
  assert.deepEqual(efectivoMostrado({ efectivoRedondeado: null, enEfectivo: -16250 }), { valor: null, sugerido: false, sugeridoAhora: null })
  assert.equal(sumaDelRedondeo([{ efectivoRedondeado: null, enEfectivo: -16250 }, { efectivoRedondeado: null, enEfectivo: 182094 }]), 182000)
  // EL PIE SUMA EL NEGATIVO IGUAL: esconderlo inflaría los sobres.
  const fila = (entrada: Parameters<typeof pagoDeLaLinea>[0]) => ({
    linea: {
      cobra: 220193.74, adelanto: 140000, yaTransferido: 0, porBanco: 96443.74, enEfectivo: 0, total: 0, horas: 50,
      sinTarifa: false, sinNeto: false, sueldo: null, pago: pagoDeLaLinea(entrada),
    },
    cotejo: { estado: 'coincide' }, celdas: [], horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0, automaticas: 0 },
  }) as unknown as FilaDelEspejo
  const t = totalesDelEspejo([
    fila({ banco: 96443.74, negro: 123750, pagadoEfectivo: 140000 }),
    fila({ banco: 96443.74, negro: 182094 }),
  ])
  assert.equal(t.pago.saldoEfectivo, 165844, 'MUTACIÓN: sumar 0 en vez del negativo daría 182.094')
  assert.equal(t.pago.pagadoEfectivo, 140000)
  // Y LA CELDA USA LA REGLA, EN ÁMBAR.
  const CELDAS = readFileSync(new URL('../components/liquidacion/cuadro/CeldasBlancoNegro.tsx', import.meta.url), 'utf8')
  assert.match(CELDAS, /avisoDeExcedente\(p\)/)
  assert.match(CELDAS, /negativo \? V\.warn/)
  assert.match(CELDAS, /const bajo = marcaDeCategoria\(s\)/)
  assert.match(CELDAS, /el recibo paga \$\{pesos\(bajo\.valorHora\)\}\/h, el básico es \$\{pesos\(bajo\.piso\)\}\/h/)
})