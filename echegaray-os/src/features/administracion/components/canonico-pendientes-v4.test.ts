import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ «PENDIENTES DE IMPUTACIÓN», VERIFICADO CONTRA EL FUENTE ═══
//
// Mismo método que `canonico-proveedores-v2.test.ts`: se protegen DECISIONES ESCRITAS sobre qué
// dato se dibuja y cuál no, no un comportamiento de render. La aritmética de la pantalla —el
// resumen que se mueve con la cola, las cuatro clasificaciones— ya se prueba de verdad en
// `services/pendientesVista.test.ts`; acá se vigila lo que sólo vive en el componente.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')

const sinComentarios = (texto: string) => texto
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const decision = () => sinComentarios(fuente('DecisionPendiente.tsx'))

test('el recurso tiene celda propia: en una compra ES el proveedor, y con eso se decide', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // El recurso y el importe compartían la última celda con un ternario: se dibujaba el importe, y
  // el recurso SÓLO cuando el importe era nulo. En herramientas y movimientos alcanzaba —esas filas
  // mueven un recurso y no plata—, pero en compras el recurso es EL PROVEEDOR y esas filas siempre
  // tienen importe. La pantalla que pregunta «¿de quién es este costo?» escondía justo el dato con
  // el que se contesta, y que además es la evidencia B del sugeridor.
  const src = decision()
  assert.match(src, /data-testid="fila-recurso"/)
  assert.doesNotMatch(
    src,
    /f\.importe != null \? plata\(f\.importe\) : \(f\.recurso/,
    'el recurso volvió a esconderse detrás del importe',
  )
})

test('una fila que mueve un recurso y no plata dice «sin importe», nunca $ 0', () => {
  const src = decision()
  assert.match(src, /'sin importe'/)
  assert.doesNotMatch(src, /plata\(f\.importe \?\? 0\)/)
  // Y una fila sin proveedor cargado lo dice: un guión ahí se lee como «no aplica».
  assert.match(src, /f\.recurso \?\? 'sin recurso'/)
})

test('la columna TIPO sólo aparece cuando el grupo mezcla fuentes', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Una columna constante. El encabezado del grupo ya dice «Aparece en Compras»; repetir esa
  // palabra en las veinte filas gasta el ancho que necesita la descripción, que es lo único que
  // identifica cada fila. Es la misma decisión que sacó la columna TIPO del maestro de proveedores.
  const src = decision()
  assert.match(src, /conTipo=\{g\.tipos\.length > 1\}/)
  assert.match(src, /\{conTipo && \(/)
})

test('la trazabilidad de la fila sigue siendo tabla + identificador + sincronización', () => {
  // Sin el identificador, «salió de compras» no permite ir a buscar el comprobante y confirmarlo.
  // Este test existe para que el rediseño de la fila no se lo lleve puesto de paso.
  assert.match(decision(), /\{f\.tabla\}\{f\.referencia \? ` · \$\{f\.referencia\}` : ''\}/)
})
