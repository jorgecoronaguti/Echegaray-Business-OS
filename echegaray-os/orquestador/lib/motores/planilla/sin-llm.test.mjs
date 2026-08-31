// EL CIRCUITO COMPLETO, PROBADO SOBRE EL SCRIPT REAL Y NO SOBRE DOBLES DEL MOTOR.
//
// `negativos.test.mjs` prueba las guardas; éste prueba la promesa que da nombre al trabajo: que
// operar una planilla —crearla, escribirla, editarla, ponerle una fórmula, releerla, copiar una
// hoja y limpiar— ocurre con CERO llamadas a un modelo.
//
// ═══ POR QUÉ EN OTRO PROCESO ═══
//
// Un test que importa el script comparte el `process.env` del runner y ya no está probando el
// arranque en frío, que es exactamente donde una llave se cuela. Acá se lanza `node` aparte y —a
// propósito— CON las llaves puestas: si el script las respetara en vez de borrarlas, el resultado
// cambiaría. No cambia.
//
// Es el mismo patrón de `lib/cotizador/sin-llm.test.mjs`, que ya prueba lo mismo del lado del
// cotizador.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'scripts', 'planilla-sin-llm.mjs')

/** Corre el script con las llaves puestas A PROPÓSITO. El circuito completo tarda unos segundos:
 *  se corre UNA vez y los tests leen la misma salida. */
const correr = (env = {}) => JSON.parse(execFileSync(process.execPath, [SCRIPT, '--json'], {
  encoding: 'utf8',
  env: { ...process.env, ANTHROPIC_API_KEY: 'sk-ant-FALSA-NO-DEBE-USARSE', ...env },
  maxBuffer: 32 * 1024 * 1024,
}))

const CORRIDA = correr()

test('SIN LLM · el circuito completo de una planilla llega al final con llamadas_llm = 0', () => {
  const { metricas } = CORRIDA
  // El cero se MIDE en el transporte (`crearMedidorLLM` envuelve `fetch` y cuenta los hosts de
  // modelo), no se declara. Un cero que sale de que ningún resolvedor levantó la mano no vale.
  assert.equal(metricas.llamadas_llm, 0, 'ni una llamada a un modelo')
  assert.equal(metricas.tokens, 0)
  assert.equal(metricas.costo_llm_usd, 0)
  // Y el circuito llegó entero: si abortara a la mitad, también daría cero llamadas.
  assert.equal(metricas.pasos, 13, `se corrieron ${metricas.pasos} pasos de 13`)
})

test('SIN LLM · la llave puesta en el entorno NO habilita nada: el script la borra', () => {
  // MUTACIÓN QUE LO PONE ROJO — CORRIDA EL 31/08/2026: en el script, cambiar
  // `for (const k of LLAVES) delete process.env[k]` por `for (const k of LLAVES) void k`.
  // Con la mutación, `llaves_vivas_al_terminar` sale `['ANTHROPIC_API_KEY']` y este test se pone
  // rojo. La primera versión de este test miraba `llaves_borradas_del_entorno` —que se calcula
  // ANTES del borrado— y la mutación NO lo ponía rojo: era una mutación declarada y falsa, la
  // misma cicatriz que este repo ya tiene. Se corrigió midiendo el efecto y no la intención.
  assert.ok(CORRIDA.llaves_borradas_del_entorno.includes('ANTHROPIC_API_KEY'),
    'la llave se puso a propósito: el script tiene que haberla visto')
  assert.deepEqual(CORRIDA.llaves_vivas_al_terminar, [],
    'quedó una llave de modelo viva en el entorno al terminar la corrida')
  assert.equal(CORRIDA.metricas.llamadas_llm, 0, 'con la llave puesta, sigue sin llamar a nadie')
})

test('SIN LLM · ningún módulo del motor importa un cliente de IA', () => {
  const { imports } = CORRIDA
  // El piso protege contra el caso en que la carpeta se mueva y la auditoría mire un directorio
  // vacío: cero culpables sobre cero archivos no es una garantía, es un descuido.
  assert.ok(imports.archivos >= 8, `sólo se auditaron ${imports.archivos} módulos: ¿cambió la carpeta?`)
  assert.deepEqual(imports.culpables, [])
})

test('SIN LLM · las trece operaciones se hicieron de verdad, y cada escritura se verificó releyendo', () => {
  const por = Object.fromEntries(CORRIDA.pasos.map((p) => [p.que, p]))

  assert.equal(por['crear planilla'].formato, 'google_sheets')
  assert.deepEqual(por['crear hoja'].hojas, ['Hoja 1', 'Compras'])

  // VERIFICADO no es una promesa: el motor releyó el destino y comparó celda por celda.
  for (const q of ['escribir datos', 'editar rango', 'agregar filas']) {
    assert.equal(por[q].verificado, true, `"${q}" no quedó verificado`)
  }
  assert.equal(por['escribir datos'].celdas, 20)

  // LA REGLA DEL LOCALE, VISTA EN EL RESULTADO. Se manda la fórmula canónica (coma separadora) y
  // tiene que aterrizar con `;` porque el archivo es es-AR. Es la conversión de `google.mjs`, y el
  // motor la deja hacer en vez de duplicarla.
  const f = por['escribir formula']
  assert.equal(f.mandada, '=ROUND(SUM(C2:C5),2)')
  assert.equal(f.formulaEnLaCelda, '=ROUND(SUM(C2:C5);2)')
  assert.equal(f.localizada_a_es_AR, true)
  // Y CALCULA: una fórmula que aterriza perfecta y devuelve #REF! no es una escritura buena.
  assert.equal(f.valorCalculado, 463500.5)

  // La revisión es una huella del contenido del rango destino, no la versión del archivo.
  assert.match(por['editar rango'].revisionUsada, /^h[0-9a-f]{8}:\d+$/)
})

test('SIN LLM · buscar, filtrar y ordenar dan el resultado correcto sin interpretar nada', () => {
  const p = CORRIDA.pasos.find((x) => x.que === 'buscar . filtrar . ordenar')
  // "acme s.a." encuentra "ACME S.A." dos veces: la clave se normaliza, una sola vez, para todo el
  // motor. Es la cicatriz del trim de un solo lado que hizo una suma 3,58 veces más corta.
  assert.equal(p.buscar.encontradas, 2)
  assert.equal(p.buscar.direccion, 'Compras!A2', 'sin la dirección real, un resultado no se puede reescribir')
  assert.equal(p.filtrar.filas, 2)
  // Ordenado por FECHA, no por el texto de la fecha: 02/08 va antes que 05/08 y que 12/08.
  assert.deepEqual(p.ordenar.proveedores, ['ACME S.A.', 'ACME S.A.', 'Ferreteria Sur', 'Corralon Norte'])
})

test('SIN LLM · el upsert edita una celda, da de alta una fila y NO resuelve el duplicado solo', () => {
  const p = CORRIDA.pasos.find((x) => x.que === 'actualizar tabla')
  assert.equal(p.ediciones, 1, 'se toca la celda que cambia, no la fila entera')
  assert.equal(p.altas, 1)
  assert.equal(p.obraDeCorralon, 'Quattropani', 'la edición aterrizó en la celda que correspondía')
  // ACME aparece dos veces. Elegir cuál de las dos es "la buena" es una decisión de negocio: el
  // motor la declara y no la toma.
  assert.equal(p.conflictos, 1)
})

test('SIN LLM · copiar una hoja se lleva la FÓRMULA, no su resultado pegado', () => {
  const p = CORRIDA.pasos.find((x) => x.que === 'copiar hoja')
  assert.equal(p.formulaCopiada, '=ROUND(SUM(C2:C5);2)', 'una copia que pega el número no es una copia')
  assert.equal(p.valorCopiado, 463500.5)
  assert.deepEqual(p.hojas, ['Hoja 1', 'Compras', 'Compras (copia)'])
})

test('SIN LLM · la corrida se autolimpia: no deja hojas ni filas de firma dando vueltas', () => {
  const p = CORRIDA.pasos.find((x) => x.que === 'limpiar')
  assert.deepEqual(p.hojas, ['Hoja 1', 'Compras'], 'la copia se borró')
  // La guarda de escritura deja una firma en Postgres por cada pestaña que escribe. Es residuo de
  // esta corrida y se borra: un test que ensucia la base no se puede correr dos veces.
  assert.ok(p.firmasBorradas === 'sin base' || Number.isInteger(p.firmasBorradas),
    `la limpieza de firmas devolvió ${p.firmasBorradas}`)
})

test('SIN LLM · corre contra el DOBLE, no contra Drive: la marca de congelamiento no se toca', () => {
  // Es una limitación declarada, no un detalle. El freno de escritura de Sheets está puesto y dice
  // «NADA escribe Sheets hasta que él lo autorice»; el modo `--vivo` existe y espera esa decisión.
  assert.equal(CORRIDA.modo, 'doble')
  assert.match(CORRIDA.fileId, /^fake-/, 'un fileId real acá significaría que se escribió Drive')
  assert.ok(CORRIDA.metricas.llamadas_google > 0, 'pero el cliente REAL de google.mjs sí corrió entero')
})
