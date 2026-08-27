import test from 'node:test'
import assert from 'node:assert/strict'
import { CLASE, DEFINE, RESPALDO, esHueco, huecosDe } from './computo-constructivo.mjs'
import {
  SUBTIPO_VIGA, computarVigaHA, volumenViga, masaLinealBarra, estriboDesarrollado, estribosEnZona, armaduraViga,
} from './computo-hormigon-armado.mjs'

// ═══ (L) UNA VIGA PRODUCE SU VOLUMEN GEOMÉTRICO, SIN MODELO ═══
//
// El defecto que atrapa: que el volumen de hormigón deje de ser b·h·L. Si alguien lo reemplaza por
// una estimación, lo redondea a dos decimales «para que quede lindo» o le mete un coeficiente
// escondido, el número cambia y el test se pone rojo.

test('(L) viga 0,20 × 0,40 × 5,00 → 0,4 m³ de hormigón, determinístico y con unidad', () => {
  const r = computarVigaHA({ subtipo: SUBTIPO_VIGA.CARGA, ancho: 0.2, alto: 0.4, longitud: 5 })
  assert.equal(r.hormigon.unitario.valor, 0.4)
  assert.equal(r.hormigon.unitario.unidad, 'm3')
  assert.equal(r.hormigon.unitario.clase, CLASE.CALCULADO)
  assert.equal(r.hormigon.unitario.formula, 'ancho × alto × longitud')
  assert.deepEqual(r.hormigon.unitario.entradas, { ancho: 0.2, alto: 0.4, longitud: 5 })
})

test('(L) N vigas iguales: el unitario se conserva y el total se multiplica', () => {
  const r = volumenViga({ ancho: 0.2, alto: 0.4, longitud: 5, cantidad: 7 })
  assert.equal(r.unitario.valor, 0.4)
  assert.equal(r.total.valor, 2.8)
})

test('(L) los cuatro subtipos existen y uno desconocido no se acepta en silencio', () => {
  assert.deepEqual(Object.values(SUBTIPO_VIGA), ['fundacion', 'arriostramiento', 'encadenado', 'carga'])
  const r = computarVigaHA({ subtipo: 'viga_rara', ancho: 0.2, alto: 0.4, longitud: 5 })
  assert.equal(r.subtipo, null)
  assert.match(r.subtipoNota, /fundacion, arriostramiento, encadenado, carga/)
})

test('(L) el rubro de la viga sale de la Base Maestra cuando el tarea_tipo existe', () => {
  const base = [{ id: 'tt-9', codigo: 'HA-VIGA-FUND', division: 'ESTRUCTURAS DE HORMIGÓN' }]
  const r = computarVigaHA(
    { subtipo: SUBTIPO_VIGA.FUNDACION, ancho: 0.3, alto: 0.5, longitud: 8, tareaTipoCodigo: 'HA-VIGA-FUND' },
    { baseMaestra: base },
  )
  assert.equal(r.rubro.texto, 'ESTRUCTURAS DE HORMIGÓN')
  assert.equal(r.rubro.clase, CLASE.EXTRAIDO)
})

// ═══ EL PESO DEL ACERO ES FÍSICA, Y SE VERIFICA CONTRA LA TABLA DE CUALQUIER PLANILLA DE OBRA ═══

test('la masa lineal reproduce la tabla conocida de barras (Ø8, Ø12, Ø20)', () => {
  assert.equal(Number(masaLinealBarra(8).valor.toFixed(3)), 0.395)
  assert.equal(Number(masaLinealBarra(12).valor.toFixed(3)), 0.888)
  assert.equal(Number(masaLinealBarra(20).valor.toFixed(3)), 2.466)
  assert.equal(masaLinealBarra(12).unidad, 'kg/m')
  // La densidad viaja DECLARADA en las entradas: no es una constante escondida en la cuenta.
  assert.equal(masaLinealBarra(12).entradas.densidadKgM3, 7850)
})

// ═══ (M) EL MOTOR NO INVENTA UNA REGLA ESTRUCTURAL AUSENTE ═══
//
// Éste es el test que sostiene todo el módulo. Si mañana alguien «mejora» el motor poniéndole un
// recubrimiento por defecto, un gancho «típico» o una separación de estribos «habitual», estos
// assert se ponen rojos. El número plausible es el defecto, no la ausencia del número.

test('(M) sin recubrimiento declarado el estribo NO se dimensiona: sale REQUIERE DEFINICIÓN', () => {
  const e = estriboDesarrollado({ anchoViga: 0.2, altoViga: 0.4 })
  assert.ok(esHueco(e.perimetro))
  assert.equal(e.perimetro.valor, null)
  assert.match(e.perimetro.requiereDefinicion.que, /recubrimiento/)
  assert.equal(e.perimetro.requiereDefinicion.quienDefine, DEFINE.NORMA)
})

test('(M) con recubrimiento el perímetro sale, pero el gancho sigue siendo REQUIERE DEFINICIÓN', () => {
  const e = estriboDesarrollado({ anchoViga: 0.2, altoViga: 0.4, recubrimiento: 0.025, diametroMm: 6 })
  // 2 × ((0,20 − 0,05) + (0,40 − 0,05)) = 2 × 0,50 = 1,00
  assert.equal(e.perimetro.valor, 1)
  assert.equal(e.perimetro.clase, CLASE.CALCULADO)
  assert.ok(esHueco(e.desarrollo))
  assert.match(e.desarrollo.requiereDefinicion.que, /gancho/)
  // Y sin desarrollo no hay peso: no se pesa un estribo que no se sabe cuánto mide.
  assert.equal(e.pesoUnitario, null)
})

test('(M) con el gancho declarado el desarrollo y el peso salen, y dicen con qué entradas', () => {
  const e = estriboDesarrollado({ anchoViga: 0.2, altoViga: 0.4, recubrimiento: 0.025, diametroMm: 6, longitudGanchoTotal: 0.12 })
  assert.equal(e.desarrollo.valor, 1.12)
  assert.deepEqual(e.desarrollo.entradas, { perimetro: 1, ganchos: 0.12 })
  assert.equal(Number(e.pesoUnitario.valor.toFixed(4)), Number((1.12 * masaLinealBarra(6).valor).toFixed(4)))
})

test('(M) un recubrimiento que no entra en la sección se rechaza, no se computa negativo', () => {
  const e = estriboDesarrollado({ anchoViga: 0.1, altoViga: 0.4, recubrimiento: 0.06 })
  assert.equal(e.perimetro, null)
  assert.equal(e.imposibles.length, 1)
})

test('(M) sin separación declarada la zona de estribos es REQUIERE DEFINICIÓN, no una cantidad', () => {
  const z = estribosEnZona({ nombre: 'crítica', longitudZona: 1 })
  assert.ok(esHueco(z.cantidad))
  assert.match(z.cantidad.requiereDefinicion.porque, /confinamiento/)
})

test('(M) sin longitud de zona crítica declarada tampoco se deduce de la viga', () => {
  const z = estribosEnZona({ nombre: 'crítica', separacion: 0.1 })
  assert.ok(esHueco(z.cantidad))
  assert.match(z.cantidad.requiereDefinicion.que, /longitud de la zona/)
})

test('(M) con zona y separación declaradas la cantidad sale con la convención escrita', () => {
  const z = estribosEnZona({ nombre: 'no crítica', longitudZona: 3, separacion: 0.2 })
  assert.equal(z.cantidad.valor, 16) // ⌊3 / 0,2⌋ + 1
  assert.match(z.cantidad.formula, /\+ 1/)
})

test('(M) sin armadura longitudinal declarada NO se propone una: sale el hueco con su porqué', () => {
  const a = armaduraViga({ anchoViga: 0.2, altoViga: 0.4 })
  assert.ok(esHueco(a.superior.peso))
  assert.match(a.superior.peso.requiereDefinicion.que, /cantidad de barras.*diámetro.*longitud/)
  assert.match(a.superior.peso.requiereDefinicion.porque, /cálculo estructural/)
  assert.equal(a.superior.peso.requiereDefinicion.quienDefine, DEFINE.NORMA)
})

test('(M) una armadura incompleta NO se totaliza: el peso total es un hueco, nunca un parcial', () => {
  const a = armaduraViga({
    anchoViga: 0.2, altoViga: 0.4,
    superior: { cantidad: 2, diametroMm: 12, longitud: 5 },
    inferior: { cantidad: 3, diametroMm: 16, longitud: 5 },
    estribo: { recubrimiento: 0.025, diametroMm: 6, longitudGanchoTotal: 0.12 },
    // faltan las zonas → faltan los estribos → NO hay total
  })
  assert.ok(!esHueco(a.superior.peso))
  assert.ok(!esHueco(a.inferior.peso))
  assert.ok(esHueco(a.pesoTotal))
  assert.match(a.pesoTotal.requiereDefinicion.porque, /incompleta/)
})

test('(M) la viga entera lista todos sus huecos con la ruta donde aparecen', () => {
  const r = computarVigaHA({ subtipo: SUBTIPO_VIGA.ENCADENADO, ancho: 0.2, alto: 0.2, longitud: 12 })
  assert.equal(r.hormigon.unitario.valor, 0.48) // el hormigón SÍ sale
  const rutas = huecosDe(r.acero).map((h) => h.ruta).sort()
  assert.deepEqual(rutas, [
    'estribo.perimetro', 'inferior.peso', 'pesoEstribos', 'pesoTotal', 'superior.peso',
    'zonas.0.cantidad', 'zonas.1.cantidad',
  ])
})

// ═══ CUANDO ESTÁ TODO DECLARADO, EL NÚMERO SALE — Y SALE EXACTO ═══

test('con todas las definiciones declaradas el peso total de acero se calcula y se puede rehacer a mano', () => {
  const a = armaduraViga({
    anchoViga: 0.2, altoViga: 0.4,
    superior: { cantidad: 2, diametroMm: 12, longitud: 5 },
    inferior: { cantidad: 2, diametroMm: 12, longitud: 5 },
    estribo: { recubrimiento: 0.025, diametroMm: 6, longitudGanchoTotal: 0.12 },
    zonas: [{ nombre: 'crítica', longitudZona: 1.6, separacion: 0.1 }, { nombre: 'no crítica', longitudZona: 3.4, separacion: 0.2 }],
  })
  assert.equal(a.cantidadEstribos, 17 + 18)
  const esperado = 2 * 5 * masaLinealBarra(12).valor * 2 + 35 * 1.12 * masaLinealBarra(6).valor
  assert.equal(Number(a.pesoTotal.valor.toFixed(4)), Number(esperado.toFixed(4)))
  assert.equal(a.pesoTotal.respaldo, RESPALDO.NORMA)
})
