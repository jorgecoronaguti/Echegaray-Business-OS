import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sinComentarios } from '../../../../shared/definiciones/fuente.ts'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El dueño, 11/09/2026: «es realmente muy difícil de entender lo que hiciste en la sección Cobranzas
// dentro de Clientes». La causa medida no era estética: el encabezado de cada trabajo publicaba
// «facturado · cobrado · pendiente» con TRES DENOMINADORES DISTINTOS —`totalesDeCobranzas.facturado`
// cuenta sólo las filas B; `cobrado` y `pendiente` cuentan B+N—, así que por construcción no podían
// sumar las filas que tenían debajo. «ME - PLAYÓN DE AZUFRE» decía «facturado $78,0 M» arriba de
// renglones que sumaban $114,9 M.
//
// La corrección fue que los bloques publiquen `totalDeFilas(filas)` —la suma exacta de lo que se
// ve— y que `totalesDeCobranzas` quede SÓLO para la tira de cifras del cliente.
//
// Esta prueba existe porque los tests del servicio no pueden atraparlo: prueban que `totalDeFilas`
// y `totalesDeCobranzas` calculan bien cada uno, no CUÁL de los dos usa el encabezado de un bloque.
// Si mañana alguien vuelve a escribir `totales.facturado` ahí, sin esto ningún test da rojo y el
// defecto vuelve entero. Es la red del ARREGLO, no la de sus piezas.
//
// ═══ POR QUÉ SE LEE LA FUENTE Y NO EL DOM ═══
//
// Renderizar un Server Component de Next en `node --test` exige un runtime que este repo no tiene
// montado. Leer la fuente es más barato y prueba exactamente el invariante que importa: qué función
// llama cada bloque. No reemplaza a mirar la pantalla — eso lo hacen las capturas.

const RUTA = fileURLToPath(new URL('./SolapaCobranzas.tsx', import.meta.url))
const FUENTE = sinComentarios(readFileSync(RUTA, 'utf8'))

/** El cuerpo del componente que dibuja una banda con su total. */
const CUERPO_DE_LA_BANDA = FUENTE.slice(FUENTE.indexOf('function Seccion('))
/** Todo lo que va antes: la cabecera de cifras y el armado de la tabla. */
const CABECERA = FUENTE.slice(0, FUENTE.indexOf('function Seccion('))

test('el archivo sigue teniendo el componente que dibuja una banda', () => {
  // Si se renombra, esta prueba dejaría de mirar nada y habría que actualizarla a conciencia.
  assert.ok(FUENTE.includes('function Seccion('), 'no existe `Seccion`')
})

test('NINGUNA BANDA PUBLICA UN TOTAL QUE NO SEA LA SUMA DE SUS FILAS VISIBLES', () => {
  assert.ok(
    !CUERPO_DE_LA_BANDA.includes('totalesDeCobranzas'),
    'una banda volvió a usar `totalesDeCobranzas`: sus totales dejan de cerrar con sus renglones',
  )
  assert.ok(
    !/\.facturado/.test(CUERPO_DE_LA_BANDA),
    '«facturado» cuenta sólo las filas B: en una banda que muestra B y N no cierra',
  )
  // Y lo que sí tiene que usar: la suma de lo que se ve, y las descomposiciones que cierran.
  assert.ok(CUERPO_DE_LA_BANDA.includes('totalDeFilas(filas)'), 'la banda dejó de sumar sus filas')
  assert.ok(CUERPO_DE_LA_BANDA.includes('totalPorCircuito(filas)'))
  assert.ok(CUERPO_DE_LA_BANDA.includes('vencidoDeFilas(filas)'))
  // Una fila sin importe no suma: si la banda deja de contarlas, el total vuelve a callar algo.
  assert.ok(CUERPO_DE_LA_BANDA.includes('filasSinImporte(filas)'))
})

test('LA CABECERA ES LA POSICIÓN DEL CLIENTE ENTERO: no se mueve con los filtros (dueño, 01/10/2026)', () => {
  // Del 11/09 al 01/10 la cabecera medía el recorte y lo pegaba al rótulo. Con «Por cobrar» elegido
  // decía «COBRADO EN BLANCO · POR COBRAR — nada cobrado en blanco», que el dueño leyó como lo que
  // dice: que el cliente no había pagado nada. La posición se mide sobre TODAS las filas.
  assert.ok(CABECERA.includes('totalesDeCobranzas(filas)'), 'la cabecera dejó de medir al cliente entero')
  assert.ok(!CABECERA.includes('totalesDeCobranzas(visibles)'), 'la cabecera volvió a medir el recorte')
  assert.ok(!FUENTE.includes('conRecorte('), 'volvió el recorte pegado al rótulo de una cifra')
})

test('UNA BANDA FILTRADA DICE QUE ES UNA PARTE: «3 de 11 filas»', () => {
  // Es lo que evita el defecto que la regla anterior quería evitar —dos «por cobrar» con dos
  // números— sin tocar la cabecera: el número de una banda recortada lleva su denominador.
  assert.ok(CABECERA.includes('deCuantas={todas.porCobrar.length}'))
  assert.ok(CABECERA.includes('deCuantas={todas.cobrado.length}'))
  assert.ok(/\$\{filas\.length\} de \$\{deCuantas\} filas/.test(CUERPO_DE_LA_BANDA))
})

test('UNA SOLA TABLA: el encabezado de columnas se dibuja una vez y no hay tablitas por obra', () => {
  assert.equal(FUENTE.split('<EncabezadoDeColumnas').length - 1, 1, 'el encabezado de columnas tiene que aparecer UNA vez')
  assert.ok(!FUENTE.includes('agruparCobranzas('), 'volvió el agrupado por obra: la agenda deja de estar ordenada de corrido')
  assert.ok(!FUENTE.includes('OrdenesDeLaObra'), 'volvió la lista de OC con importes entre los renglones')
})

test('LO COBRADO SE VE SIN BUSCARLO: la banda no nace plegada', () => {
  const cobrado = CABECERA.slice(CABECERA.indexOf('clave="cobrado"'), CABECERA.indexOf('clave="anuladas"'))
  assert.ok(cobrado.length > 0 && !/\bplegada\b/.test(cobrado), '«Cobrado» volvió a nacer plegada')
})

test('la cabecera son CUATRO cifras: contratado, cobrado en blanco, cobrado en negro y falta cobrar (dueño 24/09)', () => {
  for (const r of ['Contratado', 'Cobrado en blanco', 'Cobrado en negro', 'Falta cobrar']) assert.ok(CABECERA.includes(`'${r}'`), r)
  for (const r of ["'Vencido'", "'Facturado (B)'", "'Cobrado c/IVA'", "'Próximo cobro'"]) assert.ok(!CABECERA.includes(r), `volvió ${r} a la cabecera`)
})
