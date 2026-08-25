// LO QUE ESTAS PRUEBAS IMPIDEN: darle a un cliente un permiso que nadie quiso darle.
//
// Es el mismo defecto que ya se pagó adentro («ve la economía» afirmado para toda un área que no
// la ve, 19/08) pero apuntando hacia afuera: acá el que ve de más es la contraparte de un contrato.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  accesoExistente, alCambiarPermiso, contactoDelMail, mailPlausible, mismoMail,
  permisosCoherentes, resumenAccesos, textoDeObras,
} from './reglasPortal.ts'
import type { AccesoPortal } from '../types/cobranzas.ts'

function acceso(p: Partial<AccesoPortal> & { email: string }): AccesoPortal {
  return {
    id: p.email, cliente_id: 'c1', persona_contacto: null, puede_ver_obra: true,
    puede_ver_montos: false, puede_aprobar: false, obras: null, obras_nombres: null,
    auth_user_id: null,
    habilitado_at: '2026-07-18T10:00:00Z', invitacion_enviada_at: null, primer_ingreso_at: null,
    ultimo_ingreso_at: null, ultimo_dispositivo: null, revocado_at: null, ...p,
  }
}

test('nadie aprueba certificados sin ver los montos', () => {
  // El defecto: tres casillas independientes dejan «aprueba» encendido con «ve montos» apagado, y
  // esa persona aprueba a ciegas un documento que habilita una factura.
  assert.deepEqual(
    permisosCoherentes({ puede_ver_obra: true, puede_ver_montos: false, puede_aprobar: true }),
    { puede_ver_obra: true, puede_ver_montos: false, puede_aprobar: false },
  )
})

test('la fila incoherente se corrige QUITANDO, nunca regalando el permiso de abajo', () => {
  // Si el normalizador «completara» hacia abajo, una fila mal guardada le abriría los montos a
  // alguien a quien nadie se los dio — y del otro lado de esta pantalla está el cliente.
  assert.deepEqual(
    permisosCoherentes({ puede_ver_obra: false, puede_ver_montos: true, puede_aprobar: true }),
    { puede_ver_obra: false, puede_ver_montos: false, puede_aprobar: false },
  )
})

test('apagar «ver montos» apaga «aprobar», no al revés', () => {
  const todo = { puede_ver_obra: true, puede_ver_montos: true, puede_aprobar: true }
  assert.deepEqual(alCambiarPermiso(todo, 'puede_ver_montos', false), {
    puede_ver_obra: true, puede_ver_montos: false, puede_aprobar: false,
  })
  // Apagar la obra apaga todo lo de arriba: sin obra no hay certificado que mirar.
  assert.deepEqual(alCambiarPermiso(todo, 'puede_ver_obra', false), {
    puede_ver_obra: false, puede_ver_montos: false, puede_aprobar: false,
  })
  // Encender el de arriba enciende los de abajo.
  const nada = { puede_ver_obra: false, puede_ver_montos: false, puede_aprobar: false }
  assert.deepEqual(alCambiarPermiso(nada, 'puede_aprobar', true), {
    puede_ver_obra: true, puede_ver_montos: true, puede_aprobar: true,
  })
})

test('el resumen de la cabecera no cuenta a los revocados', () => {
  const lista = [
    acceso({ email: 'm.ruiz@laestrella.com', primer_ingreso_at: '2026-07-19T08:00:00Z' }),
    acceso({ email: 'j.sosa@laestrella.com', primer_ingreso_at: '2026-07-20T08:00:00Z' }),
    acceso({ email: 'l.paz@laestrella.com' }),
    acceso({ email: 'ex@laestrella.com', revocado_at: '2026-08-01T00:00:00Z' }),
  ]
  // «3 mails habilitados · 1 sin primer ingreso» (`31:47`).
  assert.deepEqual(resumenAccesos(lista), { habilitados: 3, sinIngresar: 1, revocados: 1 })
})

test('«todas las obras» no es «ninguna obra»', () => {
  // `obras = null` es TODAS, incluidas las futuras. Tratarlo como lista vacía deja al cliente sin
  // ver nada; tratar la lista vacía como «todas» lo abre a obras que nadie le quiso mostrar.
  assert.equal(textoDeObras(acceso({ email: 'a@b.c', obras: null }), 3), 'Las 3')
  assert.equal(textoDeObras(acceso({ email: 'a@b.c', obras: [] }), 3), 'Ninguna')
  assert.equal(
    textoDeObras(acceso({ email: 'a@b.c', obras: ['o1'], obras_nombres: ['Vestuarios'] }), 3),
    'Vestuarios',
  )
  assert.equal(textoDeObras(acceso({ email: 'a@b.c', obras: ['o1', 'o2'] }), 3), '2 obras')
})

test('el mail es la llave y se compara como la base lo guarda', () => {
  assert.equal(mismoMail(' M.Ruiz@LaEstrella.com ', 'm.ruiz@laestrella.com'), true)
  // Dos vacíos no son «el mismo mail»: si lo fueran, un contacto sin email haría falso positivo
  // contra cualquier acceso sin email y la pantalla diría «ya está habilitado».
  assert.equal(mismoMail(null, null), false)
  assert.equal(mismoMail('', ' '), false)
  assert.equal(mailPlausible('g.molina@laestrella.com'), true)
  assert.equal(mailPlausible('g.molina@laestrella'), false)
  assert.equal(mailPlausible('sin arroba'), false)
})

test('se reconoce al contacto ya cargado y al mail ya habilitado', () => {
  const contactos = [{ nombre: 'Gabriel Molina', email: 'G.Molina@laestrella.com', rol: 'compras' }]
  assert.equal(contactoDelMail('g.molina@laestrella.com', contactos)?.nombre, 'Gabriel Molina')
  assert.equal(contactoDelMail('otro@laestrella.com', contactos), null)
  const lista = [acceso({ email: 'j.sosa@laestrella.com' })]
  assert.equal(accesoExistente('J.Sosa@laestrella.com', lista)?.id, 'j.sosa@laestrella.com')
  assert.equal(accesoExistente('nuevo@laestrella.com', lista), null)
})
