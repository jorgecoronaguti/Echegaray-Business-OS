import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ LA CUENTA CORRIENTE Y EL ESQUEMA DE PAGO CONTRA EL HANDOFF CRM v4 ═══
//
// El dueño, el 05/09/2026: «no hay exactitud entre el diseño y el zip». Este archivo fija lo que se
// midió, para que la próxima pasada no lo vuelva a correr sin darse cuenta.
//
// EL CONTRATO son dos archivos de `design_handoff_crm_v4`: el README —que es el que manda cuando
// los dos mockups difieren— y `CRM · Lo que faltaba (cobranza, esquema, contacto).dc.html`. Las
// grillas se verifican LITERALES: son el número que el dueño compara contra la captura.
//
// LOS DEFECTOS QUE ATRAPA:
//
//  · QUE VUELVA LA GRILLA VIEJA. Seis columnas con REPARO y GESTIÓN, sin EMITIDO, y anchos que no
//    son los del handoff. Es exactamente lo que el dueño encontró mirando la pantalla.
//  · EL PADDING COMPENSATORIO DE LA FILA ELEGIDA. El `.dc.html` le suma 11px y el README lo
//    prohíbe: la fila se desalinea de su cabecera y se lee como si estuviera mal cargada.
//  · QUE EL COLOR VUELVA A PINTAR EL FONDO. Las tarjetas del calendario y la banda de observación
//    tenían fondo de color; la v4 deja el color en un filo y el fondo blanco.
//  · PUBLICAR UN CERO POR UNA AUSENCIA. Al reacomodar columnas es donde se cuela un `$ 0,00 M` en
//    lugar de «sin retención cargada», o un «cobrado» donde el OS sólo puede decir «encolado».
//
// Si el contrato de diseño cambia, ACÁ se cambia el número y se explica en el commit. Editar el
// test para que pase sin abrir el `.dc.html` es volver a la pantalla que el dueño rechazó.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')

const sinComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const tabla = () => sinComentarios(fuente('cuenta/TablaCertificados.tsx'))
const panel = () => sinComentarios(fuente('cuenta/PanelCertificado.tsx'))
const listado = () => sinComentarios(fuente('esquema/ListadoEsquema.tsx'))
const calendario = () => sinComentarios(fuente('esquema/CalendarioEsquema.tsx'))

// ── LA TABLA DE CERTIFICADOS ────────────────────────────────────────────────────────────────────

test('la tabla de certificados tiene la grilla del README, no la de la tanda anterior', () => {
  const src = tabla()
  assert.match(src, /const COLS = 'minmax\(190px,1\.5fr\) 96px 108px 116px 132px'/)
  assert.match(src, /gap: '14px'/)
  assert.doesNotMatch(src, /minmax\(0,1\.7fr\)/, 'volvió la grilla de seis columnas')
})

test('las cinco columnas son DOCUMENTO · EMITIDO · VENCE · MONTO · ESTADO', () => {
  const src = tabla()
  const rotulos = [...src.matchAll(/>([A-ZÁÉÍÓÚ]{4,})</g)].map((m) => m[1])
  assert.deepEqual(rotulos, ['DOCUMENTO', 'EMITIDO', 'VENCE', 'MONTO', 'ESTADO'])
})

test('la fila mide 54px y la elegida NO corre su contenido', () => {
  // El `.dc.html` dibuja `padding-left:11px` en la fila elegida; el README lo prohíbe con todas las
  // letras. Con el padding, la fila elegida deja de estar alineada con su encabezado.
  const src = tabla()
  assert.match(src, /minHeight: '54px'/)
  assert.match(src, /boxShadow: sel \? `inset 2px 0 0 \$\{C\.marca\}` : undefined/)
  assert.doesNotMatch(src, /paddingLeft: sel/, 'volvió el padding compensatorio de la fila elegida')
  assert.doesNotMatch(src, /inset 3px 0 0/, 'el filo de la fila volvió a 3px')
})

test('el rótulo y el color de los siete estados salen del servicio, no de un mapa de la tabla', () => {
  // Tener el mapa dos veces es garantizar que un día «aprobado» sea verde en la tabla y azul en el
  // panel. `propiedadesCertificado.ts` es la única definición y se prueba con `node --test`.
  const src = tabla()
  assert.match(src, /import \{ COLOR_ESTADO, ROTULO_ESTADO \} from '\.\.\/\.\.\/services\/propiedadesCertificado'/)
  assert.doesNotMatch(src, /'#175CD3'|'#067647'|'#B42318'/, 'volvió un color de estado escrito a mano')
})

test('cada ausencia de la fila lleva su palabra, y ninguna es un cero', () => {
  const src = tabla()
  assert.match(src, /'sin obra asociada'/)
  assert.match(src, /'sin factura'/)
  assert.doesNotMatch(src, /\$ 0/, 'la tabla escribió un cero por una ausencia')
})

// ── EL PANEL DEL CERTIFICADO ────────────────────────────────────────────────────────────────────

test('las propiedades del panel van en grilla 120px 1fr y sin un filo por renglón', () => {
  const src = panel()
  assert.match(src, /gridTemplateColumns: '120px 1fr', gap: '12px'/)
  assert.match(src, /padding: '5px 0'/)
  const bloque = src.slice(src.indexOf('data-testid="panel-propiedades"'), src.indexOf('documento.observacion'))
  assert.doesNotMatch(bloque, /borderBottom/, 'volvió el hairline debajo de cada propiedad')
  assert.doesNotMatch(bloque, /PROPIEDADES/, 'volvió el rótulo del bloque')
})

test('la observación es un filo ámbar, no una banda con fondo', () => {
  const src = panel()
  const bloque = src.slice(src.indexOf('{documento.observacion && ('), src.indexOf('DEL CERTIFICADO AL COBRO'))
  assert.match(bloque, /boxShadow: `inset 2px 0 0 \$\{C\.warn\}`/)
  assert.doesNotMatch(bloque, /background: C\.warnFondo/, 'volvió el fondo ámbar del bloque entero')
})

test('las cuatro acciones que no existen se leen por su nombre, no por un ícono', () => {
  const src = panel()
  assert.match(src, /texto: 'Recordatorio'/)
  assert.match(src, /texto: 'Promesa de pago'/)
  assert.match(src, /texto: 'Comprobante'/)
  assert.match(src, /texto: 'Escalar'/)
  assert.doesNotMatch(src, /BotonIcono titulo="Enviar recordatorio"/, 'volvieron los cuadraditos con ícono')
})

test('cada acción inexistente dice SU motivo, y son cuatro motivos distintos', () => {
  const src = panel()
  const motivos = [...src.matchAll(/^\s*'?(?:Enviar recordatorio|Registrar promesa de pago|Descargar comprobante|Escalar)'?:\s*'([^']+)'/gm)]
    .map((m) => m[1])
  assert.equal(motivos.length, 4)
  assert.equal(new Set(motivos).size, 4, 'dos acciones comparten el mismo motivo')
})

test('el panel no canta victoria: el cobro queda ENCOLADO', () => {
  const src = panel()
  assert.match(src, /Encolando…/)
  assert.match(src, /Encolado\. El cobro queda registrado cuando el worker escribe la fila/)
})

test('el medio de pago es una opción subrayada y sigue siendo un radio de verdad', () => {
  // Sin el `input`, el `FormData` viaja sin `medio` y la acción lo rechaza; y un lector de pantalla
  // deja de anunciar el grupo. El handoff cambia el aspecto, no el control.
  const src = panel()
  assert.match(src, /boxShadow: medio === m \? `inset 0 -2px 0 \$\{C\.grafito\}` : undefined/)
  assert.match(src, /type="radio" name="medio"/)
  assert.match(src, /outline: foco === m/, 'el foco del teclado dejó de dibujarse sobre la palabra')
})

// ── EL LISTADO DEL ESQUEMA ──────────────────────────────────────────────────────────────────────

test('el listado del esquema tiene la grilla de siete columnas del handoff', () => {
  const src = listado()
  assert.match(src, /const COLS = '30px minmax\(190px,1\.5fr\) 110px 150px 70px 150px 28px'/)
  assert.match(src, /gap: '28px'/)
  assert.match(src, /minHeight: '68px'/)
  assert.doesNotMatch(src, /112px minmax\(0,1\.5fr\)/, 'volvió la grilla anterior')
})

test('las columnas del esquema son HITO · PREVISTO · IMPORTE · % · ESTADO', () => {
  const src = listado()
  const cabecera = src.slice(src.indexOf("height: '40px'"), src.indexOf('{pagos.map('))
  const rotulos = [...cabecera.matchAll(/>([A-ZÁÉÍÓÚ%]+)</g)].map((m) => m[1])
  assert.deepEqual(rotulos, ['HITO', 'PREVISTO', 'IMPORTE', '%', 'ESTADO'])
})

test('la fecha del listado sigue siendo el control que escribe, y un cobrado no se mueve', () => {
  // La fecha ES la columna Q de Cobranzas: si deja de ser editable en la fila, la palanca del cobro
  // se pierde. Y la de un cobro registrado es un hecho del banco: no se corrige desde acá.
  const src = listado()
  assert.match(src, /<FechaEnLaFila/)
  assert.match(src, /deshabilitado=\{estado === 'cobrado'\}/)
})

test('el porcentaje no se calcula sobre un total que no contiene a ese pago', () => {
  // Doce de las 108 filas reales están en dólares y quedan fuera del total en pesos: dividirlas
  // igual daría un porcentaje inventado. Va «—».
  const src = listado()
  assert.match(src, /const enElTotal = \(p\.moneda \?\? 'ARS'\) === 'ARS' && total\.monto > 0/)
  assert.match(src, /const pct = enElTotal \? .+ : '—'/)
})

test('el total declara los pagos que dejó afuera', () => {
  assert.match(listado(), /en otra moneda, fuera del total/)
})

test('la visibilidad del pago se dice con TRES frases, no con un interruptor de dos estados', () => {
  // La RLS del portal exige `visible_portal` Y `publicado_at`: hay tres formas de que el cliente no
  // esté viendo lo que la pantalla muestra y significan cosas opuestas. `marcaDelPago` es la regla,
  // y está probada sin React.
  const src = listado()
  assert.match(src, /marcaDelPago/)
  assert.doesNotMatch(src, /<Interruptor/, 'volvió el interruptor de dos estados a la fila')
})

// ── EL CALENDARIO ───────────────────────────────────────────────────────────────────────────────

test('la tarjeta del pago es blanca con un filo de 3px por estado', () => {
  const src = calendario()
  assert.match(src, /borderRadius: '0 6px 6px 0', background: C\.superficie/)
  assert.match(src, /borderLeft: `3px solid \$\{pinta\.filo\}`/)
  assert.doesNotMatch(src, /background: pinta\.fondo/, 'volvió el fondo de color de la tarjeta')
})

test('«hoy» es sólo el recuadro amarillo: no lleva fondo', () => {
  const src = calendario()
  assert.match(src, /boxShadow: esHoy \? `inset 0 0 0 2px \$\{C\.marca\}` : undefined/)
  assert.doesNotMatch(src, /esHoy \? C\.marcaTenue/, 'volvió el tinte de fondo del día de hoy')
})

test('la celda del día mide 104px de alto mínimo', () => {
  assert.match(calendario(), /minHeight: '104px'/)
})

test('un cobrado no se arrastra, y lo dice', () => {
  const src = calendario()
  assert.match(src, /draggable=\{!fijo\}/)
  assert.match(src, /'Cobrado: su fecha no se mueve'/)
})

test('arrastrar encola y lo dice: no publica la fecha nueva al cliente', () => {
  assert.match(calendario(), /encolado a la columna Q, sin publicar/)
})
