import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { describirHallazgos, diagnosticarDerrames } from './compras-derrames.mjs'
import { contratoContra, NATURALEZA } from './comprobantes/contrato-columnas.mjs'

/** La fila 3 de Compras LEÍDA del archivo el 17/09/2026. */
const ENCABEZADO = ['ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo', 'N° Comprobante',
  'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Obra', 'Concepto', 'Importe', 'IVA', 'Total', 'Tipo pago',
  'Fecha prevista de pago (día)', 'Fecha prevista de pago (mes)', 'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1',
  'Fecha prevista de pago 2', 'Monto Parcial 2', 'Estado', 'Tipo de Costo', 'Estado pago', 'Estado Carga', 'Rubro de caja',
  'Rubro de caja', 'Fecha de caja', 'Familia de material', 'Sub-rubro de estructura', 'Orden de pago (OS)', 'Orden de pago (OS)',
  'Orden sin fecha (OS)', '¿Proveedor comercial? (OS)', '¿Comprobante repetido? (OS)', 'Saldo pendiente (OS)', 'CUIT (OS)',
  'Tramo de vencimiento (OS)']
const AE = 30
const DERIVADAS = contratoContra(ENCABEZADO).filter((c) => c.naturaleza === NATURALEZA.ARRAYFORMULA)
const idx = (l) => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

/** Compras sana: cada derivada con su ARRAYFORMULA en la fila 4 y el derrame vacío en render FORMULA. */
function compras(nFilas = 1000) {
  const formulas = Array.from({ length: nFilas }, () => Array(ENCABEZADO.length).fill(''))
  const valores = [Array(ENCABEZADO.length).fill('x')]
  for (const c of DERIVADAS) formulas[0][idx(c.letra)] = '=ARRAYFORMULA(IF($E$4:$E="";"";1))'
  formulas.forEach((f, r) => { if (r) { f[4] = 'Proveedor'; f[15] = '=O+N' } }) // las columnas de carga no son derrame
  return { encabezado: ENCABEZADO, formulas, valores }
}

describe('diagnosticarDerrames', () => {
  it('las derivadas salen del contrato y la «Fecha de caja» viva está en AE', () => {
    assert.ok(DERIVADAS.length >= 10, `sólo ${DERIVADAS.length} derivadas: el contrato perdió columnas`)
    assert.equal(DERIVADAS.find((c) => c.rotulo === 'Fecha de caja').letra, 'AE')
  })

  it('Compras sana no frena: las columnas de carga con contenido no son derrame', () => {
    assert.deepEqual(diagnosticarDerrames(compras()), [])
  })

  it('EL CASO DEL 17/09: un 16/09 pegado en AE962 y el ancla AE4 en #REF! — frena y nombra la celda', () => {
    const c = compras()
    c.formulas[962 - 4][AE] = 46281
    c.valores[0][AE] = '#REF! (Array result was not expanded because it would overwrite data in  AE962.)'
    const h = diagnosticarDerrames(c)
    assert.deepEqual(h.map((x) => [x.letra, x.problema]), [['AE', 'ancla-en-error'], ['AE', 'valor-pegado']])
    assert.deepEqual(h[1].celdas, [{ celda: 'AE962', contenido: '46281' }])
    const texto = describirHallazgos(h).join('\n')
    assert.match(texto, /Compras!AE4=/)
    assert.match(texto, /Compras!AE962="46281"/)
  })

  it('un valor pegado frena aunque Google todavía no haya marcado el ancla (debajo del último dato)', () => {
    const c = compras()
    assert.equal(DERIVADAS.find((d) => d.rotulo === 'Saldo pendiente (OS)').letra, 'AM')
    c.formulas[999][38] = '0'
    const h = diagnosticarDerrames(c)
    assert.equal(h.length, 1)
    assert.deepEqual([h[0].letra, h[0].problema, h[0].celdas[0].celda], ['AM', 'valor-pegado', 'AM1003'])
  })

  it('una fórmula por fila tipeada dentro del derrame también es un bloqueo', () => {
    const c = compras()
    c.formulas[20][28] = '=IF(E24="";"";"Materiales Civil")'
    assert.deepEqual(diagnosticarDerrames(c).map((x) => [x.rotulo, x.celdas[0].celda]), [['Rubro de caja (1.ª)', 'AC24']])
  })

  it('ancla borrada o pegada como valor: frena', () => {
    const c = compras()
    c.formulas[0][AE] = 46281
    assert.deepEqual(diagnosticarDerrames(c).map((x) => [x.letra, x.problema]), [['AE', 'ancla-ausente']])
    c.formulas[0][AE] = '=R4'
    assert.equal(diagnosticarDerrames(c)[0].problema, 'ancla-ausente', 'una fórmula de fila en el ancla no derrama')
  })

  it('cualquier error de Sheets en el ancla frena, no sólo #REF!', () => {
    for (const e of ['#N/A', '#ERROR!', '#VALUE!', '#NAME?']) {
      const c = compras()
      c.valores[0][AE] = e
      assert.equal(diagnosticarDerrames(c)[0]?.problema, 'ancla-en-error', e)
    }
  })

  it('un encabezado que perdió una derivada no se diagnostica a ciegas: error con el rótulo', () => {
    const c = compras()
    c.encabezado = ENCABEZADO.map((r) => (r === 'Fecha de caja' ? 'Fecha caja' : r))
    assert.throws(() => diagnosticarDerrames(c), /Fecha de caja/)
  })
})
