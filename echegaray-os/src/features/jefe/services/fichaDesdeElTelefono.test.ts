import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hrefFichaDeObra, hrefParteDiario } from './navegacion.ts'
import { puedeVerRuta } from '../../../shared/auth/areas.ts'
import { caraDeEscritorioDelJefe, caraDeTelefonoDelJefe } from '../../../shared/auth/caraDelJefe.ts'
import { resolverVistaObra } from '../../obras/services/vistasObra.ts'

// EL DEFECTO (dueño, 02/10/2026): «los jefes de obra en módulo ERP Obras desde mobile no pueden ver
// todo lo de la obra y no pueden cargar partes diarios». La base les daba todo (`ve_obra()` true en
// las diez activas, las policies del parte pasan); lo que faltaba era el CAMINO: J01 no enlazaba la
// ficha y en siete días ninguno de los dos abrió `/obras/<obra>` desde el teléfono. Estas pruebas
// atan las tres capas del camino: el enlace está en J01, la puerta lo deja pasar y ninguna de las
// dos caras del jefe lo desvía a otro lado.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const separar = (href: string) => {
  const u = new URL(href, 'https://app.ecsas.com.ar')
  return { path: u.pathname, params: u.searchParams }
}

test('EL PARTE DIARIO ABRE EN TRABAJO › PARTE DIARIO DE LA FICHA, no en el árbol ni en Resumen', () => {
  const { path, params } = separar(hrefParteDiario('quattropani'))
  assert.equal(path, '/obras/quattropani')
  assert.deepEqual(resolverVistaObra(params.get('vista') ?? undefined, params.get('sub') ?? undefined), { vista: 'tareas', sub: 'parte' })
  assert.equal(hrefFichaDeObra('pisos-industriales'), '/obras/pisos-industriales')
})

test('LA PUERTA LE ABRE AL JEFE LA FICHA Y EL PARTE (el rol es uno: Nievas y Maldonado igual)', () => {
  for (const obra of ['quattropani', 'pisos-industriales', 'messina-playon-azufre']) {
    assert.equal(puedeVerRuta('jefe_obra', hrefFichaDeObra(obra)), true, obra)
    assert.equal(puedeVerRuta('jefe_obra', hrefParteDiario(obra)), true, obra)
  }
  // El operario no: el parte es de quien conduce la obra.
  assert.equal(puedeVerRuta('campo', hrefParteDiario('quattropani')), false)
})

test('NINGUNA CARA DEL JEFE DESVÍA LA FICHA: ni el teléfono a J01 ni la PC a su portada', () => {
  for (const href of [hrefFichaDeObra('quattropani'), hrefParteDiario('quattropani')]) {
    const { path, params } = separar(href)
    assert.equal(caraDeTelefonoDelJefe(path, params), null, href)
    assert.equal(caraDeEscritorioDelJefe(path, params, 'pisos-industriales'), null, href)
  }
})

test('J01 (Hoy del jefe en el teléfono) OFRECE el parte diario y la ficha de la obra elegida', () => {
  const codigo = readFileSync(join(RAIZ, 'src/app/(jefe)/obra/hoy/page.tsx'), 'utf8')
    .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
  assert.match(codigo, /<Acceso href=\{hrefParteDiario\(obra\.id\)\}[^>]*texto="Parte diario"/)
  assert.match(codigo, /<Acceso href=\{hrefFichaDeObra\(obra\.id\)\}[^>]*texto="Toda la obra"/)
})
