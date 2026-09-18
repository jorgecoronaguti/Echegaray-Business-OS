#!/usr/bin/env node
// CARGA UN FAJO DE COMPROBANTES (fotografiados) A LA PESTAÑA "Compras" — íntegro y sin nada suelto.
//
// El OS lee cada foto y arma el JSON de entrada; este script lo escribe en Compras respetando el
// contrato de columnas (lib/carga-comprobantes.mjs): toca SÓLO las columnas del comprobante, estampa
// las fórmulas por fila copiándolas de la última fila (PASTE_FORMULA, Google ajusta las referencias)
// y NO escribe en las columnas de ARRAYFORMULA (AC/AD/AE/AF/AJ) — escribir ahí, aunque sea "",
// bloquea el derrame. Como los cruces del Sheet (Cash Flow, Proveedores, CAJA, Cheques) ya son
// fórmulas ABIERTAS sobre Compras, un comprobante bien cargado se propaga solo.
//
// FLUJO: lee la pestaña Compras VIVA (una sola vez) → matchea proveedor contra el desplegable
// estricto → concilia contra ARCA (corrige el número mal leído) → busca el DUPLICADO en Compras →
// asegura la grilla → escribe input → estampa fórmulas → verifica (sin #ERROR, totales) → reporta.
// Después conviene: node scripts/sync-compras.mjs (→ Supabase, regla #6).
//
// ═══ LAS TRES BARRERAS SON LAS MISMAS QUE LAS DEL BOT (03/08) ═══
//
// Este script y el bot de Mattermost comparten la escritura desde el principio (el bot lo INVOCA;
// ver `comunicacion/comprobantes/escritura.mjs`), pero decidían distinto sobre tres cosas, y en las
// tres el bot era el que sabía más:
//   · el DUPLICADO contra Compras viva (`compras-vivas.mjs`) sólo lo miraba el bot — por eso Claude
//     Code cargó dos veces un tique de Combustibles Barcelo que ya estaba en la fila 800;
//   · ARCA se conciliaba acá con un índice por NÚMERO PELADO, que da falsos positivos entre dos
//     proveedores con el mismo correlativo. Ahora se usa `arca.mjs`: CAE, CUIT+fecha+total,
//     CUIT+número, con coincidencia ÚNICA obligatoria, y corrige el número leído mal;
//   · "¿qué le falta a este comprobante?" tenía dos definiciones. Ahora es una (`faltantes.mjs`) y
//     lo que difiere es la POLÍTICA. La obra era la única diferencia de negocio —acá no se exigía y
//     en el chat sí— y el dueño la resolvió el 03/08/2026 alineando el chat con este cargador:
//     ninguno la exige. La obra se OFRECE en el chat con el historial adelante, pero no bloquea.
//
//   node orquestador/scripts/cargar-comprobantes-compras.mjs --file fajo.json [--dry] [--cargar-igual]

import { readFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { esTransitorio } from '../lib/google-transitorio.mjs'
import { query, closePool } from '../lib/db.mjs'
import { matchProveedor, valoresInput, aFechaAR, discrepanciaNeto, verificarEscritura, colIndice, filaModeloDeFormulas } from '../lib/carga-comprobantes.mjs'
import { faltantesDe, puedeCargarse, POLITICA } from '../lib/comprobantes/faltantes.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { perfilesDeImputacionDesdeDB } from '../lib/imputacion-aprendida.mjs'
import { perfilesDeCompras } from '../lib/comprobantes/imputacion-historial.mjs'
import { completarCuitsDelMaestro, cuitsParaCompletar } from '../lib/comprobantes/cuit-maestro.mjs'
import { completarUno } from '../lib/comprobantes/imputacion-historial.mjs'
import { completarDesdeAnotacion } from '../lib/comprobantes/anotacion-a-obra.mjs'
import { aritmetica, colVerificacion } from '../lib/comprobantes/verificacion.mjs'
import { CONTRATO, colDelCargador, contratoContra, derivar } from '../lib/comprobantes/contrato-columnas.mjs'
import { lectorDeEncabezados, rangoColumna, rangoFilas, ubicarColumna } from '../lib/columnas-por-encabezado.mjs'
import { COMPRAS_2508 } from '../lib/encabezados-referencia.mjs'
import { catalogosDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { destinosDeObra, obraParaLaColumna, pestanaDelComprobante, PESTANA_COMPRAS } from '../lib/comprobantes/obra-y-destino.mjs'
import { indiceDeCompras, buscarEnCompras, HALLAZGO } from '../lib/comprobantes/compras-vivas.mjs'
import { conciliarConArca, aplicarArca, candidatasArca, ESTADO_ARCA } from '../lib/comprobantes/arca.mjs'
import { listasDeCompras, proveedoresPorCuit } from '../lib/comprobantes/listas.mjs'
import { CAMINO, ampliarDesplegable, aplicarAltas, planDeAltas, requestValidacionProveedores, resolverNoMatcheado } from '../lib/alta-proveedor.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const ADD_PROV = process.argv.includes('--add-proveedores')
// EL FRENO DE MANO DEL ALTA AUTOMÁTICA. El dueño pidió que un proveedor con CUIT se cree solo, y así
// corre por defecto — también desde el bot, que invoca este script sin banderas. Existe la salida
// para apagarlo sin tocar código el día que haga falta: la decisión de crear datos maestros sin nadie
// mirando tiene que poder revertirse en un comando, no en un deploy.
const SIN_ALTA = process.argv.includes('--sin-alta-proveedores')
// "Ya lo revisé, no es el mismo: cargalo." Es el equivalente por línea de comandos del botón "Es
// otro, cargalo" del bot, y sólo levanta los PROBABLES. Una coincidencia CIERTA —mismo número y
// mismo total— no la levanta ninguna bandera: para eso habría que borrar la fila que ya está.
const CARGAR_IGUAL = process.argv.includes('--cargar-igual')
// SALIDA LEGIBLE POR OTRO PROGRAMA (`--json`). Aditiva y apagada por defecto: sin la bandera este
// script imprime exactamente lo que imprimía. Existe porque el bot de Mattermost necesita contestarle
// al dueño EN QUÉ FILA quedó cada comprobante, y sacar un número de fila parseando prosa es la clase
// de acoplamiento que se rompe el día que alguien mejora un mensaje.
const JSON_OUT = process.argv.includes('--json')
const fileArg = (process.argv.find((a) => a.startsWith('--file=')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--file') + 1]

/** Marca que delimita la línea de resultado. Todo lo demás de stdout es para una persona. */
const MARCA_JSON = '##ORQ-JSON##'
/**
 * EN QUÉ FASE ESTÁ LA CORRIDA (15/09/2026). Viaja en cada línea JSON para que el que llama sepa qué
 * significa una falla: `lectura` = no se tocó el Sheet, se puede repetir tal cual; `escritura` = la
 * pestaña puede haber quedado a medias, NO se reintenta solo; `verificacion` = las filas ya entraron.
 * Nació el día en que un 504 de Google al leer los rótulos se contestó como «revisá Compras antes
 * de reintentar» sobre un Sheet que no se había tocado.
 */
export const FASE = Object.freeze({ LECTURA: 'lectura', ESCRITURA: 'escritura', VERIFICACION: 'verificacion' })
let fase = FASE.LECTURA
const emitir = (o) => { if (JSON_OUT) console.log(MARCA_JSON + JSON.stringify({ fase, ...o })) }

/** La línea JSON de una corrida que murió por excepción. Pura, para poder probarla sin Google. */
export function resultadoDeExcepcion(e, enFase = fase) {
  return {
    ok: false,
    motivo: 'excepcion',
    fase: enFase,
    transitorio: esTransitorio(e),
    // `escritas` es lo que el bot usa para saber si es SEGURO que no se escribió: el 0 sólo se afirma
    // cuando la excepción cayó antes de tocar la pestaña. A mitad de la escritura no se sabe, y se dice.
    escritas: enFase === FASE.LECTURA ? 0 : null,
    detalle: String(e?.message ?? e).slice(0, 300),
  }
}

// El índice de columna sale de `colIndice`, no de una copia local: la verificación de la escritura
// usa la misma función, y dos definiciones de "qué número de columna es la M" es exactamente cómo
// se cuela un desfasaje que nadie ve hasta que escribe en la columna de al lado.
const idx = colIndice // 'A'->0, 'AA'->26

// LA LISTA DEL DESPLEGABLE Y EL MAPA DE CUIT SALEN DE `lib/comprobantes/listas.mjs`, que es de donde
// ya los saca el bot. Acá había una copia de `listasDeCompras` —las mismas quince líneas leyendo la
// misma validación de `Compras!E4:E12`— y una copia es una segunda verdad esperando el día en que
// una de las dos se arregle sola. Se borró: una capacidad, una fuente.

/**
 * EL MAESTRO DE `app.ecsas`: quién existe y qué texto ya resolvió una persona.
 *
 * Es la otra mitad de la identidad. La pestaña `Proveedores` del Sheet sabe de CUIT pero no de los
 * alias firmados a mano ni de las fichas creadas desde la web; Postgres sabe de las dos cosas.
 *
 * NUNCA LANZA: si la base no contesta se sigue con lo que dice el Sheet, exactamente como antes de
 * este arreglo. No poder leer el maestro no puede convertirse en un proveedor duplicado — pero sí
 * se DECLARA, porque «no está» y «no pude mirar» no son lo mismo.
 */
export async function maestroDeProveedores(q = query) {
  try {
    const [p, a] = await Promise.all([
      q('select id, nombre, cuit from public.proveedores'),
      q("select nombre_norm, proveedor_id, estado from public.proveedor_alias"),
    ])
    return { ok: true, proveedores: p.rows ?? [], alias: a.rows ?? [] }
  } catch (e) {
    return { ok: false, proveedores: [], alias: [], error: String(e?.message ?? e).slice(0, 160) }
  }
}

/** Los otros nombres que cada CUIT tiene en el maestro y en el libro fiscal. Nunca lanza. */
async function nombresDelPadronPorCuit() {
  const { nombresPorCuit } = await import('../comunicacion/comprobantes/repositorio.mjs')
  return nombresPorCuit({ query }).catch(() => new Map())
}

/** Traduce lo que devolvió la escritura en la razón HUMANA de por qué el destino quedó como quedó. */
function porQueNoEntro(respuesta, leidoOk) {
  if (respuesta?.congelado) return `la escritura de Sheets está CONGELADA — ${String(respuesta.motivo).split('\n')[0]}`
  if (respuesta?.noBorrar) return 'la guarda no-borrar descartó los rangos (no pudo releer el destino)'
  if (respuesta?.protegido) {
    const tabs = (respuesta.bloqueadas || []).join(', ') || 'la pestaña'
    // `porQue` viene de la guarda como pestaña → motivo (candado-dueño · firma-editada · …).
    const causa = Object.values(respuesta.porQue || {})[0] || respuesta.motivo || 'candado de pestaña o firma'
    return `la guarda protegió ${tabs} (${causa}): o la candaste a mano, o la editaste desde mi última escritura`
  }
  if (!leidoOk) return 'no pude releer las filas para verificar la escritura — no afirmo que se escribieron'
  return 'la API aceptó la escritura pero el destino no la tiene (algún filtro de la guarda descartó los rangos)'
}

/**
 * ESCRIBE LAS FILAS Y PRUEBA EL EFECTO. La respuesta de la API no es evidencia: la evidencia es el dato
 * leído en su destino. Escribe el bloque de input, RELEE exactamente las filas que dice haber escrito y
 * las compara contra lo que se quiso poner. Devuelve ok:false —con el porqué— si alguna quedó vacía o
 * distinta, para que el llamador falle en vez de felicitar. Exportada para poder probar el fallo.
 *
 * @returns {Promise<{ok:boolean, motivo?:string, vacias:object[], distintas:object[], respuesta:any}>}
 */
/**
 * LOS RANGOS A ESCRIBIR: sólo las celdas que este lote LLENA. NÚCLEO PURO.
 *
 * ═══ MANDAR "" NO ES NO ESCRIBIR: ES PISAR (20/08/2026) ═══
 *
 * Antes se armaba un bloque por columna —`Compras!T869:T878`— y las filas que no tenían ese dato
 * viajaban como `''`. Diez comprobantes en un lote, seis pagados y cuatro no: como ALGUNO tenía
 * `Monto Pagado`, la columna T entera entraba al pedido, y las cuatro filas sin pago mandaban vacío
 * sobre la fórmula `=IF(F="pago";O;0)` que la plantilla ya tenía ahí.
 *
 * Eso disparaba la guarda de `no-borrar.mjs` —"no dejes vacía una celda con contenido"— que conservó
 * el contenido… leído como TEXTO. La fórmula quedó reemplazada por su renderizado, «—», y `U = T-O`
 * pasó a `#VALUE!` en cuatro filas: $903.538 de saldo pendiente que dejaron de sumar. Las dos puntas
 * se arreglan —la guarda ya preserva la fórmula—, pero el pedido tampoco tiene por qué nombrar una
 * celda que no va a llenar.
 *
 * Se emite UN rango por cada corrida de filas CONSECUTIVAS que sí tienen ese dato. Un lote donde
 * todas las filas llenan la columna sigue produciendo un solo rango, igual que antes.
 *
 * @param {Array<{valores:object}>} plan
 * @param {{desde:number}} o
 * @returns {Array<{range:string, values:any[][]}>}
 */
export function rangosAEscribir(plan = [], { desde = 0 } = {}) {
  const letras = [...new Set(plan.flatMap((p) => Object.keys(p?.valores ?? {})))]
  const data = []
  for (const L of letras) {
    let corrida = null
    plan.forEach((p, i) => {
      const v = p?.valores?.[L]
      // El 0 y el false son DATOS, no ausencias: sólo `null`, `undefined` y '' cortan la corrida.
      const tiene = v !== undefined && v !== null && v !== ''
      if (!tiene) { corrida = null; return }
      if (!corrida) {
        corrida = { desde: desde + i, values: [] }
        data.push({ letra: L, corrida })
      }
      corrida.values.push([v])
    })
  }
  return data.map(({ letra, corrida }) => ({
    range: `Compras!${letra}${corrida.desde}:${letra}${corrida.desde + corrida.values.length - 1}`,
    values: corrida.values,
  }))
}

export async function escribirYVerificar(google, { desde, hasta, plan, fileId = ID }) {
  const data = rangosAEscribir(plan, { desde })
  // REGLA 0 — NO APLICA, Y ESTÁ DECIDIDO: respetar: false.
  // Este cargador AGREGA filas de comprobante al final de "Compras". No escribe un solo rótulo:
  // escribe datos —CUIT, número, importe, fecha— en filas que antes no existían. No hay texto de
  // una persona debajo que se pueda pisar, porque debajo no había nada.
  //
  // Y ese mismo hecho es el que habilita `soloFilasVacias`: como es un APPEND, la guarda puede dejarlo
  // pasar aunque la firma de "Compras" difiera (el dueño la edita todos los días) — pero sólo después de
  // RELEER el destino y confirmarlo vacío, y nunca contra un candado puesto a mano. Ver
  // guarda-escritura.mjs. Que "debajo no había nada" deje de ser cierto no es una hipótesis: es lo que la
  // guarda verifica antes de escribir, y lo que la verificación de abajo prueba después.
  const respuesta = await google.batchUpdateValues(fileId, data, { soloFilasVacias: true })
  const leido = await google.readSheetGrid(fileId, rangoFilas('Compras', desde, hasta)).catch(() => null)
  const v = verificarEscritura(plan.map((p) => p.valores), leido?.filas || [], { desde })
  if (v.ok && leido) return { ok: true, ...v, respuesta }
  // El freno de mano y el candado se arreglan de formas distintas —uno lo levanta el dueño para toda
  // la sesión, el otro es por pestaña—, así que quien consuma esto tiene que poder distinguirlos sin
  // leer prosa. Sin este campo, el bot le decía "pestaña candada" a un Sheet congelado.
  return { ok: false, congelado: respuesta?.congelado === true, motivo: porQueNoEntro(respuesta, Boolean(leido)), ...v, respuesta }
}

/**
 * LO QUE QUEDÓ EN LAS FILAS RECIÉN ESCRITAS, con los TRES controles. NÚCLEO PURO.
 *
 * Exportada para poder probarla: la mitad que importa —la aritmética— es justamente la que no se
 * podía ejercitar cuando vivía adentro de `main()`, que toca Google, Postgres y el Sheet real.
 *
 * · `errores`   → `#ERROR/#REF/#N/A/#VALUE` en id (A), total (O) o rubro (AC). Es el chequeo de las
 *                 FÓRMULAS y sólo eso.
 * · `sinRubro`  → AC vacía: la fila entra al Cash Flow sin clasificar. Informativo, no es un defecto.
 * · `noCierran` → Importe + IVA ≠ Total. **Es lo que `#ERROR` no puede ver**: si `PASTE_FORMULA` bajó
 *                 un literal en vez de la fórmula de O, la fila queda con el total de OTRA factura —
 *                 un número perfectamente válido y perfectamente falso. Usa la MISMA `aritmetica()`
 *                 que el bot al releer: si algún día cambia la tolerancia, cambia para los dos.
 *
 * @param {Array<Array<{valor?:string|null}>>} filas  la grilla releída de `Compras!A{desde}:AD{hasta}`
 * @param {{desde:number}} o
 */
export function revisarFilasEscritas(filas = [], { desde = 0, ind = indicesDeRevision(COMPRAS_2508) } = {}) {
  let errores = 0
  let sinRubro = 0
  const noCierran = []
  for (const [k, f] of (filas ?? []).entries()) {
    const val = (i) => f?.[i]?.valor ?? ''
    if (/#(ERROR|REF|N\/A|VALUE|¿NOMBRE|NAME)/i.test([val(ind.id), val(ind.total), val(ind.rubro)].join(' '))) errores++
    if (!val(ind.rubro)) sinRubro++
    const a = aritmetica((f ?? []).map((c) => c?.valor ?? ''), ind.ver)
    if (!a.cierra) noCierran.push({ fila: desde + k, ...a })
  }
  return { errores, sinRubro, noCierran }
}

/**
 * ¿Hay que tocar el desplegable estricto de la columna E?
 *
 * Existe como función porque acá vivía `nuevos.size` sobre un ARRAY —`undefined`, falsy siempre— y
 * `--add-proveedores` nunca agregó un proveedor sin que nadie se enterara. Una condición metida en el
 * medio de `main()` no se puede probar, y por eso estuvo mal todo el tiempo que estuvo.
 */
export function debeAgregarProveedores(addProv, nuevos) {
  return Boolean(addProv) && Array.isArray(nuevos) && nuevos.length > 0
}

/** Los otros nombres de ese CUIT, probados contra el desplegable estricto. null si ninguno matchea. */
function matchPorPadron(cuit, lista, nombresPorCuit, porCuit) {
  const c = String(cuit ?? '').replace(/\D/g, '')
  if (c.length !== 11 || !nombresPorCuit) return null
  const candidatos = (nombresPorCuit instanceof Map ? nombresPorCuit.get(c) : nombresPorCuit[c]) ?? []
  for (const nombre of candidatos) {
    const m = matchProveedor(nombre, lista, { cuit, porCuit })
    if (!m.esNuevo) return { ...m, motivo: m.motivo ?? 'cuit-padron' }
  }
  return null
}

/** Concilia contra el padrón. MUTA el comprobante: le corrige el número, el CUIT y el CAE. */
async function conciliar(cc, arcaDe) {
  if (typeof arcaDe !== 'function') return { estado: ESTADO_ARCA.NO_VERIFICADO }
  try {
    return aplicarArca(cc, conciliarConArca(cc, (await arcaDe(cc)) ?? []))
  } catch {
    // Que el padrón no conteste no puede frenar una carga: se declara y se sigue.
    return { estado: ESTADO_ARCA.NO_VERIFICADO }
  }
}

/**
 * UN comprobante del fajo → el ítem con todo lo que se sabe de él. Es el mismo orden que usa el bot
 * (`comunicacion/comprobantes/flujo.mjs`) y ese orden ES el arreglo: ARCA corrige el número ANTES de
 * buscar el duplicado, porque el duplicado se busca justamente por número.
 *
 * @returns {Promise<{item:object, arca:object, prov:object, hallazgo:object|null}>}
 */
export async function prepararUno(c = {}, { lista = [], porCuit = null, nombresPorCuit = null, indiceCompras = null, arcaDe = null, cargarIgual = false, conocidos = {} } = {}) {
  // EL CUIT MANDA SOBRE EL NOMBRE, igual que en el chat: la factura trae la razón social del padrón
  // y el desplegable el nombre de fantasía. Sin `porCuit` se comporta exactamente como antes.
  let prov = matchProveedor(c.proveedor, lista, { cuit: c.cuit, porCuit })
  // ═══ Y SI NO ENGANCHÓ, LA IDENTIDAD LA DA EL CUIT (25/08) ═══
  //
  // El desplegable no lo tiene, pero el CUIT del papel puede identificarlo igual: contra el maestro,
  // contra la pestaña `Proveedores` o contra lo que una persona ya resolvió a mano. Lo que va a la
  // celda es SIEMPRE el nombre canónico —nunca la variante recién leída—, porque escribir la razón
  // social de un proveedor vivo le parte la cuenta corriente en dos. Ver `alta-proveedor.mjs`.
  // Antes de decidir nada se prueban los OTROS nombres que ese CUIT tiene en el maestro y en el libro
  // fiscal, con el MISMO matcheo estricto — el paso que el bot hacía y este cargador no. No afloja un
  // umbral: sólo le da al matcheo los nombres que el papel no dejó leer. Ver `item.mjs`.
  const porPadron = prov.esNuevo ? matchPorPadron(c.cuit, lista, nombresPorCuit, porCuit) : null
  if (porPadron) prov = porPadron
  const alta = prov.esNuevo ? resolverNoMatcheado({ nombre: prov.valor, cuit: c.cuit }, { ...conocidos, porCuit }) : null
  const nombreCelda = alta?.nombreCanonico ?? prov.valor
  // La fecha se canoniza ANTES que nada: ARCA la exige en DD/MM/AAAA y el índice de Compras compara
  // contra ese mismo formato. Un "5/1/2026" sin normalizar no matchea nada y el duplicado pasa.
  const cc = { ...c, proveedor: nombreCelda, fecha: aFechaAR(c.fecha) ?? c.fecha ?? null }
  const arca = await conciliar(cc, arcaDe)
  const hallazgo = indiceCompras?.ok === false ? null : buscarEnCompras(cc, indiceCompras ?? {})
  const item = {
    comprobante: cc,
    proveedorNuevo: prov.esNuevo === true,
    // La resolución puede venir en el propio fajo (el botón "Es otro, cargalo" del bot) o de la
    // bandera. Las dos dicen lo mismo: una persona ya miró la fila candidata.
    duplicadoResuelto: c.duplicadoResuelto ?? (cargarIgual ? 'otro' : null),
  }
  if (hallazgo?.que === HALLAZGO.CARGADO) item.yaCargado = hallazgo
  else if (hallazgo?.que === HALLAZGO.PROBABLE) item.posibleDuplicado = hallazgo
  return { item, arca, prov, hallazgo, alta }
}

/**
 * El fajo de entrada → el plan de filas a escribir, y todo lo que NO se escribe con su razón.
 *
 * NO TOCA LA RED por su cuenta: la pestaña ya viene leída y ARCA entra por `arcaDe`. Exportada para
 * poder probar las tres barreras —duplicado, ARCA y qué le falta— sin Google, sin Postgres y sin
 * escribir una celda.
 */
export async function prepararPlan(comprobantes = [], o = {}) {
  const { perfiles = null } = o
  const plan = []; const rechazos = []; const duplicados = []; const percep = []; const fueraDeCompras = []
  const nuevos = new Set(); const arca = { coinciden: 0, corregidos: 0 }
  // Las resoluciones de identidad SÓLO de las filas que se van a escribir: dar de alta un proveedor
  // por un comprobante que se rechazó o que ya estaba cargado dejaría una ficha que nadie pidió.
  const resoluciones = []
  for (const [i, c] of comprobantes.entries()) {
    const { item, arca: bloque, prov, alta } = await prepararUno(c, o)
    const cc = item.comprobante
    if (bloque.estado === ESTADO_ARCA.COINCIDE) { arca.coinciden++; if (bloque.numeroLeido) arca.corregidos++ }
    // UN DUPLICADO NO ES UN PROBLEMA DE DATOS: se informa aparte para que no se lea como un
    // comprobante ilegible. Es la barrera más cara de las tres — la que evita contar un gasto dos
    // veces en el Flujo de Fondos, donde se propaga solo por fórmula a cuatro pestañas más.
    if (item.yaCargado || (item.posibleDuplicado && !item.duplicadoResuelto)) {
      const h = item.yaCargado ?? item.posibleDuplicado
      duplicados.push({ i, cierto: Boolean(item.yaCargado), fila: h.fila, via: h.via ?? null, proveedor: cc.proveedor, numero: cc.numero ?? null })
      continue
    }
    const problemas = faltantesDe(item, POLITICA.CARGADOR).map((f) => f.texto)
    if (problemas.length || !puedeCargarse(item, POLITICA.CARGADOR)) {
      rechazos.push({ i, proveedor: c.proveedor, problemas })
      continue
    }
    // ═══ LA IMPUTACIÓN SE APLICA, NO SE IMPRIME (14/08) ═══
    //
    // Acá se llamaba a `sugerirImputacion` y el resultado sólo se mostraba: «NO cambia lo que se
    // escribe». El bot, con la misma lib, sí la escribía. El mismo comprobante quedaba imputado a una
    // obra o a ninguna según por dónde entrara, y la obra es la columna que decide qué obra come el
    // costo. Ahora los dos caminos llaman a `completarUno`, que aplica sólo lo FIRME (n≥5 y ≥80%),
    // nunca pisa lo que el papel dice, y marca la vía — de ahí sale el `[historial: …]` de la
    // columna L, para que meses después se pueda distinguir el dato del promedio.
    // `campoDetalle: 'detalle'` porque en el `fajo.json` la columna K se llama así — en el ítem del
    // chat se llama `detalleObra` y `detalle` es el desglose del IVA. La forma la declara el que
    // llama; adivinarla dejaba la K vacía por una vía y le escribía texto al IVA por la otra.
    // ═══ Y ANTES QUE EL HISTORIAL, LO ESCRITO A MANO (15/09/2026) ═══
    //
    // El fajo dc2d0273 entró con «Estrella … OFICINA Y FÁB.», «SF Pisos Industriales», «QUATTROPANI»
    // y «Messino Dilucion» transcriptos… y con la columna «Obra» vacía y sin Unidad, mientras el
    // historial del proveedor proponía «LA ESTRELLA» a confirmar. El orden ES el arreglo: la
    // anotación es la decisión del dueño sobre ESTE gasto, el historial una estadística sobre otros.
    // Lo que la anotación resuelve queda escrito y marcado `*Via='anotacion'`; lo que no, sigue
    // viajando como sugerencia y el motivo se imprime.
    const anot = completarDesdeAnotacion(cc, o.destinos, { listas: o.listas, campoDetalle: 'detalle' })
    const { aplicado, sugerencia: sug } = perfiles?.por_proveedor
      ? completarUno(cc, perfiles, { campoDetalle: 'detalle', salvo: anot.aplicado.length ? ['obra', 'detalle', 'unidad'] : [] })
      : { aplicado: {}, sugerencia: null }
    // ═══ IMPUESTOS, CARGAS Y FINANCIEROS NO ENTRAN A COMPRAS (dueño, 14/09/2026) ═══
    //
    // Se decide DESPUÉS del historial —la Unidad «Impuestos» de un proveedor que siempre fue impuesto
    // también cuenta— y ANTES de las altas: dar de alta un proveedor por un comprobante que no se
    // escribe dejaría una ficha que nadie pidió. No se escribe en la otra pestaña: esas pestañas las
    // arman sus generadores desde sus propias fuentes. Se devuelve con el nombre de a dónde va.
    const { pestana, rubro } = pestanaDelComprobante(cc)
    if (pestana !== PESTANA_COMPRAS) {
      fueraDeCompras.push({ i, proveedor: cc.proveedor ?? null, numero: cc.numero ?? null, pestana, rubro })
      continue
    }
    if (alta) resoluciones.push(alta)
    // `nuevos` son los que SIGUEN fuera del desplegable después de intentar identificarlos: los que
    // el CUIT resolvió entran por `altas` y salen del rojo. Confundirlos haría que el bot avise de un
    // proveedor que ya quedó bien y se calle el que de verdad hay que mirar.
    if (prov.esNuevo && (!alta || alta.camino === CAMINO.SIN_IDENTIDAD || alta.camino === CAMINO.CONFLICTO)) nuevos.add(cc.proveedor)
    const dif = discrepanciaNeto(cc)
    if (dif) percep.push({ i, proveedor: prov.valor, dif })
    // LA COLUMNA «Obra»: sólo un valor del desplegable, y sólo si es una decisión. Se pisa lo que venga
    // en `obraFila` con el valor VALIDADO: un texto que no es opción no llega a la celda.
    const obra = obraParaLaColumna(cc, o.destinos)
    cc.obraFila = obra.valor ?? undefined
    const cuit = String(cc.cuit ?? '').replace(/\D/g, '')
    // `i` = índice del comprobante en el fajo de ENTRADA. Va en el plan porque los rechazados no
    // ocupan fila: sin él, quien llama no puede saber a qué comprobante suyo corresponde cada fila.
    plan.push({
      i, valores: valoresInput(cc, o.col), col: o.col ?? colDelCargador(CONTRATO), nuevo: prov.esNuevo, proveedor: prov.valor, sug, aplicado,
      obra, cuit: cuit.length === 11 ? cuit : null, pestana, rubro,
      // EL CUIT QUE ARCA CONFIRMÓ, para completar el maestro si a ese proveedor le falta (18/09).
      // Sólo de un proveedor que YA existe (matcheó): el nuevo entra por `altas`. Ver `cuit-maestro.mjs`.
      cuitConfirmado: !prov.esNuevo && bloque.estado === ESTADO_ARCA.COINCIDE && bloque.emisorCuit ? bloque.emisorCuit : null,
      // LO QUE VA A QUEDAR EN LAS COLUMNAS QUE DECIDEN EL COSTO, para poder mirarlo en el `--dry`
      // sin abrir el Sheet: I Unidad, J Cliente/Asignación, K Detalle, y qué dijo la mano.
      cols: { unidad: cc.unidad ?? null, obraJ: cc.obra ?? null, detalle: cc.detalle ?? null },
      anotacion: anot.anotacion ?? null, anotacionPorque: anot.resultado?.porque ?? null,
    })
  }
  // `revisadoContraCompras` viaja porque no poder mirar la pestaña NO es "no está cargado", y las dos
  // cosas se ven iguales si nadie las distingue. Quien informe esto tiene que poder decir cuál fue.
  return { plan, rechazos, duplicados, percep, fueraDeCompras, nuevos: [...nuevos], altas: planDeAltas(resoluciones), arca, revisadoContraCompras: o.indiceCompras?.ok === true }
}

/** Lo que cada fila del plan le dice a quien consume la línea JSON: dónde, a qué obra, qué CUIT. */
export function filasDelPlan(plan = [], desde = 0) {
  return plan.map((p, k) => ({
    i: p.i, fila: desde + k, proveedor: p.proveedor, cuit: p.cuit ?? null, pestana: p.pestana ?? PESTANA_COMPRAS,
    obra: p.obra?.valor ?? null, obraPorque: p.obra?.valor ? null : (p.obra?.porque ?? null),
    obraEscrita: Boolean(p.obra?.valor && p.col?.obraFila),
    // De dónde salió la obra escrita: `historial` viaja para que el mensaje lo diga (18/09/2026).
    obraVia: p.obra?.valor ? (p.obra?.via ?? null) : null,
  }))
}

/** Lo que se decidió, para una persona. No decide nada: sólo cuenta lo que ya se decidió. */
/** Por qué no hay nada que escribir. `fuera_de_compras` sólo si TODO lo no cargado fue por eso. */
export function motivoSinPlan({ rechazos = [], duplicados = [], fueraDeCompras = [] } = {}) {
  if (fueraDeCompras.length && !rechazos.length && !duplicados.length) return 'fuera_de_compras'
  return duplicados.length && !rechazos.length ? 'ya_cargados' : 'nada_cargable'
}

function informar({ plan, rechazos, duplicados, percep, fueraDeCompras = [], nuevos, arca }, { ultima, desde, hasta, indiceCompras, perfiles }) {
  console.log(`Compras: última fila con datos = ${ultima}. Se cargan ${plan.length} comprobante(s) → filas ${desde}..${hasta}.`)
  if (fueraDeCompras.length) {
    console.log(`\n↪ ${fueraDeCompras.length} NO van a Compras (dueño, 14/09: tienen su pestaña):`)
    fueraDeCompras.forEach((f) => console.log(`   #${f.i} ${f.proveedor || '(sin proveedor)'} ${f.numero ?? ''} → «${f.pestana}» (rubro ${f.rubro})`))
  }
  for (const p of plan) {
    const celda = (x) => (x ? `«${x}»` : 'vacía')
    console.log(`   Obra #${p.i} ${p.proveedor ?? ''}: ${p.obra?.valor ? `«${p.obra.valor}»` : `vacía — ${p.obra?.porque ?? 'sin propuesta'}`}${p.cuit ? ` · CUIT ${p.cuit}` : ''}`)
    // LAS TRES COLUMNAS QUE ACOMPAÑAN A LA OBRA, en la misma corrida: una fila con la obra puesta y
    // la Unidad vacía sigue sin clasificar en el rubro de caja, y eso no se ve mirando sólo la L.
    console.log(`      I ${celda(p.cols?.unidad)} · J ${celda(p.cols?.obraJ)} · K ${celda(p.cols?.detalle)}`
      + `${p.anotacion ? ` · a mano: "${p.anotacion}"` : ''}${!p.obra?.valor && p.anotacionPorque ? ` — ${p.anotacionPorque}` : ''}`)
  }
  // NO PODER MIRAR COMPRAS NO ES "NO ESTÁ CARGADO". Si se callara, una corrida ciega y una corrida
  // verificada se verían iguales — y la ciega es justo la que puede duplicar un gasto.
  if (!indiceCompras?.ok) console.log(`\n⚠ NO pude leer la pestaña Compras para buscar duplicados (${indiceCompras?.error ?? 'sin detalle'}). No afirmo que estos comprobantes no estén ya cargados.`)
  if (duplicados.length) {
    console.log(`\n⛔ ${duplicados.length} NO se cargan porque YA ESTÁN en Compras:`)
    duplicados.forEach((d) => console.log(`   #${d.i} ${d.proveedor || '(sin proveedor)'} ${d.numero ?? ''} → fila ${d.fila}${d.cierto ? '' : ' (PROBABLE)'} [${d.via ?? 'sin vía'}]`))
    if (duplicados.some((d) => !d.cierto)) console.log('   Los PROBABLES: si ya los miraste y no son el mismo, volvé a correr con --cargar-igual.')
  }
  if (rechazos.length) { console.log(`\n⚠ ${rechazos.length} NO se cargan (dato insuficiente, no se inventa):`); rechazos.forEach((r) => console.log(`   #${r.i} ${r.proveedor || '(sin proveedor)'}: ${r.problemas.join('; ')}`)) }
  if (nuevos.length) console.log(`\n⚠ Proveedores NUEVOS (no están en el desplegable estricto — confirmá antes de fijarlos): ${nuevos.join(' · ')}`)
  if (percep.length) console.log(`\nℹ Percepción/impuesto interno absorbido en Importe (M = Total − IVA, para que el Total cierre): ${percep.map((p) => `${p.proveedor} (+$${Math.round(p.dif).toLocaleString('es-AR')})`).join(' · ')}`)
  // QUE ESTÉ EN ARCA NO ES UN DUPLICADO: toda factura electrónica recibida está en el padrón.
  // Encontrarla ahí prueba que existe y da su número VERDADERO. El duplicado se busca en Compras.
  if (arca.coinciden) console.log(`\nℹ ARCA: ${arca.coinciden} conciliado(s) contra el padrón${arca.corregidos ? ` — ${arca.corregidos} con el número corregido por el del libro fiscal` : ''}.`)
  informarImputacion(plan, perfiles)
}

/**
 * LA IMPUTACIÓN APRENDIDA: qué se ESCRIBIÓ y qué queda para el dueño.
 *
 * Antes esto decía «SUGIERE, no impone» y las filas se escribían con Unidad/Obra vacías. Desde el
 * 14/08 el cargador aplica lo FIRME igual que el bot (ver `completarUno`), así que este informe tiene
 * dos mitades y la primera es la que importa: lo que ya quedó escrito, con el conteo que lo respalda.
 * Lo que no llegó a firme sigue siendo una sugerencia y se dice como tal.
 */
/**
 * QUÉ SE DECIDIÓ SOBRE CADA PROVEEDOR QUE EL DESPLEGABLE NO TENÍA — antes de escribir nada.
 *
 * Se imprime también en `--dry`, que es donde tiene que mirarse: el alta de un proveedor es un dato
 * maestro y equivocarlo cuesta caro de deshacer.
 */
function informarAltas(altas, conocidos) {
  if (!altas) return
  if (conocidos?.ok === false) {
    // NO PODER MIRAR EL MAESTRO NO ES «NO ESTÁ». Con la base caída, un proveedor que ya existe en
    // `app.ecsas` se vería como nuevo, y eso es exactamente el duplicado que hay que evitar.
    console.log(`\n⚠ No pude leer el maestro de proveedores (${conocidos.error}): la identidad se resolvió sólo con el Sheet.`)
  }
  for (const a of altas.existentes) console.log(`  = ${a.nombre} ya existía (CUIT ${a.cuit}) — no se crea nada, se imputa al que estaba.`)
  for (const a of altas.altas) console.log(`  + ALTA de proveedor: ${a.nombre} (CUIT ${a.cuit}, ${a.motivo}).`)
  for (const a of altas.alias) console.log(`  ↳ variante "${a.nombre_origen}" queda vinculada al CUIT ${a.cuit}.`)
  for (const c of altas.conflictos) console.log(`  ✖ ${c.nombreLeido}: ${c.motivo} — lo resuelve una persona en /administracion/proveedores.`)
  for (const n of altas.ambiguos) console.log(`  ✖ "${n}" apunta a dos CUIT distintos en esta misma tanda: no se vincula a ninguno.`)
}

/** Lo que la BASE dijo que pasó. La evidencia del alta es la fila que volvió, no el plan. */
function informarAplicadas(r) {
  if (r.creados.length) console.log(`  ✔ ${r.creados.length} proveedor(es) creado(s) en app.ecsas: ${r.creados.map((x) => `${x.nombre} [${x.id}]`).join(' · ')}`)
  if (r.yaEstaban.length) console.log(`  ℹ ${r.yaEstaban.length} ya estaba(n) en la base (otra corrida ganó la carrera): ${r.yaEstaban.map((x) => x.nombre).join(' · ')}`)
  if (r.alias.length) console.log(`  ✔ ${r.alias.length} variante(s) de nombre registrada(s).`)
  for (const x of r.rechazos) console.log(`  ✖ ${x.nombre ?? x.nombre_origen}: ${x.motivo}`)
}

function informarImputacion(plan, perfiles) {
  const conSug = plan.filter((p) => p.sug)
  if (!perfiles?.por_proveedor && !perfiles?.disponible) {
    console.log('\nℹ Imputación aprendida: sin historia espejada todavía (public.costos_obra). La máquina mide; la historia recién arranca.')
    return
  }
  const aplicados = plan.filter((p) => Object.keys(p.aplicado ?? {}).length)
  if (aplicados.length) {
    console.log('\n✍ Imputación COMPLETADA con el historial (queda marcada en el Concepto como `[historial: …]`):')
    // La dimensión «pago» vive en la clave `formaPago` del contrato de columnas.
    const claveDe = (k) => (k === 'pago' ? 'formaPago' : k)
    for (const p of aplicados) {
      const cual = Object.entries(p.aplicado)
        .map(([k, v]) => `${k} = «${p.valores[p.col?.[claveDe(k)]] ?? '?'}» (${v.ultimas ? `últimas ${v.ultimas} iguales de ${v.n}` : `${v.n} cargas, ${Math.round((v.share ?? 0) * 100)}%`})`)
      console.log(`   ${p.proveedor}: ${cual.join(' · ')}`)
    }
  }
  if (!conSug.length) return
  const dim = (d) => d?.sugerido ? `${d.sugerido}${d.pide_confirmacion ? ' (?)' : ' ✓'}` : '—'
  // Sólo se listan los que tienen ALGO que ofrecer. Un proveedor sin historia produce cuatro guiones
  // en fila: informar eso en cada comprobante es cómo un informe deja de leerse.
  const pendientes = conSug.filter((p) => p.sug.pide_confirmacion
    && [p.sug.unidad, p.sug.obra, p.sug.detalle, p.sug.rubro].some((d) => d?.sugerido))
  if (!pendientes.length) return
  console.log('\n💡 Lo que NO llegó a firme y no se escribió (lo completás vos en Compras; esa corrección re-alimenta el aprendizaje):')
  for (const p of pendientes) {
    const s = p.sug
    console.log(`   ${p.proveedor}: unidad ${dim(s.unidad)} · obra ${dim(s.obra)} · detalle ${dim(s.detalle)} · rubro ${dim(s.rubro)}`)
    if (s.nota) console.log(`      ↳ ${s.nota}`)
  }
  console.log('   (✓ = alta confianza · (?) = necesita tu confirmación)')
}

/** Id, Total y Rubro de caja (2.º) contra el encabezado leído, y las columnas de la aritmética. */
export function indicesDeRevision(encabezado) {
  const i = (p) => ubicarColumna(encabezado, p, 'Compras').indice
  return { id: i('ID'), total: i('Total'), rubro: i({ rotulo: 'Rubro de caja', ocurrencia: 2 }), ver: colVerificacion(encabezado) }
}

/**
 * Cuántas filas hacia arriba se busca la fila modelo. 120 alcanza de sobra —la última fila con la
 * columna O pegada era la 743 sobre 842— y acota la lectura: leer la pestaña entera en grilla para
 * esto sería pagar 840 filas de formato para mirar nueve columnas.
 */
const VENTANA_MODELO = 120

/** La fila de la que se copian las fórmulas. Toca la red; la decisión la toma `filaModeloDeFormulas`. */
async function filaDeFormulas(google, ultima, grupos) {
  const inicio = Math.max(FILA_PRIMERA, ultima - VENTANA_MODELO + 1)
  const g = await google.readSheetGrid(ID, rangoFilas('Compras', inicio, ultima))
  return filaModeloDeFormulas(g?.filas ?? [], { desde: inicio, grupos })
}

/** La primera fila de datos de Compras. Los encabezados viven arriba. Contrato con el Sheet. */
const FILA_PRIMERA = 4

/**
 * Los perfiles de imputación de la fuente más completa que haya. PRIMERO la pestaña viva —trae el
 * detalle de la columna K separado del concepto y también las filas sin obra—, después el espejo
 * `public.costos_obra`. Los dos entran por la MISMA función pura: no hay dos formas de aprender.
 */
async function perfilesDe(indiceCompras) {
  if (indiceCompras?.ok && indiceCompras.historia?.length) {
    // `perfilesDeCompras` = imputación + tipo de pago (18/09/2026), la misma puerta que usa el bot.
    return { ...perfilesDeCompras(indiceCompras.historia), disponible: true, nota: `${indiceCompras.filas} filas de Compras (pestaña viva)` }
  }
  return perfilesDeImputacionDesdeDB({ query }).catch(() => null)
}

async function main() {
  if (!fileArg) { console.error('Falta --file <fajo.json> (array de comprobantes parseados de las fotos)'); process.exit(1) }
  const comprobantes = JSON.parse(readFileSync(fileArg, 'utf8'))
  if (!Array.isArray(comprobantes) || !comprobantes.length) { console.error('El JSON tiene que ser un array de comprobantes no vacío'); process.exit(1) }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === 'Compras')
  // EL CONTRATO SE RESUELVE CONTRA LA FILA DE RÓTULOS VIVA (14/09/2026): con «Obra» insertada en L,
  // todo desde Concepto se corre una letra. Un rótulo que falta aborta acá, antes de escribir nada.
  const encabezado = await lectorDeEncabezados(google, ID).encabezado('Compras')
  const contrato = contratoContra(encabezado)
  const der = derivar(contrato)
  const col = colDelCargador(contrato)
  // UNA SOLA LECTURA DE LA PESTAÑA VIVA alimenta las dos cosas que hacen falta: el índice contra el
  // que se busca el duplicado y la historia con la que `imputacion-aprendida.mjs` sugiere la
  // imputación. Ya se leía para lo segundo; lo primero es lo que faltaba y no cuesta una consulta más.
  // ═══ EL MAPA DE CUIT VIAJA TAMBIÉN ACÁ (05/08) ═══
  //
  // El bot lo usaba y este cargador no, así que el MISMO comprobante resolvía distinto según por
  // dónde entrara: «DUBOS UGARTE PEDRO LUIS RAUL» es DUPEC por CUIT para el chat y un proveedor
  // nuevo para la terminal. Dos respuestas para el mismo paso es lo que este archivo evita en las
  // columnas y no estaba evitando en el proveedor. Una capacidad, una fuente.
  const [listas, porCuit, colE, indiceCompras, conocidos, nombresPorCuit] = await Promise.all([
    listasDeCompras(google, { fileId: ID }),
    proveedoresPorCuit(google, { fileId: ID }),
    google.readSheetValues(ID, rangoColumna('Compras', col.proveedor)),
    indiceDeCompras(google, { fileId: ID }),
    maestroDeProveedores(),
    nombresDelPadronPorCuit(),
  ])
  const lista = listas.proveedores
  const perfiles = await perfilesDe(indiceCompras)
  let ultima = 0
  colE.forEach((r, i) => { if (r[0] != null && r[0] !== '') ultima = i + 1 })

  // EL CATÁLOGO DE OBRAS PARA LA COLUMNA «Obra». Si no se puede leer, la celda queda vacía —como
  // antes del 14/09— y se dice: no poder proponer la obra no es motivo para no cargar el gasto.
  const destinos = await catalogosDeAsignacion(query).then(destinosDeObra).catch((e) => {
    console.log(`ℹ columna Obra: no pude leer el catálogo de obras (${String(e?.message ?? e).slice(0, 120)}) — la celda queda vacía.`)
    return null
  })
  if (!col.obraFila) console.log('ℹ columna Obra: Compras todavía no tiene el rótulo «Obra» — la obra se propone pero no se escribe.')

  const { plan, rechazos, duplicados, percep, fueraDeCompras, nuevos, altas, arca } = await prepararPlan(comprobantes, {
    lista, listas, porCuit, nombresPorCuit, indiceCompras, perfiles, cargarIgual: CARGAR_IGUAL, conocidos, col, destinos,
    arcaDe: (c) => candidatasArca({ query }, c),
  })

  const desde = ultima + 1
  const hasta = ultima + plan.length
  informar({ plan, rechazos, duplicados, percep, fueraDeCompras, nuevos, arca }, { ultima, desde, hasta, indiceCompras, perfiles })
  informarAltas(altas, conocidos)
  if (!plan.length) {
    console.log('\nNada cargable.')
    // `duplicados` viaja: para quien llama no es lo mismo "no se pudo leer" que "ya estaba cargado".
    emitir({ ok: false, motivo: motivoSinPlan({ rechazos, duplicados, fueraDeCompras }), escritas: 0, rechazos, duplicados, fueraDeCompras, nuevos, altas, percep })
    await closePool(); return
  }

  // ═══ DE QUÉ FILA SE COPIAN LAS FÓRMULAS: DE UNA QUE TENGA FÓRMULA (14/08) ═══
  //
  // `PASTE_FORMULA` copia lo que HAY. Como 408 de las 842 filas de Compras tienen la columna O pegada
  // como literal, copiar de `ultima` sin mirar baja el TOTAL DE OTRA FACTURA a las filas nuevas — y no
  // es un `#ERROR`, así que la verificación de abajo nunca lo vería. Ver `filaModeloDeFormulas`.
  // EL PORTÓN, CON EL CONTRATO VIVO: ninguna letra del plan puede ser fórmula ni ARRAYFORMULA.
  const indebidas = der.letrasIndebidas(plan.flatMap((p) => Object.keys(p.valores)))
  if (indebidas.length) {
    console.error(`\n✖ El plan escribiría columnas prohibidas: ${indebidas.map((m) => `${m.letra} (${m.motivo})`).join(' · ')}. NO se escribió nada.`)
    emitir({ ok: false, motivo: 'columna_prohibida', escritas: 0, rechazos, duplicados, fueraDeCompras, nuevos, altas, percep })
    process.exitCode = 1
    await closePool(); return
  }
  const modelo = await filaDeFormulas(google, ultima, der.GRUPOS_FORMULA)
  if (!modelo.fila) {
    console.error(`\n✖ No encontré ninguna fila con las fórmulas completas en las últimas ${VENTANA_MODELO} filas de Compras`
      + `${modelo.faltan.length ? ` (a la ${ultima} le faltan en ${modelo.faltan.join(', ')})` : ''}.`)
    console.error('   No copio fórmulas de una fila pegada a mano: bajaría el total de otro comprobante y quedaría verde.')
    console.error('   Arreglá la fórmula de alguna fila reciente (o pegá la de la fila 4 hacia abajo) y volvé a correr. NO se escribió nada.')
    emitir({ ok: false, motivo: 'sin_fila_modelo', escritas: 0, rechazos, duplicados, fueraDeCompras, nuevos, altas, percep, faltan: modelo.faltan })
    process.exitCode = 1
    await closePool(); return
  }
  if (modelo.fila !== ultima) {
    console.log(`\nℹ Las fórmulas se copian de la fila ${modelo.fila}, no de la ${ultima}: la última tiene valores pegados a mano en ${modelo.faltan.join(', ') || 'alguna columna con fórmula'}.`)
  }

  if (DRY) {
    console.log('\n(--dry) Muestra de la primera fila a escribir:')
    console.log('  ', JSON.stringify(plan[0].valores))
    console.log(`  Fórmulas a estampar por copyPaste desde la fila ${modelo.fila}: ${der.GRUPOS_FORMULA.map((g) => g[0] === g[1] ? g[0] : g.join(':')).join(' ')}`)
    emitir({ ok: true, dry: true, desde, hasta, escritas: 0, filaModelo: modelo.fila, filas: filasDelPlan(plan, desde), rechazos, duplicados, fueraDeCompras, nuevos, altas, percep })
    await closePool(); return
  }

  // ═══ DESDE ACÁ SE TOCA EL SHEET ═══ Todo lo de arriba fue leer; lo que falle de acá en adelante
  // puede haber dejado algo escrito y no se reintenta solo (ver `FASE`).
  fase = FASE.ESCRITURA
  // Grilla: tiene que alcanzar ANTES de escribir, o el batch falla entero.
  if ((hoja.rows ?? 0) < hasta + 5) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: hasta + 20 } }, fields: 'gridProperties.rowCount' } }])
  }

  // 0) EL DESPLEGABLE ANTES DE LA CELDA; LA FICHA DE app.ecsas, DESPUÉS DE QUE LA FILA ENTRE.
  //
  //    El orden no es estético. El desplegable tiene que tener el valor ANTES de que se escriba la
  //    columna E, o la fila entra en rojo y fuera de los cruces de Proveedores, Cash Flow y CAJA —
  //    que es exactamente el defecto que este bloque arregla. Y el alta en Postgres va DESPUÉS de
  //    verificar la fila: si la escritura del Sheet no entra (freno de mano, candado de pestaña),
  //    una ficha de proveedor sin un solo comprobante detrás es basura que después hay que salir a
  //    distinguir de los proveedores de verdad. Un desplegable con un valor de más no es daño; una
  //    ficha huérfana sí. Ver el paso 4.
  //
  // ═══ `nuevos.size` SOBRE UN ARRAY: LA BANDERA MUERTA (14/08) ═══
  //
  // Acá se preguntaba `nuevos.size` sobre el ARRAY que devuelve `prepararPlan` —`undefined`, falsy
  // siempre—, o sea que `--add-proveedores` nunca agregó un solo proveedor y no lo avisaba. La
  // bandera sigue existiendo, pero YA NO GOBIERNA el caso que importa: un proveedor con CUIT no
  // necesita permiso de una bandera para existir, lo pidió el dueño. Lo que la bandera todavía
  // gobierna es lo ÚNICO que no tiene identidad: sumar al desplegable un nombre sin CUIT.
  if (SIN_ALTA && (altas.altas.length || altas.existentes.length)) {
    console.log(`\n⚠ --sin-alta-proveedores: NO se creó ni se vinculó nada, aunque ${altas.altas.length + altas.existentes.length} proveedor(es) tenían CUIT.`)
  }
  const sinIdentidad = debeAgregarProveedores(ADD_PROV, nuevos) ? nuevos : []
  const ampliada = ampliarDesplegable(lista, SIN_ALTA ? sinIdentidad : [...altas.nombres, ...sinIdentidad])
  if (ampliada.agregados.length) {
    await google.spreadsheetBatchUpdate(ID, [requestValidacionProveedores({
      sheetId: hoja.sheetId,
      lista: ampliada.lista,
      filas: Math.max(hoja.rows ?? 0, hasta + 20),
      columna: idx(col.proveedor),
    })])
    console.log(`  + ${ampliada.agregados.length} nombre(s) agregado(s) al desplegable de la columna E: ${ampliada.agregados.join(' · ')}`)
  }
  if (nuevos.length && !sinIdentidad.length) {
    // SIN CUIT NO HAY ALTA, Y HAY QUE DECIRLO. La celda entra fuera del vocabulario estricto y nadie
    // va a ir a mirarla si nadie la nombra. `--add-proveedores` la mete al desplegable igual, pero
    // NO crea la ficha en `app.ecsas`: sin identidad no hay proveedor que crear.
    console.log(`\n⚠ ${nuevos.length} proveedor(es) sin CUIT utilizable: ${nuevos.join(' · ')}.`)
    console.log('   No se dan de alta —sin identidad no hay proveedor— y la celda queda fuera del desplegable estricto.')
  }

  // 1) VALORES de input y de imputación (obra), una columna por vez. NO toca fórmulas, derivadas
  //    (AC/AD/AE/AF/AJ) ni lo que el dueño completa aparte (Unidad de Negocio, Detalle).
  // NO ALCANZA CON MIRAR LO QUE DEVUELVE LA API. La escritura puede no ocurrir sin lanzar una
  // excepción: el freno de mano, el candado de pestaña y la firma devuelven `{protegido:true}` y el
  // script seguía derecho hasta imprimir "✔ Escritas N filas" sobre un Sheet que no se tocó. Por eso
  // `escribirYVerificar` RELEE el destino y compara celda por celda: la evidencia es el dato leído
  // donde tenía que quedar, nunca la pantalla que contestó que sí.
  const escritura = await escribirYVerificar(google, { desde, hasta, plan })
  if (!escritura.ok) {
    console.error(`\n✖ NO se escribió lo que pedí: ${escritura.motivo}`)
    for (const v of escritura.vacias.slice(0, 10)) console.error(`   fila ${v.fila} col ${v.columna}: quedó VACÍA (esperaba "${v.esperado}")`)
    for (const d of escritura.distintas.slice(0, 10)) console.error(`   fila ${d.fila} col ${d.columna}: dice "${d.encontrado}", esperaba "${d.esperado}"`)
    console.error('   No estampo fórmulas sobre filas que no tienen datos. Nada quedó a medias: revisá el candado/firma de "Compras" y volvé a correr.')
    // El bot de Mattermost consume esta línea: sin ella tendría que adivinar el resultado parseando
    // prosa, y un mensaje mejorado le rompería la lectura.
    emitir({
      ok: false,
      motivo: escritura.congelado ? 'congelado' : 'protegido',
      congelado: escritura.congelado === true,
      detalle: String(escritura.motivo ?? '').slice(0, 300),
      escritas: 0,
    })
    process.exitCode = escritura.congelado ? 2 : 1
    await closePool(); return
  }

  // 2) FÓRMULAS por fila: copiar de la fila MODELO a las nuevas (Google reajusta refs). La modelo es
  //    la última que TIENE fórmula en todas estas columnas, no la última con datos: ver arriba.
  const reqs = der.GRUPOS_FORMULA.map(([a, b]) => ({
    copyPaste: {
      source: { sheetId: hoja.sheetId, startRowIndex: modelo.fila - 1, endRowIndex: modelo.fila, startColumnIndex: idx(a), endColumnIndex: idx(b) + 1 },
      destination: { sheetId: hoja.sheetId, startRowIndex: desde - 1, endRowIndex: hasta, startColumnIndex: idx(a), endColumnIndex: idx(b) + 1 },
      pasteType: 'PASTE_FORMULA', pasteOrientation: 'NORMAL',
    },
  }))
  // EL DUEÑO TRABAJA CON UN FILTRO ACTIVO EN COMPRAS (23/07). Con un filtro puesto, copyPaste
  // revienta con "This operation is not supported on a range with a filtered out row" y, peor, el
  // batch es atómico: si tiraba la excepción, el script salía con error dejando las filas a medias.
  // Pero al AGREGAR datos debajo de columnas con fórmula consistente, Google AUTO-EXTIENDE esas
  // fórmulas por-fila solo. Entonces: si el copyPaste falla por el filtro, se verifica que la fórmula
  // clave (O = total) haya bajado sola a todas las filas nuevas. Si bajó, se sigue; si no, se falla
  // fuerte. No se toca el filtro del dueño (Regla 0: su vista es suya).
  try {
    await google.spreadsheetBatchUpdate(ID, reqs)
  } catch (e) {
    if (!/filtered out row/i.test(String(e?.message ?? e))) throw e
    const g = await google.readSheetGrid(ID, `Compras!${col.total}${desde}:${col.total}${hasta}`)
    const todasConFormula = g.filas.length === plan.length && g.filas.every((f) => f[0]?.formula)
    if (!todasConFormula) throw new Error('hay un filtro activo en Compras y la fórmula de Total (O) no se auto-extendió a todas las filas nuevas — quitá el filtro y volvé a correr')
    console.log('ℹ Compras tiene un filtro activo: copyPaste no aplica sobre filas filtradas, pero Google auto-extendió las fórmulas por fila (verificado en la columna O = Total). No se tocó tu filtro.')
  }

  // 3) VERIFICAR LAS FÓRMULAS: releer id (A), total (O) y rubro de caja (AC) de las filas nuevas.
  //    Buscar #ERROR es el chequeo de las FÓRMULAS, y sólo eso: un rango vacío no tiene errores, así que
  //    nunca podría haber detectado que la escritura no entró. Eso ya lo probó escribirYVerificar arriba,
  //    releyendo el dato en su destino — las dos verificaciones son de efectos distintos.
  //
  // ═══ Y LA ARITMÉTICA, QUE ES LO QUE #ERROR NO PUEDE VER (14/08) ═══
  //
  // Un total equivocado no es un `#ERROR`. Si la fórmula de O bajó como literal —o el IVA se leyó de
  // otra línea— la fila queda con un número perfectamente válido y perfectamente falso, y de acá se
  // propaga sola por fórmula a cuatro pestañas del Flujo de Fondos. El bot ya releía y lo controlaba
  // con `aritmetica()` de `verificacion.mjs`; este camino no. Se usa LA MISMA función: una capacidad,
  // una fuente — si algún día cambia la tolerancia, cambia para los dos o no cambia.
  fase = FASE.VERIFICACION
  const check = await google.readSheetGrid(ID, rangoFilas('Compras', desde, hasta))
  const { errores, sinRubro, noCierran } = revisarFilasEscritas(check.filas, { desde, ind: indicesDeRevision(encabezado) })
  console.log(`\n✔ Escritas y VERIFICADAS en el destino ${plan.length} fila(s) (${desde}..${hasta}). ${errores ? `⚠ ${errores} con #ERROR — revisar.` : 'Sin #ERROR.'}`)
  if (noCierran.length) {
    console.error(`\n⚠ ${noCierran.length} fila(s) NO cierran: Importe + IVA ≠ Total. Es lo que #ERROR no puede ver — revisalas ANTES de espejar a Supabase:`)
    for (const n of noCierran) {
      console.error(`   fila ${n.fila}: ${n.importe} + ${n.iva} = ${Math.round((n.importe + n.iva) * 100) / 100}, y el Total dice ${n.total} (${n.dif} de diferencia)`)
    }
  } else {
    console.log('✓ La aritmética cierra en todas: Importe + IVA = Total.')
  }
  if (sinRubro) console.log(`ℹ ${sinRubro} sin Rubro de caja (AC) todavía: se clasifican cuando completes la Unidad de Negocio (I).`)
  // FRESCURA (26/07). Cargar comprobantes a mano ES una ingesta de gastos sobre el Cash Flow: el OS
  // acaba de escribir ese Sheet. Se registra por drive_file_id (la misma fila que mantiene el
  // pipeline) para que la alerta no lo dé por atrasado. No se declara coberturaHasta: un fajo suelto
  // no define hasta qué fecha llega el gasto de la empresa — eso lo fija el sync periódico de ARCA.
  try {
    const fr = await registrarSincronizacion({ query }, { driveFileId: ID })
    console.log(fr.ok ? `✓ frescura: "${fr.nombre}" → ${fr.estado}` : `· frescura no registrada: ${fr.motivo}`)
  } catch (e) {
    console.log(`· frescura no registrada: ${String(e?.message ?? e).slice(0, 120)}`)
  }
  // 4) LA FICHA EN app.ecsas, CON LA FILA YA VERIFICADA EN SU DESTINO. El proveedor nace porque un
  //    gasto suyo entró de verdad, no porque un plan dijera que iba a entrar.
  const aplicadas = DRY || SIN_ALTA ? null : await aplicarAltas(altas, { query, comprobante: `Compras!${desde}..${hasta}` })
  if (aplicadas) informarAplicadas(aplicadas)
  // 5) EL CUIT QUE ARCA CONFIRMÓ COMPLETA EL MAESTRO SI FALTABA (18/09/2026). Sin CUIT en el
  //    maestro, la columna «CUIT (OS)» de Compras queda vacía para siempre — pasó con Neumagom el
  //    17/09 teniendo el CUIT confirmado en la mano. Nunca lanza: un fallo acá no deshace la carga.
  const cuitsCompletados = DRY || SIN_ALTA ? [] : await completarCuitsDelMaestro(query, cuitsParaCompletar(plan, conocidos))
    .catch((e) => { console.log(`· CUIT del maestro no completado: ${String(e?.message ?? e).slice(0, 120)}`); return [] })
  for (const c of cuitsCompletados) console.log(`  ✔ CUIT ${c.cuit} completado en el maestro para «${c.nombre}» (lo confirma ARCA). «CUIT (OS)» lo muestra cuando se regenere _PROVEEDORES_OS.`)

  emitir({
    ok: true, desde, hasta, escritas: plan.length, errores, sinRubro, cuitsCompletados,
    filas: filasDelPlan(plan, desde), fueraDeCompras,
    // `percep` VIAJA EN EL JSON (14/08). La percepción absorbida se imprimía sólo por stdout y el bot
    // parsea únicamente esta línea: en la fila 844 se metieron $53.356,45 de percepción de IIBB
    // adentro del costo sin que el dueño se enterara. Es correcto por el contrato de la columna M
    // (Total − IVA), pero es CRÉDITO FISCAL contabilizado como costo y hay que decirlo.
    // `noCierran` viaja por la misma razón: el control nuevo no sirve si su resultado se queda acá.
    rechazos, nuevos, altas, altasAplicadas: aplicadas, duplicados, arca, percep, filaModelo: modelo.fila,
    noCierran: noCierran.map((n) => ({ fila: n.fila, dif: n.dif, total: n.total })),
  })
  console.log('\nSIGUIENTE: node orquestador/scripts/sync-compras.mjs  (espeja a Supabase, regla #6).')
  await closePool()
}

// Sólo corre si se lo invoca como comando: importarlo desde un test NO dispara main() —que toca Google,
// la base y el Sheet real—, así el test puede ejercitar la escritura verificada con un cliente falso.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    console.error(e)
    // LA MUERTE POR EXCEPCIÓN TAMBIÉN SE INFORMA POR EL CONTRATO JSON (15/09/2026). Sin esta línea el
    // bot sólo veía stderr y no podía distinguir «Google no contestó antes de leer» de «se cortó a
    // mitad de la escritura»: trataba las dos igual y mandaba al dueño a revisar Compras por nada.
    emitir(resultadoDeExcepcion(e))
    process.exitCode = 1
    await closePool().catch(() => {})
  })
}
