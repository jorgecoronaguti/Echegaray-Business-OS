// EL REGISTRO DE «Cheques Emitidos» → `public.cheques`. NÚCLEO PURO: SIN RED NI BASE.
//
// ═══ POR QUÉ EXISTE (21/08/2026) ═══
//
// La flecha que había era la contraria. `cheques-emitidos-sync.mjs` va de la base a la pestaña:
// corrige la columna DEBITADO y agrega al final lo que el banco informó. Nunca hubo el camino de
// vuelta, así que la base se llenaba SÓLO con lo que aparecía en una pantalla del banco.
//
// Medido hoy: la pestaña tiene 104 cheques desde el 12/12/2025 por $114.280.043,77 y la base tiene
// 23, todos posteriores al 18/06. Faltan 81. No es un atraso: es que nunca hubo por dónde entrar.
//
// La consecuencia es que la réplica `_CHEQUES_RAW` —y cualquier pestaña que se construya sobre
// ella— publica los emitidos con 81 cheques menos. No da error: da un número más chico.
//
// ═══ LAS TRES TRAMPAS QUE ESTE MÓDULO TIENE QUE ESQUIVAR ═══
//
// 1. EL NÚMERO NO IDENTIFICA UN CHEQUE. Las chequeras física y electrónica numeran por separado:
//    en el registro real, los números 310, 311, 312 y 313 existen DOS VECES (ECHEQ a Maderas
//    Literas y FISICO a Corralón Progreso, importes distintos). La clave es (instrumento, número).
//    Ver la migración 20260821T1000.
//
// 2. DOS FILAS CON LA MISMA CLAVE NO SE FUSIONAN: SE DENUNCIAN. El registro tiene el FISICO 316 dos
//    veces —Diesel Rodríguez $500.000 y $510.000— y el extracto del banco dice que el segundo es el
//    317 ($-510.000 el 13/08, referencia 317). Un importador que elige uno y sigue publica un número
//    plausible; uno que fusiona, pierde plata. Este devuelve el conflicto y NO carga ninguna de las
//    dos hasta que alguien lo resuelva con evidencia.
//
// 3. LA FECHA DE PAGO ES LA COLUMNA I, NO LA J. Las dos se llaman casi igual ("fecha de pago" y
//    "fecha pago") y difieren en 5 filas. La I es la que usan las propias fórmulas de la pestaña
//    (`cheques-emitidos-geometria.rangoAbierto('I')`) y la que separa un cheque vencido de uno por
//    vencer; la J tiene el mismo 26/08 repetido en las cinco, que es una columna de trabajo del
//    dueño. Tomar la J correría los vencimientos sin dar un solo error.
//
// LO QUE ESTE MÓDULO NO HACE: no decide, no escribe y no corrige el registro. Devuelve un plan.

/** Sólo dígitos y sin ceros a la izquierda: "00000303" y "303" son el mismo cheque. */
export const norm = (n) => String(n ?? '').replace(/\D/g, '').replace(/^0+/, '')

/** Los dos únicos instrumentos que el registro conoce. Cualquier otra cosa es un dato a revisar. */
export const INSTRUMENTOS = Object.freeze(['FISICO', 'ECHEQ'])

/** Índices 0-based de las columnas del registro, y el encabezado que los hace válidos. */
export const COL = Object.freeze({
  tipo: 0, numero: 1, emision: 2, cuit: 3, proveedor: 4, monto: 5,
  tipoComp: 6, nroComp: 7, pago: 8, pagoTrabajo: 9, debitado: 10, unidad: 11,
})

/**
 * ¿El encabezado sigue siendo el que estos índices asumen?
 *
 * El dueño edita esta pestaña. Si inserta una columna, todo lo que sigue se corre y este importador
 * cargaría el monto de una columna y la fecha de otra SIN dar error — el modo de falla más caro que
 * tiene un importador. Se verifica por rótulo y se aborta; no se adivina.
 *
 * @returns {string[]} los problemas; vacío = el layout es el esperado
 */
export function verificarEncabezado(fila = []) {
  const esperado = { 0: /^tipo$/i, 1: /^nro$/i, 4: /^proveedor$/i, 5: /^monto$/i, 8: /^fecha de pago$/i, 10: /^debitado$/i }
  const problemas = []
  for (const [i, re] of Object.entries(esperado)) {
    const visto = String(fila?.[Number(i)] ?? '').trim()
    if (!re.test(visto)) problemas.push(`columna ${String.fromCharCode(65 + Number(i))} dice "${visto || '∅'}" y se esperaba ${re}`)
  }
  return problemas
}

/**
 * Un serial de Sheets → ISO. Devuelve null si no es un serial de una fecha creíble.
 *
 * La banda 2000–2100 no es decorativa: una celda con el monto adentro de la columna de fecha entra
 * como número y saldría convertida en el año 3.500 sin que nada se queje. Ver la memoria
 * `fecha-dd-mm-yy-parser`: se lee con UNFORMATTED_VALUE justamente para no depender del locale.
 */
export function aISO(serial) {
  const n = typeof serial === 'number' ? serial : NaN
  if (!Number.isFinite(n) || n < 36526 || n > 73050) return null
  return new Date(Date.UTC(1899, 11, 30) + Math.trunc(n) * 86400000).toISOString().slice(0, 10)
}

/**
 * DEBITADO → el estado del ciclo de vida que usa `public.cheques`.
 *
 * Es el inverso exacto de `debitadoDe()` en cheques-emitidos-sync.mjs, y tiene que serlo: si las dos
 * direcciones no coinciden, un cheque cargado por acá vuelve por el sync marcado al revés. El
 * vocabulario de los emitidos es Aceptado/Pagado — NO el de los recibidos (En custodia/Depositado…).
 */
export function estadoDe(debitado) {
  const d = String(debitado ?? '').trim().toUpperCase()
  if (d === 'SI') return 'Pagado'
  if (d === 'NO') return 'Aceptado'
  return null
}

/**
 * NÚCLEO PURO: una fila del registro → la fila de `public.cheques`, o el motivo por el que no se puede.
 *
 * @param {Array} r  la fila cruda, leída con UNFORMATTED_VALUE
 * @param {{fila:number, corte:string}} ctx
 * @returns {{ok:true, cheque:object} | {ok:false, motivo:string, fila:number}}
 */
export function aCheque(r = [], { fila = 0, corte } = {}) {
  const no = (motivo) => ({ ok: false, motivo, fila })
  const instrumento = String(r[COL.tipo] ?? '').trim().toUpperCase()
  if (!INSTRUMENTOS.includes(instrumento)) return no(`instrumento "${r[COL.tipo] ?? '∅'}" no es FISICO ni ECHEQ`)

  const numero = norm(r[COL.numero])
  if (!numero) return no('sin número de cheque')

  const importe = typeof r[COL.monto] === 'number' ? r[COL.monto] : NaN
  // El 0 SÍ es un importe posible en otras tablas, pero un cheque de $0 no existe: es una celda
  // vacía que entró como número. Se denuncia en vez de cargar una fila que no suma nada.
  if (!Number.isFinite(importe) || importe <= 0) return no(`importe "${r[COL.monto] ?? '∅'}" no es un número positivo`)

  const estado = estadoDe(r[COL.debitado])
  if (!estado) return no(`DEBITADO dice "${r[COL.debitado] ?? '∅'}" y sólo se entiende SI/No`)

  const fechaPago = aISO(r[COL.pago])
  if (!fechaPago) return no(`fecha de pago "${r[COL.pago] ?? '∅'}" no es una fecha creíble`)

  const texto = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }
  return {
    ok: true,
    cheque: {
      tipo: 'emitido',
      instrumento,
      numero,
      banco: 'Santander',
      contraparte: texto(r[COL.proveedor]),
      contraparte_cuit: texto(r[COL.cuit]),
      fecha_pago: fechaPago,
      fecha_emision: aISO(r[COL.emision]),
      importe,
      estado,
      obra: texto(r[COL.unidad]),
      comprobante: texto(r[COL.nroComp]),
      origen: `registro «Cheques Emitidos» fila ${fila}`,
      corte,
      fila,
    },
  }
}

/** La clave de identidad. El número solo confunde el FISICO 313 con el ECHEQ 313. */
export const clave = (c) => `${String(c?.instrumento ?? '').toUpperCase()}|${norm(c?.numero)}`

/**
 * EL PLAN DE CARGA. Puro: no escribe, devuelve qué haría y qué no puede hacer.
 *
 * `correcciones` es el único lugar por donde entra una decisión humana: un mapa
 * `{ "FISICO|316@510000": { numero: "317", porque: "…" } }` que reasigna una fila concreta con su
 * evidencia. Existe porque el registro tiene el FISICO 316 dos veces y el extracto dice que el de
 * $510.000 es el 317 — pero eso lo afirma el banco, no este módulo, y queda escrito al lado.
 *
 * @param {{registro:Array<{fila:number, r:Array}>, base?:object[], corte:string, correcciones?:object}} args
 * @returns {{nuevos, yaEstan, cambian, discrepan, conflictos, rechazados}} `cambian` se aplica
 *   (sólo el estado); `discrepan` se informa y NO se pisa: ver la nota adentro.
 */
export function planDeCarga({ registro = [], base = [], corte, correcciones = {} } = {}) {
  const rechazados = []
  const buenos = []
  for (const { fila, r } of registro) {
    const res = aCheque(r, { fila, corte })
    if (!res.ok) { rechazados.push(res); continue }
    const c = res.cheque
    const arreglo = correcciones[`${clave(c)}@${Math.round(c.importe)}`]
    if (arreglo) Object.assign(c, { numero: norm(arreglo.numero), corregido: arreglo.porque })
    buenos.push(c)
  }

  // DOS FILAS CON LA MISMA CLAVE NO SE FUSIONAN. Un UPSERT las colapsaría en una y la plata de la
  // otra desaparecería sin que ninguna suma diera error: el importador informaría "cargados 104".
  const porClave = new Map()
  for (const c of buenos) {
    const k = clave(c)
    if (!porClave.has(k)) porClave.set(k, [])
    porClave.get(k).push(c)
  }
  const conflictos = []
  for (const [k, lista] of porClave) {
    if (lista.length > 1) conflictos.push({ clave: k, filas: lista.map((c) => ({ fila: c.fila, importe: c.importe, contraparte: c.contraparte })) })
  }
  const enConflicto = new Set(conflictos.map((c) => c.clave))

  const enBase = new Map(base.map((b) => [clave(b), b]))
  const nuevos = []
  const yaEstan = []
  const cambian = []   // se aplican: sólo el estado
  const discrepan = [] // se informan: importe o fecha que no coinciden con la base
  for (const [k, lista] of porClave) {
    if (enConflicto.has(k)) continue // no se carga ninguna de las dos hasta que se resuelva
    const c = lista[0]
    const b = enBase.get(k)
    if (!b) { nuevos.push(c); continue }
    // ═══ EL REGISTRO MANDA SOBRE EL ESTADO, Y SOBRE NADA MÁS (21/08/2026) ═══
    //
    // Lo destapó el primer ensayo. De 6 diferencias contra la base, 5 eran la fecha de pago corrida
    // uno a cuatro días y 1 era el estado. No son lo mismo:
    //
    //   · DEBITADO es la columna que el dueño mantiene mirando la cuenta, y es la que hace fresca a
    //     la pestaña. El ECHEQ 366 figuraba «Aceptado» en la base con el banco habiéndolo pagado.
    //   · La fecha de pago y el importe de un cheque que YA está en la base entraron por la puerta
    //     verificada —pantalla del banco, con cruce contra el extracto—. La del registro está
    //     tipeada a mano. Pisar la del banco con la tipeada no es actualizar: es degradar, y encima
    //     en el dato que decide si un cheque está vencido.
    //
    // Así que la diferencia de importe o de fecha NO se aplica: se DENUNCIA. Una discrepancia entre
    // dos fuentes es un hallazgo que alguien tiene que resolver, no algo que el importador decide
    // solo por el orden en que corrió.
    const soloEstado = String(b.estado ?? '') !== c.estado
    const choca = []
    if (Math.round(Number(b.importe)) !== Math.round(c.importe)) choca.push(`importe: base ${b.importe} · registro ${c.importe}`)
    if (String(b.fecha_pago ?? '').slice(0, 10) !== c.fecha_pago) choca.push(`fecha de pago: base ${String(b.fecha_pago ?? '').slice(0, 10)} · registro ${c.fecha_pago}`)
    if (choca.length) discrepan.push({ ...c, choca, estadoBase: b.estado })
    if (soloEstado) cambian.push({ ...c, difiere: [`estado ${b.estado} → ${c.estado}`] })
    else if (!choca.length) yaEstan.push(c)
  }
  return { nuevos, yaEstan, cambian, discrepan, conflictos, rechazados }
}
