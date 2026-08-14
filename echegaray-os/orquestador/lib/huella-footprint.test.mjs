// LA CUARTA EVIDENCIA: ESTUVE ACÁ Y HOY YA NO — el residuo que el dueño corrigió a mano tres veces.
//
// El defecto que estos tests atrapan, medido en "Jornales por Quincena": cuando un cuadro cambia de
// alto, la fila que el layout nuevo ya no usa queda con la fórmula del layout anterior. El generador
// SÍ pide limpiarla (el centinela `VACIO` de `cola-de-rango`), pero para probar que esa celda es suya
// necesita la huella de la corrida pasada — y `guardarHuellas` la borraba justo ahí: una celda escrita
// con `VACIO` no sella huella nueva y el barrido se lleva la vieja. Sin prueba, `aplicarHuella` la
// declara ajena, `fusionar` la conserva y el veredicto se repite en cada corrida. Para siempre.
//
// Si se revierte la cuarta evidencia, (1) se pone rojo. Si se afloja —si el footprint alcanzara sin
// comparar la forma, o sin registro previo—, se ponen rojos (2), (3) y (4).
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarHuella, huellasDeEscritura, claveCelda, MIN_COMPARABLES } from './huella-celda.mjs'
import { partirPorFootprint, veredictoDeFootprint } from './huella-footprint.mjs'
import { VACIO, fusionar } from './preservar-anotaciones.mjs'
import { preservarNoVacias } from './no-borrar.mjs'

/** Lo que queda EN LA PESTAÑA: la cadena entera, con `no-borrar` incluido. Parar antes miente. */
const enLaPestana = (grid, hoy) => preservarNoVacias(hoy, fusionar(grid, hoy)).values

/** Filas propias que nadie toca, para que la alineación sea un juicio y no una casualidad. */
const lastre = (n = MIN_COMPARABLES + 2) =>
  Array.from({ length: n }, (_, k) => [`Ancla ${'abcdefghijklmnopqrstuvwxyz'[k % 26]} de control`])

const huellasDe = (grid, opts = {}) =>
  new Map(huellasDeEscritura(grid, opts).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))

/** El registro del footprint: "ocupé esta celda, la dejé con ESTA forma, y hoy ya no la ocupo". */
const conFootprint = (huellas, celdas) => {
  for (const [fila, col, forma] of celdas) {
    huellas.set(claveCelda(fila, col), { forma, huella: 'sha', borrada: false, abandonada: true })
  }
  return huellas
}

const BASICO = '=IFERROR(INDEX(_UOCRA_RAW!$D$5:$D$8;MATCH("Oficial";_UOCRA_RAW!$B$5:$B$8;0));"")'
const FORMA_BASICO = '=iferror(index(_uocra_raw!$d$#:$d$#;match("oficial";_uocra_raw!$b$#:$b$#;#));"")'
const FILA = MIN_COMPARABLES + 3          // la fila de más abajo, 1-based, que el cuadro ya no usa

test('(1) el residuo de un layout anterior en una fila que el cuadro ya no usa SE LIMPIA', () => {
  // Ayer el cuadro llegaba hasta esta fila; hoy es más bajo y el generador pide limpiarla entera.
  const quiero = [...lastre(), [VACIO, VACIO]]
  const huellas = conFootprint(huellasDe(lastre()), [[FILA, 0, 'convenio (tuya)'], [FILA, 1, FORMA_BASICO]])
  // La pestaña TODAVÍA muestra lo del layout viejo: la limpieza de la corrida pasada no llegó al Sheet.
  const hoy = [...lastre(), ['Convenio (tuya)', BASICO]]

  const { grid, desocupadas, ajenas, alineacion } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  assert.equal(desocupadas.length, 2, 'las dos celdas estuvieron en mi footprint y hoy no las ocupo')
  assert.deepEqual(ajenas, [], 'un residuo mío no es una celda del dueño')
  // LA PRUEBA DEL EFECTO, hasta el final de la cadena: en la pestaña la fila queda vacía.
  const enPestana = enLaPestana(grid, hoy)
  assert.equal(enPestana.at(-1)[0], '', 'el rótulo del layout viejo se va')
  assert.equal(enPestana.at(-1)[1], '', 'la fórmula del layout viejo se va')
})

test('(2) una celda del dueño DENTRO del rectángulo no se limpia: nunca estuvo en mi footprint', () => {
  const quiero = [...lastre(), [VACIO, VACIO]]
  // Sólo la columna A estuvo en mi footprint. La B nunca: ahí el dueño escribió algo suyo.
  const huellas = conFootprint(huellasDe(lastre()), [[FILA, 0, 'convenio (tuya)']])
  const hoy = [...lastre(), ['Convenio (tuya)', 'ojo: Perez cambio de categoria, ver con Jorge']]

  const { grid, desocupadas, ajenas } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(desocupadas.length, 1, 'sólo la celda que sí estuvo en mi footprint')
  assert.equal(ajenas.length, 1)
  assert.equal(enLaPestana(grid, hoy).at(-1)[1], 'ojo: Perez cambio de categoria, ver con Jorge',
    'lo que el dueño escribió adentro de mi rectángulo sobrevive')
})

test('(3) si escribiste ENCIMA de mi celda abandonada, el footprint NO alcanza para borrarla', () => {
  // El seguro de (1). El footprint prueba que ocupé la coordenada; la FORMA prueba que lo que hay hoy
  // sigue siendo lo mío. Sin la segunda, la cuarta evidencia sería un permiso de borrado por posición.
  const quiero = [...lastre(), [VACIO, VACIO]]
  const huellas = conFootprint(huellasDe(lastre()), [[FILA, 0, 'convenio (tuya)'], [FILA, 1, FORMA_BASICO]])
  const hoy = [...lastre(), ['Convenio (tuya)', 'OJO: esto lo confirma Jorge']]

  const { grid, desocupadas, editadas } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(desocupadas.length, 1, 'la columna B ya no tiene mi forma: no se limpia')
  assert.equal(editadas.length, 1)
  assert.equal(enLaPestana(grid, hoy).at(-1)[1], 'OJO: esto lo confirma Jorge')
})

test('(4) sin registro previo no se limpia NADA: la primera corrida siembra, no borra', () => {
  const quiero = [...lastre(), [VACIO, VACIO]]
  const hoy = [...lastre(), ['Convenio (tuya)', BASICO]]
  const { grid, desocupadas, alineacion } = aplicarHuella(quiero, hoy, new Map())
  assert.equal(alineacion.alineada, false)
  assert.match(alineacion.motivo, /sin huella previa/)
  assert.deepEqual(desocupadas, [])
  assert.equal(enLaPestana(grid, hoy).at(-1)[1], BASICO, 'sin footprint la celda se queda como está')
})

test('(5) un footprint solo, sin huella viva que aline, tampoco habilita nada', () => {
  // El mapa existe pero no alcanza para juzgar dónde cae: el lado tímido sigue siendo el defecto.
  const quiero = [[VACIO, VACIO]]
  const huellas = conFootprint(new Map(), [[1, 0, 'convenio (tuya)'], [1, 1, FORMA_BASICO]])
  const hoy = [['Convenio (tuya)', BASICO]]
  const { grid, desocupadas, alineacion } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(alineacion.alineada, false, alineacion.motivo)
  assert.deepEqual(desocupadas, [])
  assert.equal(enLaPestana(grid, hoy).at(-1)[1], BASICO)
})

test('(6) una celda que YO limpié no se anota como borrada por el dueño', () => {
  // La marca `borrada_en` es la decisión del dueño y no se revisa nunca más. Si mi propia limpieza se
  // anotara ahí, el día que el cuadro vuelva a ocupar esa fila el generador no podría escribirla.
  const quiero = [...lastre(), [VACIO, VACIO]]
  const huellas = conFootprint(huellasDe(lastre()), [[FILA, 0, 'convenio (tuya)'], [FILA, 1, FORMA_BASICO]])
  const hoy = [...lastre(), ['', '']]                   // la limpieza de la corrida pasada sí llegó
  const { desocupadas, suprimidas } = aplicarHuella(quiero, hoy, huellas)
  assert.deepEqual(suprimidas, [], 'una celda mía abandonada y vacía no es un borrado tuyo')
  assert.deepEqual(desocupadas, [], 'y no hay nada que limpiar: ya está limpia')
})

test('partirPorFootprint separa lo que ocupo hoy de lo que ocupé y ya no', () => {
  const h = conFootprint(huellasDe([['TOTAL']]), [[9, 3, 'algo viejo']])
  const { activas, footprint } = partirPorFootprint(h)
  assert.equal(activas.size, 1)
  assert.ok(activas.has(claveCelda(1, 0)))
  assert.equal(footprint.size, 1)
  assert.ok(footprint.has(claveCelda(9, 3)))
})

test('veredictoDeFootprint: sin registro es null, con forma igual es residuo, distinta es editada', () => {
  const { footprint } = partirPorFootprint(conFootprint(new Map(), [[9, 3, FORMA_BASICO]]))
  assert.equal(veredictoDeFootprint(footprint, 9, 4, BASICO), null, 'otra columna: nunca estuve ahí')
  assert.equal(veredictoDeFootprint(footprint, 9, 3, BASICO)?.veredicto, 'residuo')
  assert.equal(veredictoDeFootprint(footprint, 9, 3, 'una nota del dueño')?.veredicto, 'editada')
  // Un registro sin forma no prueba nada: no se decide sobre él.
  const { footprint: sinForma } = partirPorFootprint(conFootprint(new Map(), [[9, 3, '']]))
  assert.equal(veredictoDeFootprint(sinForma, 9, 3, BASICO), null)
})
