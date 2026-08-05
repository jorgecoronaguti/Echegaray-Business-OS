// EL RUTEO DE COMPROBANTES NO LLAMA A NINGÚN MODELO. LA LECTURA SÍ, Y SÓLO ELLA.
//
// Este módulo es el primero del subsistema que TIENE que llamar a un modelo: leer una foto de una
// factura es visión, no hay forma determinística de hacerlo. Justamente por eso hace falta escribir
// dónde termina ese permiso, o se vuelve la excusa para meter un modelo en cualquier lado.
//
// LA LÍNEA: el modelo se toca UNA vez por adjunto, adentro de `leerAdjunto`, y NUNCA en el camino
// que decide QUIÉN atiende, en la puerta de permisos, en el agrupado, en la idempotencia ni en la
// escritura. Si alguien enchufa una llamada en cualquiera de esos, esto se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { especialista } from '../especialistas/comprobantes.mjs'
import { puedeCargarComprobantes } from './guarda.mjs'
import { escribirFajo, aFajoJson } from './escritura.mjs'
import { aplicarCorreccion } from './dialogo.mjs'
import { entraEnElFajo, colapsarRepetidos, ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { resumenFajo } from '../../lib/comprobantes/mensaje.mjs'
import { normalizarLectura, claveComprobante } from '../../lib/comprobantes/lectura.mjs'
import { conciliarConArca } from '../../lib/comprobantes/arca.mjs'
import { imputacionDeAnotacion } from '../../lib/comprobantes/imputacion.mjs'
import { buscarEnCompras, indexarCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { repoMemoria, portGuarda } from './dobles.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

/** Cualquier cosa que se le pida a esto hace fallar el test. */
const MODELO_PROHIBIDO = new Proxy(() => {}, {
  get() { throw new Error('SE LLAMÓ AL MODELO DONDE NO CORRESPONDE') },
  apply() { throw new Error('SE LLAMÓ AL MODELO DONDE NO CORRESPONDE') },
})

/** Sigue los `import ... from './x.mjs'` relativos hasta el fondo. */
function arbolDeImports(entrada, vistos = new Set()) {
  const abs = path.resolve(entrada)
  if (vistos.has(abs) || !fs.existsSync(abs)) return vistos
  vistos.add(abs)
  const src = fs.readFileSync(abs, 'utf8')
  for (const m of src.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)) {
    if (!m[1].startsWith('.')) continue
    arbolDeImports(path.resolve(path.dirname(abs), m[1]), vistos)
  }
  return vistos
}

const item = () => ({
  clave: 'c:30712345678|0113-00010489',
  comprobante: {
    proveedor: 'Combustibles Barcelo', cuit: '30712345678', tipo: 'A', numero: '0113-00010489',
    fecha: '05/01/2026', total: 36460.30, iva: 5981, obra: 'Estrella',
  },
})

test('el ÚNICO archivo del módulo que nombra la API del modelo es el que lee la foto', () => {
  const entradas = [
    path.join(AQUI, 'guarda.mjs'), path.join(AQUI, 'repositorio.mjs'),
    path.join(AQUI, 'escritura.mjs'), path.join(AQUI, 'dialogo.mjs'), path.join(AQUI, 'accion.mjs'),
    // El flujo entra desde el 03/08: ahora alcanza la conciliación con ARCA, la pestaña Compras viva
    // y el matcheo de lo escrito a mano. Los tres tienen que seguir siendo aritmética y texto — la
    // única llamada a un modelo la hace el `leer` que se le INYECTA, nunca un import suyo.
    path.join(AQUI, 'flujo.mjs'),
  ]
  const modulos = new Set()
  for (const e of entradas) for (const m of arbolDeImports(e)) modulos.add(m)
  const ofensas = [...modulos].filter((f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
    return /api\.anthropic\.com|ANTHROPIC_API_KEY|x-api-key/.test(src)
  })
  assert.deepEqual(ofensas.map((f) => path.basename(f)), [],
    `la puerta, la idempotencia o la escritura terminaron alcanzando al modelo:\n${ofensas.join('\n')}`)
  assert.ok(modulos.size >= 5, 'el rastreador no recorrió nada: la prueba sería vacía')
})

test('el RECLAMO del especialista es determinístico: cuesta cero', async () => {
  // Si `reconoce` llamara al modelo, cada mensaje del equipo costaría plata sólo por existir.
  assert.equal((await especialista.reconoce('', { fileIds: ['f1'], area: 'compras' })).destino, 'cargar')
  assert.equal(await especialista.reconoce('hola qué tal', { fileIds: [], area: 'compras' }), null)
  // SIN `port` NO HAY CONSULTA: la respuesta escrita se reclama contra el fajo abierto, y sin base
  // el especialista devuelve null sin tocar nada. Un reclamo no puede depender de una lectura que
  // no se hizo.
  assert.equal(await especialista.reconoce('MESSINA', { fileIds: [], area: 'compras' }), null)
})

test('la puerta de permisos no roza un modelo', async () => {
  const r = await puedeCargarComprobantes({
    port: portGuarda(), actor: { plataforma_user_id: 'u1', channel_type: 'P' }, channelId: 'c1',
    razonar: MODELO_PROHIBIDO,
  })
  assert.equal(r.ok, true)
})

test('el agrupado, el resumen y la clave son aritmética y texto, no razonamiento', () => {
  assert.equal(entraEnElFajo({ estado: ESTADO.ABIERTO, plataforma_user_id: 'u1', channel_id: 'c1', ultimo_at: new Date() },
    { userId: 'u1', channelId: 'c1', ahora: new Date() }), true)
  assert.equal(colapsarRepetidos([item(), item()]).items.length, 1)
  assert.ok(resumenFajo({ items: [item()] }).includes('Confirmar'))
  assert.ok(claveComprobante(item().comprobante).fuerte)
})

test('la escritura no consulta a ningún modelo ni cuando algo sale mal', async () => {
  const repo = repoMemoria()
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', items: [item()] })
  const r = await escribirFajo({
    port: null, repo, congelado: () => null, razonar: MODELO_PROHIBIDO,
    correr: async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 7 }] } }),
  }, fajo)
  assert.match(r.texto, /fila 7/)
})

test('corregir a mano tampoco: lo que la persona escribe se valida, no se interpreta', () => {
  const r = aplicarCorreccion(item(), { obra: 'Messina' }, { obras: ['Estrella', 'Messina'] })
  assert.equal(r.item.comprobante.obra, 'Messina')
})

test('normalizar una lectura ya hecha es puro: el modelo se usó ANTES, una vez', () => {
  const { comprobante } = normalizarLectura({ emisor: 'X', letra: 'A', numero: '1-1', fecha: '01/01/2026', total: '100,00' })
  assert.equal(comprobante.total, 100)
  assert.equal(aFajoJson([item()]).length, 1)
})

test('la conciliación con ARCA y el matcheo de lo manuscrito son aritmética, no razonamiento', () => {
  // Son las dos capacidades que se agregaron el 03/08 y las dos tenían una versión "obvia" que
  // habría sido pedirle a un modelo que dijera si dos comprobantes son el mismo, o a qué obra va
  // una anotación. Las dos habrían costado plata por comprobante y las dos habrían sido inauditables.
  const c = { cuit: '23369111574', tipo: 'A', numero: '0004-00036542', fecha: '30/07/2026', total: 62000 }
  const r = conciliarConArca(c, [{
    emisor_cuit: '23369111574', punto_venta: '4', numero: '3642', cae: '86316017919602',
    fecha_emision: '2026-07-30', imp_total: 62000,
  }])
  assert.equal(r.numeroArca, '0004-00003642')
  assert.equal(imputacionDeAnotacion('Messinas BSA', { obras: ['MESSINA', 'ARCOR'] }).obra, 'MESSINA')
  assert.equal(buscarEnCompras(c, indexarCompras([])), null)
})
