// LA CAPA FÓSIL DE `cash-flow-lineas.mjs`, CLAVADA CON UN TEST (09/09/2026).
//
// EL DEFECTO QUE ATRAPA: `formulaMesConProyeccion`, `origenProyeccion`, `rubrosDeTabla` y la tabla
// `PROYECCION` que los tres leen NO gobiernan ninguna celda viva del Cash Flow. La línea
// «Nómina · Jornales de obra» del Cash Flow Mensual sale del libro `_MOVIMIENTOS` (estado
// PROYECTADO/VENCIDO/COMPROMETIDO + rubro), y las quincenas proyectadas las inyecta
// `libro-movimientos-pestana.mjs` vía `lib/libro-extractores-nomina.mjs`, que lee
// `JORNALES_PROY_TOTAL` de «Jornales por Quincena». Auditado el 09/09: cero consumidores en
// producción.
//
// Un módulo así es peor que código muerto: tiene el nombre de la pregunta correcta («¿cómo se
// proyecta la nómina en el Cash Flow?»), así que el próximo que la haga lo va a leer, lo va a creer
// y va a corregir la proyección en el lugar donde no manda — exactamente lo que pasó con
// `formulaJornales`, cuya nota de $114.371.743 describe un circuito que ya no existe.
//
// SE MARCA EN VEZ DE BORRARSE porque `PROYECCION` sí tiene un consumidor vivo por otro camino
// (`RUBROS_SIN_PROYECCION` → `scripts/generar-migracion-caja.mjs`), y borrar la tabla se lo lleva
// puesto. Este test es la guarda: el día que alguien vuelva a importar una de las tres fósiles desde
// un módulo de producción, se pone rojo y tiene que leer este comentario antes de seguir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const RAIZ = new URL('../', import.meta.url)
const fuentes = () => ['lib', 'scripts'].flatMap((dir) => {
  const base = new URL(`${dir}/`, RAIZ)
  return readdirSync(base)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && f !== 'cash-flow-lineas.mjs')
    .map((f) => ({ archivo: `orquestador/${dir}/${f}`, texto: readFileSync(new URL(f, base), 'utf8') }))
})

/** Lo que NO gobierna ninguna celda: si alguien lo importa, cree que manda y no manda. */
const FOSILES = ['formulaMesConProyeccion', 'origenProyeccion', 'rubrosDeTabla']

test('la capa fósil de la proyección de nómina NO tiene consumidores en producción', () => {
  const todos = fuentes()
  assert.ok(todos.length > 100, `sólo leyó ${todos.length} archivos: el escaneo no está mirando el repo`)
  for (const nombre of FOSILES) {
    const usan = todos.filter((f) => new RegExp(`\\b${nombre}\\b`).test(f.texto)).map((f) => f.archivo)
    assert.deepEqual(usan, [],
      `${usan.join(', ')} importa \`${nombre}\`, que es FÓSIL: la línea «Nómina · Jornales de obra» `
      + 'del Cash Flow sale del libro _MOVIMIENTOS (libro-extractores-nomina → JORNALES_PROY_TOTAL). '
      + 'Corregir la proyección ahí no cambia una sola celda. Leé la cabecera de este test.')
  }
})

test('la fuente VIVA de la proyección sigue siendo la cadena JORNALES_PROY_TOTAL → libro → Cash Flow', () => {
  // El control no puede validarse contra sí mismo: además de probar que la fósil no se usa, prueba
  // que el eslabón que SÍ manda sigue en su lugar. Si esta cadena se corta, la fósil deja de ser
  // fósil y el test de arriba estaría prohibiendo lo correcto.
  const porArchivo = Object.fromEntries(fuentes().map((f) => [f.archivo, f.texto]))
  assert.match(porArchivo['orquestador/lib/libro-extractores-nomina.mjs'] ?? '', /proyectadas|total/,
    'desapareció el extractor de nómina del libro: la cadena viva cambió y hay que revisar la fósil')
  assert.match(porArchivo['orquestador/scripts/libro-movimientos-pestana.mjs'] ?? '', /JORNALES_PROY_TOTAL/,
    'el libro dejó de leer JORNALES_PROY_TOTAL: la proyección de jornales cambió de camino')
})
