// LAS LETRAS DE _ARCA_RAW SALEN DEL ORDEN DE SUS RÓTULOS, DECLARADO UNA SOLA VEZ (14/09/2026).
//
// Era un mapa de letras tipeado al lado de `COLUMNAS`. Si alguien agrega o reordena una columna de la
// réplica y no toca el mapa, la verificación de lo escrito y todo lo que cite `COL` leen la de al lado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CLAVES, COL, COLUMNAS } from './arca-raw-pestana.mjs'

test('COL es la posición de cada rótulo de COLUMNAS, con las letras que la pestaña ya tenía', () => {
  assert.deepEqual({ ...COL }, {
    periodo: 'A', libro: 'B', fecha: 'C', tipo: 'D', codigo: 'E', signo: 'F',
    puntoVenta: 'G', numero: 'H', cuit: 'I', nombre: 'J', neto: 'K', iva: 'L', total: 'M',
  })
  assert.equal(CLAVES.length, COLUMNAS.length)
  const rotuloDe = (k) => COLUMNAS[CLAVES.indexOf(k)][0]
  assert.deepEqual(['periodo', 'signo', 'cuit', 'total'].map(rotuloDe), ['Período', 'Signo', 'CUIT', 'Total'])
})

// ═══ LA COLA DETRÁS DE UN HUECO (17/09/2026) ═══
//
// La réplica tenía 767 filas con 684 comprobantes: las filas 709–770 eran 62 duplicados de una
// corrida vieja. La limpieza del pie miraba sólo hasta `datos + FILA0 + 20` (= 708) y nunca los veía:
// el hueco vacío 688–708 caía entero adentro del tope y la cola real quedaba afuera. El IVA de agosto
// del Sheet salió inflado en $2,1M de débito y $1,5M de crédito.
import { conColaMedidaLeida } from '../lib/cola-de-rango.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { topeDeCola, FILA0 } from './arca-raw-pestana.mjs'

test('la cola se barre hasta el final real de la hoja aunque haya un bloque vacío en el medio', async () => {
  const ancho = COLUMNAS.length
  const n = 684
  const filasHoja = 770
  const filaDato = (i) => Array.from({ length: ancho }, (_, j) => (j === ancho - 1 ? 1000 + i : `x${i}`))
  // La hoja hoy: 3 filas de cabecera + 684 datos, hueco 688–708, duplicados viejos 709–770.
  const hoy = []
  for (let i = 0; i < 3; i++) hoy.push(['cab'])
  for (let i = 0; i < n; i++) hoy.push(filaDato(i))
  while (hoy.length < 708) hoy.push([])
  while (hoy.length < filasHoja) hoy.push(filaDato(hoy.length))
  const google = {
    async readSheetValues(_id, rango) {
      const hasta = Number(rango.match(/(\d+)$/)[1])
      return hoy.slice(0, hasta)
    },
  }
  const grid = hoy.slice(0, 3 + n)
  const filasNecesarias = n + FILA0 + 20
  const tope = topeDeCola({ filasHoja, filasNecesarias })
  const cola = await conColaMedidaLeida(google, 'ID', '_ARCA_RAW', grid, { ancho, tope })
  assert.equal(cola.hasta, 770, 'tiene que ver la última fila con dato, la 770')
  assert.equal(cola.filas.length, 770)
  assert.ok(cola.filas.slice(708).every((f) => f.every((c) => c === VACIO)), 'las filas 709–770 van con VACIO')
})

test('el tope nunca queda por debajo de lo que necesita la corrida (hoja chica o sin dato de filas)', () => {
  assert.equal(topeDeCola({ filasHoja: 100, filasNecesarias: 708 }), 708)
  assert.equal(topeDeCola({ filasHoja: undefined, filasNecesarias: 708 }), 708)
  assert.equal(topeDeCola({ filasHoja: 770, filasNecesarias: 708 }), 770)
})
