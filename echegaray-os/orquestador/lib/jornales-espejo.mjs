// EL ESPEJO DEL BLOQUE DE JORNALES: lo que la planilla DICE, tal como lo dice.
//
// ═══ PARA QUÉ EXISTE, Y POR QUÉ NO ALCANZA CON `registros_hh` ═══
//
// `jornales-a-registros-hh.mjs` TRADUCE la planilla: cada celda diaria se convierte en filas de
// `registros_hh` con su obra resuelta y su `tipo_hora`. Eso es lo que la app usa para trabajar, y es
// una interpretación — buena, probada, pero interpretación.
//
// Esto es lo otro: la FOTO del bloque. Las horas de cada día tal cual están escritas, el total que la
// propia planilla calcula, el $/h y los importes de su cadena de pago. Sirve para UNA cosa y hay que
// decirla: que la vista «Quincena» pueda poner al lado de cada persona un chip que diga si la base
// coincide con el Sheet. Sin eso el dueño no tiene cómo saber si puede dejar de abrir la planilla, y
// la pantalla es un adorno por más bien que calcule.
//
// ═══ UN CONTROL NO SE VALIDA CONTRA LA INFORMACIÓN QUE PRODUCE ═══
//
// Por eso el total NO se recalcula sumando las celdas: se LEE de la columna que la planilla calcula
// («TOTAL SEMANA»). Si acá se sumara, el cotejo compararía la suma del OS contra la suma del OS y
// diría «coincide» siempre — incluso el día que el parser se coma una celda. Las dos cifras viajan
// por separado y el que compara es quien lee.
//
// ═══ Y ADEMÁS TRAE LA PLATA, QUE ES LO QUE FALTABA ═══
//
// El dueño, 11/09/2026: *«todo lo referente a adelantos de plata no está»*. La cadena de pago de la
// app calculaba COBRA y restaba lo que encontraba en `nomina_adelanto` y `nomina_recibo_neto`; los
// adelantos que él escribe EN LA PLANILLA no entraban por ningún lado. Ahora entran por acá, y
// `fuenteDeLaCadena` (en la web) decide la precedencia: lo manual gana, JORNALES después.
//
// ═══ NUNCA SE ADIVINA UNA LETRA ═══
//
// Las columnas del resumen se resuelven POR RÓTULO, primero en la fila del bloque y si no en la fila
// 1 de la pestaña — la misma cascada que `resolverColumnas`. Un rótulo que no aparece deja la columna
// en `null` y el campo viaja NULL: un número leído de la columna equivocada es peor que un hueco,
// porque el hueco se ve. NO hay ninguna letra fija: el mapeo medido está abajo, con su evidencia.
//
// SÓLO LEE. Este módulo no escribe nada en ningún lado.

import {
  detectarBloques, trabajadoresDeBloque, leerCeldaDiaria, parseHoras, filaSheet,
} from './jornales-estructura.mjs'
import { emparejarPersona, indicePersonas, FALTA } from './jornales-a-registros-hh.mjs'

/**
 * ═══ EL MAPEO DE LAS COLUMNAS DE PLATA, MEDIDO EN EL ARCHIVO REAL EL 11/09/2026 ═══
 *
 * Leído con una sonda de sólo lectura sobre la fila 1 de cada pestaña (que es donde los bloques
 * vigentes heredan sus rótulos: el último bloque de «Obreros 26» —fila 558— no trae ninguno propio
 * salvo CLIENTE y OBRA, y el de «Oficina 26» —fila 122— no trae ninguno).
 *
 *   Obreros 26   V DIAS / HORAS · W $ HORA · X BANCO · Y ADELANTO BANCO / EMBARGOS ·
 *                Z ADELANTO EFECTIVO · AA TOTAL EFECTIVO · AB TOTAL SEMANA · AC CLIENTE · AD OBRA
 *   Oficina 26   U DIAS / HORAS · V $ HORA · W BANCO · X ADELANTO · Y TOTAL RECIBO ·
 *                Z TOTAL SEMANA · AA OBRA
 *
 * ═══ DOS COSAS QUE ESTO DEJA A LA VISTA Y HAY QUE DECIR ═══
 *
 * 1. LAS DOS PESTAÑAS NO USAN EL MISMO VOCABULARIO. «TOTAL EFECTIVO» (Obreros) y «TOTAL RECIBO»
 *    (Oficina) ocupan el mismo lugar en la cadena —lo que queda después de banco y adelantos— y se
 *    llaman distinto; y «ADELANTO BANCO / EMBARGOS» sólo existe en Obreros. Por eso el mapeo es POR
 *    RÓTULO y por pestaña, nunca por posición: una columna insertada corre todo lo de la derecha.
 *
 * 2. NO EXISTE UNA COLUMNA «PAGADO EL» en ninguna de las dos. Se buscó y no está: el espejo no la
 *    publica y la pantalla no la puede mostrar. Inventar una fecha de pago es exactamente lo que la
 *    regla 1 prohíbe.
 *
 * ═══ Y UNA TERCERA, QUE NO SE TOCA ACÁ ═══
 *
 * `lib/jornales.mjs` declara `TOTAL_COL = { 'Obreros 26': 26 }`, que HOY es AA = «TOTAL EFECTIVO»,
 * no AB = «TOTAL SEMANA». Puede ser deliberado —el tool contesta «cuánto se PAGÓ», y lo que sale en
 * mano es el efectivo— o puede ser que el layout se haya corrido. Es un número que el dueño ve por
 * chat: no se cambia sin que él lo confirme. Queda declarado, no corregido.
 */
export const ROTULOS = {
  horas: /^d[ií]as?\s*\/\s*horas?\b/i,
  valorHora: /^\$\s*hora\b/i,
  /** COBRA: lo que la quincena genera antes de restar nada. Las dos pestañas lo llaman igual. */
  cobra: /^total\s*semana\b/i,
  /** POR BANCO: el giro del lote de haberes. `^banco$` para no comerse «ADELANTO BANCO». */
  porBanco: /^banco\s*$/i,
  /** YA TRANSFERIDO: girado ANTES del lote. Sólo Obreros; en Oficina queda null y eso es un dato. */
  yaTransferido: /^adelanto\s*banco\b/i,
  /** ADELANTO: efectivo entregado a cuenta. «ADELANTO EFECTIVO» en Obreros, «ADELANTO» en Oficina. */
  adelanto: /^adelanto(\s*efectivo)?\s*$/i,
  /** EN EFECTIVO: lo que queda para el sobre. Dos nombres para la misma posición de la cadena. */
  enEfectivo: /^total\s*(efectivo|recibo)\b/i,
}

/**
 * EL ORDEN IMPORTA: `adelanto` se prueba DESPUÉS de `yaTransferido` porque «ADELANTO BANCO /
 * EMBARGOS» empieza con «ADELANTO». Sin este orden, la columna de embargos entraría como el adelanto
 * en efectivo de la persona — dos importes distintos en la misma celda de la liquidación.
 */
const ORDEN_DE_ROTULOS = [
  'horas', 'valorHora', 'cobra', 'yaTransferido', 'porBanco', 'adelanto', 'enEfectivo',
]

const celda = (grid, i, j) => (grid.filas?.[i] || [])[j] ?? null
const valor = (c) => (c && c.valor != null ? String(c.valor).trim() : '')

/** Busca en una fila la primera columna cuyo rótulo matchea. `maxCol` acota al ancho del bloque. */
function columnaPorRotulo(grid, fila, re, maxCol = 60) {
  const r = grid.filas?.[fila] || []
  for (let j = 0; j < Math.min(r.length, maxCol); j++) {
    if (re.test(valor(r[j]))) return j
  }
  return null
}

/**
 * LAS COLUMNAS DEL RESUMEN DE UN BLOQUE. `null` en la que no tenga rótulo.
 *
 * `total` acepta además la letra fija de la pestaña, porque en el archivo real esa columna a veces
 * lleva el rótulo en la fila 1 y a veces no lleva ninguno — y es la única cuya posición está medida.
 */
export function columnasDelResumen(grid, bloque, { filaRotulos = 0 } = {}) {
  const buscar = (re) => columnaPorRotulo(grid, bloque.fila, re) ?? columnaPorRotulo(grid, filaRotulos, re)
  const out = {}
  const tomadas = new Set()
  for (const clave of ORDEN_DE_ROTULOS) {
    let j = buscar(ROTULOS[clave])
    // UNA COLUMNA ES UNA SOLA COSA. Si dos rótulos caen en la misma —pasa cuando una pestaña no
    // tiene una de las columnas— la segunda queda en null en vez de duplicar el importe. Es la misma
    // decisión que `resolverColumnas` toma con CLIENTE y OBRA cuando colisionan.
    if (j != null && tomadas.has(j)) j = null
    // LAS COLUMNAS DE FECHA NO SON COLUMNAS DE RESUMEN. Un rótulo que cae dentro del tramo de días es
    // un encabezado de día mal leído: publicar las horas de un martes como el total de la quincena.
    if (j != null && j >= bloque.col_desde && j <= bloque.col_hasta) j = null
    if (j != null) tomadas.add(j)
    out[clave] = j
  }
  return out
}

/** El número de una celda de resumen. `null` cuando no hay columna o la celda no es un número. */
function numeroDe(grid, fila, col) {
  if (col == null) return null
  const c = celda(grid, fila, col)
  if (c == null) return null
  if (typeof c.numero === 'number' && Number.isFinite(c.numero)) return c.numero
  const crudo = valor(c)
  if (crudo === '') return null
  // «$7.048.606» / «$448.800,00» en es-AR. Misma normalización que `parseMonto` de `jornales.mjs`;
  // se repite acá y no se importa porque aquel módulo arrastra el cliente de Google.
  const n = Number(crudo.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const r3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000)

/**
 * LA FOTO DE UN BLOQUE: su ventana y una fila por persona.
 *
 * La ventana sale del MIN y el MAX de las fechas del encabezado, no de la primera y la última: en el
 * archivo real vienen desordenadas («16/7, 17/7, 18/7, 6/7…») y rotular la quincena con la primera
 * columna la nombraría mal. Es la misma regla que `ultimaQuincena` en `jornales.mjs`.
 */
export function fotoDelBloque(grid, bloque, { pestana } = {}) {
  const isos = bloque.fechas.map((f) => f.iso).sort()
  const cols = columnasDelResumen(grid, bloque, { pestana })
  const tomados = trabajadoresDeBloque(grid, bloque)
  const personas = tomados.map((t) => {
    const horasPorDia = {}
    for (const f of bloque.fechas) {
      const c = leerCeldaDiaria(grid, t.fila, f.col)
      if (!c.escrita) continue
      // LO QUE NO ES UN NÚMERO NO ES CERO. Una celda con texto libre («NO SE TOCA HASTA JUL») entra
      // como `null` y se cuenta aparte: convertirla a 0 diría que esa persona no trabajó ese día.
      horasPorDia[f.iso] = c.horas == null ? null : r3(c.horas)
    }
    return {
      fila1: t.fila1,
      ref: t.ref,
      nombre: t.nombre_original.trim(),
      cliente: t.cliente_original.trim(),
      obra: t.obra_original.trim(),
      categoria: t.categoria,
      horas_por_dia: horasPorDia,
      // EL TOTAL DE HORAS LO DICE LA PLANILLA, no esta función. Ver la cabecera: si se sumara acá, el
      // cotejo compararía el OS contra el OS.
      horas: r3(numeroDe(grid, t.fila, cols.horas)),
      valor_hora: r3(numeroDe(grid, t.fila, cols.valorHora)),
      // LA CADENA DE PAGO TAL COMO LA ESCRIBE EL DUEÑO, con los nombres de la app y no los del Sheet:
      // el que lee esto es `liquidacionQuincena.ts`, y traducir dos veces el mismo vocabulario es
      // cómo se termina con «ADELANTO BANCO» en la celda del adelanto en efectivo.
      cobra: r3(numeroDe(grid, t.fila, cols.cobra)),
      adelanto: r3(numeroDe(grid, t.fila, cols.adelanto)),
      ya_transferido: r3(numeroDe(grid, t.fila, cols.yaTransferido)),
      por_banco: r3(numeroDe(grid, t.fila, cols.porBanco)),
      en_efectivo: r3(numeroDe(grid, t.fila, cols.enEfectivo)),
    }
  })
  return {
    pestana,
    bloque_fila1: bloque.fila1 ?? filaSheet(grid, bloque.fila),
    desde: isos[0],
    hasta: isos[isos.length - 1],
    dias: isos.length,
    columnas: cols,
    personas,
    truncado: filaDeCorteSospechosa(grid, bloque, tomados),
  }
}

/**
 * ¿EL BLOQUE SE CERRÓ ANTES DE TIEMPO Y SE PERDIÓ UNA PERSONA?
 *
 * ═══ EL DEFECTO, MEDIDO EN EL ARCHIVO REAL EL 11/09/2026 ═══
 *
 * `trabajadoresDeBloque` cierra el bloque cuando la fila contiene un rótulo de cierre
 * (`UOCRA|UOM|BANCO|TOTAL SEMANA|…`), y lo busca en el TEXTO ENTERO de la fila. La fila 124 de
 * «Oficina 26» es la de **Juan Pablo Nievas** —con su nombre en B, 46 h en U y $416.300 en Z— y
 * además tiene la palabra «BANCO» suelta en AD, que es parte de un cuadrito de resumen que vive a la
 * derecha. Resultado: el bloque cierra en él y Nievas NO EXISTE para ningún consumidor de esa
 * función, incluido `jornales-a-registros-hh.mjs`, que es el que carga `registros_hh`.
 *
 * ═══ POR QUÉ ESTO DECLARA EN VEZ DE ARREGLAR ═══
 *
 * El arreglo natural —«un rótulo de cierre sólo cierra si la fila no tiene nombre»— cambia lo que el
 * IMPORTADOR escribe en `registros_hh`, que es plata y horas de obra, y hace que el recorrido pase de
 * largo los bloques de referencia UOCRA (que hoy se saltean con `continue`, no con `break`) y pueda
 * arrastrar filas del bloque siguiente. Eso no lo decide el módulo que descubrió el problema: se
 * declara, se mide, y lo aprueba quien no lo construyó.
 *
 * Mientras tanto el espejo DICE que se cortó. Una persona que desaparece en silencio es exactamente
 * lo que un espejo existe para impedir.
 */
function filaDeCorteSospechosa(grid, bloque, tomados) {
  const cols = bloque.columnas ?? {}
  if (cols.nombre == null) return null
  const ultima = tomados.length > 0 ? tomados[tomados.length - 1].fila : bloque.fila
  const i = ultima + 1
  const nombre = valor(celda(grid, i, cols.nombre))
  if (nombre.length <= 2) return null
  // Con nombre Y al menos tres días escritos, esa fila es una persona: el corte se comió a alguien.
  let dias = 0
  for (const f of bloque.fechas) if (celda(grid, i, f.col)?.valor != null) dias++
  if (dias < 3) return null
  return { fila1: filaSheet(grid, i), nombre, dias }
}

/**
 * TODOS LOS BLOQUES DE UNA PESTAÑA. Un bloque con fechas repetidas en el encabezado no es una
 * quincena: se descarta y se dice, igual que en `marcasDeGrid`.
 */
export function espejoDeGrid(grid, { pestana, anio } = {}) {
  const bloques = []
  const hallazgos = []
  for (const b of detectarBloques(grid, { anio })) {
    const isos = b.fechas.map((f) => f.iso)
    if (new Set(isos).size !== isos.length) {
      hallazgos.push({ tipo: 'bloque_descartado', pestana, fila1: b.fila1, detalle: 'fechas repetidas en el encabezado' })
      continue
    }
    try {
      const foto = fotoDelBloque(grid, b, { pestana })
      if (foto.truncado) {
        hallazgos.push({
          tipo: 'bloque_truncado', pestana, fila1: b.fila1,
          detalle: `se cortó en f${foto.truncado.fila1} «${foto.truncado.nombre}», que tiene `
            + `${foto.truncado.dias} días cargados: un rótulo de cierre en esa fila la sacó del bloque`,
        })
      }
      bloques.push(foto)
    } catch (e) {
      hallazgos.push({ tipo: 'bloque_descartado', pestana, fila1: b.fila1, detalle: e.message })
    }
  }
  return { bloques, hallazgos }
}

/**
 * LAS FILAS QUE VAN A `jornales_bloque_persona`, con la persona resuelta.
 *
 * ═══ QUIEN NO EMPAREJA NO SE DESCARTA: VIAJA CON `persona_id` EN NULL ═══
 *
 * Esa fila es la que hace que la pantalla pueda decir «3 de la planilla sin persona en el padrón».
 * Tirarla haría que el bloque pareciera más chico de lo que es y que el cotejo del resto diera bien
 * mientras alguien queda sin liquidar. Y NO se crea a nadie: el padrón no lo escribe un espejo.
 */
export function filasDelEspejo(bloques, { personas = [] } = {}) {
  const indice = indicePersonas(personas)
  const filas = []
  const sinPersona = []
  for (const b of bloques) {
    for (const p of b.personas) {
      const m = emparejarPersona(p.nombre, indice)
      if (m.estado !== 'ok') {
        sinPersona.push({
          nombre: p.nombre, pestana: b.pestana, fila1: p.fila1,
          estado: m.estado, candidatos: m.candidatos ?? [],
        })
      }
      filas.push({
        pestana: b.pestana,
        bloque_fila1: b.bloque_fila1,
        fila1: p.fila1,
        quincena_desde: b.desde,
        quincena_hasta: b.hasta,
        persona_id: m.estado === 'ok' ? m.persona.id : null,
        nombre_planilla: p.nombre,
        cliente_planilla: p.cliente || null,
        obra_planilla: p.obra || null,
        categoria_planilla: p.categoria,
        horas_por_dia: p.horas_por_dia,
        horas: p.horas,
        valor_hora: p.valor_hora,
        cobra: p.cobra,
        adelanto: p.adelanto,
        ya_transferido: p.ya_transferido,
        por_banco: p.por_banco,
        en_efectivo: p.en_efectivo,
      })
    }
  }
  return { filas, sinPersona }
}

/** Las claves que el UPSERT manda como arrays paralelos, en el orden de `SQL_UPSERT`. */
export const COLUMNAS = [
  'pestana', 'bloque_fila1', 'fila1', 'quincena_desde', 'quincena_hasta', 'persona_id',
  'nombre_planilla', 'cliente_planilla', 'obra_planilla', 'categoria_planilla',
  'horas_por_dia', 'horas', 'valor_hora', 'cobra', 'adelanto', 'ya_transferido', 'por_banco',
  'en_efectivo',
]

export function columnasParaUpsert(filas) {
  return COLUMNAS.map((c) => filas.map((f) => (c === 'horas_por_dia' ? JSON.stringify(f[c] ?? {}) : f[c] ?? null)))
}

/**
 * IDEMPOTENTE POR (pestaña, bloque, fila): la identidad es ESTRUCTURAL, no el nombre.
 *
 * Dos homónimos en la misma quincena colapsarían en una sola clave si se usara el nombre, y el
 * espejo publicaría las horas de uno a nombre de los dos. Es la misma decisión que `ref` en
 * `trabajadoresDeBloque`, y por el mismo defecto ya medido.
 *
 * `leido_en` se pisa SIEMPRE, incluso cuando nada cambió: es la fecha de la última vez que alguien
 * MIRÓ la planilla, y el sello de la pantalla la publica. Si sólo se actualizara al cambiar, una
 * quincena estable diría «leído hace seis días» teniéndose leída hace una hora.
 */
export const SQL_UPSERT = `
insert into public.jornales_bloque_persona (
  pestana, bloque_fila1, fila1, quincena_desde, quincena_hasta, persona_id,
  nombre_planilla, cliente_planilla, obra_planilla, categoria_planilla,
  horas_por_dia, horas, valor_hora, cobra, adelanto, ya_transferido, por_banco, en_efectivo, leido_en)
select *, now() from unnest(
  $1::text[], $2::int[], $3::int[], $4::date[], $5::date[], $6::uuid[],
  $7::text[], $8::text[], $9::text[], $10::text[],
  $11::jsonb[], $12::numeric[], $13::numeric[], $14::numeric[], $15::numeric[], $16::numeric[],
  $17::numeric[], $18::numeric[])
on conflict (pestana, bloque_fila1, fila1) do update set
  quincena_desde = excluded.quincena_desde,
  quincena_hasta = excluded.quincena_hasta,
  persona_id = excluded.persona_id,
  nombre_planilla = excluded.nombre_planilla,
  cliente_planilla = excluded.cliente_planilla,
  obra_planilla = excluded.obra_planilla,
  categoria_planilla = excluded.categoria_planilla,
  horas_por_dia = excluded.horas_por_dia,
  horas = excluded.horas,
  valor_hora = excluded.valor_hora,
  cobra = excluded.cobra,
  adelanto = excluded.adelanto,
  ya_transferido = excluded.ya_transferido,
  por_banco = excluded.por_banco,
  en_efectivo = excluded.en_efectivo,
  leido_en = now()
returning (xmax = 0) as insertada`

/** Un resumen legible del ensayo. Sin esto, `--dry` imprime filas y no dice nada. */
export function resumir(filas) {
  const porQuincena = new Map()
  for (const f of filas) {
    const k = `${f.pestana} · ${f.quincena_desde}..${f.quincena_hasta}`
    const r = porQuincena.get(k) ?? {
      clave: k, personas: 0, sinPersona: 0, horas: 0, cobra: 0, adelanto: 0, yaTransferido: 0,
      porBanco: 0, enEfectivo: 0, sinHoras: 0, conAdelanto: 0,
    }
    r.personas++
    if (f.persona_id == null) r.sinPersona++
    if (f.horas == null) r.sinHoras++
    if ((f.adelanto ?? 0) !== 0 || (f.ya_transferido ?? 0) !== 0) r.conAdelanto++
    r.horas += f.horas ?? 0
    r.cobra += f.cobra ?? 0
    r.adelanto += f.adelanto ?? 0
    r.yaTransferido += f.ya_transferido ?? 0
    r.porBanco += f.por_banco ?? 0
    r.enEfectivo += f.en_efectivo ?? 0
    porQuincena.set(k, r)
  }
  return [...porQuincena.values()].sort((a, b) => a.clave.localeCompare(b.clave))
}

export { FALTA }
