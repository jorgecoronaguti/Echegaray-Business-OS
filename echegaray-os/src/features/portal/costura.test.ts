// LO QUE ESTAS PRUEBAS IMPIDEN: que la costura entre los tres frentes vuelva a dejar pasar una
// llamada con la forma equivocada.
//
// Los tres defectos de acá abajo COMPILABAN antes de la integración, porque las server actions
// recibían `entrada: unknown`. Ninguno se veía hasta apretar el botón, y dos de los tres no fallaban
// ni ahí: guardaban el registro mal y seguían.
//
// Se prueban contra el ESQUEMA de Zod, que es lo que la action corre de verdad, y no contra la
// action —que necesita sesión y base—. Es la parte que decide si el dato entra bien.

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearConsultaSchema, informarTransferenciaSchema } from './types.ts'
import { destinoPorRol, esRutaPortal, RUTA_PORTAL_INGRESAR } from './rutas.ts'

test('una consulta con `obra_id` NO se guarda como si tuviera obra', () => {
  // La pantalla mandaba `{ obra_id }` y el esquema espera `obraId`. Con `unknown` en la firma esto
  // pasaba el `safeParse` —el campo es opcional— y la consulta quedaba sin obra, en silencio.
  const conGrafiaVieja = crearConsultaSchema.safeParse({
    titulo: 'Filtración en el vestuario', cuerpo: 'Aparece humedad en la pared del fondo.',
    obra_id: 'arcor',
  })
  assert.equal(conGrafiaVieja.success, true, 'sigue siendo válida: el campo sobrante se ignora')
  assert.equal(conGrafiaVieja.success && conGrafiaVieja.data.obraId, undefined,
    'y por eso la obra se PERDÍA — hoy lo impide el tipo de la action, no este parse')

  const bien = crearConsultaSchema.safeParse({
    titulo: 'Filtración en el vestuario', cuerpo: 'Aparece humedad en la pared del fondo.',
    obraId: 'arcor',
  })
  assert.equal(bien.success && bien.data.obraId, 'arcor')
})

test('un importe que llega como texto se rechaza, no se interpreta', () => {
  // El campo del panel es un `<input>`: sale texto. El esquema pide número y NO lo convierte —
  // convertir acá haría que «3.100.000» entre como 3,1 (el punto de miles leído como decimal), que
  // es el error que ya costó plata en el bot de comprobantes.
  const comoTexto = informarTransferenciaSchema.safeParse({
    monto: '4100000', fecha: '2026-08-25',
  })
  assert.equal(comoTexto.success, false)

  const comoNumero = informarTransferenciaSchema.safeParse({ monto: 4_100_000, fecha: '2026-08-25' })
  assert.equal(comoNumero.success, true)
})

test('el informe de transferencia distingue el certificado de la fila del esquema', () => {
  // `pago_informado.esquema_pago_id` apunta al esquema, NO al certificado: son dos filas del mismo
  // cobro unidas por `cobranza_fila`. La pantalla mandaba el id del certificado en el campo del
  // esquema; el aviso quedaba mal vinculado o rebotaba contra la FK.
  const r = informarTransferenciaSchema.safeParse({
    certificadoId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    monto: 1_000_000, fecha: '2026-08-25',
  })
  assert.equal(r.success, true)
  assert.equal(r.success && r.data.esquemaPagoId, undefined,
    'el certificado NO se cuela como id de esquema: lo traduce la action contra la base')
})

test('la fecha del informe va en ISO y el día 32 no existe para el esquema', () => {
  assert.equal(informarTransferenciaSchema.safeParse({ monto: 1, fecha: '25/08/2026' }).success, false)
  assert.equal(informarTransferenciaSchema.safeParse({ monto: 1, fecha: '2026-08-25' }).success, true)
})

test('el confinamiento del rol `cliente` tiene UNA sola versión y vive sin Zod', () => {
  // `rutas.ts` no importa nada: lo carga el middleware en cada request, en el runtime edge. Si
  // alguien vuelve a colgar `destinoPorRol` de `types.ts`, este import arrastra Zod al middleware.
  assert.equal(destinoPorRol('cliente', '/obras'), '/portal')
  assert.equal(destinoPorRol('cliente', '/portal/obra/arcor'), null)
  assert.equal(destinoPorRol('administracion', '/portal'), '/')
  // El rol nulo NO es cliente y NO entra: falla cerrado en las dos puertas.
  assert.equal(destinoPorRol(null, '/portal'), '/')
  assert.equal(destinoPorRol(undefined, '/portal'), '/')
  assert.equal(destinoPorRol(null, '/obras'), null, 'fuera del portal lo deciden las otras reglas')
  // Y la puerta del portal es del cliente aunque todavía no tenga sesión.
  assert.equal(esRutaPortal(RUTA_PORTAL_INGRESAR), true)
  assert.equal(destinoPorRol('cliente', RUTA_PORTAL_INGRESAR), null)
})
