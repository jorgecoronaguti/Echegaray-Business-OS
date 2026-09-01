#!/usr/bin/env node
// EL CIRCUITO COMPLETO DE LOS DOS MOTORES CON CLAUDE APAGADO, SOBRE DRIVE DE VERDAD.
//
// ═══ LAS LLAVES SE BORRAN ANTES DE IMPORTAR NADA ═══
//
// No hay un «modo offline». Se borran del entorno del proceso todas las variables de API de modelo,
// y ADEMÁS se apunta `ORQ_ANTHROPIC_ENV_FILE` a un archivo inexistente: `lib/config.mjs` carga
// `~/.config/echegaray-orq/anthropic.env` dentro de `process.env`, así que borrar la variable y
// después importar config la habría devuelto a la vida. Se verifica al final que siga ausente.
//
// ═══ Y ADEMÁS SE MIDE ═══
//
// `fetch` queda envuelto: cualquier salida hacia un proveedor de modelos se cuenta. `llamadas_llm`
// no es una declaración, es una medición sobre el circuito vivo.
//
// ═══ QUÉ TOCA ═══
//
// Crea su PROPIA carpeta en Drive, trabaja adentro y la manda a la papelera al terminar. No toca un
// Sheet, ni un documento de la empresa, ni el Cash Flow. Los datos son de una obra de prueba y
// están rotulados como tales: no salen de ninguna fuente real y no pretenden salir.
//
// ═══ DOS PROFUNDIDADES ═══
//
//   --seco   arma el documento y la presentación ENTEROS sin salir a la red. Es lo que corre en la
//            suite: prueba que con las llaves puestas en el entorno no se usa ninguna, y no deja
//            archivos en el Drive de nadie en cada corrida de tests.
//   (nada)   el circuito vivo contra Drive: crea, edita, verifica releyendo, exporta, mira el
//            render y limpia. Es la prueba que manda, y se corre a mano.
//
//   node orquestador/scripts/motores-sin-llm.mjs [--seco] [--json] [--conservar] [--png <carpeta>]

// ── 1 · LAS LLAVES, ANTES DE CUALQUIER IMPORT ────────────────────────────────────────────────
const LLAVES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'ORQ_ANTHROPIC_API_KEY']
const borradas = LLAVES.filter((k) => process.env[k] !== undefined)
for (const k of LLAVES) delete process.env[k]
process.env.ORQ_ANTHROPIC_ENV_FILE = '/dev/null/no-existe'

// ── 2 · TODA SALIDA A UN PROVEEDOR DE MODELOS SE CUENTA ──────────────────────────────────────
const DOMINIOS_LLM = /(anthropic|openai|googleapis\.com\/v1beta\/models|generativelanguage|mistral|cohere)/i
const salidas = { llm: [], google: 0 }
const fetchOriginal = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  const u = String(typeof url === 'string' ? url : url?.url ?? '')
  if (DOMINIOS_LLM.test(u)) salidas.llm.push(u.slice(0, 120))
  else salidas.google++
  return fetchOriginal(url, opts)
}

const { readdirSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
const path = await import('node:path')
const { fileURLToPath } = await import('node:url')
const { loadConfig } = await import('../lib/config.mjs')
const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
const { crearDesdePlantilla } = await import('../lib/motores/plantillas-motor.mjs')
const { actualizarSeccion, exportarDocumento, insertarEnSeccion, leerDocumento, reemplazarVariables } =
  await import('../lib/motores/documento-motor.mjs')
const { actualizarPresentacion, exportarPresentacion, mirarPresentacion } =
  await import('../lib/motores/presentacion-motor.mjs')
const { renderPresentacion } = await import('../lib/motores/plantillas-motor.mjs')

const ARGS = process.argv.slice(2)
const SECO = ARGS.includes('--seco')
const JSON_OUT = ARGS.includes('--json')
const CONSERVAR = ARGS.includes('--conservar')
const CARPETA_PNG = ARGS[ARGS.indexOf('--png') + 1]
const AQUI = path.dirname(fileURLToPath(import.meta.url))

// ── 3 · NINGÚN MÓDULO DE LOS MOTORES IMPORTA UN CLIENTE DE IA ────────────────────────────────
const RE_IA = /from\s+'[^']*(?:\/ia\/|anthropic|openai|llm)[^']*'/i
function auditarImports(carpetas) {
  const culpables = []
  let archivos = 0
  for (const c of carpetas) {
    for (const f of readdirSync(path.join(AQUI, '..', 'lib', c)).filter((x) => x.endsWith('.mjs'))) {
      archivos++
      const txt = readFileSync(path.join(AQUI, '..', 'lib', c, f), 'utf8')
      for (const linea of txt.split('\n')) if (RE_IA.test(linea)) culpables.push(`${c}/${f}: ${linea.trim().slice(0, 90)}`)
    }
  }
  return { archivos, culpables }
}

// ── 4 · LOS DATOS: DE UNA OBRA DE PRUEBA, ROTULADOS COMO TALES ───────────────────────────────
const SELLO = `PRUEBA ${new Date().toISOString().slice(0, 19)}`
const DATOS = {
  cliente: 'Cliente de prueba (no es un cliente real)',
  obra: `Obra de prueba ${SELLO}`,
  fecha: '31/08/2026',
  periodo: 'agosto 2026',
  resumen: 'Datos de prueba del motor de documentos. Ningún número de acá sale de una fuente real.',
  ejecutado: ['Primer frente cerrado', 'Segundo frente en curso', 'Tercer frente sin empezar'],
  desvios: ['Un desvío de prueba'],
  indicadores: [{ rotulo: 'Avance', valor: '62 %' }, { rotulo: 'Frentes', valor: '3' }, { rotulo: 'Desvíos', valor: '1' }],
}

let configCargada = false
const paso = []
const anotar = (que, r, extra = {}) => { paso.push({ paso: que, ok: Boolean(r?.ok), ...(r?.ok ? {} : { codigo: r?.codigo, motivo: r?.motivo }), ...extra }); return r }
const morir = (r, que) => { if (!r?.ok) { console.error(`✖ ${que}: ${r?.codigo} — ${r?.motivo}`); console.error(JSON.stringify(paso, null, 1)); process.exit(1) } return r }

// ── 5 SECO · TODO LO QUE SE PUEDE HACER SIN DRIVE ────────────────────────────────────────────
if (SECO) {
  // Se carga la configuración IGUAL, aunque en seco no haga falta salir a Drive: el punto del
  // control es que `lib/config.mjs` hidrata `~/.config/echegaray-orq/anthropic.env` dentro de
  // `process.env`, así que la llave podría volver a la vida DESPUÉS de haberla borrado. Si no se
  // carga la config, la métrica «ausente» no probaría nada — y eso se dice.
  try { loadConfig(); configCargada = true } catch { configCargada = false }
  const { renderDocumento } = await import('../lib/motores/plantillas-motor.mjs')
  const { construirCuerpo, requestsDeCuerpo, requestsDeTablas } = await import('../lib/motores/documento-requests.mjs')
  const doc = renderDocumento('informe.avance_obra.v1', DATOS)
  morir(doc, 'armar el informe desde la plantilla')
  const plan = construirCuerpo(doc.contenido)
  anotar('armar el informe entero desde la plantilla', doc, {
    secciones: doc.contenido.secciones.length,
    caracteres: plan.texto.length,
    peticiones: requestsDeCuerpo(plan).length + requestsDeTablas(plan).length,
  })
  const cert = renderDocumento('certificado.avance.v1', {
    cliente: 'Cliente de prueba', obra: 'Obra de prueba', fecha: '31/08/2026', numero: '3', periodo: 'agosto 2026',
    items: [{ item: 'Frente A', avance: '100 %', monto: 'ver certificado' }], monto_del_periodo: 'ver certificado',
  })
  morir(cert, 'armar el certificado')
  anotar('armar un certificado con tabla', cert, { tablas: cert.contenido.secciones.flatMap((x) => x.bloques).filter((b) => b.tipo === 'tabla').length })
  const pres = renderPresentacion('presentacion.avance_obra.v1', { ...DATOS, proximo: ['seguir'] })
  morir(pres, 'componer la presentación')
  anotar('componer la presentación entera (medida y control de calidad incluidos)', pres, { laminas: pres.contenido.laminas.length })
  informar({ carpeta: null, documento: null, presentacion: null })
}

const cfg = loadConfig()
configCargada = true
const google = makeGoogleClient({ config: cfg, scopes: WRITE_SCOPES })
const basura = []

// ── 5 · EL CIRCUITO ──────────────────────────────────────────────────────────────────────────
// La carpeta va marcada con la misma `appProperty` que usa el motor: es lo que después permite
// PREGUNTARLE A DRIVE si quedó algo vivo. Preguntar por nombre no sirve — medido: la búsqueda por
// nombre corre con el token del robot, que NO ve el Drive del dueño y devuelve `[]` tanto si el
// archivo existe como si no. Un control que no puede mirar no dice «no está».
const carpeta = await google.createFile({ name: `_ZZ motores ${SELLO}`, mimeType: 'application/vnd.google-apps.folder', appProperties: { os_clave: `prueba-${SELLO}` } })
basura.push(carpeta.id)
anotar('carpeta propia de trabajo', { ok: true }, { id: carpeta.id })

// 5.1 · DOCUMENTO desde plantilla, con tabla y todo
const doc = morir(await crearDesdePlantilla(google, {
  template_id: 'informe.avance_obra.v1', datos: DATOS, carpeta_id: carpeta.id,
}), 'crear documento desde plantilla')
basura.push(doc.id)
anotar('crear documento desde plantilla', doc, { id: doc.id, verificacion: doc.verificacion, omitidas: doc.omitidas })

// 5.2 · EDITARLO: reemplazar una sección entera y VERIFICARLA releyéndola
// El id con el que se direcciona una sección sale de su TÍTULO, no del id de diseño de la
// plantilla: el motor devuelve el mapa para no tener que adivinarlo.
const idDe = (dePlantilla) => doc.mapa_de_secciones.find((m) => m.plantilla === dePlantilla).documento
const editado = morir(await actualizarSeccion(google, doc.id, {
  seccion_id: idDe('resumen'),
  bloques: [
    { tipo: 'parrafo', texto: 'Resumen reescrito por el motor sin ningún modelo de por medio.' },
    { tipo: 'tabla', columnas: ['Frente', 'Estado'], filas: [['A', 'cerrado'], ['B', 'en curso']] },
  ],
}), 'actualizar la sección')
anotar('actualizar la sección «resumen» y releerla', editado, { texto_releido: editado.verificacion.texto })

// 5.3 · INSERTAR contenido con un hueco, y REEMPLAZARLO
morir(await insertarEnSeccion(google, doc.id, {
  seccion_id: idDe('ejecutado'), bloques: [{ tipo: 'parrafo', texto: 'Monto del período: {{monto_del_periodo}}' }],
}), 'insertar contenido')
const vars = morir(await reemplazarVariables(google, doc.id, { monto_del_periodo: 'a confirmar con el certificado' }), 'reemplazar variables')
anotar('insertar contenido y reemplazar {{variables}}', vars, { pendientes: vars.pendientes_en_el_documento })

// 5.4 · LEER la estructura y EXPORTAR
const estructura = morir(await leerDocumento(google, doc.id), 'leer la estructura')
anotar('leer la estructura del documento', estructura, { secciones: estructura.estructura.secciones.map((s) => s.id) })
const pdfDoc = morir(await exportarDocumento(google, doc.id, { formato: 'pdf' }), 'exportar el documento')
anotar('exportar el documento a PDF', pdfDoc, { bytes: pdfDoc.bytes })
// El PDF exportado se deja en disco cuando se pide `--png`: es la única forma de MIRAR el
// documento sin abrir Drive, y un documento que nadie miró no está listo.
if (CARPETA_PNG) { mkdirSync(CARPETA_PNG, { recursive: true }); writeFileSync(path.join(CARPETA_PNG, 'documento.pdf'), pdfDoc.contenido) }

// 5.5 · IDEMPOTENCIA: el mismo pedido, otra vez
const otra = morir(await crearDesdePlantilla(google, { template_id: 'informe.avance_obra.v1', datos: DATOS, carpeta_id: carpeta.id }), 'reintento')
anotar('reintentar el MISMO pedido', otra, { mismo_archivo: otra.id === doc.id, reutilizado: otra.reutilizado })
if (otra.id !== doc.id) { basura.push(otra.id); morir({ codigo: 'DUPLICADO', motivo: 'el reintento creó un segundo archivo' }, 'idempotencia') }

// 5.6 · PRESENTACIÓN desde la misma plantilla de datos
const pres = morir(await crearDesdePlantilla(google, {
  template_id: 'presentacion.avance_obra.v1', datos: DATOS, carpeta_id: carpeta.id,
}), 'crear presentación desde plantilla')
basura.push(pres.id)
anotar('crear presentación desde plantilla', pres, { id: pres.id, laminas: pres.laminas, verificacion: pres.verificacion })

// 5.7 · MODIFICARLA
const conCierre = renderPresentacion('presentacion.avance_obra.v1', { ...DATOS, proximo: ['Cerrar el frente B', 'Certificar septiembre'] })
morir(conCierre, 'componer la presentación modificada')
const actualizada = morir(await actualizarPresentacion(google, pres.id, conCierre.contenido), 'actualizar la presentación')
anotar('actualizar la presentación', actualizada, { laminas: actualizada.laminas, verificacion: actualizada.verificacion })

// 5.8 · MIRAR EL RENDER DE VERDAD
const vista = morir(await mirarPresentacion(google, pres.id), 'mirar el render')
anotar('mirar el render (PNG que dibujó Google)', vista, { laminas: vista.laminas.map((l) => ({ lamina: l.lamina, bytes: l.bytes, png: l.png })) })
if (CARPETA_PNG) {
  mkdirSync(CARPETA_PNG, { recursive: true })
  for (const l of vista.laminas) if (l.contenido) writeFileSync(path.join(CARPETA_PNG, `lamina-${String(l.lamina).padStart(2, '0')}.png`), l.contenido)
}
const pdfPres = morir(await exportarPresentacion(google, pres.id), 'exportar la presentación')
anotar('exportar la presentación a PDF', pdfPres, { bytes: pdfPres.bytes })

// ── 6 · LIMPIAR ──────────────────────────────────────────────────────────────────────────────
let limpiados = 0
if (!CONSERVAR) {
  for (const id of [...new Set(basura)].reverse()) { try { await google.trashFile(id); limpiados++ } catch { /* queda anotado abajo */ } }
}
anotar('limpiar lo creado', { ok: CONSERVAR || limpiados === new Set(basura).size }, { archivos: basura.length, a_la_papelera: limpiados, conservado: CONSERVAR })

// Y LA LIMPIEZA SE VERIFICA LEYENDO DRIVE, no confiando en que el borrado contestó bien.
if (!CONSERVAR) {
  const claves = [`prueba-${SELLO}`, doc.clave, pres.clave].filter(Boolean)
  const vivos = []
  for (const c of claves) vivos.push(...(await google.buscarPorPropiedad('os_clave', c)).map((f) => `${f.name} (${f.id})`))
  anotar('verificar que no quedó nada vivo en Drive', { ok: vivos.length === 0, codigo: 'WRITE_NOT_PERSISTED', motivo: `quedaron ${vivos.length} archivo(s)` }, { claves_consultadas: claves.length, vivos })
}

// ── 7 · LO QUE PRUEBA QUE NO HUBO MODELO ─────────────────────────────────────────────────────
informar({ carpeta: carpeta.id, documento: doc.id, presentacion: pres.id })

function informar({ carpeta, documento, presentacion }) {
const imports = auditarImports(['motores', 'slides'])
const metricas = {
  llamadas_llm: salidas.llm.length,
  destinos_llm: salidas.llm,
  llamadas_a_google: salidas.google,
  llaves_borradas_del_entorno: borradas,
  config_cargada: configCargada,
  // SE PUBLICA LA PRESENCIA, NUNCA EL VALOR.
  //
  // Antes decía `process.env.ANTHROPIC_API_KEY ?? null`, o sea el VALOR. El día que esta guarda
  // falle —que es exactamente el día para el que existe— la llave de producción de la empresa
  // quedaba escrita en claro en el log de `orq:test`, en la salida de CI y en el transcript de
  // quien lo corriera. Un control que filtra el secreto cuando salta es peor que no tenerlo.
  ANTHROPIC_API_KEY_despues_de_cargar_config: configCargada
    ? (process.env.ANTHROPIC_API_KEY ? 'PRESENTE (revivida)' : 'ausente')
    : 'NO_VERIFICADO (la config no se pudo cargar)',
  modulos_auditados: imports.archivos,
  modulos_que_importan_ia: imports.culpables,
}
const salida = { metricas, pasos: paso, carpeta, documento, presentacion }

if (JSON_OUT) console.log(JSON.stringify(salida, null, 1))
else {
  for (const p of paso) console.log(`${p.ok ? '✔' : '✖'} ${p.paso}${p.codigo ? ` — ${p.codigo}: ${p.motivo}` : ''}`)
  console.log(`\nllamadas a un modelo: ${metricas.llamadas_llm} · llamadas a Google: ${metricas.llamadas_a_google}`)
  console.log(`llaves borradas del entorno: ${borradas.join(', ') || '(no había ninguna)'}`)
  console.log(`ANTHROPIC_API_KEY después de cargar config: ${metricas.ANTHROPIC_API_KEY_despues_de_cargar_config}`)
  console.log(`módulos auditados: ${metricas.modulos_auditados} · que importan un cliente de IA: ${metricas.modulos_que_importan_ia.length}`)
}
process.exit(paso.every((p) => p.ok) && metricas.llamadas_llm === 0 && !metricas.modulos_que_importan_ia.length ? 0 : 1)
}
