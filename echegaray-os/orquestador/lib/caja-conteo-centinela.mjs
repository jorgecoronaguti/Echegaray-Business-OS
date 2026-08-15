// EL CENTINELA DEL CONTEO: EL OS MIRA LA CELDA, Y EL INSTANTE EN QUE LA VE CAMBIAR ES EL ANCLA.
//
// ═══ EL PEDIDO (15/08/2026) ═══
//
// El dueño: *"la carga del saldo de caja en pesos (no en banco) es manual, pero el sheet tiene q poder
// contemplar el momento (timestamp) en el q se hizo la carga por un tema de conteo y desde ahi hacer
// los descargos correspondientes de compras o incluso la carga de cobranzas. tiene q ser automatico el
// funcionamiento"*. Y después: *"usa el registro interno del sheet para detectar exactamente cuando se
// puso de manera manual ese monto"* · *"te borre la fecha de los saldos en caja para q no te guies en
// eso sino en lo q marca los timestamps del codigo"*.
//
// ═══ NO HAY REGISTRO INTERNO QUE SIRVA. LO MEDÍ ═══
//
// `listarRevisiones` sobre el Cash Flow devuelve DOS revisiones, las dos de la cuenta de servicio, la
// más vieja del mismo día — y los ids saltan de 32559 a 32773 en tres horas y media: 214 revisiones que
// existieron y la API no publica. Drive poda el historial de los archivos nativos de Google. El detalle
// medido está en caja-ancla-por-instante.mjs.
//
// El único instante que el OS puede AFIRMAR es el de su propia lectura. Este archivo lo convierte en un
// mecanismo: cada corrida mira la celda y anota qué valor vio. Cuando el valor cambia, el conteo se
// anotó entre la corrida anterior —que todavía lo vio viejo— y ésta.
//
// ═══ QUÉ RESOLUCIÓN TIENE, DICHO ACÁ Y NO EN UN INFORME QUE NADIE VA A ABRIR ═══
//
//   · LA RESOLUCIÓN ES EL PERÍODO DEL TIMER: 2 HORAS. El centinela no sabe el minuto en que el dueño
//     tipeó el conteo; sabe que fue entre dos miradas. Por eso se publica como INTERVALO y jamás como
//     instante exacto: un instante inventado sobre una ventana de dos horas es precisión falsa.
//   · RECONTAR Y QUE DÉ EL MISMO MONTO ES INDETECTABLE. El disparador es que cambie el número; si el
//     dueño vuelve a contar y le da lo mismo, no hay nada que ver. El cálculo sigue siendo correcto (el
//     saldo es el mismo), pero la ANTIGÜEDAD que publica la pestaña es la del conteo anterior. No se
//     simula lo contrario. Ver `NO_DETECTA`, que es la lista entera y la cita el test.
//
// ═══ POR QUÉ FALLA CERRADO, Y POR QUÉ ESO NO ES UN DETALLE ═══
//
// El ancla gobierna `CAJA!C7` → `CAJA_TOTAL_DISPONIBLE`, y ese rango lo leen Cash Flow Semanal (A5 y
// B8), Cash Flow Mensual (B8) y el KPI DISPONIBLE de Cheques Emitidos: 21 semanas y 5 meses de forecast
// cuelgan del saldo inicial. Un ancla equivocada no arruina una celda, arruina el año.
//
// Por eso, sin instante registrado NO SE INVENTA UNO. Ni `now()` —que absorbería dentro del conteo todo
// lo que se movió desde que se contó de verdad— ni un 0 —que abre la ventana desde el principio de los
// tiempos y mete el histórico ENTERO como movimiento posterior—. Sin ancla, la pestaña no estampa nada,
// el neto se degrada a 0 por su propia guarda (`IF(NOT(ISNUMBER(ancla));0;…)`) y publica EL CONTEO TAL
// CUAL, que es la verdad más nueva que existe. El estado lo dice con todas las letras.
//
// ═══ CÓMO ESTABA ANTES, Y POR QUÉ ANDABA POR CASUALIDAD ═══
//
// El ancla vivía SÓLO en `_CAJA_ANEXO`, columna F de la fila del sello, y se estampaba nada más cuando
// el sello se renovaba. Tres agujeros, y los tres de los que no gritan:
//
//   1. SI ESA CELDA SE PIERDE, EL ANCLA NO VUELVE. El rescate por rótulo del sello estuvo roto desde
//      que existe (comparaba un rótulo recortado contra una constante con seis espacios de sangría) y
//      nadie se enteró en semanas. Sin ancla el automático queda apagado, en silencio.
//   2. EL INTERVALO DECLARADO ERA FALSO. `ventanaDelSello` recibía como "corrida anterior" la F del
//      sello, que es cuándo se selló EL CONTEO ANTERIOR —días o semanas atrás, no la corrida previa—, y
//      el texto imprime sólo HH:mm: una ventana de una semana se lee como una de dos horas.
//   3. EL CONTEO EN DÓLARES NO LO MIRABA NADIE.
//
// El 14/08 el momento del conteo se pudo reconstruir por un accidente: el aviso "efectivo imposible"
// aparecía a las 15:01 y a las 15:09 y a las 17:00 ya no. Ese aviso sólo salta con el cajón en negativo.
// Un conteo que no cruce el cero no dejaba ninguna huella, y ése es el agujero que se cierra.

import { query } from './db.mjs'
import { fechaDeSerial, instanteDelSello } from './caja-ancla-por-instante.mjs'

/** El conteo de pesos y el de dólares, con el nombre con el que viajan a la base. */
export const CONCEPTO = Object.freeze({
  arqueoArs: 'CAJA_ARQUEO_ARS',
  arqueoUsd: 'CAJA_ARQUEO_USD',
})

/**
 * LA RESOLUCIÓN REAL DEL MECANISMO, como dato y no como prosa: el período del timer que corre el
 * pipeline. Se cita en el texto que ve el dueño para que nadie lea el ancla como el minuto exacto en
 * que se contaron los billetes.
 */
export const RESOLUCION_HORAS = 2

/**
 * LO QUE ESTE MECANISMO NO DETECTA. Va como constante y no como comentario suelto porque el test lo
 * cita: el día que alguien crea haber cubierto uno de estos casos, tiene que venir acá a borrarlo.
 */
export const NO_DETECTA = Object.freeze([
  'recontar y que dé EL MISMO monto: el valor no cambia, así que no hay nada que ver. El cálculo sigue '
  + 'siendo válido (mismo saldo) pero la antigüedad publicada es la del conteo anterior.',
  `dos cambios dentro de la misma ventana de ${RESOLUCION_HORAS} h: se ve el último y el intermedio no `
  + 'existió para nadie.',
  'el minuto exacto del conteo: se conoce el intervalo entre dos corridas, nunca el instante.',
  'un conteo hecho mientras el pipeline está detenido: el intervalo se ensancha hasta la corrida que '
  + 'vuelva a mirar, y el texto lo dice en vez de fingir una ventana de dos horas.',
])

/** A centavos, que es como se comparan los importes acá: el flotante que devuelve la API miente. */
const cent = (x) => Math.round((Number(x) || 0) * 100)

/** ¿Es el mismo valor tipeado? Sólo por el número, redondeado a centavos. */
export const mismoValor = (a, b) => cent(a) === cent(b)

/**
 * NÚCLEO PURO: qué fila corresponde persistir después de mirar la celda. Sin base en el medio.
 *
 * `adopcion` sólo se usa cuando NO hay observación previa, y es el porqué entero de que exista: al
 * enchufar el centinela sobre una pestaña que YA tenía su ancla estampada, tomar `ahora` como primera
 * vista movería el ancla hacia adelante y se tragaría adentro del conteo todo lo que se movió entre el
 * conteo real y la puesta en marcha. Se adopta el instante que ya estaba, que es evidencia más vieja y
 * por lo tanto mejor. Nunca hacia el futuro: un `adopcion` posterior a `ahora` se descarta.
 *
 * @param {{valor:number, vistoDesde:Date, vistoHasta:Date, corridas:number}|null} previa
 * @param {{valor:number, ahora?:Date, adopcion?:Date|null}} lectura
 * @returns {{accion:'primera'|'sigue'|'cambio', fila:object}}
 */
export function observacionSiguiente(previa, { valor, ahora = new Date(), adopcion = null } = {}) {
  const v = Number(valor)
  // FALLA CERRADO. `Number('')` es 0 y 0 es finito: sin esta guarda, una celda VACÍA se observaría como
  // un conteo de cero y el ancla saltaría a esta corrida con un saldo inventado. Y un cajón contado en
  // exactamente $0 no se puede distinguir de una celda vacía por esta vía, así que se trata igual —
  // que es el mismo criterio que ya usa `necesitaSello` (un arqueo en 0 no dispara sello). Un criterio,
  // no dos. Con el conteo ilegible el ancla queda como estaba y la pestaña sigue publicando lo suyo.
  if (valor === '' || valor === null || valor === undefined || !Number.isFinite(v) || v === 0) {
    throw new Error('el centinela necesita un valor numérico distinto de cero: una celda vacía o ilegible no es una observación')
  }
  if (!previa) {
    const heredado = adopcion instanceof Date && Number.isFinite(adopcion.getTime()) && adopcion <= ahora ? adopcion : null
    return {
      accion: 'primera',
      fila: { valor: v, vistoDesde: heredado ?? ahora, vistoHasta: ahora, corridas: 1, valorPrevio: null, previoVistoEn: null },
    }
  }
  if (mismoValor(previa.valor, v)) {
    // EL ANCLA NO SE MUEVE. Es la mitad del mecanismo: mientras el número tipeado sea el mismo, el
    // conteo es el mismo y su instante es el de la primera vez que se lo vio. Un ancla que avanza con
    // cada corrida es el sello rodante que el 14/08 hizo desaparecer un pago de $3.000.000.
    return { accion: 'sigue', fila: { ...previa, valor: v, vistoHasta: ahora, corridas: (previa.corridas ?? 1) + 1 } }
  }
  return {
    accion: 'cambio',
    fila: {
      valor: v,
      vistoDesde: ahora,
      vistoHasta: ahora,
      corridas: 1,
      valorPrevio: Number(previa.valor),
      // EL BORDE IZQUIERDO DEL INTERVALO: la última corrida que todavía vio el valor viejo. Es el dato
      // que convierte "lo vi a las 17" en "lo anotaste entre las 15 y las 17".
      previoVistoEn: previa.vistoHasta ?? null,
    },
  }
}

const dd = (n) => String(n).padStart(2, '0')
const fechaYReloj = (d) => `${dd(d.getDate())}/${dd(d.getMonth() + 1)} ${dd(d.getHours())}:${dd(d.getMinutes())}`

/**
 * NÚCLEO PURO: el momento del conteo como el INTERVALO que de verdad se conoce.
 *
 * LLEVA LA FECHA Y NO SÓLO LA HORA, y es la corrección de un defecto real: la versión anterior imprimía
 * `15:01` y `17:00` para un intervalo que podía ser de una semana, porque el borde izquierdo salía del
 * sello del conteo ANTERIOR. Un texto que dibuja una ventana de siete días como una de dos horas no es
 * una imprecisión: es una afirmación falsa sobre cuándo se contó la plata.
 *
 * @param {{vistoDesde:Date, previoVistoEn?:Date|null}} fila
 */
export function ventanaDelConteo(fila = {}) {
  const hasta = fila.vistoDesde
  if (!(hasta instanceof Date)) throw new Error('ventanaDelConteo necesita el instante en que se vio el conteo')
  const desde = fila.previoVistoEn instanceof Date && fila.previoVistoEn < hasta ? fila.previoVistoEn : null
  const horas = desde ? (hasta - desde) / 3600000 : null
  const ancho = horas === null ? '' : (horas < 1 ? `${Math.round(horas * 60)} min` : `${horas.toFixed(1)} h`)
  const texto = desde
    ? `lo anotaste entre el ${fechaYReloj(desde)} y el ${fechaYReloj(hasta)} — ventana de ${ancho}`
    : `lo vi por primera vez el ${fechaYReloj(hasta)}; no sé desde cuándo estaba (no hay lectura anterior registrada)`
  return { desde, hasta, horas, acotado: Boolean(desde), texto }
}

/** El ancla como serial de Sheets, que es lo que la fórmula compara. */
export const anclaComoSerial = (fila) => instanteDelSello(fila?.vistoDesde)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENCIA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La tabla se asegura acá ADEMÁS de existir en `supabase/migrations/` por la trampa que este repo ya
// pagó: una migración commiteada no es una migración aplicada, y el mensaje de arranque con la tabla
// ausente es idéntico al del arranque sano. El DDL de acá es el mismo que el del archivo.

async function asegurarTabla() {
  await query(`
    create table if not exists public.caja_conteo_observado (
      file_id         text not null,
      concepto        text not null,
      valor           numeric not null,
      visto_desde     timestamptz not null,
      visto_hasta     timestamptz not null,
      corridas        int not null default 1,
      valor_previo    numeric,
      previo_visto_en timestamptz,
      primary key (file_id, concepto, visto_desde)
    )`)
  await query(`create index if not exists caja_conteo_observado_ultima
    on public.caja_conteo_observado (file_id, concepto, visto_desde desc)`)
  await query('alter table public.caja_conteo_observado enable row level security')
  // Una tabla con RLS y sin policy no da error: devuelve cero filas, que es indistinguible de un cero
  // real. Por eso la policy se asegura acá igual que la tabla.
  await query(`do $$ begin
      if not exists (select 1 from pg_policies where schemaname = 'public'
                       and tablename = 'caja_conteo_observado'
                       and policyname = 'caja_conteo_observado_service') then
        create policy caja_conteo_observado_service on public.caja_conteo_observado
          for all to service_role using (true) with check (true);
      end if;
    end $$`)
}

const aFila = (r) => (r ? {
  concepto: r.concepto,
  valor: Number(r.valor),
  vistoDesde: r.visto_desde,
  vistoHasta: r.visto_hasta,
  corridas: Number(r.corridas),
  valorPrevio: r.valor_previo === null || r.valor_previo === undefined ? null : Number(r.valor_previo),
  previoVistoEn: r.previo_visto_en ?? null,
} : null)

/** La observación vigente de un concepto: la racha más nueva. */
export async function ultimaObservacion(fileId, concepto) {
  await asegurarTabla()
  const r = await query(
    `select * from public.caja_conteo_observado
      where file_id = $1 and concepto = $2 order by visto_desde desc limit 1`, [fileId, concepto])
  return aFila(r.rows[0])
}

/**
 * Las observaciones vigentes de todos los conceptos con un prefijo, en UNA consulta. `DISTINCT ON` y
 * no un `LIMIT 1` por concepto: vigilar las ~850 celdas de importe de Compras con una consulta por
 * celda convertiría el paso en un maratón de SQL.
 */
export async function ultimasObservaciones(fileId, prefijo = '') {
  await asegurarTabla()
  const r = await query(
    `select distinct on (concepto) * from public.caja_conteo_observado
      where file_id = $1 and concepto like $2 order by concepto, visto_desde desc`, [fileId, `${prefijo}%`])
  return new Map(r.rows.map((x) => [x.concepto, aFila(x)]))
}

/** Inserta o confirma una racha. En tandas: 850 celdas no entran en un solo INSERT. */
async function upsert(fileId, filas) {
  for (let i = 0; i < filas.length; i += 300) {
    const t = filas.slice(i, i + 300)
    const vals = t.map((_, k) => `($1,$${k * 7 + 2},$${k * 7 + 3},$${k * 7 + 4},$${k * 7 + 5},$${k * 7 + 6},$${k * 7 + 7},$${k * 7 + 8})`).join(',')
    await query(
      `insert into public.caja_conteo_observado
         (file_id, concepto, valor, visto_desde, visto_hasta, corridas, valor_previo, previo_visto_en)
       values ${vals}
       on conflict (file_id, concepto, visto_desde)
       do update set visto_hasta = excluded.visto_hasta, corridas = excluded.corridas`,
      [fileId, ...t.flatMap((f) => [f.concepto, f.valor, f.vistoDesde, f.vistoHasta, f.corridas, f.valorPrevio, f.previoVistoEn])],
    )
  }
}

/**
 * MIRAR UNA CELDA Y DEJARLO ANOTADO. Devuelve la racha vigente y qué pasó con ella.
 * TIRA si no se puede persistir: una observación que no quedó escrita no es una observación, y el que
 * llama tiene que poder distinguir "el ancla es ésta" de "no sé cuál es el ancla".
 */
export async function observar(fileId, concepto, valor, { ahora = new Date(), adopcion = null } = {}) {
  const previa = await ultimaObservacion(fileId, concepto)
  const { accion, fila } = observacionSiguiente(previa, { valor, ahora, adopcion })
  await upsert(fileId, [{ ...fila, concepto }])
  return { accion, fila: { ...fila, concepto }, previa }
}

/**
 * MIRAR MUCHAS CELDAS DE UNA VEZ: una lectura, una escritura por tanda.
 * @param {Array<{concepto:string, valor:number}>} lecturas
 */
export async function observarMuchas(fileId, lecturas = [], { ahora = new Date(), prefijo = '' } = {}) {
  const previas = await ultimasObservaciones(fileId, prefijo)
  const out = new Map()
  const aEscribir = []
  for (const l of lecturas) {
    const previa = previas.get(l.concepto) ?? null
    const { accion, fila } = observacionSiguiente(previa, { valor: l.valor, ahora })
    out.set(l.concepto, { accion, fila: { ...fila, concepto: l.concepto }, previa })
    aEscribir.push({ ...fila, concepto: l.concepto })
  }
  if (aEscribir.length) await upsert(fileId, aEscribir)
  return out
}

/**
 * EL ANCLA DEL CONTEO PARA EL VALOR QUE ESTÁ TIPEADO HOY, con la adopción resuelta.
 *
 * `sello` es lo que la pestaña ya tiene estampado: el serial en F y el conteo al que pertenece (la D
 * del estado). Sólo se adopta cuando ese sello es del MISMO valor que está tipeado hoy — un instante
 * que pertenece a otro conteo no es evidencia de éste, es un número parecido.
 *
 * @param {{serial?:number, valorSellado?:number}} sello
 * @returns {Promise<{accion:string, fila:object, previa:object|null, serial:number, ventana:object}>}
 */
export async function anclaDelConteo(fileId, concepto, valor, { ahora = new Date(), sello = {} } = {}) {
  const adopcion = Number(sello.serial) > 0 && mismoValor(sello.valorSellado, valor)
    ? fechaDeSerial(sello.serial) : null
  const r = await observar(fileId, concepto, valor, { ahora, adopcion })
  return { ...r, serial: anclaComoSerial(r.fila), ventana: ventanaDelConteo(r.fila) }
}
