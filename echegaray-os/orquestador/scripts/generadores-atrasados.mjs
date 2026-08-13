#!/usr/bin/env node
// ¿ALGÚN GENERADOR DE SHEETS DE `main` ESTÁ ATRASADO RESPECTO DE UNA RAMA SIN MERGEAR?
//
// ═══ POR QUÉ EXISTE (03/08) ═══
//
// `jornales-pestana.mjs` en `main` no tenía UNA SOLA mención del bloque "3 · Dirección". La pestaña
// viva SÍ lo tenía, con tres retiros de $3.000.000 cargados ese mismo día. Correr el generador de
// `main` contra el Sheet real se los borraba al dueño — y no habría fallado: habría reescrito la
// grilla que él conoce, que es una grilla vieja, y habría informado que salió todo bien.
//
// Eso se descubrió DE CASUALIDAD, comparando ramas a mano antes de reactivar el pipeline. Un
// mecanismo que destruye datos y se detecta por casualidad no está controlado. Esto lo mide.
//
// ═══ POR QUÉ NO ALCANZA `git branch --merged` ═══
//
// Estos generadores no se ponen al día mergeando la rama entera: la rama maximal del linaje traía 142
// commits con toda la infraestructura de Mattermost adentro, y lo que hacía falta eran veinticuatro
// archivos. Se hace un 3-way POR ARCHIVO, y eso no deja registro en la historia: la rama sigue "sin
// mergear" para git aunque su trabajo ya esté incorporado. Contar commits daría rojo para siempre, y
// un aviso que siempre está rojo se ignora — que es como muere un control.
//
// ═══ POR QUÉ LA UNIDAD ES EL BLOB Y NO EL COMMIT ═══
//
// Un `git log -- archivo` cuenta también los MERGES de main hacia la rama, que no aportan trabajo
// nuevo. Medido acá: 30 archivos "con trabajo pendiente" de los cuales la mitad eran merges. El
// contenido no miente: el blob de un archivo en una rama o es uno que ya se miró, o no lo es.
//
// El registro (`generadores-revisados.json`) dice, por archivo, HASTA QUÉ COMMIT se revisó. Una
// versión de rama cuenta como revisada si su blob es alguno de los que ese archivo tuvo en la
// historia de ese commit. Es a la vez legible ("revisado hasta 7c7cc10") y exacto (comparación de
// contenido), y se puede auditar: `git cat-file -p <blob>` muestra qué se miró.
//
// ═══ POR QUÉ UN `descartado` YA NO FRENA (13/08) ═══
//
// Hasta hoy CUALQUIER diferencia con main frenaba, incluso la que ya se había mirado y resuelto:
// "la diferencia sigue existiendo". Quedaron tres archivos —`guarda-escritura.mjs`,
// `cargar-comprobantes-compras.mjs`, `cheques-recibidos-tablero.mjs`— cuyo motivo escrito dice que
// main resolvió el mismo problema igual o mejor y que traer la rama sería un retroceso. Con ese
// criterio el control quedaba rojo PARA SIEMPRE, y un aviso permanentemente rojo se ignora: es la
// misma muerte de control que ya se documentó dos veces más arriba en este archivo.
//
// La liberación la decidió el dueño el 13/08 ("liberado, termina todo el trabajo") y tiene un
// límite duro: lo que libera NO es la palabra `descartado`, es la DECLARACIÓN ESCRITA. Un descarte
// sin motivo con sustancia frena igual que lo que nadie miró — porque es lo mismo: no consta que
// alguien lo haya mirado. La vara es la de la casa (`motivoValido` del freno de Sheets) subida al
// piso que este registro ya exigía.
//
// Y liberar no es callar: los descartados se siguen imprimiendo, con su motivo, en CADA corrida.
// Un control que deja de nombrar lo que perdonó es un silenciador.
//
// ═══ CÓMO SE USA ═══
//
//   node orquestador/scripts/generadores-atrasados.mjs                   inventario completo
//   node orquestador/scripts/generadores-atrasados.mjs --archivo <ruta>  un solo generador
//   node orquestador/scripts/generadores-atrasados.mjs --base HEAD       desde un worktree, antes de integrar
//
// Sale con código 1 mientras quede trabajo de rama sin resolver. Es el chequeo previo a correr el
// pipeline: si esto está rojo, un generador puede borrarle datos al dueño.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { motivoValido } from '../lib/congelador-sheets.mjs'

/** Corre git. `null` cuando falló — la diferencia con `''` es la que evita dar por bueno lo que no se pudo mirar. */
const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 120000 }).trim()
  } catch { return null }
}

/** Igual que `git`, pero le pasa una lista por stdin. Para `cat-file --batch-check`. */
const gitConEntrada = (args, entrada) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', input: entrada, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 120000 })
  } catch { return null }
}

// LAS RUTAS SON DEL REPO, NO DEL DIRECTORIO DESDE EL QUE SE CORRE. `ls-tree` y el pathspec de `log` se
// interpretan desde el CWD; `git show rev:ruta` SIEMPRE quiere la ruta desde la raíz. Mezclar las dos
// convenciones daba "0 generadores revisados" y un ✔ que no había mirado nada.
const RAIZ_APP = git(['rev-parse', '--show-prefix']) ?? ''

/** El prefijo del orquestador, tal como lo nombra el repo desde su raíz. */
export const PREFIJO_ORQ = `${RAIZ_APP}orquestador/`

/** Quita el prefijo de la app: las rutas se informan como las escribe una persona. */
export const corto = (archivo) => (RAIZ_APP && archivo.startsWith(RAIZ_APP) ? archivo.slice(RAIZ_APP.length) : archivo)

/**
 * Las marcas de que un archivo ESCRIBE en un Sheet.
 *
 * `WRITE_SCOPES` y `escribirPreservando` están a propósito: casi ningún generador llama a la API de
 * Sheets directamente —escriben por el portón de `preservar-anotaciones.mjs`— así que un patrón que
 * sólo buscara `values.update` dejaba afuera justo a los peores. Con el patrón angosto este script
 * veía 19 escritores; con éste ve 67, y `jornales-pestana.mjs` —el caso que motivó todo— estaba
 * entre los 48 que faltaban.
 */
export const MARCAS_DE_ESCRITURA = [
  'WRITE_SCOPES', 'escribirPreservando', 'values.update', 'values.batchUpdate', 'values.append',
  'spreadsheets.batchUpdate', 'escribirRango', 'escribirValores', 'updateCells', 'deleteDimension',
]

/** ¿Este fuente escribe Sheets? Puro. */
export function escribeSheets(fuente) {
  if (typeof fuente !== 'string') return false
  return MARCAS_DE_ESCRITURA.some((m) => fuente.includes(m))
}

/** Ramas que no cuentan: worktrees efímeros de agentes y ramas de trabajo del orquestador. */
const RUIDO = /^worktree-agent-|^worktree-|^orq\/code_change\//

/** El registro de lo revisado, versionado al lado de este script. */
export const RUTA_REGISTRO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'generadores-revisados.json')

/** Lee el registro. Si no se puede leer, vacío: nada revisado ⇒ todo se reporta (falla cerrado). */
export function leerRegistro(ruta = RUTA_REGISTRO) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')).archivos ?? {} } catch { return {} }
}

/**
 * EL PISO DE UN MOTIVO ESCRITO. `motivoValido` (≥8 caracteres, nada trivial) es la vara de la casa
 * para levantar el freno de Sheets; acá se le suma el largo que este registro YA exigía en su test,
 * porque lo que un descarte tiene que dejar no es una etiqueta sino la razón: qué trae la rama, qué
 * hizo main en su lugar y por qué traerlo sería un retroceso. Eso no entra en diez caracteres.
 *
 * El número vive UNA vez y lo usan las dos puntas —el veredicto y la validación del registro— para
 * que no puedan discrepar: un registro que pasa su propio test y aun así frena sería un misterio.
 */
export const MOTIVO_MINIMO = 40

/** ¿Esta declaración alcanza para dejar de frenar? Puro. Un "ok" no es una decisión. */
export const motivoQueLibera = (m) => motivoValido(m) && String(m).trim().length > MOTIVO_MINIMO

/**
 * EL VEREDICTO. Es la única decisión del script, y por eso es pura y se prueba sola.
 *
 * `descartado` es "se miró y se decidió no traerlo, por ESTE motivo": no frena, porque la decisión
 * ya está tomada y escrita. Pero el que libera es el motivo, no la palabra: sin una declaración con
 * sustancia el veredicto es `DESCARTE SIN MOTIVO` y frena igual que lo que nadie miró — que es
 * exactamente lo que es. Si esto no fuera así, `descartado` sería el campo con el que se apaga el
 * control entero escribiendo cinco letras.
 *
 * `motivoRama` es la declaración por RAMA: sirve para una rama viva de otra tanda, que se conoce y no
 * se toca. Nunca convierte el hallazgo en verde — sólo le pone nombre.
 *
 * ═══ `incorporado` SE VERIFICA, NO SE CREE (03/08) ═══
 *
 * La primera versión de este veredicto leía `decision: 'incorporado'` del registro y devolvía verde.
 * Probado: poniendo la base en el commit ANTERIOR a la incorporación —o sea con el trabajo revertido
 * y `jornales-pestana.mjs` otra vez sin el bloque de Dirección— seguía diciendo "incorporado". El
 * registro se estaba validando contra sí mismo, que es exactamente lo que un control no puede hacer.
 *
 * Ahora la incorporación tiene que dejar EVIDENCIA en el archivo de la base: que su contenido ya no
 * sea el de antes, y —cuando hay una señal declarada— que la señal esté. Si no, `REVERTIDO`.
 *
 * @param {{cubierto:boolean, decision?:string, motivo?:string|null, motivoRama?:string|null,
 *          evidencia?:boolean}} h
 * @returns {'incorporado'|'REVERTIDO'|'descartado'|'DESCARTE SIN MOTIVO'|'pendiente'|'SIN REVISAR'}
 */
export function veredicto({ cubierto, decision, motivo, motivoRama, evidencia = true }) {
  if (!cubierto) return motivoRama ? 'pendiente' : 'SIN REVISAR'
  if (decision === 'descartado') return motivoQueLibera(motivo) ? 'descartado' : 'DESCARTE SIN MOTIVO'
  if (decision === 'pendiente') return 'pendiente'
  return evidencia ? 'incorporado' : 'REVERTIDO'
}

/**
 * ¿EL VEREDICTO FRENA EL PIPELINE? Puro, y es el único lugar donde se decide eso.
 *
 * Pasan dos: el trabajo que main ya tiene (`incorporado`) y el que se miró y se decidió no traer con
 * el motivo escrito (`descartado`). Todo lo demás frena, incluido el descarte sin motivo: la
 * diferencia entre "lo miré y no va" y "no lo miré" es la declaración, no la intención.
 */
export const frenaElPipeline = (v) => v !== 'incorporado' && v !== 'descartado'

/**
 * ¿Y además nadie lo miró —o se perdió lo que ya se había traído? Ésos no pueden quedar así. Puro.
 *
 * `DESCARTE SIN MOTIVO` entra acá y no en "declarado": de un descarte sin razón escrita no consta
 * que nadie lo haya mirado, y tratarlo como declarado sería creerle al registro sobre sí mismo.
 */
export const nadieLoMiro = (v) => v === 'SIN REVISAR' || v === 'REVERTIDO' || v === 'DESCARTE SIN MOTIVO'

/**
 * ¿La incorporación dejó rastro en el archivo de `base`? Puro respecto de sus entradas.
 *
 * Dos evidencias, de la más débil a la más fuerte:
 *   · `blobAntes` — la versión previa. Si el archivo volvió EXACTAMENTE a ella, se perdió lo que se
 *     había traído. Sirve siempre, y por eso se registra para todos.
 *   · `senal` — algo que la incorporación tuvo que dejar adentro (un import, un identificador).
 *     Sobrevive a cambios cosméticos posteriores y detecta un revert PARCIAL, que el blob no ve.
 *
 * Sin ninguna de las dos declaradas no se puede afirmar nada, y no afirmar nada es `false`: la falta
 * de evidencia no es evidencia de que esté.
 *
 * ═══ LA SEÑAL SE ATA A LA CAPACIDAD, NO AL ARCHIVO (13/08) ═══
 *
 * `impuestos-pestana.mjs` gritó REVERTIDO sin que se hubiera revertido nada: la señal declarada era
 * `'../lib/iva-ddjj.mjs'`, y el 06/08 el generador se partió en `lib/impuestos-*.mjs`, así que ese
 * import se mudó una carpeta más adentro. La DDJJ oficial F.2051 se seguía leyendo — cambió DÓNDE.
 *
 * Un centinela atado a la posición se cae con cada refactor, y un aviso que siempre está rojo se
 * ignora: así muere un control. Por eso `senalesRelocalizadas` deja seguir la capacidad hasta el
 * archivo donde hoy vive. Se exigen TODAS: la cadena entera o nada.
 *
 * @param {{blobBase?:string, fuenteBase?:string|null, blobAntes?:string, senal?:string,
 *          senalesRelocalizadas?:Array<{texto:string, fuente:string|null}>}} _
 */
export function hayEvidencia({ blobBase, fuenteBase, blobAntes, senal, senalesRelocalizadas = [] }) {
  if (!blobAntes && !senal && !senalesRelocalizadas.length) return false
  if (blobAntes && blobBase === blobAntes) return false
  for (const { texto, fuente } of senalesRelocalizadas) {
    if (typeof fuente !== 'string' || !fuente.includes(texto)) return false
  }
  if (senal) return typeof fuenteBase === 'string' && fuenteBase.includes(senal)
  return true
}

/**
 * QUÉ ES LA VERSIÓN DE UNA RAMA FRENTE A LA BASE. Puro, y es lo que separa el trabajo del ruido.
 *
 * ═══ POR QUÉ NO ALCANZA "TIENE COMMITS QUE LA BASE NO TIENE" (13/08) ═══
 *
 * `deploy/comunicacion-protegido` —el checkout desde el que corre el bot— tiene 42 commits que main
 * no tiene, y 41 son merges DE main HACIA la rama. Con `--full-history` esos merges "tocan" el
 * archivo, así que el filtro por commits los dejaba pasar y seis generadores aparecían SIN REVISAR
 * teniendo la rama una versión de main del 06/08 y main una posterior. Seis falsos positivos que
 * exigían una decisión que no existe: no hay nada que traer.
 *
 * La prueba exacta es de CONTENIDO, igual que el resto de este script: si la base YA TUVO ese blob
 * alguna vez, todo lo que la rama tiene de este archivo estuvo en la base y la base siguió. La rama
 * está atrás, no adelante.
 *
 * LÍMITE, y hay que decirlo: esto responde "¿la rama está adelante?", no "¿la base perdió algo?".
 * Si la base tuvo ese contenido y después lo revirtió, acá igual da 'rama vieja' — el control de esa
 * otra pregunta es `hayEvidencia`, que se declara por archivo en el registro.
 *
 * `declaradaAtrasada` es la misma conclusión cuando la aritmética no puede llegar sola: main incorporó
 * el trabajo de la rama por 3-way POR ARCHIVO, así que su blob nunca existió literalmente en main
 * aunque su contenido esté adentro. Eso se resuelve leyendo el diff, y la declaración se ata AL BLOB
 * —no a la rama— justamente para que caduque sola si esa rama vuelve a moverse.
 */
export function estadoDeLaRama({ blob, blobBase, tieneCommits, historicosDeLaBase, declaradaAtrasada = false }) {
  if (!blob || blob === blobBase) return 'al día'
  if (historicosDeLaBase?.has(blob)) return 'rama vieja'
  if (declaradaAtrasada) return 'rama vieja'
  if (!tieneCommits) return 'rama vieja'
  return 'hallazgo'
}

/**
 * Ramas locales que NO están contenidas en `base`, sin el ruido de los worktrees de agentes.
 *
 * Se excluye la rama ACTUAL: nadie está atrasado respecto de sí mismo. Quien corre esto desde su
 * worktree está justamente produciendo ese trabajo, y verlo listado como "main está atrasado" no le
 * dice nada — pero le tapa lo que sí tiene que mirar. Cuando su rama entre a main, desaparece sola.
 */
export function ramasSinMergear(base = 'main') {
  const actual = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const todas = (git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/']) ?? '').split('\n').filter(Boolean)
  return todas.filter((b) => b !== base && b !== actual && !RUIDO.test(b) && git(['merge-base', '--is-ancestor', b, base]) === null)
}

/** Los archivos de `orquestador/` que escriben Sheets, según el árbol de `base`. */
export function escritoresDeSheets(base = 'main', prefijo = PREFIJO_ORQ) {
  const lista = (git(['ls-tree', '-r', '--full-tree', '--name-only', base, prefijo]) ?? '').split('\n')
  return lista.filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && escribeSheets(git(['show', `${base}:${f}`])))
}

/**
 * Todos los blobs que `archivo` tuvo alguna vez en la historia de `rev`.
 *
 * `--full-history` porque la simplificación PODA commits cuyo cambio un merge posterior dejó sin
 * efecto: acá eso sería un falso negativo, y un falso negativo termina en un generador viejo
 * corriendo contra el Sheet real. `:(top)` porque el pathspec de `log`/`rev-list` es relativo al CWD
 * y estas rutas son del repo entero — sin él el recorrido daba vacío y todo parecía revisado.
 */
export function blobsEnLaHistoria(rev, archivo) {
  const commits = (git(['rev-list', '--full-history', rev, '--', `:(top)${archivo}`]) ?? '').split('\n').filter(Boolean)
  if (!commits.length) return new Set()
  // UN SOLO proceso de git, no uno por commit. `caja-pestana.mjs` tiene 80 versiones en main y acá se
  // recorre la historia de CADA generador: con un `rev-parse` por commit esto pasaba de segundos a
  // minutos, y un control que tarda minutos se saltea justo el día que hay apuro por correr.
  const salida = gitConEntrada(['cat-file', '--batch-check=%(objectname) %(objecttype)'],
    `${commits.map((c) => `${c}:${archivo}`).join('\n')}\n`)
  const blobs = new Set()
  for (const linea of (salida ?? '').split('\n')) {
    const [oid, tipo] = linea.split(' ')
    // Sólo `blob`: una ruta que en ese commit todavía no existía contesta "missing", y un directorio
    // contestaría `tree`. Guardar cualquiera de los dos ensuciaría la comparación de contenido.
    if (tipo === 'blob') blobs.add(oid)
  }
  return blobs
}

/** ¿La rama tiene algún commit que toque `archivo` y que `base` no tenga? */
export function ramaTieneTrabajo(base, rama, archivo) {
  return Boolean(git(['log', '--full-history', '-1', '--format=%H', `${base}..${rama}`, '--', `:(top)${archivo}`]))
}

/**
 * Compara un archivo contra todas las ramas. Hay hallazgo cuando se cumplen LAS DOS condiciones:
 *
 *   · el CONTENIDO difiere del de `base` — si coincide, ese trabajo ya está; y
 *   · la rama tiene COMMITS sobre el archivo que `base` no tiene.
 *
 * Hacen falta las dos, y cada una tapa el ruido de la otra. Sólo contenido: entran los 12 archivos
 * donde el que avanzó fue MAIN y la rama quedó vieja — ahí no hay nada que traer. Sólo commits:
 * entran los merges de main hacia la rama, que "tocan" el archivo sin aportar una línea.
 */
export function revisarArchivo(archivo, ramas, base = 'main', registro = leerRegistro()) {
  const enBase = git(['rev-parse', `${base}:${archivo}`])
  const candidatas = ramas
    .map((rama) => ({ rama, blob: git(['rev-parse', `${rama}:${archivo}`]) }))
    .filter((x) => x.blob && x.blob !== enBase)
  if (!candidatas.length) return { hallazgos: [], viejas: [] }
  const entrada = registro[corto(archivo)] ?? {}
  // Las declaraciones de "esta versión quedó atrás" se guardan POR BLOB, no por rama: 25 ramas de la
  // misma tanda comparten el mismo contenido, y atarlo al contenido hace que la declaración caduque
  // sola el día que alguien vuelve a tocar ese archivo en esa rama.
  const atrasadas = entrada.atrasadas ?? {}
  const motivoAtraso = (blob) => atrasadas[blob] ?? atrasadas[blob.slice(0, 7)] ?? null
  // La historia de la base se recorre UNA vez por archivo, y sólo si hay alguna rama que difiere.
  const historicosDeLaBase = blobsEnLaHistoria(base, archivo)
  const viejas = []
  const distintas = []
  for (const x of candidatas) {
    // El orden importa por costo: `ramaTieneTrabajo` es un `git log` por rama y no se paga si el
    // contenido ya está resuelto por la historia de la base o por una declaración.
    const estado = estadoDeLaRama({
      blob: x.blob,
      blobBase: enBase,
      historicosDeLaBase,
      declaradaAtrasada: Boolean(motivoAtraso(x.blob)),
      tieneCommits: historicosDeLaBase.has(x.blob) || motivoAtraso(x.blob) ? false : ramaTieneTrabajo(base, x.rama, archivo),
    })
    if (estado === 'hallazgo') distintas.push(x)
    else if (estado === 'rama vieja') viejas.push({ archivo: corto(archivo), rama: x.rama, motivo: motivoAtraso(x.blob) })
  }
  if (!distintas.length) return { hallazgos: [], viejas }
  // `revisadoHasta` admite varios puntos: un archivo puede haberse revisado contra más de un linaje.
  const puntos = [entrada.revisadoHasta].flat().filter(Boolean)
  const revisados = new Set(puntos.flatMap((p) => [...blobsEnLaHistoria(p, archivo)]))
  // La evidencia se mide UNA vez por archivo: sale del contenido de la base, no de las ramas.
  const evidencia = hayEvidencia({
    blobBase: enBase,
    fuenteBase: entrada.senal ? git(['show', `${base}:${archivo}`]) : null,
    blobAntes: entrada.blobAntes,
    senal: entrada.senal,
    senalesRelocalizadas: Object.entries(entrada.senalEn ?? {})
      .map(([donde, texto]) => ({ texto, fuente: git(['show', `${base}:${RAIZ_APP}${donde}`]) })),
  })
  const hallazgos = distintas.map(({ rama, blob }) => {
    const motivoRama = entrada.pendientes?.[rama] ?? null
    // El motivo que puede liberar es el de la DECISIÓN del archivo (`entrada.motivo`), no el de la
    // rama: `pendientes` describe una rama viva que se conoce, y eso nunca puso nada en verde.
    const v = veredicto({ cubierto: revisados.has(blob), decision: entrada.decision, motivo: entrada.motivo, motivoRama, evidencia })
    return { archivo: corto(archivo), rama, blob: blob.slice(0, 7), veredicto: v, motivo: motivoRama ?? entrada.motivo ?? null }
  })
  return { hallazgos, viejas }
}

/** El inventario completo. `soloArchivo` limita a un generador (chequeo previo a correrlo). */
export function revisar({ base = 'main', soloArchivo = null, registro = leerRegistro() } = {}) {
  const ramas = ramasSinMergear(base)
  let archivos = escritoresDeSheets(base)
  if (soloArchivo) {
    const buscado = soloArchivo.replace(/^\.?\//, '')
    archivos = archivos.filter((f) => f.endsWith(buscado))
  }
  const porArchivo = archivos.map((f) => revisarArchivo(f, ramas, base, registro))
  // `viejas` NO se esconde: se cuenta y se informa. Lo que un control filtra en silencio es lo
  // primero que alguien acusa de estar tapando algo, y con razón.
  return {
    ramas,
    archivos,
    hallazgos: porArchivo.flatMap((r) => r.hallazgos ?? r),
    viejas: porArchivo.flatMap((r) => r.viejas ?? []),
  }
}

/**
 * Agrupa por archivo. Manda el peor veredicto de sus ramas: lo que nadie miró tapa a lo declarado, y
 * lo declarado tapa a lo incorporado.
 *
 * El último escalón —`declarados` antes que `hs`— existe desde que el descarte dejó de frenar: sin
 * él, un archivo con una rama incorporada y otra descartada se resumía por la primera y el descarte
 * desaparecía del informe. Liberar el freno no puede significar dejar de nombrar lo que se perdonó.
 */
export function resumir(hallazgos) {
  const porArchivo = new Map()
  for (const h of hallazgos) {
    if (!porArchivo.has(h.archivo)) porArchivo.set(h.archivo, [])
    porArchivo.get(h.archivo).push(h)
  }
  return [...porArchivo.entries()].map(([archivo, hs]) => {
    const crudos = hs.filter((h) => nadieLoMiro(h.veredicto))
    const frenan = hs.filter((h) => frenaElPipeline(h.veredicto))
    const declarados = hs.filter((h) => h.veredicto !== 'incorporado')
    const elegidos = crudos.length ? crudos : (frenan.length ? frenan : (declarados.length ? declarados : hs))
    return { archivo, veredicto: elegidos[0].veredicto, ramas: elegidos.map((h) => h.rama), motivo: elegidos[0].motivo }
  }).sort((a, b) => a.archivo.localeCompare(b.archivo))
}

const MARCA = { 'SIN REVISAR': '✖', 'DESCARTE SIN MOTIVO': '✖', REVERTIDO: '🚨', descartado: '📝', pendiente: '⏳' }

/**
 * Las líneas del informe. Puro a propósito: es la parte que garantiza que liberar no sea callar, y
 * eso hay que poder probarlo sin correr git ni mirar una consola.
 *
 * Se imprime TODO lo que no está incorporado, frene o no, con su motivo. El descartado lleva escrito
 * que no frena: el dueño tiene que poder leer en cada corrida qué se decidió, por qué, y que esa
 * decisión es la que está dejando pasar el pipeline.
 */
export function lineasDelInforme(resumen) {
  const lineas = []
  for (const r of resumen.filter((x) => x.veredicto !== 'incorporado')) {
    const frena = frenaElPipeline(r.veredicto) ? '' : '  — no frena: decisión escrita'
    lineas.push(`\n${MARCA[r.veredicto] ?? '·'} ${r.veredicto}  ${r.archivo}${frena}`)
    lineas.push(`   ramas: ${r.ramas.slice(0, 6).join(', ')}${r.ramas.length > 6 ? ` (+${r.ramas.length - 6})` : ''}`)
    if (r.motivo && r.veredicto !== 'SIN REVISAR') lineas.push(`   ${r.motivo}`)
  }
  const frenan = resumen.filter((r) => frenaElPipeline(r.veredicto))
  const descartados = resumen.filter((r) => r.veredicto === 'descartado').length
  const crudos = frenan.filter((r) => nadieLoMiro(r.veredicto)).length
  lineas.push(`\nincorporados: ${resumen.length - frenan.length - descartados} · descartados con motivo (no frenan): ${descartados}`
    + ` · declarados que frenan: ${frenan.length - crudos} · sin decisión escrita: ${crudos}`)
  return lineas
}

function informar(resumen) {
  for (const l of lineasDelInforme(resumen)) console.log(l)
  return resumen.filter((r) => frenaElPipeline(r.veredicto)).length
}

function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--archivo')
  // `--base` porque el trabajo se hace en un worktree y main todavía no lo tiene: preguntar por main
  // desde la rama que acaba de traer un generador informa un REVERTIDO que es cierto para main y
  // falso para lo que se está por integrar. La base se declara, y así se sabe qué se midió.
  const b = argv.indexOf('--base')
  const base = b >= 0 ? argv[b + 1] : 'main'
  const { ramas, archivos, hallazgos, viejas } = revisar({ base, soloArchivo: i >= 0 ? argv[i + 1] : null })
  console.log(`base: ${base} · generadores de Sheets revisados: ${archivos.length} · ramas sin mergear: ${ramas.length}`)
  if (!archivos.length) { console.error('✖ no encontré ningún generador: el prefijo o la rama base están mal. No afirmo nada.'); return 1 }
  if (viejas.length) {
    const ramasViejas = [...new Set(viejas.map((v) => v.rama))]
    console.log(`\n· ${viejas.length} versión(es) de rama que ${base} YA TUVO y superó — nada que traer`)
    console.log(`   ${ramasViejas.slice(0, 6).join(', ')}${ramasViejas.length > 6 ? ` (+${ramasViejas.length - 6})` : ''}`)
    // Las DECLARADAS se muestran enteras: son un juicio de una persona, no una comparación de blobs,
    // y esconderlas entre 740 automáticas sería exactamente el silenciador que este registro no puede ser.
    // Se deduplica por archivo+motivo, no por archivo: un mismo generador puede tener dos versiones
    // de rama atrasadas por razones distintas, y quedarse con una sola escondería la otra.
    for (const [, v] of new Map(viejas.filter((x) => x.motivo).map((x) => [`${x.archivo}·${x.motivo}`, x]))) {
      console.log(`\n· rama vieja (declarada)  ${v.archivo}`)
      console.log(`   ${v.motivo}`)
    }
  }
  if (!hallazgos.length) { console.log('\n✔ ninguna rama sin mergear difiere de main en un generador de Sheets.'); return 0 }

  if (!informar(resumir(hallazgos))) {
    console.log('\n✔ no queda trabajo de rama sin resolver: lo que no se incorporó está descartado por escrito arriba.')
    console.log('  El pipeline PUEDE correr — lo que sigue siendo distinto de main es lo que se decidió no traer.')
    return 0
  }
  console.log('\n  NO corras el pipeline contra el Sheet real hasta resolverlo: un generador viejo reescribe')
  console.log('  la grilla que él conoce y borra lo que se agregó después, sin fallar y sin avisar.')
  console.log('  Cuando lo resuelvas —lo traigas o decidas no traerlo— anotalo en orquestador/scripts/generadores-revisados.json.')
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
