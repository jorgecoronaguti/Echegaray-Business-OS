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

// ── LA GEOMETRÍA DEL HANDOFF v4 ──────────────────────────────────────────────────────────────────

test('«las filas que va a mover» es una grilla con cabecera, no cinco anchos sueltos', () => {
  // ═══ EL CONTRATO ═══
  //
  // `Pendientes de imputación · una pantalla.dc.html:115-119`:
  //   `120px 100px minmax(0,1.6fr) minmax(0,1fr) 140px`, gap 28, sangría 16, fila de 66px
  //   TIPO · FECHA · DESCRIPCIÓN · RECURSO · IMPORTE, con su encabezado de 40px
  //
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Dos, y son el mismo de fondo: la fila decidía sus anchos por su cuenta.
  //
  //   1. NO HABÍA CABECERA. Cinco celdas mudas, y la de 150px que dice «Corralón Progreso» se lee
  //      igual de bien como descripción que como recurso: quien mira tiene que adivinar cuál es
  //      cuál para decidir de quién es el costo.
  //   2. ERA UN `flex` CON TODOS LOS HIJOS EN `shrink-0`. Una celda que no encoge no se recorta:
  //      DESBORDA sobre la de al lado, y en angosto el importe se montaba sobre el recurso. Ésa es
  //      la trampa que este repo ya pagó en la lista de clientes.
  //
  // Que la cabecera y la fila compartan `gridDe()` es lo que impide que vuelvan a divergir: si
  // alguien agrega una columna en un lado y no en el otro, no hay dónde escribir el desajuste.
  const src = decision()
  assert.ok(
    src.includes('grid-cols-[120px_100px_minmax(0,1.6fr)_minmax(0,1fr)_140px]'),
    'la grilla dejó de ser la del handoff v4',
  )
  assert.ok(
    src.includes('grid-cols-[100px_minmax(0,1.6fr)_minmax(0,1fr)_140px]'),
    'la variante sin TIPO dejó de ser la misma grilla menos su primera pista',
  )
  assert.match(src, /<CabeceraFilas conTipo=/, 'las columnas volvieron a quedar mudas')
  // Cabecera y fila salen de la MISMA función: dos llamadas, ninguna clase de grilla suelta.
  assert.equal((src.match(/gridDe\(conTipo\)/g) ?? []).length, 2)
  assert.match(src, /min-h-\[66px\]/, 'la fila perdió su alto mínimo')
  // Y ninguna celda vuelve a ser `shrink-0`: en una grilla la pista manda, y un `shrink-0` ahí
  // desborda sobre la columna vecina en vez de recortarse.
  const desde = src.indexOf('function FilaQueSeMueve')
  const cuerpo = src.slice(desde, src.indexOf('export function DecisionPendiente', desde))
  assert.ok(cuerpo.length > 200, 'no se pudo aislar la fila: el corte quedó vacío')
  assert.equal(/shrink-0/.test(cuerpo), false,
    'volvió una celda que no encoge: desborda sobre la de al lado')
})

test('las clases de grilla van literales: Tailwind no compila una clase armada en runtime', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Escribir `grid-cols-[${COLS}]`. TypeScript compila, el test de columnas pasa leyendo la
  // constante, y en el navegador la fila se dibuja SIN NINGUNA GRILLA: Tailwind escanea el texto
  // del archivo y nunca ve la clase entera. Es un modo de falla que sólo se ve mirando la pantalla.
  const src = decision()
  assert.equal(/grid-cols-\[\$\{/.test(src), false, 'una clase de grilla se arma concatenando')
})
