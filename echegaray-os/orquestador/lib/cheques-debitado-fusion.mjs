// EL DEBITADO DEL REGISTRO TIENE DOS FUENTES. FUSIONARLAS SIN QUE SE PISEN. NÚCLEO PURO.
//
// ═══ POR QUÉ EXISTE (14/08) ═══
//
// El sync del registro de "Cheques Emitidos" sólo miraba `public.cheques`, y ahí adentro viven los
// eCHEQ: los que el banco lista en su pantalla de echeq emitidos. Los cheques FÍSICOS —los de papel,
// que el banco nunca lista— no tienen fuente: se marcan a mano. Resultado medido hoy contra el
// archivo: FISICO 316 ($500.000, debitado el 13/08), 318 ($750.000, el 11/08) y 325 ($340.000, el
// 10/08) figuraban vivos. $1.590.000 contados como comprometidos que ya habían salido de la cuenta.
//
// El banco SÍ los informa, sólo que en otro documento: el extracto. Cada uno aparece como una salida
// con su número en la referencia. Esa es la segunda fuente, y `cheques-debito-banco.mjs` ya sabe
// leerla —lo que faltaba no era el diagnóstico (existe desde el 03/08 y sólo imprime), sino que
// alguien lo aplicara a la columna DEBITADO.
//
// ═══ CUÁL DE LAS DOS FUENTES GANA, Y POR QUÉ NO ES ARBITRARIO ═══
//
// Las dos hablan del mismo hecho: ¿esta plata ya salió de la cuenta? `public.cheques` lo dice por el
// ESTADO que el banco declaró en su pantalla el día del corte de esa foto; el extracto lo dice porque
// el movimiento está. Cuando se contradicen, gana el extracto: un débito asentado es plata que ya no
// está, y un "Aceptado" que lo contradice sólo significa que la foto de `public.cheques` es vieja.
//
// Ese conflicto NO se resuelve en silencio: se declara, porque su causa es siempre la misma —la
// puerta de entrada (`importar-cheques.mjs`) no se corrió— y taparlo deja el problema para la próxima.
//
// ═══ LO QUE ESTE NÚCLEO NO HACE ═══
//
// No inventa filas. Un débito de cheque del extracto que ningún cheque del registro explica NO se
// convierte en una fila nueva: el registro es del dueño y una fila fabricada por el OS es peor que un
// hueco visible. Se declara como hallazgo, con su monto y su fecha, para que se pueda consultar.

import { debitadoDe, instrumentoDe, clave } from './cheques-emitidos-sync.mjs'

const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

/**
 * Lo que `public.cheques` AFIRMA sobre cada cheque, indexado por (instrumento, número).
 *
 * Hace falta el mapa entero y no alcanza con las diferencias que `planSync` ya detectó: cuando la base
 * dice "No" y la pestaña también dice "No", `planSync` no produce ninguna corrección —y sin embargo el
 * banco puede tener el débito asentado—. Ese caso, que es justo el que importa, sólo se ve mirando lo
 * que la base afirma, no lo que la base quiere cambiar.
 *
 * @param {Array<{numero:unknown, estado:unknown, origen?:unknown, cuenta?:unknown}>} base
 * @returns {Map<string, 'SI'|'No'>}
 */
export function loQueAfirmaLaBase(base = []) {
  const m = new Map()
  for (const c of base) {
    const marca = debitadoDe(c?.estado)
    const inst = instrumentoDe(c)
    if (!marca || !inst) continue
    m.set(clave(inst, c.numero), marca)
  }
  return m
}

/** Los dos estados en los que el extracto AFIRMA que ese cheque salió. El segundo llegó el 17/08. */
const EMPAREJADOS = ['emparejado', 'emparejado_por_importe']

/**
 * Las marcas de DEBITADO que se deducen del extracto: sólo los emparejados que la pestaña todavía da
 * por vivos. Un emparejado ya marcado "SI" no produce nada — el sync es idempotente por construcción.
 *
 * ENTRA TAMBIÉN EL RESCATE POR IMPORTE (17/08). La fila 102 del registro dice "FISICO 316" y el banco
 * dice 317: el número no cierra, pero los $510.000 salieron el 13/08 y quedaba con DEBITADO = "No".
 * Marcar eso es completar un dato que el banco prueba. Lo que NO se toca es el número: esta función
 * sólo sabe producir marcas para la columna DEBITADO, y el `numero` que devuelve es el de LA FILA —no
 * el del banco—, justamente para que nadie confunda esta marca con una corrección de identidad.
 *
 * @param {Array<object>} conciliacion resultados de `conciliarDebitosDeCheques`
 * @returns {Array<{fila:number, a:'SI', de:string, instrumento:string, numero:string, monto:number, evidencia:string, fuentes:string[]}>}
 */
export function marcasDelBanco(conciliacion = []) {
  return conciliacion
    .filter((r) => EMPAREJADOS.includes(r?.estado) && r.cheque && !r.cheque.debitado)
    .map((r) => {
      const [instrumento, numero] = String(r.clave).split('|')
      const base = `el banco lo debitó el ${r.mov?.fecha ?? 's/f'} ("${String(r.mov?.concepto ?? '').trim()}")`
      return {
        fila: r.cheque.fila,
        a: 'SI',
        de: 'No',
        instrumento,
        numero,
        monto: Number(r.cheque.importe) || 0,
        // Las DOS lecturas en la evidencia: marcar el DEBITADO sin nombrar el número que no cierra
        // taparía el defecto de fondo justo en el renglón donde se lo puede ver.
        evidencia: r.discrepancia
          ? `${base} — el banco lo llama N° ${r.discrepancia.referenciaDelBanco} y esta fila dice `
            + `${r.discrepancia.numeroDeLaFila}; empareja por importe exacto`
          : base,
        fuentes: ['banco'],
      }
    })
}

/**
 * LOS NÚMEROS QUE EL BANCO DESMIENTE — para que los decida el dueño, no el OS.
 *
 * Marcar un DEBITADO es completar un dato que el banco prueba. Cambiar el NÚMERO de un cheque es otra
 * cosa: reescribe la identidad de la fila y puede fusionar dos cheques distintos —en el registro real
 * ya hay DOS filas "FISICO 316"—. Así que la contradicción se publica con sus dos lecturas y se para
 * ahí. Que este listado exista es lo que permite marcar el DEBITADO sin tapar el número equivocado.
 *
 * @param {Array<object>} conciliacion
 * @returns {Array<{fila:number, referenciaDelBanco:string, numeroDeLaFila:string, importe:number,
 *                  fecha:string, beneficiario:string, evidencia:string}>}
 */
export function numerosQueElBancoDesmiente(conciliacion = []) {
  return conciliacion
    .filter((r) => r?.estado === 'emparejado_por_importe' && r.discrepancia && r.cheque)
    .map((r) => ({
      fila: r.cheque.fila,
      referenciaDelBanco: r.discrepancia.referenciaDelBanco,
      numeroDeLaFila: r.discrepancia.numeroDeLaFila,
      importe: Number(r.cheque.importe) || 0,
      fecha: String(r.mov?.fecha ?? ''),
      beneficiario: String(r.cheque.beneficiario ?? '').trim(),
      evidencia: `El extracto tiene el ${r.mov?.fecha ?? 's/f'}: "${String(r.mov?.concepto ?? '').trim()}" por `
        + `${$(Math.abs(Number(r.mov?.importe) || 0))} con la referencia ${r.discrepancia.referenciaDelBanco}. `
        + `La fila ${r.cheque.fila} tiene ese importe exacto y lleva el número ${r.discrepancia.numeroDeLaFila}.`,
    }))
}

/**
 * LAS DOS FUENTES EN UN SOLO PLAN, UNA CORRECCIÓN POR FILA.
 *
 * Dos propuestas sobre la misma fila no se escriben dos veces (la segunda pisaría a la primera sin que
 * nadie lo vea): se resuelven acá, y si difieren gana el extracto y queda declarado el conflicto.
 *
 * @param {{base?:Array, planBase?:{updates?:Array}, conciliacion?:Array}} args
 * @returns {{updates:Array, conflictos:Array<{clave:string, fila:number, dice:string, evidencia:string}>}}
 */
export function fusionarDebitado({ base = [], planBase = {}, conciliacion = [] } = {}) {
  const afirma = loQueAfirmaLaBase(base)
  const banco = marcasDelBanco(conciliacion)

  const porFila = new Map()
  for (const u of planBase.updates ?? []) porFila.set(u.fila, { ...u, fuentes: ['base'] })

  const conflictos = []
  for (const p of banco) {
    const k = clave(p.instrumento, p.numero)
    // LA CONTRADICCIÓN QUE IMPORTA: la base sostiene que el cheque sigue vivo y el extracto ya lo pagó.
    if (afirma.get(k) === 'No') {
      conflictos.push({ clave: k, fila: p.fila, dice: 'public.cheques lo da por NO debitado', evidencia: p.evidencia })
    }
    const prev = porFila.get(p.fila)
    if (!prev) { porFila.set(p.fila, p); continue }
    // El extracto manda: la plata ya salió. `prev.a` sólo se conserva cuando coincide.
    porFila.set(p.fila, { ...p, de: prev.de ?? p.de, fuentes: [...new Set([...prev.fuentes, 'banco'])] })
  }

  return { updates: [...porFila.values()].sort((a, b) => a.fila - b.fila), conflictos }
}

/**
 * PLATA QUE SALIÓ DE LA CUENTA SIN UNA FILA QUE LA RESPALDE.
 *
 * Medido hoy: el FISICO 317, $510.000, debitado el 13/08. El registro tiene 106 cheques y ninguno
 * lleva ese número. No se inventa la fila —el registro es del dueño— pero tampoco se ignora: un débito
 * de cheque sin respaldo es o un cheque que nunca se cargó, o un número mal transcripto, o una salida
 * que hay que explicar. Las tres se revisan a mano, y ninguna se puede revisar si nadie la nombra.
 *
 * Los `sin_referencia` NO entran: ahí el banco no mandó número y no hay nada que buscar en el registro
 * (emparejar por importe suelto ya se pagó caro). Se informan aparte, como lo que son: un límite del
 * documento, no un hallazgo sobre el registro.
 *
 * @param {Array<object>} conciliacion
 * @returns {Array<{fecha:string, numero:string|null, importe:number, concepto:string, motivo:string}>}
 */
export function huerfanosDeDebito(conciliacion = []) {
  return conciliacion
    .filter((r) => r?.estado === 'sin_cheque')
    .map((r) => ({
      fecha: String(r.mov?.fecha ?? ''),
      numero: String(r.mov?.referencia ?? '').replace(/\D/g, '').replace(/^0+/, '') || null,
      importe: Math.abs(Number(r.mov?.importe) || 0),
      concepto: String(r.mov?.concepto ?? '').trim(),
      motivo: String(r.motivo ?? ''),
    }))
}

/**
 * El título del hallazgo. Es también su clave de idempotencia, así que lleva los tres datos que lo
 * identifican —número, importe y fecha— y ninguno más: un título que cambia de una corrida a otra
 * duplica el ítem cada vez que alguien mira.
 * @param {{numero:string|null, importe:number, fecha:string}} h
 */
export function tituloHuerfano(h) {
  return `Débito de cheque N° ${h?.numero ?? 's/n'} por ${$(h?.importe)} del ${h?.fecha ?? 's/f'} sin fila en "Cheques Emitidos"`
}

/** @param {{concepto:string, motivo:string, importe:number, fecha:string}} h */
export function evidenciaHuerfano(h) {
  return `El extracto (public.banco_movimientos) tiene el ${h?.fecha}: "${h?.concepto}" por ${$(h?.importe)}. `
    + `${h?.motivo}. Es plata que salió de la cuenta y que el registro de cheques emitidos no explica: `
    + 'o el cheque nunca se cargó, o su número o su importe están mal transcriptos en la pestaña.'
}

// ── LO QUE HACE CONSULTABLE AL HALLAZGO ──────────────────────────────────────────────────────────
//
// Va a `public.backlog_autonomo`, que es donde este OS ya deja lo que detecta solo y de donde lo
// levantan la vigilancia autónoma y el Director. No se creó una tabla nueva a propósito: un hallazgo
// en su propia tabla es un hallazgo que sólo mira quien ya sabía que existe.
//
// Idempotente por TÍTULO + estado abierto, igual que `comprobantes/vigilancia.mjs`. Si Postgres no
// contesta NO se rompe el sync: devuelve `anotados:null` y quien informa dice que no se pudo anotar —
// la marca del DEBITADO es un hecho del banco y no puede quedar esperando a que la tabla exista.

/**
 * @param {{query:Function}} port
 * @param {Array} lista lo que devolvió `huerfanosDeDebito`
 * @returns {Promise<{anotados:number|null, yaEstaban:number, motivo?:string}>}
 */
export async function anotarHuerfanos(port, lista = []) {
  if (typeof port?.query !== 'function') return { anotados: null, yaEstaban: 0, motivo: 'sin acceso a la base' }
  let anotados = 0
  let yaEstaban = 0
  try {
    for (const h of lista) {
      const titulo = tituloHuerfano(h)
      const { rows } = await port.query(
        `select id from public.backlog_autonomo
          where origen_tabla = 'public.banco_movimientos' and titulo = $1
            and estado in ('abierto','en_curso') limit 1`, [titulo])
      if (rows.length) { yaEstaban++; continue }
      await port.query(
        `insert into public.backlog_autonomo
           (tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
            recomendacion, nivel_autonomia_permitido, estado, origen_tabla, area)
         values ('anomalia', $1, $2, $3, 'confirmado', 'alta', 'alta', 'bajo', $4, 'C', 'abierto',
                 'public.banco_movimientos', 'administracion_finanzas')`,
        [
          titulo,
          evidenciaHuerfano(h),
          'cheques-emitidos-sync-banco (extracto del Santander vs. registro de "Cheques Emitidos")',
          `Buscar el cheque N° ${h?.numero ?? 's/n'} en la chequera física y cargarlo en "Cheques Emitidos" `
            + 'con su beneficiario, importe y N° de comprobante. Si el número no existe, revisar la '
            + 'transcripción del extracto: el débito está asentado igual.',
        ])
      anotados++
    }
    return { anotados, yaEstaban }
  } catch (e) {
    return { anotados: null, yaEstaban, motivo: String(e?.message ?? e) }
  }
}
