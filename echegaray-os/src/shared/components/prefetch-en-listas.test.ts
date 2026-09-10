import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sinComentarios } from '../definiciones/fuente.ts'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El dueño, 25/08/2026: *"todo app.ecsas.com.ar es MUY lento, tenes q optimizar la carga de todas las
// pantallas"*. Instrumentando el middleware apareció el motivo, y no era ninguna consulta: era la
// PRECARGA.
//
// Next precarga solo los `<Link>` que entran en pantalla. En este OS hay dos formas de dibujar
// muchísimos `<Link>` de golpe:
//
//   · las pastillas de filtro, que apuntan a LA MISMA pantalla con otra query;
//   · el nombre de cada fila de una tabla, uno por registro.
//
// Como todos entran en pantalla, abrir UNA lista disparaba un render de servidor COMPLETO por cada
// enlace dibujado — cada uno con sus consultas y su pasada por el middleware. Medido el 25/08 con el
// middleware instrumentado, UNA visita de una persona:
//
//   /documentos ····················· 77 pasadas por el middleware
//   /administracion/proveedores ····· 51
//   /clientes ······················· 14
//   una pantalla sin listas ·········  3
//
// O sea 74 renders de `/documentos` para dibujar `/documentos` una vez: un usuario abriendo una lista
// ocupaba el servidor como setenta. Con `prefetch={false}` en esos enlaces, `/documentos` bajó a 24
// pedidos totales y su tiempo hasta contenido de 4.671 ms a 2.311 ms.
//
// Precargar ahí además no compra NADA: el destino es `force-dynamic`, así que el payload precargado no
// se reusa cuando la persona hace clic.
//
// ESTE TEST LEE EL CÓDIGO, y es a propósito: el defecto no se ve en ninguna pantalla —todo funciona,
// sólo que lento— y no hay valor de retorno que comprobar. Lo único que lo delata es el atributo. Si
// alguien lo saca, esto se pone rojo.
//
// NO ES UNA REGLA CONTRA `prefetch` EN GENERAL. La navegación de verdad —la marca, las áreas del
// header, un botón que lleva a otra pantalla— sigue precargando: son pocos y se usan. La regla es
// para los enlaces que se dibujan UNO POR FILA o UNO POR FILTRO.
//
// ═══ TRES TABLAS FALTAN A PROPÓSITO (25/08/2026) ═══
//
// `TablaProveedores`, `TablaNombres` y `TablaPendientes` tienen el mismo defecto y NO están en la
// lista: los está reescribiendo enteros otro frente en este mismo momento. Tocarlos desde acá sería
// un conflicto que alguien tiene que resolver dos veces a mano, o directamente trabajo perdido en el
// merge. El arreglo es de una línea —`prefetch={false}` en el `<Link>` del nombre de la fila— y le
// corresponde a quien sea dueño de esas pantallas. Cuando entre, se agregan acá y este test las
// cuida igual que a las demás.

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Cada entrada es un enlace que se dibuja N veces por pantalla. El ancla es el `href` —lo único
 * estable del `<Link>`— y a partir de ahí se lee el bloque de atributos.
 */
const ENLACES_MULTIPLICADOS: { archivo: string; ancla: string; porque: string }[] = [
  // ── LAS PASTILLAS DE FILTRO: apuntan a la misma pantalla con otra query.
  { archivo: 'features/administracion/components/Controles.tsx', ancla: 'href={o.href}', porque: 'FiltrosURL — una pastilla por filtro (documentos, proveedores, clientes)' },
  { archivo: 'shared/components/canon/ChipsCanon.tsx', ancla: 'href={o.href}', porque: 'ChipsCanon — las pastillas del canónico' },

  // ── EL NOMBRE DE CADA FILA: uno por registro de la tabla.
  { archivo: 'features/documentos/components/TablaDocumentos.tsx', ancla: "href={hrefs[d.drive_file_id] ?? '#'}", porque: 'un documento por fila, y son hasta 50' },
  { archivo: 'features/administracion/components/TablaCompras.tsx', ancla: 'href={hrefDe(c.id)}', porque: 'un comprobante por fila' },
  { archivo: 'features/administracion/components/TablaComprasSheet.tsx', ancla: 'href={hrefDe(f.fila)}', porque: 'una fila del Sheet por fila' },
  { archivo: 'features/administracion/components/TablaCuadrillas.tsx', ancla: 'href={hrefDe(c.id)}', porque: 'una cuadrilla por fila' },
  { archivo: 'features/administracion/components/GrillaSemana.tsx', ancla: 'href={`/administracion/personas/${f.persona.persona_id}`}', porque: 'una persona por fila de la semana' },
  { archivo: 'features/administracion/components/PoolSinCuadrilla.tsx', ancla: 'href={`/administracion/personas/${p.id}`}', porque: 'una persona por ficha suelta' },
  { archivo: 'features/clientes/components/TablaClientes.tsx', ancla: 'href={hrefDe(c.cliente_id)}', porque: 'un cliente por fila' },
  { archivo: 'features/clientes/components/TablaClientes.tsx', ancla: 'href={`/obras/${o.obra_id}`}', porque: 'una obra en ejecución por cliente' },
  { archivo: 'features/presupuestos/components/ListaPresupuestos.tsx', ancla: 'href={`/presupuestos/${p.id}`}', porque: 'un presupuesto por fila' },
  { archivo: 'features/presupuestos/components/TablaPartidas.tsx', ancla: 'href={`${base}?partida=${p.partida_id}`}', porque: 'una partida por fila' },
]

/** El bloque de atributos del `<Link>` que contiene ese `href`: del `<Link` anterior al `>` que cierra. */
function atributosDelEnlace(fuente: string, ancla: string): string | null {
  const donde = fuente.indexOf(ancla)
  if (donde < 0) return null
  const abre = fuente.lastIndexOf('<Link', donde)
  if (abre < 0) return null
  // El `>` que cierra la etiqueta: el primero que no está dentro de una llave de JSX.
  let llaves = 0
  for (let i = abre; i < fuente.length; i++) {
    const c = fuente[i]
    if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0) return fuente.slice(abre, i)
  }
  return null
}

for (const { archivo, ancla, porque } of ENLACES_MULTIPLICADOS) {
  test(`no precarga: ${archivo} · ${porque}`, () => {
    const fuente = readFileSync(RAIZ + archivo, 'utf8')
    const atributos = atributosDelEnlace(fuente, ancla)

    // Que el ancla no aparezca NO es un aprobado: significa que el enlace se movió y este test dejó
    // de mirar nada. Se pone rojo y se corrige la lista.
    assert.notEqual(
      atributos, null,
      `no encontré el <Link> con ${ancla} en ${archivo}: el enlace se movió y este test quedó mirando al aire`,
    )
    assert.match(
      atributos as string, /prefetch=\{false\}/,
      `${archivo} dibuja un <Link> por fila/filtro (${porque}) SIN prefetch={false}: cada uno dispara un `
      + 'render de servidor completo del destino. Es lo que hacía que abrir /documentos costara 77 pasadas '
      + 'por el middleware.',
    )
  })
}

// ═══ LA LISTA DE ARRIBA NO ALCANZÓ, Y SE PUEDE PROBAR (07/09/2026) ═══
//
// La lista es a mano, y por eso no viaja: el rediseño v2 reemplazó `FiltrosURL` por `FiltrosSuaves`
// —otro archivo, mismo control— y el `prefetch={false}` se quedó en el componente viejo. Medido con
// el navegador contra `next start`, una sola visita disparaba renders de servidor completos que
// nadie pidió:
//
//   /documentos ······················ 25
//   /administracion/compras ·········· 11
//   /administracion/personas ·········  9
//   /clientes ························  7
//   /presupuestos ····················  4
//
// O sea el defecto que este archivo dice cuidar estaba VIVO en las mismas cinco pantallas, con el
// test en verde. Un control cuya lista se mantiene a mano no puede decir que no hay más casos: sólo
// puede decir que los que alguien anotó siguen ahí.
//
// ESTE BARRIDO NO TIENE LISTA. La regla es estructural y se lee del código: un `<Link>` escrito
// DENTRO de un `.map(` se dibuja una vez por dato, y todos entran en pantalla juntos. Un enlace
// suelto —«Ver todo», la marca, un botón que lleva a otra pantalla— no está adentro de ningún
// `.map(` y este barrido ni lo mira, que es exactamente la línea que el bloque de arriba declara.

/** El `)` que cierra el `(` que empieza en `abre`. */
function cierreDeParentesis(fuente: string, abre: number): number {
  let n = 0
  for (let i = abre; i < fuente.length; i++) {
    if (fuente[i] === '(') n++
    else if (fuente[i] === ')') { n--; if (n === 0) return i }
  }
  return fuente.length
}

// `sinComentarios` SE MUDÓ a `shared/definiciones/fuente.ts` (10/09/2026). Nació acá —este barrido
// acusó a `TablaClientes.tsx:229`, que es un comentario que explica dónde vive el alto de la fila—
// y el control de definiciones canónicas necesita exactamente lo mismo. Se comparte en lugar de
// copiarse: dos copias de la misma lectura es el defecto que aquel control existe para impedir, una
// capa más abajo. Se re-exporta porque hay quien la importa por este nombre.
export { sinComentarios }

/** Los `<Link>` de `fuente` que están adentro de algún `.map(`, con su línea. */
export function enlacesMultiplicados(fuenteCruda: string): { linea: number; atributos: string }[] {
  const fuente = sinComentarios(fuenteCruda)
  const rangos: [number, number][] = []
  for (let m = fuente.indexOf('.map('); m >= 0; m = fuente.indexOf('.map(', m + 1)) {
    rangos.push([m, cierreDeParentesis(fuente, m + 4)])
  }
  const salida: { linea: number; atributos: string }[] = []
  for (let i = fuente.indexOf('<Link'); i >= 0; i = fuente.indexOf('<Link', i + 1)) {
    if (!rangos.some(([d, h]) => i > d && i < h)) continue
    let llaves = 0
    let fin = fuente.length
    for (let j = i; j < fuente.length; j++) {
      const c = fuente[j]
      if (c === '{') llaves++
      else if (c === '}') llaves--
      else if (c === '>' && llaves === 0) { fin = j; break }
    }
    salida.push({ linea: fuente.slice(0, i).split('\n').length, atributos: fuente.slice(i, fin) })
  }
  return salida
}

test('ningún <Link> dentro de un .map() precarga', () => {
  const archivos = execFileSync('find', [RAIZ, '-name', '*.tsx'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
  // Que no encuentre archivos sería un verde vacío: el barrido tiene que haber mirado algo.
  assert.ok(archivos.length > 100, `sólo encontré ${archivos.length} .tsx: el barrido no miró el repo`)
  const culpables: string[] = []
  for (const archivo of archivos) {
    for (const { linea, atributos } of enlacesMultiplicados(readFileSync(archivo, 'utf8'))) {
      if (!/prefetch=\{false\}/.test(atributos)) {
        culpables.push(`${archivo.replace(RAIZ, '')}:${linea}`)
      }
    }
  }
  assert.deepEqual(
    culpables, [],
    'estos <Link> se dibujan uno por dato y precargan: cada uno dispara un render de servidor '
    + 'completo del destino, que además es force-dynamic y no se reusa al hacer clic. '
    + `Poné prefetch={false}:\n  ${culpables.join('\n  ')}`,
  )
})

test('un <Link> nombrado en un comentario dentro del .map() no cuenta', () => {
  // EL DEFECTO QUE ATRAPA: el barrido leyó «el alto vive en el `<Link>`» de un comentario de
  // TablaClientes.tsx:229 como si fuera un enlace sin prefetch, y puso rojo un archivo correcto.
  const fuente = [
    'export function X({ filas }) {',
    '  return filas.map((f) => {',
    '    // el alto vive en el `<Link>`, que es el contenedor',
    '    /* otro <Link> en bloque */',
    '    return <Link href={`/x/${f.id}`} prefetch={false}>{f.nombre}</Link>',
    '  })',
    '}',
  ].join('\n')
  const hallados = enlacesMultiplicados(fuente)
  assert.equal(hallados.length, 1, 'sólo el <Link> real')
  assert.equal(hallados[0].linea, 5)
  assert.match(hallados[0].atributos, /prefetch=\{false\}/)
})
