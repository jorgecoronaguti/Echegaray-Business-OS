import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { contarPorFiltro, type FilaDeConteo } from './personasService.ts'
import { esDireccion, sinDireccion } from './vocabularioPersona.ts'

// ═══ DIRECCIÓN NO APARECE EN NINGUNA PANTALLA DEL MÓDULO PERSONAL ═══
//
// Dueño, 22/09/2026, textual: *«a rodrigo y a mi quitanos de todo el modulo "personal"»*. Antes,
// también textual: *«falta q agregues a rodrigo y a mi como receptores de plata»* — que es la razón
// por la que Rodrigo Echegaray y Jorge Corona están en `personas`: sin fila en el padrón no pueden
// recibir efectivo a rendir (`efectivo_entrega.persona_id` apunta a `personas`) ni firmar la
// conformidad desde el teléfono (`firmar_conformidad_entrega` exige `persona_id = mi_persona_id()`).
//
// Las dos frases juntas son el contrato: EXISTEN COMO PERSONA, Y NO SON PLANTEL. Plantel, Horas,
// Asistencia, Liquidación, Cuadrillas, Retribución, sus contadores y sus exportaciones no los
// muestran; el desplegable «A quién» de Entregar efectivo y Herramientas, sí.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ═══
//
// Que la regla se aplique pantalla por pantalla y la número nueve se olvide. No se rompería nada:
// una pantalla de Personal volvería a listar al dueño, en silencio, y nadie se enteraría hasta que
// él lo viera. Por eso el test de abajo no prueba una pantalla: RECORRE TODAS las lecturas de
// `persona_directorio` del repositorio y exige que cada una aplique la regla o esté declarada acá
// con su motivo. Un archivo nuevo que lea el padrón y no haga ninguna de las dos cosas se pone rojo
// el día que se escribe.
//
// Y EL ERROR OPUESTO, que sería peor: sacar a Dirección de una SUMA. Medido en la base el
// 22/09/2026, después del alta: 0 horas, 0 líneas de liquidación, 0 recibos, 0 bloques de jornales,
// 0 asignaciones a obra. Aportan cero a todo total de dinero y de horas, así que esta regla no
// mueve un peso — y el último test impide que se meta donde sí lo movería.

const aqui = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(aqui, '../../..')       // src/
const leer = (p: string) => readFileSync(p, 'utf8')
/** Sin comentarios: lo que se afirma es el código, no la prosa que lo explica. */
const codigo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function archivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) archivosDeCodigo(p, acc)
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) acc.push(p)
  }
  return acc
}

/**
 * LAS LECTURAS DEL PADRÓN QUE NO SON DEL MÓDULO PERSONAL, una por una y con su motivo.
 *
 * Estar acá no es una excepción a la regla: es la afirmación de que esa lectura NO produce una lista
 * ni un conteo de gente del módulo. Agregar una línea obliga a escribir por qué, que es exactamente
 * la pregunta que hay que hacerse antes de dejar a Dirección adentro de algo.
 */
const FUERA_DEL_MODULO: Record<string, string> = {
  'features/administracion/services/costoObraQuincena.ts':
    'mapa id → nombre para el costo por obra: no lista gente, y sacar a alguien del mapa dejaría horas sin nombre',
  'features/administracion/services/costoLecturas.ts':
    'categorías para valorizar el costo: es una suma, y una fila que se saca de una suma la falsifica',
  'features/administracion/services/jornadaPorObraService.ts':
    'la jornada de una OBRA, por asignación vigente: Dirección no tiene ninguna y no aparece sola',
  'features/administracion/services/jornadaPorObraActions.ts':
    'escribe la jornada de una obra; no dibuja ninguna lista del módulo Personal',
  'features/administracion/services/presenciaService.ts':
    'exige `obra_actual_id not null`: sin asignación vigente Dirección no entra por definición',
  'features/administracion/services/eslabonesLegajoService.ts':
    'mapa id → puesto para auditar el legajo: mirar a todos es lo que la auditoría tiene que hacer',
  'features/administracion/services/lecturasCompartidasDeQuincena.ts':
    'quién es de un subcontrato: un mapa por id, no una lista de personas',
  'features/analiticas/services/analiticasService.ts':
    'mapa id → nombre de Analíticas, que es otro módulo y cuenta cabezas de la empresa entera',
}

// ── 1 · NINGUNA LECTURA DEL PADRÓN SE OLVIDA DE LA REGLA ──────────────────────────────────────

test('toda lectura de `persona_directorio` aplica `sinDireccion` o está declarada fuera del módulo', () => {
  const lectores = archivosDeCodigo(RAIZ)
    .filter((p) => /from\('persona_directorio'\)/.test(codigo(leer(p))))
    .map((p) => relative(RAIZ, p).replaceAll('\\', '/'))

  assert.ok(lectores.length >= 15, `se leyeron ${lectores.length} archivos: el barrido dejó de encontrar el padrón`)

  for (const rel of lectores) {
    const aplica = /\bsinDireccion\b/.test(codigo(leer(join(RAIZ, rel))))
    const declarado = rel in FUERA_DEL_MODULO
    assert.ok(aplica || declarado,
      `${rel} lee el padrón y no aplica \`sinDireccion\`: si NO es del módulo Personal, declaralo en ` +
      'FUERA_DEL_MODULO con el motivo; si lo es, Dirección acaba de reaparecer en una pantalla del dueño')
    assert.ok(!(aplica && declarado),
      `${rel} aplica la regla Y está declarado fuera del módulo: una de las dos cosas sobra`)
  }

  // Y la lista de excepciones no puede envejecer con nombres de archivos que ya no existen: una
  // excepción muerta es una puerta abierta esperando que alguien vuelva a crear ese archivo.
  for (const rel of Object.keys(FUERA_DEL_MODULO)) {
    assert.ok(lectores.includes(rel), `FUERA_DEL_MODULO nombra ${rel}, que ya no lee el padrón: sacalo`)
  }
})

// ── 2 · Y CADA UNA PIDE LA COLUMNA CON LA QUE SE JUZGA ────────────────────────────────────────

test('la lectura que aplica la regla pide `puesto`: sin esa columna el filtro no filtra nada', () => {
  // EL MODO SILENCIOSO DE FALLAR. `sinDireccion` mira `fila.puesto`; si el `select` no la trae, el
  // filtro corre, no saca a nadie y la pantalla se ve perfecta. Ningún test de comportamiento lo
  // nota, porque el resultado es exactamente el de antes de la regla.
  for (const p of archivosDeCodigo(RAIZ)) {
    const src = codigo(leer(p))
    if (!/from\('persona_directorio'\)/.test(src) || !/\bsinDireccion\b/.test(src)) continue
    const rel = relative(RAIZ, p).replaceAll('\\', '/')
    for (const select of src.match(/from\('persona_directorio'\)\s*\n?\s*\.?select\([^)]*\)/g) ?? []) {
      // Un catálogo (`select('categoria')`) no es una lista de personas y no se filtra: una lista de
      // gente siempre pide el `id`, que es con lo que después se la cruza.
      if (!/\bid\b/.test(select)) continue
      // El `select` puede ser una constante del archivo (`COLUMNAS_DIRECTORIO`): se resuelve ahí
      // mismo, porque lo que importa es qué columnas viajan, no cómo se escribieron.
      const porNombre = select.match(/select\(([A-Z_][A-Z0-9_]*)\)/)
      const columnas = porNombre
        ? (src.match(new RegExp(`const ${porNombre[1]} =[\\s\\S]*?\\n\\n`))?.[0] ?? '')
        : select
      assert.match(columnas, /puesto/,
        `${rel}: una lectura del padrón aplica \`sinDireccion\` sin pedir \`puesto\` — el filtro no puede ver nada`)
    }
  }
})

// ── 3 · LA REGLA, EN SÍ ───────────────────────────────────────────────────────────────────────

test('el padrón del módulo Personal es el leído menos Dirección, y nadie más se va', () => {
  const padron = [
    { puesto: null, nombre: 'ACOSTA' },
    { puesto: 'JEFE DE OBRA', nombre: 'MALDONADO' },
    { puesto: 'DIRECCIÓN', nombre: 'ECHEGARAY' },
    { puesto: 'direccion', nombre: 'CORONA' },
    { puesto: 'ADMINISTRACIÓN', nombre: 'la administrativa' },
  ]
  assert.deepEqual(sinDireccion(padron).map((p) => p.nombre),
    ['ACOSTA', 'MALDONADO', 'la administrativa'],
    'la regla se ensanchó o se angostó: sólo Dirección sale del módulo')
  assert.equal(esDireccion('ADMINISTRACIÓN'), false, 'Administración trabaja y sí es plantel')
})

test('los cuatro recortes cuentan sobre el padrón ya filtrado, no sobre lo leído', () => {
  // `contarPorFiltro` no conoce a Dirección —y no tiene por qué—: la regla se aplicó en la lectura.
  // Lo que este test fija es que el chip cuente lo MISMO que la lista muestra.
  const leido: FilaDeConteo[] = [
    { en_la_empresa: true, obra_actual_id: 'qp', obra_actual: 'QP', puesto: null },
    { en_la_empresa: true, obra_actual_id: null, obra_actual: null, puesto: null },
    { en_la_empresa: true, obra_actual_id: null, obra_actual: null, puesto: 'DIRECCIÓN' },
    { en_la_empresa: true, obra_actual_id: null, obra_actual: null, puesto: 'DIRECCIÓN' },
  ]
  const c = contarPorFiltro(sinDireccion(leido))
  assert.equal(c.plantel, 2, 'Dirección volvió al plantel')
  assert.equal(c.sin_asignar, 1, 'Dirección volvió a la lista de los que necesitan obra')
  assert.equal(c.en_obra, 1)
})

// ── 4 · Y NINGÚN TOTAL APRENDIÓ A ESCONDERLA ──────────────────────────────────────────────────

test('ni el costo de mano de obra ni la nómina de Analíticas filtran a Dirección', () => {
  // EL ERROR OPUESTO, y el más caro: «completar» la exclusión llevándola a donde la fila SUMA. Hoy
  // Rodrigo y Jorge suman cero —0 horas, 0 líneas, 0 recibos—, así que sacarlos de un total no
  // cambiaría ningún número y por eso el error pasaría inadvertido… hasta el día que alguno tenga
  // horas cargadas y el costo de esa obra empiece a faltar sin que nada avise.
  for (const rel of [
    'features/administracion/services/costoObraQuincena.ts',
    'features/administracion/services/costoLecturas.ts',
    'features/analiticas/services/empresa.ts',
    'features/analiticas/services/analiticasService.ts',
    'features/base-maestra/services/recursosService.ts',
  ]) {
    assert.doesNotMatch(codigo(leer(join(RAIZ, rel))), /\bsinDireccion\b|\besDireccion\b/,
      `${rel}: un total aprendió a esconder a Dirección — sacar una fila de una suma la falsifica`)
  }
})

// ── 5 · DONDE SÍ TIENEN QUE ESTAR ─────────────────────────────────────────────────────────────

test('el desplegable «A quién» y Herramientas siguen leyendo el padrón entero', () => {
  // La razón de todo esto: *«falta q agregues a rodrigo y a mi como receptores de plata»*. Las dos
  // lecturas salen de `personas` —no del directorio— y no pueden aprender esta regla nunca.
  const efectivo = codigo(leer(join(RAIZ, 'features/efectivo/services/datos.ts')))
  assert.match(efectivo, /from\('personas'\)[\s\S]{0,140}eq\('en_la_empresa', true\)/,
    'el desplegable «A quién» cambió de fuente: Rodrigo y Jorge pueden haber quedado afuera')
  assert.doesNotMatch(efectivo, /\bsinDireccion\b|\besDireccion\b/,
    'Efectivo aprendió a esconder a Dirección: es exactamente lo que el dueño pidió que NO pasara')
  assert.doesNotMatch(codigo(leer(join(RAIZ, 'features/herramientas/services/datos.ts'))),
    /\bsinDireccion\b|\besDireccion\b/, 'Herramientas dejó de poder asignarle una máquina a Dirección')
})
