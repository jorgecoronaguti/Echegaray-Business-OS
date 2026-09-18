import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ═══ LA COLUMNA OTROS EN EL CRM (dueño, 18/09/2026) ═══
//
// «Los presupuestos son materiales, mano de obra, subcontratistas y en otros si hay alquileres de
// maquinarias, servicios, etc. Y quiero que cada cosa quede aclarada diciendo qué contiene cada uno.»
// QUÉ DEFECTOS ATRAPA: que Otros no esté entre Subcontratos y Mano de obra en la ficha o en la cartera;
// que la celda formatee por su cuenta en vez de delegar en `costosDeObra.ts`; que el `title` deje de decir
// qué contiene y desde cuándo salió de Materiales; que Materiales vuelva a callar que ya no incluye equipos,
// servicios, combustible ni fletes; que la celda enlace a un detalle que la base no publica; que el
// teléfono o el pie pierdan la cifra; o que la fila «sin obra» se corra una columna.

const DIR = dirname(fileURLToPath(import.meta.url))
const leer = (f: string): string => readFileSync(join(DIR, f), 'utf8')

const QUE_CONTIENE = /Alquiler y traslado de equipos, servicios de obra \(baño, contenedor, agua\), combustible, fletes y honorarios/
/** Una constante escrita en varias líneas con `+`, leída como el string que ve el navegador. */
const pegado = (src: string): string => src.replace(/'\s*\n\s*\+\s*'/g, '')

test('la ficha dibuja Otros entre Subcontratos y Mano de obra, con su pista y su piso', () => {
  const src = leer('./ListasClienteV2.tsx')
  const h = (t: string) => src.indexOf(`<RotuloCol derecha>${t}</RotuloCol>`)
  assert.ok(h('Subcontratos') > 0 && h('Subcontratos') < h('Otros') && h('Otros') < h('Mano de obra'),
    'el orden dejó de ser Materiales · Subcontratos · Otros · Mano de obra')
  // Cuatro pistas de 112 en el ancho entero y cuatro de 108 debajo de 1200: una por rubro.
  assert.match(src, /_minmax\(0,112px\)_minmax\(0,112px\)_minmax\(0,112px\)_minmax\(0,112px\)_minmax\(0,148px\)/)
  assert.match(src, /_minmax\(0,108px\)_minmax\(0,108px\)_minmax\(0,108px\)_minmax\(0,108px\)_minmax\(0,132px\)/)
  assert.match(src, /title=\{AYUDA_OTROS\}><RotuloCol derecha>Otros<\/RotuloCol><ALaFecha \/>/)
})

test('la celda de Otros de la ficha delega, escribe lo por vencer y NO enlaza a un detalle que no existe', () => {
  const src = leer('./ListasClienteV2.tsx')
  const desde = src.indexOf('data-testid="otros-obra-cliente"')
  assert.ok(desde > 0, 'no está la celda de otros de la obra')
  const celda = src.slice(desde, src.indexOf('</span>', desde))
  assert.match(celda, /textoOtros\(costoDeLaObra\)/)
  assert.match(celda, /tituloOtros\(costoDeLaObra\) \?\? AYUDA_OTROS/)
  assert.doesNotMatch(celda, /toLocaleString|\?\? 0|Math\.round/)
  assert.doesNotMatch(celda, /AbrirDetalle/, 'la RPC de detalle no publica «otros»: un botón abriría un panel vacío')
  assert.match(src.slice(desde, desde + 900), /PorVencer texto=\{textoPorVencer\(costoDeLaObra\?\.otrosPorVencer\)\}/)
  // El detalle por rubro sigue sin conocer «otros» —y el día que lo conozca, este caso avisa que hay que enlazar.
  assert.match(leer('../services/detalleCostoDeObra.ts'), /export const RUBROS = \['materiales', 'subcontratos', 'mo', 'hh'\] as const/)
})

test('los títulos dicen qué contiene Otros y qué dejó de contener Materiales', () => {
  for (const f of ['./ListasClienteV2.tsx', './TablaClientes.tsx']) {
    const src = leer(f)
    const ayuda = pegado(src.slice(src.indexOf('const AYUDA_OTROS'), src.indexOf('\n\n', src.indexOf('const AYUDA_OTROS'))))
    assert.match(ayuda, QUE_CONTIENE, `${f}: AYUDA_OTROS ya no dice qué contiene`)
    assert.match(ayuda, /Hasta el 18\/09\/2026 iban dentro de Materiales/, `${f}: AYUDA_OTROS no dice desde cuándo`)
    const mat = pegado(src.slice(src.indexOf('const AYUDA_MATERIALES'), src.indexOf('\n\n', src.indexOf('const AYUDA_MATERIALES'))))
    assert.match(mat, /columna Otros|van en sus columnas/, `${f}: AYUDA_MATERIALES no dice que equipos, servicios, combustible y fletes van en Otros`)
  }
})

test('la cartera dibuja Otros entre Subcontratos y Mano de obra; las celdas y la línea angosta la llevan', () => {
  const src = leer('./TablaClientes.tsx')
  const i = (t: string) => src.indexOf(`texto="${t}"`)
  assert.ok(i('Subcontratos') > 0 && i('Subcontratos') < i('Otros') && i('Otros') < i('Mano de obra'))
  const costo = leer('./CeldasDeCosto.tsx')
  const celdas = costo.slice(costo.indexOf('function Celdas('), costo.indexOf('function LineaAngosta'))
  const orden = ['materiales-', 'subcontratos-', 'otros-', 'mano-obra-'].map((t) => celdas.indexOf(`testid={\`${t}`))
  for (let k = 1; k < orden.length; k++) assert.ok(orden[k - 1] > 0 && orden[k - 1] < orden[k], 'las celdas no son Materiales · Subcontratos · Otros · Mano de obra')
  assert.match(costo, /otros: textoOtros\(c\), tituloOtros: tituloOtros\(c\)/)
  assert.match(costo, /otros: textoTotalOtros\(t\)/)
  const linea = costo.slice(costo.indexOf('function LineaAngosta'), costo.indexOf('export function CostoDeLaObra'))
  assert.match(linea, /<span>Otros<\/span>\{cifra\(f\.otros, false, f\.tituloOtros\)\}/, 'en el teléfono se perdió la cifra de otros')
})

test('el pie del cliente suma Otros con t.otros, y la fila sin obra reserva su pista sin inventar un «—»', () => {
  const pie = leer('./PieDeLosTrabajos.tsx')
  assert.match(pie, /data-testid="otros-del-cliente"/)
  assert.match(pie, /<Rotulo texto=\{ROTULO_OTROS\} \/>/)
  assert.match(pie, /costos\.legible \? plata\(costos\.otros\) : 'no puedo leerlos'/)
  // La fila «sin obra» usa COLS_OBRAS (nueve pistas): después de Subcontratos van TRES pistas vacías
  // —Otros, Mano de obra, Contratado— y la de Otros no dibuja «—»: la vista sin obra no abre el rubro.
  assert.equal(leer('./ListasClienteV2.tsx').match(/grid-cols-\[([^\]]+)\]/)![1].split('_').length, 9,
    'la grilla de Trabajos dejó de tener nueve pistas')
  const fila = leer('./CostoALaFecha.tsx')
  const cola = fila.slice(fila.indexOf('data-testid="subcontratos-sin-obra-cliente"'), fila.lastIndexOf('</div>'))
  assert.equal((cola.match(/^\s*<span(?: aria-hidden)? \/>$/gm) ?? []).length, 3,
    'la fila sin obra perdió o ganó una pista: Mano de obra y Contratado se corren de columna')
  assert.doesNotMatch(cola, /otros-sin-obra|plata\(gasto\?\.otros/, 'la fila sin obra no publica otros: la vista no lo abre')
})
