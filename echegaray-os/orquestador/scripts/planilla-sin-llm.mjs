#!/usr/bin/env node
// EL CIRCUITO COMPLETO DE UNA PLANILLA, CON CLAUDE APAGADO. CERO LLAMADAS A UN MODELO.
//
// Crear una planilla · escribir datos · editar un rango · escribir una fórmula · releer y verificar
// · buscar, filtrar y ordenar · agregar filas · actualizar una tabla por clave · publicar un rango
// con nombre · crear una hoja · copiarla · limpiar. Nada de eso decide nada, y por lo tanto nada de
// eso necesita un modelo de lenguaje.
//
// ═══ CÓMO SE APAGA CLAUDE, DE VERDAD ═══
//
// No hay un flag «modo offline». Las llaves de API se BORRAN del entorno antes del primer import,
// así que ningún módulo cargado después las encuentra — es el patrón de `xsas-sin-llm.mjs`. Y el
// cero NO se declara: se MIDE en el transporte con `crearMedidorLLM()`, que envuelve `fetch` y
// cuenta toda petición a un host de modelo. Un cero que sale de que nadie levantó la mano no vale;
// éste sale de que no salió un byte hacia api.anthropic.com.
//
// ═══ POR QUÉ CORRE CONTRA UN DOBLE Y NO CONTRA GOOGLE (31/08/2026) ═══
//
// La marca `~/.config/echegaray-orq/SHEETS-CONGELADOS` está puesta desde hoy 18:03 y dice, textual:
// «NADA escribe Sheets hasta que él lo autorice, ni el timer ni un generador a mano». Correr este
// circuito contra Drive —aunque fuera sobre un archivo propio y descartable— sería levantar el
// freno con la variable de entorno, y la regla del repo es explícita: *el freno de mano manda y no
// se pide excepción*. Así que la corrida por defecto es contra `dobles/api-google-falsa.mjs`.
//
// ═══ LO QUE ESTA CORRIDA **NO** PRUEBA — leer antes de creerle al verde ═══
//
// El doble está en `fetchImpl`, no en el cliente: corre `google.mjs` ENTERO (URL, escapado del
// rango, localización de fórmulas a es-AR, freno, guarda de escritura, no-borrar) y lo único
// fingido es el servidor. Eso prueba el motor y su cableado. NO prueba que Google se comporte como
// el doble cree, y la diferencia no es un detalle:
//
//   **La promesa central del motor —toda escritura relee y compara— está probada contra un servidor
//   escrito por la misma lane que escribió el motor.**
//
// Sin una corrida contra Google quedan SIN evidencia, una por una:
//   · que Google ACEPTE y CALCULE la fórmula localizada. El 463.500,5 lo calcula
//     `dobles/calculo-falso.mjs`, 160 líneas de esta misma lane.
//   · dónde aterriza de verdad un `append` (el doble elige la fila que a él le parece).
//   · que `duplicateSheet` se lleve la FÓRMULA y no su resultado pegado.
//   · el round-trip del rango con nombre: se compara texto contra el formateo que devuelve Google,
//     y el doble devuelve el formateo de esta lane.
//   · `UNFORMATTED_VALUE`, los seriales de fecha y el parseo es-AR AL RELEER.
//   · el freno, la guarda de escritura, los candados y `no-borrar` contra el servidor real.
//
// Para eso está `--vivo`, que espera a que el dueño levante el freno y NO toca la marca por su
// cuenta. Hasta entonces, el verde de acá vale para el motor y no vale para Google.
//
//   node orquestador/scripts/planilla-sin-llm.mjs
//   node orquestador/scripts/planilla-sin-llm.mjs --json
//   node orquestador/scripts/planilla-sin-llm.mjs --vivo --carpeta=<folderId>

// -- 1 . LAS LLAVES SE BORRAN ANTES DE IMPORTAR NADA -------------------------------------------
const LLAVES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_API_KEY', 'OPENAI_API_KEY',
  'ORQ_ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'GOOGLE_GENERATIVE_AI_API_KEY']
const borradas = LLAVES.filter((k) => process.env[k] !== undefined)
for (const k of LLAVES) delete process.env[k]
// El borrado se COMPRUEBA, no se da por hecho, y se comprueba AL FINAL de la corrida (ver la
// salida): asi tambien se detecta un modulo que la repusiera al importarse.
const llavesVivas = () => LLAVES.filter((k) => process.env[k] !== undefined)

// ═══ BORRARLAS NO ALCANZA (medido el 31/08/2026) ═══
//
// `lib/config.mjs` carga `~/.config/echegaray-orq/anthropic.env` DENTRO de `process.env` al
// importarse, y llega solo: google.mjs -> no-reponer.mjs -> db.mjs -> config.mjs. Como
// `loadEnvLocalInto` completa lo que falta y no pisa lo que hay, REPONE exactamente la llave que
// esta linea acaba de borrar. Con la primera version de este script, `ANTHROPIC_API_KEY` estaba
// VIVA al terminar la corrida: el apagado era nominal.
//
// La cura es apuntar ESE cargador a un archivo que no existe. Es la variable que el propio
// `config.mjs` respeta, y no se toca el archivo real.
//
// SOLO ESE. La primera version tambien anulaba `ORQ_ENV_FILE` (worker.env), y con eso se fue
// DATABASE_URL: la guarda de escritura se quedo sin base y fallo CERRADA — «no puedo verificar tus
// ediciones -> no piso ninguna pestaña de contenido». El circuito murio en la primera escritura, que
// es la trampa del worktree documentada en el repo, y esta bien que muera asi. `worker.env` y
// `.env.local` no traen llaves de modelo (verificado), asi que apagar el LLM no necesita tocarlos.
process.env.ORQ_ANTHROPIC_ENV_FILE = '/dev/null/anthropic-env-inexistente-del-apagado'

const ARGS = new Set(process.argv.slice(2))
const VIVO = ARGS.has('--vivo')
const CARPETA = process.argv.find((a) => a.startsWith('--carpeta='))?.split('=')[1] ?? null

// El doble no manda un byte a Google, así que el freno no tiene nada que frenar; pero `google.mjs`
// lo consulta igual antes de cada escritura. Se apunta la marca a una ruta inexistente SOLO en modo
// doble: la marca REAL no se lee, no se toca y no se borra. En `--vivo` esta linea no corre.
if (!VIVO) process.env.ORQ_SHEETS_MARCA = '/dev/null/marca-inexistente-del-doble'

const { readdirSync, readFileSync } = await import('node:fs')
const path = await import('node:path')
const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
const { crearMedidorLLM } = await import('../lib/ia/medidor.mjs')
const { crearPlanilla } = await import('../lib/motores/planilla/motor.mjs')
const { crearDrive, fetchFalso } = await import('../lib/motores/planilla/dobles/api-google-falsa.mjs')

// -- 2 . EL CERO SE MIDE EN EL TRANSPORTE ------------------------------------------------------
const medidor = crearMedidorLLM()
const desinstalar = medidor.instalar()

// -- 3 . EL CLIENTE ----------------------------------------------------------------------------
const drive = VIVO ? null : crearDrive()
const google = VIVO
  ? makeGoogleClient({ scopes: WRITE_SCOPES })
  : makeGoogleClient({ auth: { getAccessToken: async () => 'token-del-doble' }, fetchImpl: fetchFalso(drive) })

const pasos = []
const paso = (que, detalle) => { pasos.push({ n: pasos.length + 1, que, ...detalle }); return detalle }

// =============================================================================================
// EL CIRCUITO
// =============================================================================================

const NOMBRE = `MOTOR-PLANILLA prueba ${new Date().toISOString().slice(0, 19)}`
const t0 = Date.now()

const planilla = await crearPlanilla(google, NOMBRE, { carpetaId: CARPETA })
paso('crear planilla', { fileId: planilla.fileId, formato: planilla.formato })

const HOJA = 'Compras'
const { titulo } = await planilla.crearHoja(HOJA)
paso('crear hoja', { hoja: titulo, hojas: (await planilla.hojas()).map((h) => h.title) })

// -- escribir datos --
const DATOS = [
  ['Proveedor', 'Fecha', 'Neto', 'Obra'],
  ['ACME S.A.', '05/08/2026', 120000, 'Quattropani'],
  ['Ferreteria Sur', '12/08/2026', 45500.5, 'San Francisco'],
  ['ACME S.A.', '02/08/2026', 78000, 'Quattropani'],
  ['Corralon Norte', '20/08/2026', 210000, 'San Francisco'],
]
const escritura = await planilla.escribirRango(`${HOJA}!A1:D5`, DATOS, {
  // El esquema se valida ANTES de mandar nada: un texto en la columna de importes no llega al Sheet.
  esquema: [null, 'fecha', 'numero', null], filasEncabezado: 1,
})
paso('escribir datos', { rango: escritura.rango, celdas: escritura.celdas, verificado: escritura.verificado })

// -- editar un rango (sub-bloque del anterior), con control de revision --
const revision = await planilla.revisionDe(`${HOJA}!C2:C5`)
const edicion = await planilla.escribirRango(`${HOJA}!C2:C5`, [[125000], [45500.5], [78000], [215000]], { revision })
paso('editar rango', { rango: edicion.rango, revisionUsada: revision, verificado: edicion.verificado })

// -- escribir una formula (canonica: la localizacion a es-AR la hace google.mjs) --
await planilla.escribirCelda(`${HOJA}!A7`, 'TOTAL')
// La formula se manda CANONICA (coma separadora). El archivo es es-AR, asi que `google.mjs` tiene
// que convertirla a `;` antes de mandarla — y lo que se relee lo demuestra. Sin un separador de
// argumentos en la formula, ese paso no se ejercitaria y la trampa quedaria sin probar.
const formula = await planilla.escribirFormula(`${HOJA}!C7`, '=ROUND(SUM(C2:C5),2)')
const total = await planilla.leerCelda(`${HOJA}!C7`)
paso('escribir formula', {
  rango: formula.rango,
  mandada: '=ROUND(SUM(C2:C5),2)',
  formulaEnLaCelda: total.formula,
  localizada_a_es_AR: total.formula.includes(';'),
  valorCalculado: total.valor,
  tipo: total.tipo,
})
if (!total.formula.includes(';')) throw new Error(`la formula no se localizo a es-AR: ${total.formula}`)
if (total.valor !== 463500.5) throw new Error(`el total dio ${total.valor} y tiene que dar 463500.5`)

// -- releer y verificar --
const relectura = await planilla.leerRango(`${HOJA}!A1:D5`)
paso('releer y verificar', { rango: relectura.rango, huella: relectura.huella, filas: relectura.grid.length })

// -- buscar . filtrar . ordenar (una sola lectura, tres operaciones) --
const tabla = await planilla.abrirTabla(`${HOJA}!A1:D5`)
const hallado = tabla.buscar('Proveedor', 'acme s.a.')
const grandes = tabla.filtrar([{ campo: 'Neto', op: '>', valor: 100000 }])
const porFecha = tabla.ordenar([{ campo: 'Fecha' }])
paso('buscar . filtrar . ordenar', {
  buscar: { que: 'acme s.a.', encontradas: hallado.resultados.length, direccion: tabla.direccionDe(hallado.resultados[0]?.indice ?? 0) },
  filtrar: { que: 'Neto > 100000', filas: grandes.resultados.length },
  ordenar: { por: 'Fecha', proveedores: porFecha.filas.map((f) => f[0]) },
})

// -- agregar filas --
const agregadas = await planilla.agregarFilas(`${HOJA}!A1:D1`, [['Sanitarios SRL', '25/08/2026', 33000, 'Quattropani']])
paso('agregar filas', { rango: agregadas.rango, verificado: agregadas.verificado })

// -- actualizar tabla: upsert por clave de negocio, celda por celda --
const tabla2 = await planilla.abrirTabla(`${HOJA}!A1:D6`)
const plan = tabla2.planUpsert('Proveedor', [
  { Proveedor: 'Corralon Norte', Obra: 'Quattropani' },       // existe -> edicion
  { Proveedor: 'Vidrieria Este', Neto: 9000, Obra: 'Nueva' }, // no existe -> alta
])
for (const e of plan.ediciones) await planilla.escribirCelda(tabla2.direccionDe(e.indice, e.col), e.a)
if (plan.altas.length) await planilla.agregarFilas(`${HOJA}!A1:D1`, plan.altas)
paso('actualizar tabla', {
  ediciones: plan.ediciones.length, altas: plan.altas.length, conflictos: plan.conflictos.length,
  obraDeCorralon: (await planilla.leerCelda(tabla2.direccionDe(plan.ediciones[0].indice, plan.ediciones[0].col))).valor,
})

// -- rango con nombre --
const nombrado = await planilla.definirRangoConNombre('IMPORTES_COMPRAS', `${HOJA}!C2:C5`)
paso('rango con nombre', { nombre: nombrado.nombre, apunta: nombrado.rango, todos: (await planilla.leerRangosConNombre()).map((n) => n.nombre) })

// -- validaciones (se leen antes de escribir una columna con desplegable) --
const val = await planilla.leerValidaciones(`${HOJA}!D1:D6`)
paso('leer validaciones', { hoja: val.hoja, reglas: val.validaciones.length })

// -- copiar la hoja (con sus formulas) --
await planilla.copiarHoja(HOJA, 'Compras (copia)')
const totalCopia = await planilla.leerCelda("'Compras (copia)'!C7")
paso('copiar hoja', { hojas: (await planilla.hojas()).map((h) => h.title), formulaCopiada: totalCopia.formula, valorCopiado: totalCopia.valor })

// -- limpiar --
await planilla.borrarHoja('Compras (copia)')
const limpieza = { hojas: (await planilla.hojas()).map((h) => h.title) }
if (VIVO) { await google.trashFile(planilla.fileId); limpieza.archivoALaPapelera = true }
// La firma que dejo la guarda de escritura en Postgres es residuo de esta corrida: se borra. Un
// test que ensucia la base no se puede correr dos veces y termina apagado.
try {
  const { query } = await import('../lib/db.mjs')
  const r = await query('delete from sheet_tab_firma where file_id = $1 returning pestana', [planilla.fileId])
  limpieza.firmasBorradas = r.rows.length
} catch { limpieza.firmasBorradas = 'sin base' }
paso('limpiar', limpieza)

const ms = Date.now() - t0
desinstalar()

// =============================================================================================
// LA AUDITORIA ESTRUCTURAL: ningun modulo del motor importa un cliente de IA
// =============================================================================================

/** Se lee con `fs`, NO con `grep`. Este repo tiene al menos un archivo con bytes NUL
 *  (`lib/preservar-anotaciones.mjs`), y `grep` lo trata como binario y lo SALTEA en silencio: una
 *  auditoria por grep dar a cero culpables sin haber mirado el archivo. */
function auditarImports(dir) {
  const archivos = []
  const recorrer = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { recorrer(path.join(d, e.name)); continue }
      if (e.name.endsWith('.mjs')) archivos.push(path.join(d, e.name))
    }
  }
  recorrer(dir)
  const culpables = archivos.filter((f) => {
    const lineas = readFileSync(f, 'utf8').split('\n').filter((l) => /^\s*import\s|await import\(/.test(l)).join('\n')
    return /ia\/cliente|ia\/medidor|anthropic|openai|pedirTexto|llamarModelo/i.test(lineas)
  }).map((f) => path.relative(dir, f))
  return { archivos: archivos.length, culpables }
}

const raiz = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'lib', 'motores', 'planilla')
const imports = auditarImports(raiz)
const llm = medidor.instantanea()

const salida = {
  modo: VIVO ? 'vivo' : 'doble',
  fileId: planilla.fileId,
  llaves_borradas_del_entorno: borradas,
  // TIENE QUE SER []. Es la diferencia entre "el codigo dice que las borra" y "no quedo ninguna
  // viva cuando termino de correr todo".
  llaves_vivas_al_terminar: llavesVivas(),
  metricas: {
    llamadas_llm: llm.total,
    tokens: llm.tokens,
    costo_llm_usd: llm.usd,
    llamadas_google: drive ? drive.trafico.length : null,
    pasos: pasos.length,
    ms,
  },
  imports,
  pasos,
}

if (ARGS.has('--json')) {
  console.log(JSON.stringify(salida, null, 2))
} else {
  const fila = (k, v) => console.log(`  ${String(k).padEnd(32)} ${v}`)
  console.log(`\nMOTOR DE PLANILLAS . CIRCUITO COMPLETO SIN LLM (${salida.modo})\n${'='.repeat(78)}`)
  for (const p of pasos) {
    console.log(`  ${String(p.n).padStart(2)}. ${p.que}`)
    console.log(`      ${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => !['n', 'que'].includes(k))))}`)
  }
  console.log(`\nEL CERO, MEDIDO EN EL TRANSPORTE\n${'='.repeat(78)}`)
  fila('llaves borradas del entorno', borradas.length ? borradas.join(', ') : '(no habia ninguna puesta)')
  fila('llaves VIVAS al terminar', llavesVivas().length ? `!! ${llavesVivas().join(', ')}` : 'ninguna')
  fila('LLAMADAS A UN MODELO', llm.total)
  fila('tokens . costo USD', `${llm.tokens} . ${llm.usd}`)
  fila('llamadas a la API de Google', drive ? drive.trafico.length : 'n/d (modo vivo)')
  fila('modulos del motor auditados', `${imports.archivos} . con cliente de IA: ${imports.culpables.length}`)
  fila('duracion', `${ms} ms`)
  console.log()
}

process.exit(0)
