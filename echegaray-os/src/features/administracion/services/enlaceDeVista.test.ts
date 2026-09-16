import test from 'node:test'
import assert from 'node:assert/strict'
import { enlaceConservando } from './enlaceDeVista.ts'

// LA REGLA DE LOS ENLACES DE UNA VISTA, probada una vez para las tres solapas de Personal. Los casos
// de la solapa Horas siguen en `vistaDeAsistencia.test.ts`, que ahora prueba la delegación entera.

const RUTA = '/administracion/personas'

test('lo puesto se conserva y un `undefined` lo apaga — el mismo enlace que lo prendió', () => {
  // ═══ EL DEFECTO QUE ATRAPA (10/09/2026) ═══
  //
  // Con un filtro puesto, tocar otro control devolvía la empresa entera sin que nadie lo pidiera:
  // esos enlaces escribían la URL desde cero. El recorte duraba hasta el primer clic.
  const base = { q: 'gonzalez', f: 'en_obra', obra: 'quattropani' }
  assert.equal(enlaceConservando(RUTA, {}, base, { f: 'inactivos' }),
    `${RUTA}?q=gonzalez&f=inactivos&obra=quattropani`)
  assert.equal(enlaceConservando(RUTA, {}, base, { obra: undefined }),
    `${RUTA}?q=gonzalez&f=en_obra`)
})

test('un valor vacío NO es un parámetro, y sin nada puesto la URL no lleva `?`', () => {
  // `?q=` no filtra nada y ensucia lo que se comparte por chat; una ruta pelada con un `?` colgando
  // es la misma suciedad en su peor versión.
  assert.equal(enlaceConservando(RUTA, {}, { q: '', f: undefined }), RUTA)
  assert.equal(enlaceConservando(RUTA, {}, {}), RUTA)
  assert.equal(enlaceConservando(RUTA, { vista: 'asistencia' }, { q: '' }), `${RUTA}?vista=asistencia`)
})

test('los fijos van primero y un cambio mueve el VALOR, no el lugar', () => {
  // Dos enlaces a la misma vista con el mismo recorte tienen que ser el mismo TEXTO: se comparan
  // literales en los tests y se comparan a ojo cuando alguien los pega en un mensaje.
  const orden = enlaceConservando(RUTA, { vista: 'asistencia' },
    { quincena: '2026-09-01', q: 'perez', modo: 'quincena' }, { quincena: '2026-09-16' })
  assert.equal(decodeURIComponent(orden),
    `${RUTA}?vista=asistencia&quincena=2026-09-16&q=perez&modo=quincena`)
})

test('un parámetro nuevo entra por `cambios` aunque la vista no lo llevara puesto', () => {
  assert.equal(enlaceConservando(RUTA, {}, { q: 'perez' }, { obra: 'pisos-industriales' }),
    `${RUTA}?q=perez&obra=pisos-industriales`)
})
