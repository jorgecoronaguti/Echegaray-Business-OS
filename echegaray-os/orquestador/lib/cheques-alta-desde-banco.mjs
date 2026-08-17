// UN CHEQUE QUE EL BANCO YA DEBITÓ TIENE QUE EXISTIR EN EL REGISTRO. NÚCLEO PURO.
//
// ═══ POR QUÉ EXISTE (17/08) — LA FRASE DEL DUEÑO QUE DIO VUELTA LA REGLA ═══
//
// Hasta hoy el OS detectaba el hueco y se negaba a llenarlo: *"no agregué la fila — el registro es
// tuyo y una fila fabricada es peor que un hueco visible"*. El dueño contestó: **"no, el registro es
// tuyo, así q si detectas eso lo tenés q agregar"**. O sea que "Cheques Emitidos" es responsabilidad
// del OS, y transcribir un débito que el banco ya asentó no es fabricar un dato: es copiar un hecho.
// El hueco visible que el OS defendía era peor que la fila, porque nadie mira un hueco.
//
// El caso medido: 2026-08-13, "Cheque debitado", $510.000, referencia 317. Ninguna de las 104 filas
// del registro lleva ese número. Plata que salió de la cuenta y que el registro no explicaba.
//
// ═══ AGREGAR NO ES PISAR, Y ESA DISTINCIÓN NO SE PUEDE PERDER ═══
//
// Lo que el dueño autorizó es el ALTA. Nada de esto habilita a MODIFICAR ni a BORRAR lo que él
// escribió: seis pérdidas de trabajo pagadas por eso. Por construcción, este núcleo devuelve FILAS,
// nunca posiciones — no existe forma de que su resultado apunte a una fila existente, y el llamador
// sólo puede pegarlas al final del registro. El test `el alta no toca ninguna fila del dueño` es el
// que sostiene esa promesa.
//
// ═══ QUÉ SE TRANSCRIBE Y QUÉ QUEDA VACÍO ═══
//
// El extracto trae tres cosas y sólo tres: NÚMERO, FECHA del débito e IMPORTE. Esas van a la fila,
// más el DEBITADO en "SI" —que es el hecho mismo—. Beneficiario, obra, fecha de emisión, CUIT y
// comprobante NO los informa el banco: quedan VACÍOS. Una fila con el proveedor adivinado sí sería
// fabricar un dato, y sería peor que el hueco que esto viene a cerrar.
//
// El instrumento es el caso fino: el banco lo declara sólo cuando escribe "Echeq…". En "Cheque
// debitado" NO lo dice, y el número solo no identifica un cheque (conviven FISICO 313 y ECHEQ 313).
// Así que ahí la columna Tipo queda vacía y la fila lo pide. Deducir "FISICO" de que el concepto no
// diga "echeq" sería exactamente la inferencia que `cheques-debito-banco.mjs` se prohíbe.
//
// ═══ CUÁNDO NO SE DA DE ALTA ═══
//
//   · Sin referencia: el banco no mandó número (4 débitos del extracto real). No se puede atribuir a
//     nadie y emparejar por importe suelto ya se pagó caro. Se informa, no se agrega.
//   · Número YA presente en el registro, con cualquier importe: o el importe está mal transcripto, o
//     el número. Agregar ahí crea DOS cheques donde hay uno — que es el daño que este OS no puede
//     causar. Se informa para revisar a mano.
//
// Ese segundo caso es también LA IDEMPOTENCIA: la fila que esta corrida agrega lleva el número, así
// que la corrida siguiente la encuentra y no agrega nada. No depende del Tipo —que puede quedar
// vacío— ni de que el cruce contra el extracto llegue a emparejarla.

import { COL, norm, aFechaAR } from './cheques-emitidos-sync.mjs'
import { familiaDebitoCheque } from './cheques-debito-banco.mjs'
import { ALERTA } from './glifos.mjs'

const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

/** Cómo se nombra en la fila cada dato que el banco no trae. El orden es el de las columnas. */
const ROTULO = Object.freeze({
  tipo: 'tipo de cheque (FISICO o ECHEQ)',
  emision: 'fecha de emisión',
  cuit: 'CUIT',
  proveedor: 'beneficiario',
  tipoComp: 'tipo de comprobante',
  nroComp: 'N° de comprobante',
  unidad: 'unidad de negocio',
})

/** "a, b y c" — la enumeración se arma sola desde las celdas vacías, así que no puede mentir. */
const enumerar = (xs) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)

/**
 * QUÉ DÉBITOS HUÉRFANOS SE CONVIERTEN EN FILA Y CUÁLES NO.
 *
 * @param {{huerfanos?:Array<{numero:string|null, importe:number, fecha:string, concepto:string, motivo:string}>,
 *          registro?:Array<{numero?:unknown}>}} args
 *   `registro` es el registro CRUDO de la pestaña —todas las filas con número, tengan o no Tipo—.
 *   Tiene que ser el crudo y no el que entra a la conciliación: una fila sin Tipo queda fuera del
 *   cruce contra el extracto, y si la guarda mirara sólo ahí volvería a agregarla en cada corrida.
 * @returns {{altas:Array, yaTienenFila:Array}} `altas` conserva los campos del huérfano (así se
 *   sigue pudiendo anotar como hallazgo) y suma `instrumento` y `recomendacion`.
 */
export function planAltasDesdeBanco({ huerfanos = [], registro = [] } = {}) {
  const yaEstan = new Set(registro.map((r) => norm(r?.numero)).filter(Boolean))
  const altas = []
  const yaTienenFila = []
  for (const h of huerfanos) {
    const numero = norm(h?.numero)
    if (!numero) continue
    if (yaEstan.has(numero)) { yaTienenFila.push(h); continue }
    const alta = {
      ...h,
      numero,
      importe: Math.abs(Number(h?.importe) || 0),
      instrumento: familiaDebitoCheque(h?.concepto)?.instrumentoDeclarado ?? '',
    }
    altas.push({ ...alta, recomendacion: recomendacionDeAlta(alta) })
    // Dos débitos con el mismo número en la misma corrida: uno solo se convierte en fila. El segundo
    // se informa, porque con el número repetido no se puede afirmar que sean dos cheques distintos.
    yaEstan.add(numero)
  }
  return { altas, yaTienenFila }
}

/**
 * LA FILA QUE SE PEGA AL FINAL DEL REGISTRO. Ancho A–L, igual que `filaRegistro`.
 *
 * La columna M ("Estado en el OS") queda AFUERA a propósito: la escribe `cheques-cobertura-sheet.mjs`
 * fila por fila, y dos generadores sobre la misma columna es el defecto que ya dejó filas salteadas.
 *
 * @param {{numero:unknown, importe:number, fecha:string, instrumento?:string}} alta
 * @returns {Array<string|number>}
 */
export function filaAltaDesdeBanco(alta) {
  const f = Array(12).fill('')
  f[COL.tipo] = alta?.instrumento ?? ''
  f[COL.numero] = norm(alta?.numero)
  f[COL.monto] = Math.abs(Number(alta?.importe) || 0)
  // El día en que el banco se llevó la plata ES la fecha de pago de ese cheque. No es una estimación.
  f[COL.pago] = aFechaAR(alta?.fecha)
  f[COL.debitado] = 'SI'
  f[COL.proveedor] = textoACompletar(f, alta)
  return f
}

/**
 * EL TEXTO QUE HACE QUE LA FILA NO SE PUEDA CONFUNDIR CON UNA CARGA DEL DUEÑO.
 *
 * Va en la columna del beneficiario porque es la primera que se mira cuando algo no cierra, y porque
 * el beneficiario es justo lo que falta. Se arma leyendo las celdas VACÍAS de la fila recién armada:
 * si mañana el banco empezara a informar un dato más, el texto deja de pedirlo solo.
 *
 * @param {Array} fila la fila a medio armar (sin la columna del proveedor)
 * @param {{numero:unknown, importe:number, fecha:string}} alta
 */
export function textoACompletar(fila, alta) {
  const falta = Object.entries(ROTULO)
    .filter(([k]) => k === 'proveedor' || !String(fila?.[COL[k]] ?? '').trim())
    .map(([, r]) => r)
  return `${ALERTA} COMPLETAR — alta del OS desde el extracto del banco: el ${aFechaAR(alta?.fecha)} debitó `
    + `${$(Math.abs(Number(alta?.importe) || 0))} con la referencia ${norm(alta?.numero)} y ninguna fila del `
    + `registro lo explicaba. Falta ${enumerar(falta)}.`
}

/**
 * Qué le queda por hacer al dueño, para el hallazgo que se anota en `backlog_autonomo`.
 * Reemplaza al texto genérico ("buscá el cheque y cargalo"), que después del alta pediría algo que
 * el OS ya hizo — una instrucción vieja en un tablero es la forma más rápida de que nadie lo mire.
 */
export function recomendacionDeAlta(alta) {
  return `El OS ya agregó la fila al final de "Cheques Emitidos" con lo que informa el extracto: `
    + `N° ${norm(alta?.numero)}, ${$(Math.abs(Number(alta?.importe) || 0))}, pagado el ${aFechaAR(alta?.fecha)} `
    + 'y DEBITADO = SI. Buscá el cheque en la chequera y completá el resto de la fila; el texto de la '
    + 'columna Proveedor dice exactamente qué falta. Si ese número no existe en la chequera, revisá la '
    + 'transcripción del extracto: el débito está asentado igual.'
}
