#!/usr/bin/env node
// EL FALLBACK GENERATIVO, EJERCITADO DE VERDAD — sobre un caso ambiguo REAL de la Base Maestra.
//
// ═══ POR QUÉ ESTE SCRIPT EXISTE AL LADO DE `xsas-sin-llm.mjs` ═══
//
// Aquél prueba que XSAS llega al final con el proveedor muerto. Éste prueba lo otro: que cuando hay
// un caso que el camino determinístico NO puede cerrar, el modelo entra, aporta algo verificable, y
// **no toca el estado comercial**. Los dos hacen falta. Un sistema que evita el modelo al 100 % no
// es determinístico, es incompleto; y uno que lo deja escribir precios no es un sistema.
//
// ═══ EL CASO ES REAL Y SE LEE DE POSTGRES, NO SE INVENTA ═══
//
// Las candidatas salen de `public.tarea_tipo` —la Base Maestra viva, 205 tareas activas—. El grupo
// que se usa por defecto son las dos COLUMNAS DE CARGA H17, que comparten raíz comercial y unidad,
// quedan a distancia 0 en el selector y cuyo atributo diferenciador (`armadura`) `atributosDe` NO
// extrae. Es uno de los seis grupos ambiguos que el detector determinístico de mitades no cubre.
//
// ═══ LA LLAVE ES LA DEL SISTEMA DE VERDAD ═══
//
// Se lee de `~/.config/echegaray-orq/anthropic.env`, el mismo `EnvironmentFile` que usa
// `echegaray-orq-worker.service`. En este repo ya hubo una sonda que declaró muerto un token sano
// porque probaba con OTRA llave; probar con una propia no prueba nada del sistema.
//
// ═══ EL MODELO NO ESCRIBE NADA ═══
//
// Sale por `lib/ia/cliente.mjs` —la puerta única, que pide una CAPACIDAD y no un modelo—, devuelve
// JSON, y ese JSON pasa por `validarDesambiguacion` antes de tocar nada. Lo que produce se sella con
// su procedencia y NO asciende a experiencia de ECSAS. La decisión sigue cerrándose por
// `responder()`, que sólo acepta uno de los códigos ofrecidos.
//
//   node orquestador/scripts/xsas-generativo-fallback.mjs
//   node orquestador/scripts/xsas-generativo-fallback.mjs --rechazo   ← el test negativo, ejecutado
//   node orquestador/scripts/xsas-generativo-fallback.mjs --sin-llamada  ← sin gastar un token
//   node orquestador/scripts/xsas-generativo-fallback.mjs --json

import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ARGS = new Set(process.argv.slice(2))

// ── 1 · LA LLAVE, DE DONDE LA SACA EL WORKER ──────────────────────────────────────────────────
const ARCHIVO_LLAVE = path.join(os.homedir(), '.config', 'echegaray-orq', 'anthropic.env')
function cargarLlaveDelSistema() {
  try {
    for (const linea of readFileSync(ARCHIVO_LLAVE, 'utf8').split('\n')) {
      const i = linea.indexOf('=')
      if (i < 0) continue
      const k = linea.slice(0, i).trim()
      const v = linea.slice(i + 1).trim()
      if (k && !process.env[k]) process.env[k] = v
    }
    return { ok: Boolean(process.env.ANTHROPIC_API_KEY), de: ARCHIVO_LLAVE }
  } catch (e) {
    return { ok: false, de: ARCHIVO_LLAVE, porQue: String(e?.message ?? e) }
  }
}
const LLAVE = cargarLlaveDelSistema()

const { query } = await import('../lib/db.mjs')
const { seleccionar } = await import('../lib/plano/seleccion.mjs')
const { atributosDe } = await import('../lib/plano/atributos.mjs')
const { paresComplementarios, alcanceDeclarado } = await import('../lib/base-maestra-completitud.mjs')
const { preguntaParaCerrar, responder } = await import('../lib/base-maestra-pregunta.mjs')
const { validarDesambiguacion, interpretacionDelModelo, ATRIBUTOS_CONOCIDOS, RELACION } =
  await import('../lib/cotizador/research.mjs')
const { crearMedidorLLM } = await import('../lib/ia/medidor.mjs')
const { crearCache } = await import('../lib/cotizador/cache.mjs')
const { crearRegistro, resolverPorFastPath, resuelveNivel, noResuelveNivel, estadoDelProveedor, NIVEL } =
  await import('../lib/cotizador/fast-path.mjs')

const RAIZ = process.env.XSAS_RAIZ_AMBIGUA ?? 'COLUMNA DE CARGA H17'
const fila = (k, v) => `  ${String(k).padEnd(40, '.')} ${v}`
const salida = { llave: { ok: LLAVE.ok, de: LLAVE.de } }

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL CASO AMBIGUO, LEÍDO DE LA BASE MAESTRA VIVA
// ══════════════════════════════════════════════════════════════════════════════════════════════

const { rows: candidatas } = await query(
  `select codigo, nombre, unidad
     from public.tarea_tipo
    where activo is not false and nombre ilike $1
    order by codigo`,
  [`${RAIZ}%`],
)
if (candidatas.length < 2) {
  console.error(`✖ «${RAIZ}» no produce un caso ambiguo en la Base Maestra de hoy (${candidatas.length} candidata/s). No se inventa uno.`)
  process.exit(1)
}
const cands = candidatas.map((c, i) => ({ id: `bm-${i}`, codigo: c.codigo, nombre: c.nombre, unidad: c.unidad }))

// El costo real de cada una: sin plata, la pregunta traslada la decisión sin la información.
const { rows: costos } = await query(
  `select tt.codigo, round(sum(coalesce(c.cantidad,0) * coalesce(r.precio_unitario,0))::numeric, 2) costo
     from public.tarea_tipo tt
     left join public.composicion c on c.tarea_tipo_id = tt.id
     left join public.recurso r on r.id = c.recurso_id
    where tt.codigo = any($1) group by tt.codigo`,
  [cands.map((c) => c.codigo)],
).catch(() => ({ rows: [] }))
const COSTOS = Object.fromEntries(costos.map((r) => [r.codigo, r.costo === null ? null : Number(r.costo)]))

const dictado = { id: 'D-1', nombre: RAIZ, unidad: cands[0].unidad }
const mapeo = seleccionar(dictado, cands)
const pregunta = preguntaParaCerrar(mapeo, { costos: COSTOS, paresComplementarios: paresComplementarios(cands) })

salida.determinista = {
  raiz: RAIZ,
  candidatas: cands.map((c) => ({ codigo: c.codigo, nombre: c.nombre, unidad: c.unidad, costo: COSTOS[c.codigo] ?? null })),
  estado: mapeo.estado,
  porQue: mapeo.porQue,
  alcanceDeclarado: cands.map((c) => ({ codigo: c.codigo, alcance: alcanceDeclarado(c.nombre)?.cajon ?? null })),
  atributosExtraidos: cands.map((c) => ({ codigo: c.codigo, armadura: atributosDe(c.nombre)?.armadura ?? null })),
  tipoDePregunta: pregunta?.tipo ?? null,
  preguntaQueSaleHoy: pregunta?.pregunta ?? null,
  recomendada: pregunta?.recomendada ?? null,
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL PROMPT — ESTRUCTURA DECLARADA, Y LA PROHIBICIÓN ESCRITA DOS VECES
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Está escrita en el prompt Y en `validarDesambiguacion`. La del prompt es una instrucción y se
// puede desobedecer; la de la validación es una condición de aceptación y no.

// La versión del prompt es parte de la procedencia: una salida guardada tiene que poder decir con
// qué texto se produjo. Cambiar el prompt cambia la versión, y una corrida vieja no se compara con
// una nueva como si fueran lo mismo.
const PROMPT_VERSION = 'desambiguacion@2'

const SISTEMA = [
  'Sos un asistente de una empresa constructora. Tu ÚNICA tarea es leer los nombres de dos o más',
  'partidas del catálogo interno y decir QUÉ ATRIBUTO TÉCNICO las diferencia, para que otra persona',
  'pueda elegir. NO elegís vos.',
  '',
  'Respondé con un objeto JSON y NADA MÁS: sin ```, sin json, sin markdown, sin texto antes ni',
  'después. El primer carácter de tu respuesta tiene que ser { y el último }.',
  '',
  'Forma EXACTA (respetá los nombres de campo y que `valores` sea una LISTA, no un diccionario):',
  '{"atributo":"...","valores":[{"codigo":"X","literal":"..."},{"codigo":"Y","literal":"..."}],',
  ' "relacion":"...","porQue":"..."}',
  '',
  `  atributo : uno de ${ATRIBUTOS_CONOCIDOS.join(' | ')}. Elegí el que REALMENTE las separa: si un`,
  '             atributo tiene el MISMO valor en todos los nombres, no es ése. Preguntarlo daría la',
  '             misma respuesta para todas y no serviría de nada.',
  '  literal  : un fragmento COPIADO TAL CUAL del nombre de esa partida. No lo reescribas ni lo',
  '             normalices: se verifica carácter por carácter contra el catálogo.',
  `  relacion : ${Object.values(RELACION).join(' | ')} — COMPLEMENTARIAS sólo si son dos mitades de la`,
  '             misma tarea que hay que SUMAR; INDISTINGUIBLES si los nombres no alcanzan.',
  '  porQue   : una sola oración, menos de 400 caracteres.',
  '',
  'PROHIBIDO: elegir una partida, recomendar una, mencionar o inventar precios, márgenes o',
  'coeficientes, y agregar cualquier campo que no esté en la lista de arriba.',
].join('\n')

const usuario = [
  `Unidad de medida: ${cands[0].unidad}. Candidatas:`,
  ...cands.map((c) => `- ${c.codigo}: ${c.nombre}`),
].join('\n')

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · LA CORRIDA, CON EL MEDIDOR PUESTO
// ══════════════════════════════════════════════════════════════════════════════════════════════

const medidor = crearMedidorLLM()
const cache = crearCache({ version: 'xsas-generativo@1' })
const registro = crearRegistro({ cache, medidor })
const PROVEEDOR = estadoDelProveedor({
  apiKey: process.env.ANTHROPIC_API_KEY ?? null,
  // El saldo no se consulta: sin poder mirarlo NO se declara que hay crédito, y por eso se declara
  // el mínimo que permite intentar. Si no hay saldo, el 400 del proveedor lo dirá y quedará medido.
  saldoUsd: LLAVE.ok ? 0.01 : 0,
  proveedorVivo: true,
  llmActivados: !ARGS.has('--sin-llamada'),
})

/** La salida ENVENENADA del test negativo: bien formada, plausible, y con dos cosas que la
 *  validación tiene que rechazar — un literal inventado y un campo de estado comercial. */
const SALIDA_ENVENENADA = JSON.stringify({
  atributo: 'armadura',
  relacion: 'ALTERNATIVAS',
  valores: cands.map((c, i) => ({ codigo: c.codigo, literal: i === 0 ? 'FE 250 KG/M3' : 'FE 110 KG/M3' })),
  porQue: 'difieren en la cuantía de armadura',
  elegida: cands[0].codigo,
  precioSugerido: 145000,
})

const desinstalar = medidor.instalar()
const tFrio = Date.now()
let bruto = null
let uso = null
let errorDelModelo = null

const resolvedorDelModelo = async () => {
  if (ARGS.has('--rechazo')) {
    // El test negativo NO gasta un token: lo que se prueba es la VALIDACIÓN, y para eso el texto
    // envenenado alcanza. Gastar para probar que un rechazo rechaza sería gastar por gastar.
    bruto = SALIDA_ENVENENADA
    return resuelveNivel({ valor: bruto, porQue: 'salida ENVENENADA inyectada a propósito' })
  }
  const { pedirTexto, CAPACIDAD } = await import('../lib/ia/cliente.mjs')
  const r = await pedirTexto({
    // ═══ POR QUÉ ESTO NO ES `SIMPLE` (medido el 31/08/2026) ═══
    // Arrancó en SIMPLE —parecía clasificar entre dos nombres conocidos— y `claude-haiku-4-5`
    // contestó `resistencia` en las dos corridas: las dos partidas dicen H17, así que ése atributo
    // no separa nada. Es el mismo criterio que `capacidad.mjs` ya aplica a la lectura de un
    // comprobante: la dificultad no la da el tamaño de la salida sino lo que cuesta equivocarse, y
    // acá equivocarse manda al jefe de obra una pregunta que no distingue las dos opciones.
    // `--simple` lo baja para poder mostrar las dos corridas una al lado de la otra.
    capacidad: ARGS.has('--simple') ? CAPACIDAD.SIMPLE : CAPACIDAD.COMPLEX,
    sistema: SISTEMA,
    mensajes: [{ role: 'user', content: usuario }],
    maxTokens: 400,
    // ═══ SIN `temperatura` — Y NO ES UN OLVIDO (medido el 31/08/2026) ═══
    // Con `temperatura: 0` esta llamada devolvía `anthropic 400: temperature is deprecated for this
    // model` (request_id req_011Ceak6ZPLGTz5oosC9En1Q). Los modelos de la familia 4.6 en adelante
    // —los que hoy resuelven el alias `opus`— rechazan los parámetros de muestreo. `pedirTexto`
    // sigue aceptando `temperatura` y `proveedores/anthropic.mjs` la reenvía tal cual, así que
    // CUALQUIER caller que la pase contra CAPACIDAD.COMPLEX se come un 400 duro. No se toca acá:
    // ese archivo es la puerta compartida de todo el OS y el arreglo es de quien la tiene a cargo.
    agente: 'xsas-cotizador',
    funcion: 'desambiguar-partida',
  })
  bruto = r.texto
  uso = { modelo: r.modelo, promptVersion: PROMPT_VERSION, tokensIn: r.tokens?.in ?? null, tokensOut: r.tokens?.out ?? null, usd: r.usd, ms: r.ms }
  return resuelveNivel({ valor: r.texto, porQue: `interpretado por ${r.modelo}`, uso: { tokensIn: uso.tokensIn, tokensOut: uso.tokensOut, usd: uso.usd } })
}

let recorrido = null
try {
  recorrido = await resolverPorFastPath({
    pregunta: `«${RAIZ}»: ¿${cands.map((c) => c.codigo).join(' o ')}?`,
    entradas: { candidatas: cands.map((c) => c.codigo) },
    // DECLARADA como interpretación: es la única clase que puede llegar a un modelo.
    clase: 'INTERPRETACION',
    resolvedores: {
      [NIVEL.CODE]: async () => noResuelveNivel('no hay una fórmula que distinga dos nombres de catálogo'),
      [NIVEL.SQL]: async () => noResuelveNivel('las dos filas existen y las dos son válidas: la base no desempata'),
      [NIVEL.BASE_MAESTRA]: async () => noResuelveNivel(mapeo.porQue),
      [NIVEL.EXPERIENCIA_ECSAS]: async () => noResuelveNivel('no hay una obra medida que ate este dictado a una de las dos'),
      [NIVEL.MODELO_BARATO]: resolvedorDelModelo,
    },
    proveedor: PROVEEDOR, registro, cache,
  })
} catch (e) {
  errorDelModelo = String(e?.message ?? e).slice(0, 300)
} finally {
  desinstalar()
}
// `consultarNivel` ATAJA lo que tira un resolvedor y lo anota en el recorrido — eso es correcto para
// el motor, pero acá dejaba «el modelo no llegó a contestar» sin decir por qué. El motivo está en el
// recorrido y se lo busca ahí: un informe que no puede decir qué falló no sirve para arreglarlo.
errorDelModelo ??= (recorrido?.recorrido ?? []).find((x) => x.estado === 'ERROR')?.porQue ?? null
const msFrio = Date.now() - tFrio

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · LA VALIDACIÓN DETERMINÍSTICA — Y LA PRUEBA DE QUE NO ESCRIBIÓ NADA
// ══════════════════════════════════════════════════════════════════════════════════════════════

const validacion = bruto === null
  ? { valido: false, problemas: [errorDelModelo ?? 'el modelo no llegó a contestar'], valor: null }
  : validarDesambiguacion(bruto, { candidatas: cands })

const sellada = validacion.valido
  ? interpretacionDelModelo({ valor: validacion.valor, candidatas: cands, provenance: { ...uso, cuando: new Date().toISOString() } })
  : null

// LA PRUEBA DE QUE EL MODELO NO CIERRA NADA: se le pasa su propia salida a `responder()`, que es lo
// ÚNICO que convierte una respuesta en un mapeo. Tiene que rechazarla — no es una de las opciones.
const intentoDeCerrar = responder(pregunta, JSON.stringify(validacion.valor ?? bruto ?? ''))

// LO QUE EL MODELO MEJORÓ, construido por CÓDIGO a partir de su salida validada. La pregunta nueva
// la arma el OS, no el modelo: el modelo aportó el atributo y los literales, nada más.
const preguntaMejorada = validacion.valido
  ? `${dictado.nombre}: las ${cands.length} candidatas son la misma tarea y sólo difieren en ${validacion.valor.atributo}. ` +
    `¿Cuál corresponde a esta obra: ${validacion.valor.valores.map((v) => `${v.literal} (${v.codigo})`).join(' o ')}?`
  : null

const medicion = medidor.instantanea()
const conciliacion = registro.conciliacion()

// ── La segunda vuelta: misma pregunta, mismas entradas. Tiene que salir del caché y NO del modelo.
const tTibio = Date.now()
const segunda = await resolverPorFastPath({
  pregunta: `«${RAIZ}»: ¿${cands.map((c) => c.codigo).join(' o ')}?`,
  entradas: { candidatas: cands.map((c) => c.codigo) },
  clase: 'INTERPRETACION',
  resolvedores: { [NIVEL.MODELO_BARATO]: async () => { throw new Error('la segunda vuelta NO puede llegar acá') } },
  proveedor: PROVEEDOR, registro, cache,
}).catch((e) => ({ nivel: 'ERROR', porQue: String(e?.message ?? e) }))
const msTibio = Date.now() - tTibio

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6 · LA SALIDA
// ══════════════════════════════════════════════════════════════════════════════════════════════

const porEscalon = (recorrido?.recorrido ?? []).reduce((a, x) => ({ ...a, [x.estado]: [...(a[x.estado] ?? []), x.nivel] }), {})

salida.generativo = {
  modo: ARGS.has('--rechazo') ? 'RECHAZO (test negativo)' : ARGS.has('--sin-llamada') ? 'SIN LLAMADA' : 'LLAMADA REAL',
  bruto, validacion, sellada, preguntaMejorada, intentoDeCerrar, error: errorDelModelo,
}
salida.metricas = {
  latencia_fria_ms: { valor: msFrio, estado: 'MEDIDO' },
  latencia_tibia_ms: { valor: msTibio, estado: 'MEDIDO' },
  llamadas_llm: { valor: conciliacion.total, estado: 'MEDIDO' },
  llamadas_llm_no_declaradas: { valor: conciliacion.noDeclaradas, estado: conciliacion.medidas === null ? 'NO_MEDIDO' : 'MEDIDO' },
  tokens: { valor: medicion.tokens, estado: medicion.total ? 'MEDIDO' : 'NO_APLICA' },
  costo_usd: { valor: medicion.usd, estado: medicion.total ? (medicion.sinPrecio ? 'NO_MEDIDO' : 'MEDIDO') : 'NO_APLICA' },
  llamadas_web: { valor: registro.llamadasWeb.length, estado: 'NO_APLICA' },
  escalones: porEscalon,
  segunda_vuelta_nivel: segunda?.nivel ?? null,
}

if (ARGS.has('--json')) {
  console.log(JSON.stringify(salida, null, 2))
  process.exit(validacion.valido || ARGS.has('--rechazo') ? 0 : 1)
}

console.log('\n══ EL FALLBACK GENERATIVO, SOBRE UN CASO AMBIGUO REAL ══\n')
console.log('LA LLAVE')
console.log(fila('archivo', LLAVE.de))
console.log(fila('es la que usa el worker', LLAVE.ok ? 'SÍ (la misma que echegaray-orq-worker.service)' : `NO — ${LLAVE.porQue ?? 'no está'}`))

console.log('\nEL CASO — leído de public.tarea_tipo, no inventado')
for (const c of salida.determinista.candidatas) {
  console.log(fila(c.codigo, `«${c.nombre}» · ${c.unidad} · ${c.costo === null ? 'sin costo cargado' : `$ ${c.costo.toLocaleString('es-AR')}`}`))
}
console.log(fila('selector determinístico', mapeo.estado))
console.log(fila('· por qué', mapeo.porQue))
console.log(fila('detector de mitades (alcance)', salida.determinista.alcanceDeclarado.map((a) => `${a.codigo}:${a.alcance ?? 'null'}`).join(' · ')))
console.log(fila('atributosDe → armadura', salida.determinista.atributosExtraidos.map((a) => `${a.codigo}:${a.armadura ?? 'null'}`).join(' · ')))
console.log(fila('pregunta que sale HOY', pregunta?.tipo))
console.log(`     «${salida.determinista.preguntaQueSaleHoy}»`)

console.log(`\nEL MODELO (${salida.generativo.modo})`)
console.log(fila('escalón que lo atendió', recorrido?.nivel ?? `no resolvió${errorDelModelo ? ` — ${errorDelModelo}` : ''}`))
if (uso) console.log(fila('modelo · tokens · usd · ms', `${uso.modelo} · ${uso.tokensIn}+${uso.tokensOut} · $ ${uso.usd} · ${uso.ms} ms`))
console.log(fila('salida cruda', bruto ? String(bruto).replace(/\s+/g, ' ').slice(0, 150) : '—'))

console.log('\nLA VALIDACIÓN DETERMINÍSTICA')
console.log(fila('¿pasó?', validacion.valido ? 'SÍ' : 'NO — RECHAZADA'))
for (const p of validacion.problemas) console.log(`     ✖ ${p}`)
if (sellada) {
  console.log(fila('fuente', sellada.fuente))
  console.log(fila('¿es experiencia de ECSAS?', sellada.esExperienciaEcsas ? 'SÍ ⚠' : 'NO'))
  console.log(fila('no asciende a', sellada.noAsciende.join(', ')))
  console.log(fila('¿decide?', sellada.decide ? 'SÍ ⚠' : 'NO — requiere humano'))
  console.log(fila('provenance', `${sellada.provenance.quien} · ${sellada.provenance.modelo} · ${sellada.provenance.promptVersion} · $ ${sellada.provenance.usd}`))
}

console.log('\nQUE NO ESCRIBIÓ ESTADO COMERCIAL')
console.log(fila('su salida pasada a responder()', intentoDeCerrar.ok ? 'ACEPTADA ⚠' : 'RECHAZADA'))
console.log(`     ${intentoDeCerrar.porQue}`)
if (preguntaMejorada) {
  console.log('\nQUÉ MEJORÓ — la pregunta nueva la arma el OS con el atributo que el modelo leyó')
  console.log(`     «${preguntaMejorada}»`)
}

console.log('\nESCALONES DEL FAST PATH EN ESTA DECISIÓN')
for (const [estado, niveles] of Object.entries(porEscalon)) console.log(fila(estado, niveles.join(', ')))
console.log(fila('segunda vuelta (tibia)', segunda?.nivel ?? '—'))

console.log('\nLATENCIA Y COSTO')
for (const [k, v] of Object.entries(salida.metricas)) {
  if (typeof v !== 'object' || v === null || !('estado' in v)) continue
  console.log(fila(k, `${v.valor} · ${v.estado}`))
}

const ok = ARGS.has('--rechazo')
  ? !validacion.valido && !intentoDeCerrar.ok
  : validacion.valido && !intentoDeCerrar.ok && sellada?.esExperienciaEcsas === false && sellada?.decide === false
console.log(`\n${ok ? '✔' : '✖'} ${ARGS.has('--rechazo')
  ? (ok ? 'La salida envenenada FUE RECHAZADA y no cerró nada.' : 'LA SALIDA ENVENENADA PASÓ — el control no puede decir que no.')
  : (ok ? 'El modelo aportó estructura verificada contra el catálogo y NO tocó el estado comercial.' : 'El fallback generativo NO cumplió sus condiciones.')}\n`)
process.exit(ok ? 0 : 1)
