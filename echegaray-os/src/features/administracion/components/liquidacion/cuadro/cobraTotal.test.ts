// EL ORDEN DEL CUADRO: BLANCO · NEGRO · TOTAL · cómo se paga (dueño, 14/09/2026).
//
// Antes: *«quiero q la columna de valor hora este primero y dp cuanto cobra total (eso de "le falta
// pagar", esta mal no quiero q sea asi)»*. Después: *«realmente no se entiende nada el cuadro de liq de
// hs, vamos a rehacer»* con el sueldo partido en blanco (recibo) y negro. Lo que se sigue protegiendo:
// el orden de lectura, que la frase «le falta pagar» no vuelva, y que el rojo de la fila sea un control
// que puede dar rojo (`estadoDelPago` es puro y se ejecuta).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDelPago, tituloDeJornales } from './estadoDelPago.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
// DESDE EL 17/09/2026 EL CUADRO SON DOS (jornaleros y mensuales): las columnas viven en `columnasDelCuadro.ts`
// (con su propio test), las filas en `FilasJornaleros.tsx` / `FilasMensuales.tsx` y el encabezado en `TablaDeBloques.tsx`.
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')
const TABLA = fuente('./TablaDeBloques.tsx')
const JORNALEROS = fuente('./FilasJornaleros.tsx')
const MENSUALES = fuente('./FilasMensuales.tsx')
const COLUMNAS = fuente('./columnasDelCuadro.ts')
const PIE = fuente('./PieDeLaQuincena.tsx')
const CELDAS = fuente('./CeldasBlancoNegro.tsx')

// CAMBIÓ EL 15/09/2026 (dueño, textual: «necesito al lado de banco y negro lo que se le ha pagado efectivamente
// y que vaya restando al total o incrementando en el otro llegado el caso; así no sirve, rehacer — pésimo: no
// considera adelantos en efectivo y resta del efectivo total»). Las dos bandas pasan a tener las MISMAS cinco
// columnas —cuánto, pagado, saldo— y la fila cierra con Total · Pagado · Saldo. Se fueron «Adelanto banco /
// embargos», «Adelanto efectivo» y «Total efectivo»: un adelanto no es un descuento del sueldo, es un pago.
// Lo que se sigue protegiendo: el orden de lectura, las dos bandas rotuladas, que la fila dibuje en el mismo
// orden que el encabezado, y que «le falta pagar» no vuelva.
const ORDEN_DEL_CUADRO = [
  'Horas',
  'Hs recibo', '$/h cat.', 'Banco', 'Pagado', 'Saldo',
  'Hs', '$/h negro', 'Importe', 'Pagado', 'Saldo',
  'Presentismo', 'Efect. red.', 'Total', 'Pagado', 'Saldo', 'Saldo red.',
]

// «EFECT. RED. ✎» VUELVE AL CUADRO (dueño, 16/09/2026: la pidió él). MUTACIÓN: sacarla → rojo.
test('EL ENCABEZADO: Persona · días · Horas · BLANCO(5) · NEGRO(5) · presentismo · redondeo · total · pagado · saldo', () => {
  const jornaleros = COLUMNAS.slice(COLUMNAS.indexOf('export const CUADRO_JORNALEROS'), COLUMNAS.indexOf('export const CUADRO_MENSUALES'))
  const columnas = [...jornaleros.matchAll(/clave: '([a-zA-Z]+)', rotulo: '([^']+)', px: \d+, bloque: '([a-z]+)'/g)]
    .map((m) => ({ clave: m[1], rotulo: m[2].replace(' ✎', ''), bloque: m[3] }))
  assert.deepEqual(columnas.map((c) => c.rotulo), ORDEN_DEL_CUADRO, 'el orden exacto, sin Cliente · Obra')
  assert.ok(!/Cliente|Obra'/.test(jornaleros), 'no vuelve la columna Cliente · Obra')
  for (const muerta of ['Adelanto banco / embargos', 'Adelanto efectivo', 'Total efectivo', 'Cobra total']) {
    assert.ok(!jornaleros.includes(muerta), `«${muerta}» volvió al encabezado`)
  }
  // LOS DÍAS ADELANTE: Persona · días · plata.
  assert.match(COLUMNAS, /minmax\(var\(--liq-persona,200px\),1fr\)\$\{dias > 0 \? ` repeat\(\$\{dias\},\$\{DIA\}px\)` : ''\} \$\{d\.columnas\.map/,
    'MUTACIÓN: la plata antes que los días')
  assert.match(TABLA, /gridColumn: 2 \+ dias\.length \+ i, gridRow: 2/)
  // Y LA FILA DIBUJA EN ESE ORDEN.
  const fila = JORNALEROS.slice(JORNALEROS.indexOf('export function FilaJornalero('), JORNALEROS.indexOf('export function TotalJornaleros('))
  const orden = ['<CeldaDeDia', '<CeldaHorasPagas', '<CeldaHorasBlanco', '<CeldaHoraCategoria', '<CeldaNeto',
    'campo="pagadoBanco"', 'lado="banco"', '<CeldaHorasNegro', '<CeldaImporteNegro', 'campo="pagadoEfectivo"',
    'lado="efectivo"', '<CeldaPresentismo', '<CeldaRedondeo', '<CeldaTotal', '<CeldaPagadoTotal', 'lado="total"',
    '<CeldaSaldoRedondeado']
    .map((x) => fila.indexOf(x))
  assert.ok(orden.every((i) => i > 0), 'están todas las celdas')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'en el orden pedido')
  assert.match(JORNALEROS, /espejo-total-redondeo/, 'la fila de total suma «Efect. red.»')
  assert.match(PIE, /rotulo="Efectivo redondeado"/, 'el pie la sigue sumando')
})

// «NECESITO Q EN ALGUNA COLUMNA DE LIQ HS ME DIGA CUANTO COBRA EN TOTAL» (dueño, 14/09/2026) sigue vigente: el
// TOTAL está y el SALDO cierra la fila. Y NINGUNA COLUMNA QUEDA PEGADA A LA DERECHA (dueño, 16/09/2026, textual:
// «está mal la columna de "saldo" en liq de hs porque esa queda fija, y la que has dejado tirada al último a la
// derecha sí se mueve como saldo: has hecho mal eso, rehacer urgente»). El saldo `sticky right` del 15/09 se leía
// como una columna distinta de la que se movía. MUTACIÓN: volver a pegar una columna a la derecha → rojo.
test('TOTAL EN EL CUADRO Y EN EL PIE; NINGUNA COLUMNA PEGADA A LA DERECHA', () => {
  const PANEL = fuente('./PanelDeLaPersona.tsx')
  assert.match(COLUMNAS, /clave: 'total', rotulo: 'Total'/)
  assert.match(COLUMNAS, /clave: 'saldo', rotulo: 'Saldo'/)
  assert.match(PIE, /rotulo="Total" valor=\{pesos\(t\.cobra\)\}/)
  assert.match(PIE, /rotulo="Saldo" valor=\{pesos\(t\.pago\.saldoTotal\)\}/)
  // Las tres cadenas del panel: blanco + negro, mensual y sin modelo.
  assert.equal((PANEL.match(/rotulo="Cobra total"/g) ?? []).length, 3, 'las tres cadenas del panel')
  const todo = GRILLA + TABLA + JORNALEROS + MENSUALES
  assert.ok(!/Total quincena/.test(todo + PANEL), 'no queda el rótulo viejo')
  assert.ok(!/right: -CANAL_SCROLL|COLUMNA_SALDO|CLASE_SALDO/.test(todo), 'volvió una columna pegada a la derecha')
  // LA ÚNICA `sticky` ES LA DE PERSONA (`COLUMNA_FIJA`, importada): acá no se declara ninguna.
  assert.ok(!/position: 'sticky'/.test(todo), 'se declaró un sticky propio: sólo Persona (tabla.tsx) es fija')
  // EL SALDO TOTAL ES UNA CELDA COMÚN, la última de la fila, en los dos cuadros.
  assert.match(JORNALEROS, /<CeldaPagadoTotal fila=\{fila\} \/>\s*<CeldaSaldo fila=\{fila\} lado="total" \/>\s*<CeldaSaldoRedondeado fila=\{fila\} \/>\s*<\/div>/)
  assert.match(MENSUALES, /<CeldaSaldo fila=\{fila\} lado="total" pago=\{p\}[^>]*\/>\s*<CeldaSaldoRedondeado fila=\{fila\} pago=\{p\} \/>\s*<\/div>/)
})

// ═══ «SALDO RED.» — LO QUE RESTA PAGAR, SI SALIERA TODO EN BILLETES (dueño, 16/09/2026) ═══
//
// *«dame una columna más al lado de saldo en donde diga saldo redondeado como si lo que resta pagar se pagara en
// efectivo»*. Va PEGADA A SALDO y sale de él. Lo que este test protege —y las mutaciones que lo ponen en rojo—:
// que la columna esté al lado de Saldo y no en cualquier lado; que NO sea editable ni se guarde (sería una
// segunda «Efect. red.», que es otra cosa y sí la decide el dueño); y que el total sume saldos ya redondeados.
test('SALDO RED. VA AL LADO DE SALDO, SE DERIVA DE ÉL, NO SE EDITA NI SE GUARDA', () => {
  for (const cuadro of ['CUADRO_JORNALEROS', 'CUADRO_MENSUALES']) {
    const i = COLUMNAS.indexOf(`export const ${cuadro}`)
    const plata = COLUMNAS.slice(i, COLUMNAS.indexOf('\n}\n', i))
    const claves = [...plata.matchAll(/clave: '([a-zA-Z]+)', rotulo/g)].map((m) => m[1])
    assert.equal(claves[claves.indexOf('saldoRedondeado') - 1], 'saldo', 'MUTACIÓN: separarla del Saldo')
    assert.equal(claves[claves.length - 1], 'saldoRedondeado', 'cierra la fila')
    assert.match(plata, /clave: 'saldoRedondeado', rotulo: 'Saldo red\.'/)
    assert.ok(!/clave: 'saldoRedondeado', rotulo: '[^']*✎/.test(plata), 'MUTACIÓN: no es editable')
  }
  // SALE DEL SALDO TOTAL (de la línea o del pago del mensual), no de `enEfectivo` ni del redondeo del dueño.
  const celda = CELDAS.slice(CELDAS.indexOf('export function CeldaSaldoRedondeado('), CELDAS.indexOf('export function CeldaPagadoTotal('))
  assert.match(celda, /\(pago \?\? fila\.linea\.pago\)\.saldoTotal/)
  assert.ok(!/efectivoRedondeado|enEfectivo/.test(celda), 'MUTACIÓN: se mezcló con la columna que edita el dueño')
  assert.ok(!/Escribible|onBlur|upsert/.test(celda), 'MUTACIÓN: se volvió escribible')
  assert.match(celda, /Saldo exacto \$\{pesos\(saldo\)\}/)
  // EL TOTAL: suma de redondeados uno por uno, no el redondeo de la suma (`liquidacionPorTipo.ts`).
  assert.match(JORNALEROS, /espejo-total-saldo-redondeado/)
  assert.match(PIE, /rotulo="Saldo red\."/)
})

// EL ENCABEZADO FIJO (dueño, 15/09/2026: «quiero eso fijo en liq hs», con captura del cuadro desplazado).
test('EL ENCABEZADO SE PEGA ARRIBA Y LA CAJA NO LE ROBA EL ANCLAJE', () => {
  // EL DEFECTO QUE ATRAPA: `sticky` se ancla al scrollport MÁS CERCANO. Con los rótulos ADENTRO del div que scrollea
  // de costado, la cabecera se va con la página; con `overflow: hidden` en la caja, lo mismo.
  assert.match(TABLA, /<CintaHorizontal/, 'los rótulos viven afuera del scroller')
  assert.match(TABLA, /cabecera=\{\(corrimiento\) =>/)
  assert.match(TABLA, /marcoPropio=\{\{ \.\.\.MARCO_SCROLL/, 'el canal de 20 px de la columna fija se conserva')
  assert.ok(!/borderRadius: 10, overflow: 'hidden'/.test(GRILLA), 'MUTACIÓN: `hidden` crea scrollport y mata el sticky')
  assert.match(GRILLA, /borderRadius: 10, overflow: 'clip'/)
  const cuerpo = TABLA.slice(TABLA.indexOf('function Encabezado('))
  assert.match(cuerpo, /gridRow: '1 \/ span 2', alignSelf: 'stretch', marginInline/, 'el bloque cubre los dos renglones')
  assert.match(cuerpo, /gridRow: 2/, 'y los rótulos de columna el 2')
  assert.equal((TABLA.match(/<Encabezado /g) ?? []).length, 1, 'un solo encabezado, dentro de la cabecera pegajosa')
  // «PERSONA» NO SE DESPEGA DE SU COLUMNA: se contra-desplaza con el mismo corrimiento, en UNA celda para los dos
  // renglones, estirada. Y con `left: 0`: el `left: -20` de `COLUMNA_FIJA` con `relative` la corría 20 px (17/09).
  assert.match(cuerpo, /\.\.\.COLUMNA_FIJA, position: 'relative', left: 0, gridColumn: 1, gridRow: '1 \/ span 2', alignSelf: 'stretch'/)
  assert.match(cuerpo, /transform: `translateX\(\$\{corrimiento\}px\)`/)
  assert.ok(!/height: ALTO_LIQ\.encabezado/.test(cuerpo), 'MUTACIÓN: una altura fija deja pasar el rótulo envuelto')
  // Los rótulos de bloque siguen a la vista al desplazar.
  assert.match(cuerpo, /corrimientoDelRotulo\(corrimiento, t\)/)
})

// EL PANEL DICE LO MISMO QUE EL CUADRO (16/09/2026). Después de rehacer el cuadro, el panel por persona seguía
// mostrando «Total efectivo = cobra total − banco − adelantos» con una celda `enEfectivo` que el cuadro ya no lee:
// dos respuestas a «cuánto le falta cobrar en mano», y la segunda era la resta que el dueño calificó de «pésimo».
// MUTACIÓN: volver a poner esa fila, o sacar las celdas Pagado del panel → rojo.
test('EL PANEL DE LA PERSONA MUESTRA PAGADO Y SALDO POR LADO, NO «TOTAL EFECTIVO»', () => {
  const PANEL = fuente('./PanelDeLaPersona.tsx')
  const cadena = PANEL.slice(PANEL.indexOf('function CadenaBlancoNegro('), PANEL.indexOf('function CadenaSinModelo('))
  for (const muerta of ['Total efectivo', 'cobra total − banco − adelantos', 'campo="enEfectivo"', 'Adelanto efectivo', 'Adelanto banco / embargos']) {
    assert.ok(!cadena.includes(muerta), `«${muerta}» sigue en la cadena blanco + negro del panel`)
  }
  const orden = ['campo="porBanco"', 'campo="negro"', '<PagadoYSaldo', 'campo="cobra"', 'rotulo="Pagado"', 'rotulo="A pagar hoy"']
    .map((x) => cadena.indexOf(x))
  assert.ok(orden.every((i) => i > 0), 'están todos los renglones')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'en el orden del cuadro: blanco · negro · pagado · total')
  // LAS MISMAS CELDAS QUE EL CUADRO, y el saldo se LEE: nadie escribe un saldo.
  for (const campo of ['pagadoBanco', 'pagadoEfectivo']) assert.match(cadena, new RegExp(`<Escribible campo="${campo}"`))
  assert.match(cadena, /<Leida valor=\{p\.saldoBanco\}/)
  assert.match(cadena, /<Leida valor=\{p\.saldoEfectivo\}/)
  assert.match(cadena, /avisoDeExcedente\(p\)/, 'el saldo negativo dice adónde va el exceso')
  assert.match(cadena, /aPagarEfectivo == null \? 'sin saldo que afirmar'/, 'NULL no es cero tampoco en el panel')
})

test('LA FRASE NO QUEDA ESCRITA EN EL CUADRO, EL PIE, EL PANEL NI CAJA', () => {
  for (const rel of ['../GrillaEspejoQuincena.tsx', './CeldasDelEspejo.tsx', './CeldasBlancoNegro.tsx', './PanelDeLaPersona.tsx', '../solapas/caja-nomina.tsx', '../solapas/cierre.tsx']) {
    const texto = fuente(rel)
    assert.ok(!/le falta pagar|leFaltaPagar|le-falta-pagar|CeldaLeFaltaPagar/i.test(texto), `${rel} todavía la tiene`)
  }
})

test('EL TOTAL SE PINTA DE ROJO SÓLO SI LA FILA NO CIERRA; EL ESTIMADO SE VE APAGADO CON «est.»', () => {
  // ANTES ERA «Total efectivo» (`CeldaEfectivoDelSueldo`, retirada el 15/09/2026 con su columna). El rojo que
  // hay que conservar es el de la fila que NO CIERRA, y hoy vive en el Total.
  const cuerpo = CELDAS.slice(CELDAS.indexOf('export function CeldaTotal('), CELDAS.indexOf('export function CeldaPagado('))
  assert.match(cuerpo, /estadoDelPago\(l\)/)
  assert.match(cuerpo, /e\.noCierra \? V\.neg/)
  // Y EL ÁMBAR DEL SALDO NEGATIVO: no es un error de la fila, es plata que pasa al otro lado.
  const saldo = CELDAS.slice(CELDAS.indexOf('export function CeldaSaldo('), CELDAS.indexOf('export function CeldaSaldoRedondeado('))
  assert.match(saldo, /negativo \? V\.warn : V\.tinta/)
  assert.match(saldo, /avisoDeExcedente\(p\)/)
  assert.ok(!/Math\.max\(0,/.test(saldo), 'MUTACIÓN: netear el saldo a cero escondería que cobró de más')
  assert.match(CELDAS, /const ESTIMADO: CSSProperties = \{ color: V\.apagado, fontStyle: 'italic' \}/)
  assert.match(CELDAS, /estimado && <Est \/>/)
  // ÁMBAR SÓLO PARA EL PROBLEMA: el recibo que paga más horas que las cargadas.
  assert.match(CELDAS, /reciboExcedeHoras[\s\S]{0,200}color: V\.warn/)
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(CELDAS), 'sin hex sueltos: tokens V')
})

const base = { cobra: 552156, adelanto: 0, yaTransferido: 200000, porBanco: 230240.12, enEfectivo: 121915.88, total: 352156, reciboNeto: 230240.12, blancoAcuerdo: 276078, efectivoAcuerdo: 276078 }

test('UNA FILA QUE NO CIERRA SE MARCA Y DICE POR CUÁNTO; UNA QUE CIERRA NO MUESTRA NADA', () => {
  const bien = estadoDelPago(base)
  assert.equal(bien.noCierra, false)
  assert.match(bien.titulo, /Cobra \$552\.156 − adelanto \$0 − ya transferido \$200\.000 = banco/)
  const mal = estadoDelPago({ ...base, enEfectivo: 169759.88, total: 400000 })
  assert.equal(mal.noCierra, true)
  // CAMBIÓ EL 15/09/2026: el título arranca con la diferencia («no cierra: diferencia $X»).
  assert.match(mal.titulo, /^no cierra: diferencia \$47\.844/)
  assert.equal(estadoDelPago({ ...base, cobra: null, total: null }).noCierra, false)
})

test('JORNALES VA ENTERO EN EL TITLE Y NO MANDA: horas, cobra, banco y efectivo', () => {
  assert.equal(
    tituloDeJornales({ referenciaJornales: { horas: 94, cobra: 552156, porBanco: 250000, enEfectivo: 121915.88, difiere: false } }),
    'JORNALES (referencia): 94 h · cobra $552.156 · banco $250.000 · efectivo $121.915,88',
  )
  assert.equal(tituloDeJornales({ referenciaJornales: null }), null)
})
