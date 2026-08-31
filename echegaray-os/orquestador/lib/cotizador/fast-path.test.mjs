// LO QUE PRUEBA ESTE ARCHIVO (§13): que Claude no es una dependencia.
//
// La prueba central NO es un flag `modoOffline`. Son las CUATRO condiciones simuladas de verdad:
// sin key, sin saldo, con el proveedor tirando excepciones, y con los modelos desactivados. Las
// cuatro a la vez, y la corrida tiene que llegar hasta el final igual — con `llamadas_llm = 0`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NIVEL, FAST_PATH, NIVELES_SIN_MODELO, NIVELES_CON_MODELO, ordenDelFastPath, esNivelDeModelo,
  estadoDelProveedor, SIN_PROVEEDOR, crearRegistro, resolverPorFastPath, resuelveNivel, noResuelveNivel,
} from './fast-path.mjs'
import { PASO, resuelto, noResuelve } from './research.mjs'
import { crearCache } from './cache.mjs'
import { metricasDeCorrida, SIN_MEDIR } from './metricas.mjs'
import { crearMedidorLLM } from '../ia/medidor.mjs'
import { FUENTE } from '../plano/fuente.mjs'

const espia = (respuesta) => {
  const f = async (ctx) => { f.veces += 1; return typeof respuesta === 'function' ? respuesta(ctx) : respuesta }
  f.veces = 0
  return f
}

/** El proveedor caído de verdad: no un booleano, una función que tira como tira un 5xx. */
const PROVEEDOR_QUE_SE_CAYO = async () => { throw new Error('ECONNRESET: el proveedor cortó la conexión') }
/** El proveedor sin saldo: contesta, pero contesta que no hay crédito. */
const PROVEEDOR_SIN_SALDO = async () => { throw new Error('400 credit balance is too low') }

const PREGUNTA = '¿cuántos ladrillones entran en un m² de muro de 0,20?'

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EL ORDEN
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el fast path es EXACTAMENTE este y en este orden', () => {
  // MUTACIÓN QUE LO PONE ROJO: mover MODELO_BARATO antes de RESEARCH.
  //
  // El orden lo fijó el dueño el 31/08/2026 y CACHE va PRIMERO. El riesgo que eso abría —servir
  // estado vivo viejo— no se resolvió discutiendo el orden sino haciendo que el caché sepa de qué
  // nivel salió cada respuesta; lo prueba «el caché no sirve una respuesta de SQL…» más abajo.
  assert.deepEqual(ordenDelFastPath(), [
    'CACHE', 'CODE', 'SQL', 'BASE_MAESTRA', 'EXPERIENCIA_ECSAS', 'BIBLIOTECA_TECNICA',
    'RESEARCH', 'MODELO_BARATO', 'MODELO_POTENTE',
  ])
  assert.equal(NIVELES_SIN_MODELO.length, 7, 'siete niveles sobreviven a un proveedor muerto')
  assert.deepEqual([...NIVELES_CON_MODELO], ['MODELO_BARATO', 'MODELO_POTENTE'])
  assert.equal(esNivelDeModelo(NIVEL.RESEARCH), false, 'investigar NO es llamar a un modelo')
  // Los dos de modelo van ÚLTIMOS: si uno se colara antes, el sistema pagaría tokens por algo que
  // un nivel más barato sabía.
  assert.deepEqual(FAST_PATH.slice(-2).map((n) => n.id), [...NIVELES_CON_MODELO])
})

test('se detiene en el PRIMERO que resuelve: los de abajo ni se llaman', () => {
  const code = espia(resuelveNivel({ valor: 45, unidad: 'un/m2', porQue: 'lo calcula la composición' }))
  const sql = espia(resuelveNivel({ valor: 99 }))
  const barato = espia(resuelveNivel({ valor: 88 }))
  return resolverPorFastPath({
    pregunta: PREGUNTA,
    resolvedores: { [NIVEL.CODE]: code, [NIVEL.SQL]: sql, [NIVEL.MODELO_BARATO]: barato },
    proveedor: estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: 10 }),
  }).then((r) => {
    assert.equal(r.nivel, NIVEL.CODE)
    assert.equal(r.valor, 45)
    assert.equal(r.usoModelo, false)
    assert.deepEqual([code.veces, sql.veces, barato.veces], [1, 0, 0])
  })
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LAS CUATRO CONDICIONES, UNA POR UNA Y TODAS JUNTAS
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('estadoDelProveedor evalúa las CUATRO por separado y dice cuál falló', () => {
  const vivo = estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: 12.5, proveedorVivo: true, llmActivados: true })
  assert.equal(vivo.disponible, true, 'el verde tiene que ser alcanzable')
  assert.deepEqual([...vivo.motivos], [])

  assert.deepEqual([...estadoDelProveedor({ saldoUsd: 10, proveedorVivo: true, llmActivados: true }).motivos], ['sin_key'])
  assert.deepEqual([...estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: 0, proveedorVivo: true, llmActivados: true }).motivos], ['sin_saldo'])
  assert.deepEqual([...estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: 10, proveedorVivo: false, llmActivados: true }).motivos], ['proveedor_caido'])
  assert.deepEqual([...estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: 10, proveedorVivo: true, llmActivados: false }).motivos], ['desactivados'])

  // Las cuatro juntas — el caso del §13.
  const muerto = estadoDelProveedor({ apiKey: null, saldoUsd: 0, proveedorVivo: false, llmActivados: false })
  assert.equal(muerto.disponible, false)
  assert.deepEqual([...muerto.motivos], ['sin_key', 'sin_saldo', 'proveedor_caido', 'desactivados'])
})

test('un saldo que NO SE PUDO CONSULTAR no se declara disponible', () => {
  // Un control que no pudo mirar no dice «está bien». `null` no es «hay crédito».
  const r = estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: null, proveedorVivo: true, llmActivados: true })
  assert.equal(r.disponible, false)
  assert.equal(r.condiciones.sin_saldo, true)
  assert.match(r.porQue, /no se pudo consultar/)
})

test('SIN_PROVEEDOR es el default: un módulo no asume que hay modelo', async () => {
  // MUTACIÓN QUE LO PONE ROJO: en `resolverPorFastPath`, `proveedor = estadoDelProveedor({apiKey:'x',
  // saldoUsd:1, proveedorVivo:true, llmActivados:true})`.
  // CORRIDA: sin el espía de abajo esta mutación NO daba rojo — el aserto sobre la constante no
  // prueba nada del comportamiento. Hay que OMITIR `proveedor` y ver que el modelo igual no se llama.
  assert.equal(SIN_PROVEEDOR.disponible, false)
  const barato = espia(resuelveNivel({ valor: 'X' }))
  const r = await resolverPorFastPath({
    pregunta: PREGUNTA,
    // ← `proveedor` OMITIDO a propósito
    resolvedores: { [NIVEL.CODE]: async () => noResuelveNivel('no'), [NIVEL.MODELO_BARATO]: barato },
  })
  assert.equal(barato.veces, 0, 'sin decir nada del proveedor, se asume que NO hay')
  assert.equal(r.resuelto, false)
})

test('CUATRO CONDICIONES · con el proveedor muerto los niveles de modelo NO SE LLAMAN', async () => {
  // MUTACIÓN QUE LO PONE ROJO: en `resolverPorFastPath`, sacar el `if (nivel.usaModelo && !proveedor.disponible)`.
  //
  // ═══ POR QUÉ NINGÚN NIVEL DE ABAJO RESUELVE ACÁ ═══
  //
  // La primera versión de este test tenía BASE_MAESTRA resolviendo, y el bucle RETORNABA antes de
  // llegar a los niveles de modelo. Los espías daban 0 porque el fast path nunca llegó, no porque
  // los saltara: la mutación se corrió y NO dio rojo. El test afirmaba algo que no estaba probando.
  // Para probar el salto hay que llegar hasta ahí, y para llegar hasta ahí nada anterior puede
  // resolver.
  const barato = espia(PROVEEDOR_QUE_SE_CAYO)
  const potente = espia(PROVEEDOR_SIN_SALDO)
  const registro = crearRegistro()

  const r = await resolverPorFastPath({
    pregunta: PREGUNTA,
    proveedor: estadoDelProveedor({ apiKey: null, saldoUsd: 0, proveedorVivo: false, llmActivados: false }),
    resolvedores: {
      [NIVEL.CODE]: async () => noResuelveNivel('no hay una fórmula para esto'),
      [NIVEL.BASE_MAESTRA]: async () => noResuelveNivel('la composición no lo trae'),
      [NIVEL.MODELO_BARATO]: barato,
      [NIVEL.MODELO_POTENTE]: potente,
    },
    registro,
  })

  assert.deepEqual([barato.veces, potente.veces], [0, 0], 'apagado es no llamar, no llamar-y-atajar')
  // Y se saltaron ANOTADOS, diciendo cuál de las cuatro condiciones fue:
  const saltados = r.recorrido.filter((x) => x.estado === 'SALTADO')
  assert.deepEqual(saltados.map((x) => x.nivel), ['MODELO_BARATO', 'MODELO_POTENTE'])
  assert.match(saltados[0].porQue, /sin_key, sin_saldo, proveedor_caido, desactivados/)
  assert.equal(registro.paraMetricas().llamadasLLM.length, 0)
  assert.equal(r.requiereHumano, true)
})

test('CUATRO CONDICIONES · lo determinístico llega hasta el final igual', async () => {
  // La otra mitad: con las cuatro condiciones puestas, un nivel determinístico resuelve y la
  // corrida termina bien. Los dos casos hacen falta — sin éste, «no se llama al modelo» se podría
  // cumplir no haciendo nada.
  const registro = crearRegistro()
  const r = await resolverPorFastPath({
    pregunta: PREGUNTA,
    proveedor: estadoDelProveedor({ apiKey: null, saldoUsd: 0, proveedorVivo: false, llmActivados: false }),
    resolvedores: {
      [NIVEL.CODE]: async () => noResuelveNivel('no hay una fórmula para esto'),
      [NIVEL.BASE_MAESTRA]: async () => resuelveNivel({ valor: 45, unidad: 'un/m2', porQue: 'la composición T4010 lo trae' }),
      [NIVEL.MODELO_BARATO]: espia(PROVEEDOR_QUE_SE_CAYO),
    },
    registro,
  })
  assert.equal(r.resuelto, true)
  assert.equal(r.nivel, NIVEL.BASE_MAESTRA)
  assert.equal(r.valor, 45)
  assert.equal(registro.decisionesDeterministicas, 1)
  assert.equal(registro.paraMetricas().llamadasLLM.length, 0)
})

test('CUATRO CONDICIONES · el proveedor que se cae EN MEDIO no rompe la corrida', async () => {
  // El caso que el flag no cubre: el proveedor estaba vivo cuando arrancó la corrida y se murió
  // después. La llamada SÍ sale, tira, y lo determinístico que faltaba tiene que seguir.
  const registro = crearRegistro()
  const r = await resolverPorFastPath({
    pregunta: PREGUNTA,
    proveedor: estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: 10, proveedorVivo: true, llmActivados: true }),
    resolvedores: {
      [NIVEL.CODE]: async () => noResuelveNivel('no hay fórmula'),
      [NIVEL.MODELO_BARATO]: PROVEEDOR_QUE_SE_CAYO,
      [NIVEL.MODELO_POTENTE]: PROVEEDOR_SIN_SALDO,
    },
    registro,
  })
  assert.equal(r.resuelto, false)
  assert.equal(r.requiereHumano, true, 'nueve niveles fallaron: sigue una persona')
  const errores = r.recorrido.filter((x) => x.estado === 'ERROR')
  assert.equal(errores.length, 2)
  assert.match(errores[0].porQue, /ECONNRESET/)
  assert.match(errores[1].porQue, /credit balance/)
  assert.equal(registro.paraMetricas().llamadasLLM.length, 0, 'una llamada que tiró no es una llamada facturada')
})

test('con el proveedor VIVO y todo lo barato agotado, el modelo SÍ se usa', async () => {
  // Si el fast path nunca llegara al modelo, el control sería una constante: probamos que puede.
  const registro = crearRegistro()
  const r = await resolverPorFastPath({
    pregunta: 'el pliego dice «terminación a definir por la DO»: ¿qué alcance tiene?',
    proveedor: estadoDelProveedor({ apiKey: 'sk-x', saldoUsd: 10 }),
    resolvedores: {
      [NIVEL.CODE]: async () => noResuelveNivel('no es una cuenta'),
      [NIVEL.MODELO_BARATO]: async () => ({ ...resuelveNivel({ valor: 'ambiguo: hay que preguntar' }), uso: { tokensIn: 1200, tokensOut: 300, usd: 0.004 } }),
    },
    registro,
  })
  assert.equal(r.nivel, NIVEL.MODELO_BARATO)
  assert.equal(r.usoModelo, true)
  assert.equal(r.fuente, FUENTE.INFERIDO, 'lo que dedujo un modelo es INFERIDO')
  const m = registro.paraMetricas()
  assert.equal(m.llamadasLLM.length, 1)
  assert.equal(m.llamadasLLM[0].usd, 0.004)
  assert.equal(m.decisionesDeterministicas, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL CACHÉ DENTRO DEL FAST PATH
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('lo resuelto por un nivel caro se sirve del CACHE la segunda vez', async () => {
  const cache = crearCache({ version: 'fp@1' })
  const base = espia(resuelveNivel({ valor: 45, unidad: 'un/m2' }))
  const args = { pregunta: PREGUNTA, entradas: { espesor: 0.2 }, resolvedores: { [NIVEL.BASE_MAESTRA]: base }, cache }

  const uno = await resolverPorFastPath(args)
  const dos = await resolverPorFastPath(args)
  assert.equal(uno.nivel, NIVEL.BASE_MAESTRA)
  assert.equal(dos.nivel, NIVEL.CACHE, 'la segunda sale del caché')
  assert.equal(dos.deCache, true)
  assert.equal(dos.valor, 45)
  assert.equal(base.veces, 1, 'no se volvió a consultar la Base Maestra')
  assert.equal(cache.contadores().cache_hits, 1)
})

test('NEGATIVO · con una ENTRADA distinta el CACHE no contesta', async () => {
  // MUTACIÓN QUE LO PONE ROJO: en `consultarNivel` Y en `resolverPorFastPath`, sacar `entradas` de
  // las DOS —de `cache.leer` y de `cache.escribir`—. Sacarla de una sola no alcanza para probar
  // esto: la clave de lectura deja de coincidir con la de escritura, nunca hay hit y este test pasa
  // por la razón equivocada. Se verifica el VALOR, no sólo el nivel, justamente por eso.
  //
  // El daño concreto: un muro de 0,30 recibiría los 45 ladrillones del muro de 0,20.
  const cache = crearCache({ version: 'fp@1' })
  const base = espia(({ entradas }) => resuelveNivel({ valor: entradas.espesor === 0.2 ? 45 : 68 }))
  const con = (espesor) => resolverPorFastPath({ pregunta: PREGUNTA, entradas: { espesor }, resolvedores: { [NIVEL.BASE_MAESTRA]: base }, cache })

  assert.equal((await con(0.2)).valor, 45)
  const otro = await con(0.3)
  assert.equal(otro.valor, 68, 'el muro de 0,30 NO puede recibir el número del de 0,20')
  assert.equal(otro.deCache, false)
  assert.equal(base.veces, 2, 'cambió el espesor: hubo que volver a resolver')
  // Y el de 0,20 repetido SÍ sale del caché — si no, este test se cumpliría con un caché apagado.
  const repetido = await con(0.2)
  assert.equal(repetido.deCache, true)
  assert.equal(repetido.valor, 45)
  assert.equal(base.veces, 2, 'la repetición exacta no volvió a consultar')
})

test('NEGATIVO · el CACHE de otra VERSIÓN de código no se sirve', async () => {
  const args = (cache) => ({ pregunta: PREGUNTA, resolvedores: { [NIVEL.BASE_MAESTRA]: async () => resuelveNivel({ valor: 45 }) }, cache })
  const v1 = crearCache({ version: 'fp@1' })
  await resolverPorFastPath(args(v1))
  assert.equal((await resolverPorFastPath(args(v1))).nivel, NIVEL.CACHE)
  // El mismo almacén no se comparte entre versiones, y las claves tampoco coinciden.
  const v2 = crearCache({ version: 'fp@2' })
  assert.equal((await resolverPorFastPath(args(v2))).nivel, NIVEL.BASE_MAESTRA)
})

test('sin caché el nivel CACHE se salta ANOTADO, no en silencio', async () => {
  // El resolvedor que responde tiene que estar DEBAJO de CACHE, o CACHE ni se visita.
  const r = await resolverPorFastPath({ pregunta: PREGUNTA, resolvedores: { [NIVEL.BASE_MAESTRA]: async () => resuelveNivel({ valor: 1 }) } })
  const c = r.recorrido.find((x) => x.nivel === NIVEL.CACHE)
  assert.equal(c.estado, 'SIN_RESOLVEDOR')
  assert.match(c.porQue, /no hay caché/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · RESEARCH DENTRO DEL FAST PATH — y la web sin ascenso
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el nivel RESEARCH corre la cascada del §12 y cuenta la llamada web', async () => {
  const registro = crearRegistro()
  const r = await resolverPorFastPath({
    pregunta: 'resistencia mínima de un H-21 según CIRSOC',
    resolvedores: { [NIVEL.CODE]: async () => noResuelveNivel('no es una cuenta') },
    research: {
      resolvedores: {
        [PASO.BASE_MAESTRA]: async () => noResuelve('no está'),
        [PASO.WEB]: async () => resuelto({ valor: 21, unidad: 'MPa', porQue: 'lo publica el INTI', extra: { url: 'https://www.inti.gob.ar/x', autoridad: 'ORGANISMO_TECNICO' } }),
      },
    },
    registro,
  })
  assert.equal(r.nivel, NIVEL.RESEARCH)
  assert.equal(r.valor, 21)
  assert.equal(r.fuente, FUENTE.WEB, 'sigue siendo web dentro del fast path')
  assert.equal(r.usoModelo, false, 'investigar no es llamar a un modelo')
  const m = registro.paraMetricas()
  assert.equal(m.llamadasWeb.length, 1)
  assert.equal(m.llamadasLLM.length, 0)
  assert.equal(m.investigaciones[0].esExperienciaEcsas, false)
})

test('NEGATIVO · el RESEARCH no habilita el modelo si el proveedor no está', async () => {
  // MUTACIÓN QUE LO PONE ROJO: en `consultarNivel`, `permitirModelo: research.permitirModelo`
  // sin el `&& proveedor.disponible`. El modelo entraría por la puerta de atrás del research.
  const modelo = espia(resuelto({ valor: 'X' }))
  const r = await resolverPorFastPath({
    pregunta: 'la partida es ambigua',
    proveedor: estadoDelProveedor({ apiKey: null, saldoUsd: 0, proveedorVivo: false, llmActivados: false }),
    research: { permitirModelo: true, ambiguo: true, resolvedores: { [PASO.MODELO]: modelo } },
  })
  assert.equal(modelo.veces, 0)
  assert.equal(r.resuelto, false)
  assert.equal(r.requiereHumano, true)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · EL REGISTRO ALIMENTA LAS MÉTRICAS SIN DEDUCIR NADA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el registro produce las métricas del §21 y el AVOIDANCE es 100 % HONESTO', async () => {
  const cache = crearCache({ version: 'fp@1' })
  const registro = crearRegistro({ cache })
  const proveedor = estadoDelProveedor({ apiKey: null, saldoUsd: 0, proveedorVivo: false, llmActivados: false })
  const resolvedores = {
    [NIVEL.CODE]: async ({ entradas }) => (entradas.n ? resuelveNivel({ valor: entradas.n * 2 }) : noResuelveNivel('sin n')),
    [NIVEL.BASE_MAESTRA]: async () => resuelveNivel({ valor: 45 }),
  }
  for (const n of [1, 2, 0, 0]) await resolverPorFastPath({ pregunta: `p${n}`, entradas: { n }, resolvedores, cache, registro, proveedor })

  const m = metricasDeCorrida({ ...registro.paraMetricas(), cantidades: [{ valor: 1, estado: 'CALCULADO' }] })
  assert.equal(m.llamadas_llm, 0)
  assert.equal(m.tokens, 0)
  assert.equal(m.costo_llm_usd, 0)
  assert.equal(m.claude_avoidance_rate, 1, 'cuatro decisiones, ninguna con modelo')
  assert.equal(m.claude_avoidance_base, 4, 'y se publica sobre cuántas — 4/4 no es 400/400')
  assert.equal(m.cache_hits, 1, 'la cuarta (n=0) repitió a la tercera')
  assert.deepEqual(m.fast_path_por_nivel, { CODE: 2, BASE_MAESTRA: 1, CACHE: 1 })
})

test('una corrida SIN decisiones publica SIN_MEDIR, no 100 %', () => {
  const m = metricasDeCorrida({ ...crearRegistro().paraMetricas() })
  assert.equal(m.claude_avoidance_rate, SIN_MEDIR)
  assert.equal(m.autonomous_resolution_rate, SIN_MEDIR)
  assert.equal(m.cache_hit_rate, null, 'un caché que no existió no tiene tasa')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE NUNCA SE LE PREGUNTA A UN MODELO (31/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Estos tests existen porque la regla estaba escrita en un documento y nada la hacía cumplir. Cada
// uno cablea un modelo que SÍ FUNCIONA y con el proveedor DISPONIBLE: si el fast path lo llamara,
// resolvería y el test se pondría rojo. Probar esto con el proveedor caído no probaría nada — sólo
// que sin modelo no hay modelo.

const PROVEEDOR_VIVO = estadoDelProveedor({ apiKey: 'sk-ant-de-prueba', saldoUsd: 10, proveedorVivo: true, llmActivados: true })

test('PROHIBIDO · una SUMA no llega a un modelo, aunque el modelo esté vivo y sepa contestarla', async () => {
  const modelo = espia(resuelveNivel({ valor: 546, porQue: 'lo calculé yo' }))
  const registro = crearRegistro()
  const r = await resolverPorFastPath({
    pregunta: '520 * 1,05',
    resolvedores: { [NIVEL.MODELO_BARATO]: modelo, [NIVEL.MODELO_POTENTE]: modelo },
    proveedor: PROVEEDOR_VIVO, registro,
  })

  assert.equal(modelo.veces, 0, 'no se llama y se descarta: NO SE LLAMA')
  assert.equal(r.resuelto, false, 'sin resolvedor determinístico cableado, esto es trabajo de una persona')
  assert.equal(r.determinista.si, true)
  assert.equal(r.determinista.clase, 'ARITMETICA')
  const prohibidos = r.recorrido.filter((x) => x.estado === 'PROHIBIDO').map((x) => x.nivel)
  assert.deepEqual(prohibidos, ['MODELO_BARATO', 'MODELO_POTENTE'])
  assert.equal(registro.prohibidas.length, 2, 'queda anotado cuántos tokens se ahorraron y por qué')
})

test('PROHIBIDO · las siete clases declaradas bloquean el modelo, y la interpretación NO', async () => {
  const clases = ['ARITMETICA', 'CONVERSION_UNIDADES', 'SQL', 'DATO_ESTRUCTURADO', 'COMPARAR_HASH', 'REGLA_DETERMINISTICA']
  for (const clase of clases) {
    const modelo = espia(resuelveNivel({ valor: 'lo que sea' }))
    const r = await resolverPorFastPath({
      pregunta: 'una pregunta cualquiera', clase,
      resolvedores: { [NIVEL.MODELO_BARATO]: modelo }, proveedor: PROVEEDOR_VIVO,
    })
    assert.equal(modelo.veces, 0, `la clase ${clase} no puede llegar a un modelo`)
    assert.equal(r.determinista.clase, clase)
  }
  // Y el control PUEDE decir que sí: si nunca dejara pasar nada, el modelo no serviría para nada.
  const modelo = espia(resuelveNivel({ valor: 'T1010', porQue: 'lo interpreté' }))
  const r = await resolverPorFastPath({
    pregunta: '«COLUMNA DE CARGA H17»: ¿T1010 o T1069?', clase: 'INTERPRETACION',
    resolvedores: { [NIVEL.MODELO_BARATO]: modelo }, proveedor: PROVEEDOR_VIVO,
  })
  assert.equal(modelo.veces, 1, 'lo ambiguo SÍ llega al modelo: un control que siempre dice que no no dice nada')
  assert.equal(r.nivel, NIVEL.MODELO_BARATO)
})

test('PROHIBIDO · un SELECT escrito en la pregunta se detecta aunque nadie declare la clase', async () => {
  const modelo = espia(resuelveNivel({ valor: 42 }))
  const r = await resolverPorFastPath({
    pregunta: 'select sum(total) from public.cotizacion_partida where obra_id = 7',
    resolvedores: { [NIVEL.MODELO_BARATO]: modelo }, proveedor: PROVEEDOR_VIVO,
  })
  assert.equal(modelo.veces, 0)
  assert.equal(r.determinista.clase, 'SQL')
  assert.equal(r.determinista.como, 'DETECTADA_EN_EL_TEXTO')
})

test('PROHIBIDO · lo prohibido para el modelo NO bloquea los siete niveles baratos', async () => {
  const code = espia(resuelveNivel({ valor: 546, porQue: 'la multiplicación la hace el OS' }))
  const modelo = espia(resuelveNivel({ valor: 'algo' }))
  const r = await resolverPorFastPath({
    pregunta: '520 * 1,05', clase: 'ARITMETICA',
    resolvedores: { [NIVEL.CODE]: code, [NIVEL.MODELO_BARATO]: modelo },
    proveedor: PROVEEDOR_VIVO,
  })
  assert.equal(r.nivel, NIVEL.CODE, 'la cuenta la resuelve el código, que es de lo que se trata')
  assert.equal(r.valor, 546)
  assert.equal(modelo.veces, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CACHÉ PRIMERO, Y LO QUE ESO OBLIGÓ
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el caché NO sirve una respuesta de SQL cuando nadie declaró cuánta antigüedad se tolera', async () => {
  const cache = crearCache({ version: 'v1' }) // sin ttlMs
  let vueltas = 0
  const sql = async () => { vueltas += 1; return resuelveNivel({ valor: 100 + vueltas, porQue: 'select de ahora' }) }
  const args = { pregunta: 'saldo de la obra', entradas: { obra: 7 }, resolvedores: { [NIVEL.SQL]: sql }, cache }

  const uno = await resolverPorFastPath(args)
  const dos = await resolverPorFastPath(args)
  assert.equal(uno.nivel, NIVEL.SQL)
  assert.equal(dos.nivel, NIVEL.SQL, 'estado vivo sin TTL declarado se vuelve a consultar')
  assert.equal(dos.valor, 102, 'y trae el valor de AHORA, no el de la corrida anterior')
  assert.equal(vueltas, 2)
})

test('el caché SÍ sirve una respuesta de SQL cuando el TTL está declarado', async () => {
  const cache = crearCache({ version: 'v1', ttlMs: 60_000 })
  let vueltas = 0
  const sql = async () => { vueltas += 1; return resuelveNivel({ valor: 100 + vueltas }) }
  const args = { pregunta: 'saldo de la obra', entradas: { obra: 7 }, resolvedores: { [NIVEL.SQL]: sql }, cache }

  await resolverPorFastPath(args)
  const dos = await resolverPorFastPath(args)
  assert.equal(dos.nivel, NIVEL.CACHE, 'alguien declaró que un minuto de antigüedad es aceptable')
  assert.equal(dos.nivelOrigen, NIVEL.SQL, 'y se sigue sabiendo de dónde salió de verdad')
  assert.equal(vueltas, 1)
})

test('el caché SÍ sirve una respuesta de CODE sin TTL: una función pura no envejece', async () => {
  const cache = crearCache({ version: 'v1' })
  let vueltas = 0
  const code = async () => { vueltas += 1; return resuelveNivel({ valor: 546 }) }
  const args = { pregunta: '520 × 1,05', entradas: { a: 520 }, resolvedores: { [NIVEL.CODE]: code }, cache }

  await resolverPorFastPath(args)
  const dos = await resolverPorFastPath(args)
  assert.equal(dos.nivel, NIVEL.CACHE)
  assert.equal(dos.nivelOrigen, NIVEL.CODE)
  assert.equal(vueltas, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTADOR QUE PUEDE DECIR QUE NO — Y QUE NO SE DEJA ENGAÑAR POR LA DECLARACIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════

const RESPUESTA_REAL = () => new Response(JSON.stringify({
  model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'ok' }],
  usage: { input_tokens: 1000, output_tokens: 200 },
}), { status: 200, headers: { 'content-type': 'application/json' } })

test('una llamada declarada SIN uso no puede costar $ 0: la plata la pone el transporte', async () => {
  // ═══ EL DEFECTO QUE ESTE TEST ENCONTRÓ AL CORRERLO ═══
  // `consultarNivel` anota `{...salida.uso}`, y un resolvedor que no devuelve `uso` dejaba
  // `tokensIn: 0, usd: 0`. El CONTEO salía bien —1 llamada— y la PLATA salía en cero. Una llamada
  // real facturada como gratis es el mismo defecto que un control que no puede dar rojo.
  const original = globalThis.fetch
  globalThis.fetch = async () => RESPUESTA_REAL()

  const medidor = crearMedidorLLM()
  const desinstalar = medidor.instalar()
  try {
    const registro = crearRegistro({ medidor })
    await resolverPorFastPath({
      pregunta: 'algo ambiguo de verdad', clase: 'INTERPRETACION',
      resolvedores: {
        [NIVEL.MODELO_BARATO]: async () => {
          await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' })
          return resuelveNivel({ valor: 'T1010' }) // ← sin `uso`
        },
      },
      proveedor: PROVEEDOR_VIVO, registro,
    })

    assert.equal(registro.llamadasLLM[0].usd, 0, 'lo declarado por el fast path era, efectivamente, cero')

    const m = metricasDeCorrida({ ...registro.paraMetricas(), cantidades: [{ valor: 1, estado: 'CALCULADO' }] })
    assert.equal(m.llamadas_llm, 1)
    // MUTACIÓN QUE LO PONE ROJO: en `paraMetricas()`, devolver `[...llamadasLLM]` en vez de unir.
    assert.equal(m.tokens, 1200, 'los tokens salen del `usage` del proveedor')
    assert.equal(m.costo_llm_usd, 0.002, '1000/1e6×$1 + 200/1e6×$5 — y no $ 0')
  } finally { desinstalar(); globalThis.fetch = original }
})

test('una llamada al modelo hecha POR FUERA del fast path igual entra en el costo', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => RESPUESTA_REAL()

  const medidor = crearMedidorLLM()
  const desinstalar = medidor.instalar()
  try {
    const registro = crearRegistro({ medidor })
    // Nadie pasó por `resolverPorFastPath`: es el caso de un módulo que se abre su propia puerta.
    await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' })

    const c = registro.conciliacion()
    assert.equal(c.declaradas, 0, 'el fast path no la vio pasar')
    assert.equal(c.medidas, 1, 'el transporte sí')
    assert.equal(c.noDeclaradas, 1)
    assert.equal(c.cuadra, false)
    assert.match(c.porQue, /NADIE declaró/)

    const m = metricasDeCorrida({ ...registro.paraMetricas(), cantidades: [{ valor: 1, estado: 'CALCULADO' }] })
    assert.equal(m.llamadas_llm, 1, 'llamar por fuera deja de ser una forma de que el costo baje')
    assert.equal(m.costo_llm_usd, 0.002)
  } finally { desinstalar(); globalThis.fetch = original }
})

test('sin medidor, la conciliación dice que NO PUDO MIRAR — no dice que no hubo', () => {
  const c = crearRegistro().conciliacion()
  assert.equal(c.medidas, null, 'un control que no pudo mirar no afirma que está todo bien')
  assert.equal(c.cuadra, null)
  assert.match(c.porQue, /no instaló el medidor/)
})
