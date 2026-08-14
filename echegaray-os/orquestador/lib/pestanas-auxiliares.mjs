// QUIÉN ESCRIBE CADA PESTAÑA AUXILIAR (`_*`) — DEDUCIDO DEL CÓDIGO, NO DE UNA LISTA A MANO.
//
// ═══ POR QUÉ EXISTE (14/08/2026) ═══
//
// `_CRUCE_ARCA` tenía generador (`cruce-arca-pestana.mjs`), tenía dueño declarado y NO estaba en
// `PASOS`: nadie la refrescó desde el 04/08. No estaba muerta — `Materiales` lee de ahí su bloque
// "Respaldo fiscal" con nueve fórmulas, $88.078.801 sobre 290 celdas. Una fuente que se congela sin
// gritar: exactamente el modo de falla que ya se pagó con `_MOVIMIENTOS` (el libro del que cuelgan
// CAJA y los dos cash flow) y con `_CHEQUES_RAW` (30 cheques contra 35 celdas que la leen).
//
// Agregar el nombre que falta a `PASOS` arregla ESTE caso y ninguno más. Lo que arregla el mecanismo
// es que la lista de escritores se DEDUZCA del código: acá se lee cada script, se resuelve qué
// pestaña `_*` declara como suya —literal propia o constante importada de `lib/`— y el test compara
// ese conjunto contra `PASOS`. El próximo generador auxiliar que nazca fuera del pipeline se pone
// rojo solo, sin que nadie se acuerde de mirar.
//
// ═══ QUÉ CUENTA COMO "SU" PESTAÑA, Y POR QUÉ ESE CRITERIO ═══
//
// Una constante de módulo con el nombre de la pestaña. Es el estilo de TODOS los generadores del repo
// (`const PESTAÑA = '_ARCA_RAW'`, `PESTANA_ANEXO`, `IIBB_RAW`…) y es lo que distingue al DUEÑO de la
// pestaña del que apenas la lee: `tarjeta-pestana.mjs` nombra `'_BANCO_RAW'` adentro de un rango de
// fórmula (`"'_BANCO_RAW'!$A$4:$A$1000"`), no en una constante, y no es su dueño.
//
// LÍMITE CONOCIDO, DECLARADO ACÁ PARA QUE NO SE LEA COMO GARANTÍA: si alguien escribe una pestaña
// auxiliar con el nombre en línea (`escribirPreservando(g, ID, '_LO_QUE_SEA', …)`) sin pasar por una
// constante, este detector no lo ve. Se eligió igual porque el falso NEGATIVO exige salirse del
// estilo del repo, mientras que un detector por call-site tendría que entender los cinco caminos de
// escritura distintos que ya existen (`escribirPreservando`, `escribirValoresPorCeldas`,
// `refrescarEspejo`, `batchUpdateValues`, `spreadsheetBatchUpdate`) y fallaría en silencio en el sexto.

/**
 * Pestañas que NO tienen que tener un generador en `PASOS`, con el motivo escrito.
 *
 * Una excepción sin motivo declarado es una huérfana disfrazada: por eso el motivo es obligatorio y
 * se imprime. Son las pestañas de CAPTURA —las carga una persona— y el OS las lee, no las escribe.
 *
 * Vive acá y no en `scripts/auditar-duenos-pestanas.mjs` porque la consultan DOS controles: ese censo
 * (contra el archivo vivo) y el test estático de este archivo (sin red). Duplicada, la lista corta se
 * separa de la larga en la primera excepción nueva.
 */
export const SIN_GENERADOR = {
  Compras: 'la carga una persona: es el libro de gastos. El OS le calcula columnas (rubro-caja-sheet) pero no la reescribe.',
  Cobranzas: 'la carga una persona: es el libro de ventas y cobros.',
  Parámetros: 'los parámetros los decide una persona (alícuotas, jornada, clientes).',
  '01_Valores Iniciales': 'saldos de arranque del ejercicio: se cargan una vez.',
  // NO ES UNA EXCEPCIÓN CÓMODA, ES UNA DEUDA DECLARADA: la escala del convenio cambia con cada
  // paritaria y hoy la réplica se carga a mano. Mientras siga así, el bloque de escala de Jornales
  // envejece en silencio cuando se firma un acuerdo nuevo.
  _UOCRA_RAW: '⚠ DEUDA: réplica del acuerdo UOCRA cargada a mano. Falta el script que la traiga del boletín de la paritaria.',
}

/** ¿Este nombre es el de una pestaña auxiliar? Las del OS son `_MAYÚSCULAS_CON_GUIONES`. */
export const esPestanaAuxiliar = (nombre) => /^_[A-Z0-9_]+$/.test(String(nombre ?? ''))

/**
 * ¿Este script puede escribir en el Sheet? Los que sólo leen piden el cliente sin `scopes` y quedan
 * con los de sólo lectura — es el control que ya usa `auditar-fechas-absurdas.mjs`, y acá sirve para
 * no exigirle a un AUDITOR que nombra una réplica que corra en el pipeline de generación.
 */
export const escribeEnElSheet = (fuente = '') => /\bWRITE_SCOPES\b/.test(fuente)

/** Las constantes de módulo con valor string: `const X = '...'` / `export const X = '...'`. */
export function constantesDeModulo(fuente = '') {
  const out = new Map()
  const re = /(?:^|\n)[ \t]*(?:export[ \t]+)?const[ \t]+([\p{L}_$][\p{L}\p{N}_$]*)[ \t]*=[ \t]*'([^'\n]*)'/gu
  for (const m of fuente.matchAll(re)) out.set(m[1], m[2])
  return out
}

/**
 * Los identificadores que este archivo importa, con el módulo del que vienen.
 * `import { A, B as C } from './x.mjs'` → [{ modulo:'./x.mjs', nombre:'A', local:'A' }, …]
 */
export function importaciones(fuente = '') {
  const out = []
  for (const m of fuente.matchAll(/import[\s\n]*\{([^}]*)\}[\s\n]*from[\s\n]*'([^']+)'/g)) {
    for (const parte of m[1].split(',')) {
      const [nombre, local] = parte.trim().split(/\s+as\s+/)
      if (nombre) out.push({ modulo: m[2], nombre, local: local || nombre })
    }
  }
  return out
}

/**
 * NÚCLEO PURO: las pestañas auxiliares que este script declara como suyas.
 *
 * @param {string} fuente el código del script
 * @param {(modulo: string, nombre: string) => string|null} resolverImportado
 *        devuelve el valor de una constante exportada por otro módulo (lo cablea quien tenga el
 *        filesystem: esta función no lee archivos para poder probarse con fuentes sintéticas)
 * @returns {string[]} nombres de pestaña, sin repetir
 */
export function pestanasAuxiliaresDe(fuente = '', resolverImportado = () => null) {
  const nombres = new Set()
  for (const valor of constantesDeModulo(fuente).values()) {
    if (esPestanaAuxiliar(valor)) nombres.add(valor)
  }
  for (const imp of importaciones(fuente)) {
    const valor = resolverImportado(imp.modulo, imp.nombre)
    if (esPestanaAuxiliar(valor)) nombres.add(valor)
  }
  return [...nombres]
}
