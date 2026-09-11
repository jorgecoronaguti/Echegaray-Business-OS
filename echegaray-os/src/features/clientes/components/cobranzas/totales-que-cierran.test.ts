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

/** El cuerpo de los dos componentes que dibujan un bloque con su total. */
const CUERPO_DE_LOS_BLOQUES = FUENTE.slice(FUENTE.indexOf('function Seccion('))

test('el archivo sigue teniendo los dos componentes que dibujan un bloque', () => {
  // Si se renombran, esta prueba dejaría de mirar nada y habría que actualizarla a conciencia.
  assert.ok(FUENTE.includes('function Seccion('), 'no existe `Seccion`')
  assert.ok(CUERPO_DE_LOS_BLOQUES.includes('function GrupoDeTrabajo('), 'no existe `GrupoDeTrabajo`')
})

test('NINGÚN BLOQUE PUBLICA UN TOTAL QUE NO SEA LA SUMA DE SUS FILAS VISIBLES', () => {
  assert.ok(
    !CUERPO_DE_LOS_BLOQUES.includes('totalesDeCobranzas'),
    'un bloque volvió a usar `totalesDeCobranzas`: sus totales dejan de cerrar con sus renglones',
  )
  assert.ok(
    !/\.facturado/.test(CUERPO_DE_LOS_BLOQUES),
    '«facturado» cuenta sólo las filas B: en el encabezado de un bloque que muestra B y N no cierra',
  )
  // Y lo que sí tiene que usar: la suma de lo que se ve, y las descomposiciones que cierran.
  assert.ok(CUERPO_DE_LOS_BLOQUES.includes('totalDeFilas(filas)'), 'el bloque dejó de sumar sus filas')
  assert.ok(CUERPO_DE_LOS_BLOQUES.includes('totalPorCircuito(filas)'))
  assert.ok(CUERPO_DE_LOS_BLOQUES.includes('vencidoDeFilas(filas)'))
  // Una fila sin importe no suma: si el bloque deja de contarlas, el total vuelve a callar algo.
  assert.ok(CUERPO_DE_LOS_BLOQUES.includes('filasSinImporte(filas)'))
})

test('la tira de cifras mide LO QUE SE ESTÁ VIENDO, no la pestaña entera', () => {
  // Con un recorte puesto (`?cob=n`), medir sobre todas las filas ponía POR COBRAR $114.916.324 en
  // la cabecera arriba de una banda que decía $18.750.000: dos rótulos iguales, dos números.
  const cabecera = FUENTE.slice(0, FUENTE.indexOf('function Seccion('))
  assert.ok(cabecera.includes('totalesDeCobranzas(visibles)'), 'la cabecera volvió a medir sin el recorte')
  assert.ok(cabecera.includes('proximoCobro(visibles)'))
  assert.ok(
    !cabecera.includes('totalesDeCobranzas(filas)') && !cabecera.includes('proximoCobro(filas)'),
    'quedó una medición sobre la pestaña entera conviviendo con las bandas recortadas',
  )
})
