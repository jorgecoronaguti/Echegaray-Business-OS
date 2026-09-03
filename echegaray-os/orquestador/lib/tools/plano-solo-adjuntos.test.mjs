// LA TOOL, EJECUTADA DE VERDAD: con adjuntos, Drive no se toca.
//
// El ternario que traduce «hay adjuntos» a `conDrive` vivía sin un solo test que lo corriera: la
// decisión de si esta capacidad sale o no al índice de Drive se probaba una capa más abajo, sobre
// `fuentesDe`. Acá se ejecuta el camino completo —`run()` de `plano.cotizar`— con un Postgres y un
// Drive que EXPLOTAN si alguien los usa para lo que no debe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planoTools } from './plano-tool.mjs'

/** Postgres falso: el índice de Drive es lo único que no puede consultarse. */
const queryQueExplotaEnElIndice = async (sql) => {
  if (/from public\.drive_index/i.test(String(sql))) throw new Error('MODO SÓLO-ADJUNTOS CONSULTÓ EL ÍNDICE DE DRIVE')
  return { rows: [] }
}

/** Drive falso: cualquier método que alguien llame revienta con su nombre. */
const driveQueExplota = new Proxy({}, {
  get: (_t, prop) => async () => { throw new Error(`MODO SÓLO-ADJUNTOS LLAMÓ A DRIVE: ${String(prop)}`) },
})

const correrTool = (archivos) => planoTools(driveQueExplota, { query: queryQueExplotaEnElIndice })['plano.cotizar']
  .run({ proyecto: 'San Francisco del Monte', archivos })

test('CON ADJUNTOS la tool NO consulta el índice ni baja nada — y lo dice en su respuesta', async () => {
  // Un adjunto que no es plano corta apenas clasificado: alcanza para probar la decisión, que se
  // toma ANTES de mirar el contenido, sin gastar una sola llamada paga.
  const r = await correrTool([{ nombre: 'nota del cliente.txt', contenido: 'Hola, ¿cuándo empiezan?' }])
  assert.doesNotMatch(String(r.error ?? ''), /ÍNDICE DE DRIVE|LLAMÓ A DRIVE/, 'la corrida con adjuntos no puede tocar Drive')
  assert.match(String(r.resumen_texto ?? ''), /Miré SÓLO los 1 adjunto\(s\) —no busqué en Drive—/)
  assert.equal(r.documentos_encontrados, 1, 'el único documento de la corrida es el adjunto')
})

test('SIN ADJUNTOS la tool SÍ va al índice: la conducta vieja no se perdió', async () => {
  // El otro lado del mismo ternario. Sin este test, «no toca Drive» podría estar cumpliéndose
  // porque la capacidad dejó de buscar en Drive SIEMPRE, que sería otro defecto.
  const r = await correrTool([])
  assert.match(String(r.error ?? ''), /CONSULTÓ EL ÍNDICE DE DRIVE/, 'sin adjuntos, el término se busca en el índice')
})
