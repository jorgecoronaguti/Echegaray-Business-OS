// LA BARRERA TRANSACCIONAL — los tests que la rompen a propósito.
//
// Si alguno de estos se pone rojo, el agente puede hacer clic en "Comprar". No hay bug más grave en
// todo este subsistema, y por eso los casos están escritos como ataques, no como ejemplos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluarElemento, evaluarNavegacion, contieneVerboProhibido, normalizar, registroBloqueo,
} from './balanz-denylist.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))

test('bloquea los verbos del pedido, en cualquier capitalización y con acento', () => {
  for (const t of ['Comprar', 'COMPRÁ', 'vender', 'Suscribir', 'Rescatar', 'Transferir',
    'Confirmar', 'Aceptar', 'Operar', 'Enviar orden', 'Invertir', 'Renovar', 'Licitar',
    'Firmar', 'Autorizar', 'Continuar operación', 'Confirmar operación']) {
    const v = evaluarElemento({ texto: t })
    assert.equal(v.permitido, false, `"${t}" no fue bloqueado`)
  }
})

test('bloquea por aria-label aunque el texto visible sea inocente', () => {
  // El ataque real: un botón con una flecha y la intención escondida en el atributo.
  const v = evaluarElemento({ texto: '→', ariaLabel: 'Confirmar compra de FCI' })
  assert.equal(v.permitido, false)
  assert.equal(v.campo, 'ariaLabel')
})

test('bloquea por href aunque el texto diga "Ver más"', () => {
  const v = evaluarElemento({ texto: 'Ver más', href: '/mercado/comprar?especie=AL30' })
  assert.equal(v.permitido, false)
  assert.match(v.motivo, /ruta transaccional/)
})

test('bloquea por el texto del elemento PADRE: un "Continuar" dentro de un modal de compra', () => {
  const v = evaluarElemento({ texto: 'Continuar', textoPadre: 'Confirmá tu suscripción al fondo' })
  assert.equal(v.permitido, false)
})

test('bloquea todo formulario y todo submit', () => {
  assert.equal(evaluarElemento({ tag: 'FORM', texto: 'buscar' }).permitido, false)
  assert.equal(evaluarElemento({ rol: 'button', tipo: 'submit', texto: 'Siguiente' }).permitido, false)
})

test('FALLA CERRADA: un elemento sin nada evaluable no se toca', () => {
  const v = evaluarElemento({})
  assert.equal(v.permitido, false)
  assert.match(v.motivo, /ante la duda no se toca/)
})

test('permite lo genuinamente informativo', () => {
  for (const el of [
    { texto: 'Rendimientos históricos', href: '/fondos/detalle/123' },
    { texto: 'Ver prospecto', href: '/documentos/prospecto.pdf' },
    { texto: 'Cotizaciones', href: '/mercado/cotizacion' },
  ]) {
    assert.equal(evaluarElemento(el).permitido, true, `"${el.texto}" fue bloqueado de más`)
  }
})

test('NO bloquea por subcadena: "Recomprar" sí, "compras" del menú de la empresa no es de Balanz', () => {
  // La frontera de palabra evita el falso positivo que dejaría al agente sin poder navegar nada.
  assert.equal(contieneVerboProhibido('Descompresión de datos'), null)
  assert.equal(contieneVerboProhibido('Comprar ahora'), 'comprar')
})

test('la navegación directa a una URL transaccional se bloquea', () => {
  assert.equal(evaluarNavegacion('https://clientes.balanz.com/operar/fci').permitido, false)
  assert.equal(evaluarNavegacion('https://clientes.balanz.com/fondos').permitido, true)
  assert.equal(evaluarNavegacion('').permitido, false)
})

test('el registro de bloqueo NO guarda la pantalla, sólo lo mínimo para auditar', () => {
  const el = { tag: 'BUTTON', rol: 'button', texto: 'Comprar', href: '/comprar', ariaLabel: 'Comprar 5.000.000' }
  const r = registroBloqueo(el, evaluarElemento(el))
  assert.equal(r.elemento.href, undefined, 'no debe guardar el destino')
  assert.equal(r.elemento.ariaLabel, undefined, 'no debe guardar el aria-label con montos')
  assert.ok(r.elemento.texto.length <= 80)
  assert.ok(r.motivo)
})

test('normalizar saca tildes y colapsa espacios', () => {
  assert.equal(normalizar('  SUSCRIPCIÓN   Ahora '), 'suscripcion ahora')
})

// ── EL CONTROL SOBRE EL CONTROL ────────────────────────────────────────────────
// Que la barrera funcione no sirve si el navegador la puentea. Este test lee el archivo del
// navegador y verifica que no exista un camino de clic que no pase por acá.

test('el navegador NO tiene ningún clic ni goto que saltee la barrera', () => {
  const src = readFileSync(join(DIR, 'balanz-navegador.mjs'), 'utf8')
  // Los únicos usos permitidos viven dentro de clicSeguro/navegarSeguro.
  const clics = [...src.matchAll(/\.click\(/g)].length
  const gotos = [...src.matchAll(/\.goto\(/g)].length
  assert.equal(clics, 1, 'hay más de un .click(): alguno no pasa por clicSeguro')
  assert.equal(gotos, 1, 'hay más de un .goto(): alguno no pasa por navegarSeguro')
  assert.match(src, /evaluarElemento/, 'el navegador no llama a la barrera')
  assert.match(src, /evaluarNavegacion/, 'el navegador no evalúa las navegaciones')
})

test('el navegador NO extrae cookies, tokens ni contraseñas', () => {
  const src = readFileSync(join(DIR, 'balanz-navegador.mjs'), 'utf8')
  for (const prohibido of ['cookies()', 'storageState', 'localStorage', 'sessionStorage', 'password:']) {
    assert.equal(src.includes(prohibido), false, `el navegador usa ${prohibido}`)
  }
})
