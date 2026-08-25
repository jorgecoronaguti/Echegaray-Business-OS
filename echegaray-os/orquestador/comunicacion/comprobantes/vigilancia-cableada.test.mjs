// EL CONTROL SE DISPARA SOLO, Y ESO SE PRUEBA — NO SE PROMETE.
//
// ═══ EL DEFECTO (14/08) ═══
//
// `orquestador/scripts/auditar-comprobantes-cargados.mjs` detecta el descalce entre el registro de
// cargas y la pestaña Compras. Corrido a mano encontró uno vivo —Alumetal 0031-00002661, registrado
// como cargado en la fila 840 y ausente de Compras, −$1.095.076,13— y `grep -rl auditarCompras`
// devolvía el script y su test: **nadie lo llamaba**. Un control que existe y nadie dispara no es un
// control; es un archivo.
//
// Un test que sólo probara la lib de vigilancia repetiría el defecto un nivel más arriba: la lib
// andaría y seguiría sin llamarla nadie. Lo que se prueba acá es el CABLEADO — que al cerrar una
// carga el auditor corre, que lo que encuentra llega al mensaje que el dueño está leyendo, y que
// falle lo que falle la carga no se cae.
//
// SIN RED, SIN POSTGRES, SIN SHEET: el auditor entra inyectado y el cargador es una corrida falsa.

import test from 'node:test'
import assert from 'node:assert/strict'
import { escribirFajo } from './escritura.mjs'
import { repoMemoria } from './dobles.mjs'

/** Un comprobante completo, con todo lo que hace falta para tener clave de idempotencia. */
function item(over = {}) {
  return {
    comprobante: {
      proveedor: 'Combustibles Barcelo', cuit: '30712345678', tipo: 'A', numero: '0113-00010489',
      fecha: '05/01/2026', concepto: 'gasoil', iva: 5981, total: 36460.3, obra: 'Estrella',
      unidad: 'Obras', detalleObra: 'Civil', categoria: 'B', condicion: 'Contado',
      ...over,
    },
  }
}

/** El descalce real del 14/08, tal como lo devuelve `conciliarRegistro`. */
const ALUMETAL = {
  clave: 'c:30712345678|A|0031-00002661', proveedor: 'Alumetal', numero: '0031-00002661',
  total: -1095076.13, filaRegistrada: 840, filaReal: null, estado: 'no_esta',
}

/** Una carga que sale bien. `d` extra se mezcla para poder inyectar el auditor. */
async function cargar(extra = {}) {
  const repo = repoMemoria()
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', items: [item()] })
  return escribirFajo({
    port: null, repo, congelado: () => null,
    correr: async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 845 }] } }),
    // El re-leído de lo escrito entra falso: sin esto tocaría el Sheet real.
    leerCompras: async () => [],
    ...extra,
  }, fajo)
}

test('EL DEFECTO: al cerrar la carga el auditor CORRE — antes no lo llamaba nadie', async () => {
  let corrio = 0
  await cargar({ auditar: async () => { corrio++; return { conciliado: [] } } })
  assert.equal(corrio, 1, 'el auditor de descalces no se disparó al cerrar la carga')
})

test('lo que el auditor encuentra llega al MENSAJE y a los avisos duros, con la plata', async () => {
  const r = await cargar({ auditar: async () => ({ conciliado: [ALUMETAL] }) })
  assert.match(r.texto, /NO están en Compras/, 'el descalce no llegó al mensaje del dueño')
  assert.match(r.texto, /1\.095\.076/, 'el mensaje no dice cuánta plata hay en juego')
  assert.ok(r.avisos.some((a) => /NO están en Compras/.test(a)), 'el descalce no viajó en los avisos de la tanda')
})

test('sin descalces el mensaje no se ensucia: el control calla cuando no hay nada', async () => {
  const r = await cargar({ auditar: async () => ({ conciliado: [{ estado: 'ok' }] }) })
  assert.doesNotMatch(r.texto, /NO están en Compras/)
})

test('si el auditor revienta, la carga NO se cae y el mensaje sale igual', async () => {
  const r = await cargar({ auditar: async () => { throw new Error('Google 500') } })
  assert.equal(r.estado, 'cargado')
  assert.match(r.texto, /fila 845/)
})

test('EN MODO ENSAYO no corre: nada se escribió, así que todo aparecería descalzado', async () => {
  let corrio = 0
  const r = await cargar({
    auditar: async () => { corrio++; return { conciliado: [ALUMETAL] } },
    correr: async () => ({ ok: true, datos: { ok: true, dry: true, escritas: 1, filas: [{ i: 0, fila: 845 }] } }),
  })
  assert.equal(corrio, 0, 'auditó un ensayo: el aviso habría sido íntegramente falso')
  assert.match(r.texto, /ENSAYO/)
})

test('sin cliente de Google el control no se dispara — y por eso el cableado se prueba aparte', async () => {
  // Es la costura que impide que CADA test de la escritura lea el Sheet real del dueño (medido: 11 s
  // y una lectura viva de Compras desde una prueba unitaria). El precio es que alguien tiene que
  // pasar `google`, y el test de abajo es el que garantiza que se sigue pasando.
  const r = await cargar()
  assert.equal(r.estado, 'cargado')
  assert.doesNotMatch(r.texto ?? '', /NO están en Compras/)
})

test('EL CABLEADO: el cliente de Google llega hasta la escritura, salto por salto', async () => {
  // Sin esta aserción, alguien saca el argumento en una refactor y volvemos al punto de partida: el
  // auditor existiendo y sin que nadie lo llame, verde y callado.
  //
  // Desde el 25/08 el cableado no está en un archivo sino en DOS: el especialista le pasa `google`
  // al circuito compartido (`comprobantes/circuito.mjs`) y el circuito se lo pasa a `escribirFajo`.
  // Se afirman los dos saltos: cortar cualquiera de ellos apaga el auditor igual, y una aserción
  // sobre un solo salto se quedaría verde con la cadena rota más abajo.
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const lee = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  assert.match(
    lee('../especialistas/comprobantes.mjs'),
    /procesarComprobantes\(\{[^}]*\bgoogle\b[^}]*\}/,
    'el especialista dejó de pasarle `google` al circuito: el auditor no se dispara más',
  )
  assert.match(
    lee('./circuito.mjs'),
    /escribirFajo\(\{[^}]*\bgoogle\b[^}]*\},\s*f\)/,
    'el circuito dejó de pasarle `google` a escribirFajo: el auditor no se dispara más',
  )
})

// ── LA PERCEPCIÓN ABSORBIDA NO LLEGABA AL CHAT (14/08) ───────────────────────
//
// ═══ EL DEFECTO ═══
//
// El cargador imprime `ℹ Percepción/impuesto interno absorbido en Importe` por stdout, y el bot sólo
// parsea la línea `##ORQ-JSON##`, que NO incluía `percep`. En la fila 844 se absorbieron $53.356,45
// de percepción de IIBB adentro del costo, sin una palabra. Es correcto por el contrato de la columna
// M (= Total − IVA, con las percepciones adentro para que el Total cierre con la plata que salió),
// pero es CRÉDITO FISCAL contabilizado como costo: si el dueño no se entera, no lo computa contra su
// IIBB y termina pagándolo dos veces.

/** Una carga donde el cargador informó percepción absorbida y una fila que no cierra. */
async function cargarConDatos(datos) {
  const repo = repoMemoria()
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', items: [item()] })
  return escribirFajo({
    port: null, repo, congelado: () => null, leerCompras: async () => [],
    auditar: async () => ({ conciliado: [] }),
    correr: async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 844 }], ...datos } }),
  }, fajo)
}

test('EL DEFECTO: la percepción absorbida llega al mensaje con su importe', async () => {
  const r = await cargarConDatos({ percep: [{ i: 0, proveedor: 'Alumetal', dif: 53356.45 }] })
  const todo = [r.texto, ...r.avisos].join('\n')
  assert.match(todo, /53\.356/, 'la percepción absorbida no aparece por ningún lado')
  assert.match(todo, /crédito fiscal/i, 'no dice QUÉ es: crédito fiscal quedando dentro del costo')
})

test('sin percepción no se dice nada: el mensaje corto es el que se lee', async () => {
  const r = await cargarConDatos({})
  assert.doesNotMatch([r.texto, ...r.avisos].join('\n'), /Percepción/i)
})

test('la fila que no cierra viaja como aviso DURO, no como comentario', async () => {
  // Un total equivocado no da #ERROR y se propaga solo a cuatro pestañas del Flujo de Fondos.
  const r = await cargarConDatos({ noCierran: [{ fila: 844, dif: 1014940.07, total: 2014940.07 }] })
  assert.ok(r.avisos.some((a) => /NO cierran/.test(a)), 'el hallazgo de aritmética no salió del cargador')
  assert.ok(r.avisos.some((a) => /fila 844/.test(a)))
})
