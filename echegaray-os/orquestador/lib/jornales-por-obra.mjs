// CUANTA MANO DE OBRA SE LLEVO CADA OBRA - leido de JORNALES, no deducido.
//
// POR QUE EXISTE (28/08/2026). Le pidieron al OS el costo de mano de obra por obra y contesto "NO SE
// PUDO ATRIBUIR", mirando tablas de Postgres que estan vacias. La planilla JORNALES lo tiene cargado
// desde siempre: CLIENTE en la columna AB y OBRA en la AC, persona por persona y quincena por
// quincena. El dato estaba; lo que faltaba era abrir la planilla.
//
// TODO ACA ES PURO. Entra la grilla que ya devolvio readSheetGrid y un mapa de nombres; sale la
// estructura. Sin red, sin base, sin fecha del sistema - por eso se puede testear entero.
//
// LAS CUATRO REGLAS QUE GOBIERNAN ESTE ARCHIVO
//
// 1. NINGUNA COORDENADA SE ASUME. El ancho de los bloques cambia -se vieron 10, 11, 12, 13 y 16
//    columnas de fecha- y las columnas de plata se mueven con el. La columna de horas y la de valor
//    hora se DERIVAN de las formulas que la planilla ya tiene escritas; si no se pueden derivar, la
//    persona sale con hueco declarado y su plata no se inventa.
// 2. UNA CELDA VACIA NO ES UN CERO, Y TAMPOCO ES UN CONTROL HECHO. Si el mapa de nombres no se pudo
//    leer, el resultado NO es "todos desconocidos": es NO_VERIFICABLE, que es otra cosa y bloquea.
// 3. UN ROTULO NO SE RESUELVE POR PARECIDO. "MESSINA" y "MESSINAS" difieren en una letra y en
//    $ 1.333.000. Lo que no esta en el mapa sale DESCONOCIDO y se informa; nunca se adivina.
// 4. NINGUN PESO QUEDA SIN NOMBRE. Cada fila cae en una clase, cada clase tiene su lista y su
//    contador, y `control.cuadra` exige que las clases sumen el total. Antes existia la clase
//    SIN_ROTULO sin lista ni contador: se midieron $ 161.200 que no aparecian en ningun lado y el
//    resultado igual se leia completo. Un residuo sin nombre es plata perdida, no un detalle.

import {
  normalizarClave, parseHoras, detectarBloques, trabajadoresDeBloque, letraColumna, indiceColumna,
} from './jornales-estructura.mjs'

// La conversion letra->indice vive en el parser estructural junto a su inversa. Se re-exporta para
// que quien ya la importaba de aca la siga encontrando, pero definicion hay UNA sola.
export { indiceColumna }

/** Como quedo resuelto el rotulo de la columna CLIENTE de una fila. */
export const CLASE = Object.freeze({
  CLIENTE: 'CLIENTE',
  NO_ES_CLIENTE: 'NO_ES_CLIENTE',
  DESCONOCIDO: 'DESCONOCIDO',
  SIN_ROTULO: 'SIN_ROTULO',
  NO_VERIFICABLE: 'NO_VERIFICABLE',
})

/** Por que una fila no pudo valuarse. Cada hueco es explicito: no hay ceros de relleno. */
export const HUECO = Object.freeze({
  SIN_COLUMNA_HORAS: 'sin_columna_horas',
  SIN_VALOR_HORA: 'sin_valor_hora',
  CELDA_ILEGIBLE: 'celda_ilegible',
})

/**
 * NUCLEO PURO: a que cliente canonico corresponde este rotulo?
 *
 * `mapa` es { leido: boolean, alias: Map<clave, canonico>, noCliente: Map<clave, motivo> }.
 * Cuando `leido` no es exactamente true, TODO sale NO_VERIFICABLE: un mapa que no se pudo leer no
 * autoriza a decir "este rotulo no existe".
 */
export function resolverCliente(rotulo, mapa) {
  if (mapa?.leido !== true) return { cliente: null, clase: CLASE.NO_VERIFICABLE }
  const clave = normalizarClave(rotulo)
  if (!clave) return { cliente: null, clase: CLASE.SIN_ROTULO }
  const motivo = mapa.noCliente?.get(clave)
  if (motivo != null) return { cliente: null, clase: CLASE.NO_ES_CLIENTE, motivo }
  const canonico = mapa.alias?.get(clave)
  if (canonico != null) return { cliente: canonico, clase: CLASE.CLIENTE }
  return { cliente: null, clase: CLASE.DESCONOCIDO, rotulo: String(rotulo).trim() }
}

const RE_SUMA_HORAS = /^=SUM\(([A-Z]+)(\d+):([A-Z]+)\d+\)$/i
const RE_PRODUCTO = /^=([A-Z]+)(\d+)\s*\*\s*([A-Z]+)\2$/i

/**
 * NUCLEO PURO: donde estan las horas y el valor hora de ESTA fila, derivados de sus propias formulas.
 *
 * La planilla escribe =SUM(F497:T497) en la columna de horas y =V497*W497 en la del total. Con esas
 * dos se despeja todo: la del SUM es la de horas, y en el producto la que no es la de horas es la
 * del valor hora. Nada de esto esta pegado en el codigo a proposito - cuando el bloque cambia de
 * ancho, la formula cambia con el y esto sigue funcionando.
 */
export function columnasDeDinero(fila) {
  const vacio = { colHoras: null, colValorHora: null, colTotal: null }
  if (!Array.isArray(fila)) return vacio
  let colHoras = null
  for (let j = 0; j < fila.length; j++) {
    const f = fila[j]?.formula
    if (typeof f === 'string' && RE_SUMA_HORAS.test(f)) { colHoras = j; break }
  }
  if (colHoras == null) return vacio
  const letraHoras = letraColumna(colHoras)
  for (let j = 0; j < fila.length; j++) {
    const f = fila[j]?.formula
    if (typeof f !== 'string') continue
    const m = RE_PRODUCTO.exec(f)
    if (!m) continue
    const a = m[1].toUpperCase()
    const b = m[3].toUpperCase()
    if (a === letraHoras) return { colHoras, colValorHora: indiceColumna(b), colTotal: j }
    if (b === letraHoras) return { colHoras, colValorHora: indiceColumna(a), colTotal: j }
  }
  return { colHoras, colValorHora: null, colTotal: null }
}

/** Horas de UNA celda diaria. escrita:false cuando no hay nada escrito - que NO es cero. */
function horasDeCelda(c) {
  if (!c) return { valor: null, escrita: false }
  const escrita = c.formula != null || c.valor != null
  if (!escrita) return { valor: null, escrita: false }
  const n = typeof c.numero === 'number' ? c.numero : parseHoras(c.valor)
  if (n == null || !Number.isFinite(n)) return { valor: null, escrita: true, ilegible: true }
  return { valor: n, escrita: true }
}

/** Horas de una persona en las fechas de la ventana. Los huecos se ANOTAN, nunca se rellenan. */
function horasEnVentana(fila, dentro, filaHoja, huecos) {
  let horas = 0
  const conHoras = []
  for (const f of dentro) {
    const h = horasDeCelda(fila[f.col])
    if (!h.escrita) continue
    if (h.ilegible) {
      huecos.push({
        tipo: HUECO.CELDA_ILEGIBLE,
        fila: filaHoja,
        columna: letraColumna(f.col),
        fecha: f.iso,
        contenido: String(fila[f.col]?.valor ?? fila[f.col]?.formula ?? '').slice(0, 40),
      })
      continue
    }
    horas += h.valor
    if (h.valor > 0) conHoras.push(f.iso)
  }
  return { horas, conHoras }
}

/** Una persona de un bloque, valuada. `jornal: null` cuando no hay valor hora — jamas 0. */
function filaValuada(grid, bloque, t, dentro, { mapa, conCargas, factorCargas }, huecos) {
  const fila = grid.filas[t.fila] || []
  const { colHoras, colValorHora } = columnasDeDinero(fila)
  const vh = colValorHora == null ? null : fila[colValorHora]?.numero
  const valorHoraValido = typeof vh === 'number' && Number.isFinite(vh)
  const { horas, conHoras } = horasEnVentana(fila, dentro, t.fila1, huecos)
  if (colHoras == null) huecos.push({ tipo: HUECO.SIN_COLUMNA_HORAS, fila: t.fila1, persona: t.nombre_original })
  if (!valorHoraValido) huecos.push({ tipo: HUECO.SIN_VALOR_HORA, fila: t.fila1, persona: t.nombre_original })

  const jornal = valorHoraValido ? horas * vh : null
  const r = resolverCliente(t.cliente_original, mapa)
  return {
    ref: t.ref,
    fila: t.fila1,
    bloque: bloque.fila1,
    persona: t.nombre_original,
    personaClave: t.nombre_clave,
    categoria: t.categoria ?? null,
    rotuloCliente: t.cliente_original,
    cliente: r.cliente,
    clase: r.clase,
    motivo: r.motivo ?? null,
    obra: t.obra_original || null,
    // La clave normalizada de la obra existe desde el parser y no se usaba: agrupar por el texto
    // crudo partia "GALPON 9", "GALPON 9 " (el espacio final es real) y "Galpon 9" en tres obras.
    obraClave: t.obra_clave || '',
    horas,
    diasTrabajados: conHoras.length,
    fechasConHoras: conHoras,
    valorHora: valorHoraValido ? vh : null,
    jornal,
    cargas: jornal == null || !conCargas ? null : jornal * factorCargas,
    costo: jornal == null ? null : jornal * (conCargas ? 1 + factorCargas : 1),
  }
}

/**
 * CONTROL DE CUADRE: cada peso del total cae en una clase con nombre, o se declara residuo.
 *
 * Es una funcion aparte y exportada para poder probar que PUEDE dar rojo: un control que no puede
 * decir que no es una constante disfrazada. Con una fila de clase desconocida, `cuadra` da false.
 */
/**
 * NUCLEO PURO: la plata que se PUBLICA, contra la plata que se leyo.
 *
 * POR QUE ASI, Y NO CONTRA LAS CLASES. La primera version sumaba `Object.values(CLASE)` sobre las
 * mismas filas de las que sale `clase`, y `clase` sólo lo produce `resolverCliente()`, que nunca
 * devuelve algo fuera de ese enum: el residuo era CERO POR CONSTRUCCION y `cuadra` una constante
 * `true`. Una auditoría lo demostró reintroduciendo el defecto original —una clase con plata y sin
 * lista— y el control seguía diciendo ✓ con $ 161.200 desaparecidos.
 *
 * Un control nunca se valida contra la misma información que produce. Por eso ahora suma las CINCO
 * LISTAS QUE SALEN EN EL INFORME: si una clase nueva no tiene lista, su plata no aparece en ninguna
 * y el residuo la delata. Es la única forma de que el control pueda decir que no.
 */
export function cuadreDeLoPublicado(jornalTotal, listas) {
  const sumar = (xs, campo) => (xs || []).reduce((a, x) => a + (Number(x?.[campo]) || 0), 0)
  const publicado = {
    porObra: sumar(listas?.porObra, 'jornal'),
    sinObra: sumar(listas?.sinObra, 'jornal'),
    desconocidos: sumar(listas?.desconocidos, 'jornal'),
    sinRotulo: sumar(listas?.sinRotulo, 'jornal'),
    noVerificables: sumar(listas?.noVerificables, 'jornal'),
  }
  const suma = Object.values(publicado).reduce((a, b) => a + b, 0)
  const residuo = (Number(jornalTotal) || 0) - suma
  return {
    total: Number(jornalTotal) || 0,
    publicado,
    residuo,
    // Tolerancia de un centavo: horas por valor hora en punto flotante no cierra al bit.
    cuadra: Math.abs(residuo) < 0.01,
  }
}

/** Agrupa por CLIENTE CANONICO + clave de obra. La clave lleva separador: sin el, cliente "A B" con
 *  obra "C" y cliente "A" con obra "B C" caian en el mismo grupo. El texto que se muestra es el
 *  original de la primera aparicion, que es el que el jefe de obra reconoce. */
function agruparPorObra(filas, conCargas) {
  const porObra = new Map()
  for (const f of filas) {
    if (f.clase !== CLASE.CLIENTE) continue
    const k = `${normalizarClave(f.cliente)}|${f.obraClave}`
    const a = porObra.get(k) ?? {
      clave: k,
      cliente: f.cliente,
      obra: f.obra,
      horas: 0,
      jornal: 0,
      cargas: conCargas ? 0 : null,
      costo: 0,
      personas: new Set(),
      sinValuar: 0,
    }
    a.horas += f.horas
    if (f.jornal == null) a.sinValuar++
    else {
      a.jornal += f.jornal
      if (conCargas) a.cargas += f.cargas
      a.costo += f.costo
    }
    a.personas.add(f.ref)
    porObra.set(k, a)
  }
  return [...porObra.values()]
    .map((a) => ({ ...a, personas: a.personas.size }))
    .sort((x, y) => y.costo - x.costo)
}

/**
 * DOS BLOQUES QUE COMPARTEN FECHAS DUPLICAN LA PLATA, Y NADA LO GRITABA.
 *
 * `diasEnVentana` sumaba las columnas de cada bloque: una ventana de 3 dias con dos bloques que las
 * tienen a las dos daba 6, y el total salia el doble del real. Ahora los dias son los DISTINTOS, y
 * la coincidencia se informa: una fecha en dos bloques, o una persona con horas en dos bloques de
 * la misma ventana, es ambiguedad estructural. No se elige una: se declara.
 *
 * Dos filas con el mismo nombre en el MISMO bloque no se marcan: los homonimos existen en esta
 * planilla y estan resueltos por identidad estructural (bloque + fila), no por nombre.
 */
function solapes(enVentana, filas) {
  const porFecha = new Map()
  for (const { bloque, dentro } of enVentana) {
    for (const f of dentro) {
      if (!porFecha.has(f.iso)) porFecha.set(f.iso, new Set())
      porFecha.get(f.iso).add(bloque.fila1)
    }
  }
  const fechasDuplicadas = [...porFecha.entries()]
    .filter(([, b]) => b.size > 1)
    .map(([iso, b]) => ({ fecha: iso, bloques: [...b].sort((x, y) => x - y) }))

  // Una persona esta repetida cuando tiene horas EL MISMO DIA en dos bloques: eso es la plata
  // contada dos veces. Aparecer en dos quincenas distintas es lo normal y no se marca.
  const porPersona = new Map()
  for (const f of filas) {
    for (const iso of f.fechasConHoras) {
      const k = `${f.personaClave}|${iso}`
      if (!porPersona.has(k)) porPersona.set(k, [])
      porPersona.get(k).push(f)
    }
  }
  const repetidas = new Map()
  for (const [k, fs] of porPersona) {
    if (fs.length < 2) continue
    const persona = k.slice(0, k.lastIndexOf('|'))
    const e = repetidas.get(persona) ?? { persona, fechas: [], bloques: new Set(), filas: new Set() }
    e.fechas.push(k.slice(k.lastIndexOf('|') + 1))
    for (const f of fs) { e.bloques.add(f.bloque); e.filas.add(f.fila) }
    repetidas.set(persona, e)
  }
  const personasRepetidas = [...repetidas.values()]
    .map((e) => ({ persona: e.persona, fechas: e.fechas, bloques: [...e.bloques], filas: [...e.filas] }))

  return { dias: porFecha.size, fechasDuplicadas, personasRepetidas }
}

/** Valua persona por persona los bloques que tocan la ventana. Devuelve las filas, los huecos
 *  declarados y que bloque aporto que fechas — que es lo que despues permite ver los solapes. */
function valuarVentana(grid, { desde, hasta, anio, ...opciones }) {
  const filas = []
  const huecos = []
  const enVentana = []

  // UN BLOQUE TERMINA DONDE EMPIEZA EL SIGUIENTE. Sin este limite, `trabajadoresDeBloque` barre
  // hasta el final de la hoja: la fila del bloque de abajo dice "Obrero" en la columna de nombre y
  // eso NO corta (se saltea como no-trabajador), asi que las personas de la quincena siguiente
  // entraban tambien en la anterior, valuadas con las columnas de fecha de la anterior. Depender de
  // que siempre exista una fila de totales que corte es depender de una costumbre, no de la
  // estructura.
  const bloques = detectarBloques(grid, { anio })
  for (let k = 0; k < bloques.length; k++) {
    const bloque = bloques[k]
    const hastaFila = bloques[k + 1]?.fila ?? (grid.filas?.length ?? 0)
    const dentro = (bloque.fechas || []).filter((f) => f.iso >= desde && f.iso <= hasta)
    if (!dentro.length) continue
    enVentana.push({ bloque, dentro })
    for (const t of trabajadoresDeBloque(grid, bloque, { hastaFila })) {
      filas.push(filaValuada(grid, bloque, t, dentro, opciones, huecos))
    }
  }
  return { filas, huecos, enVentana }
}

/**
 * NUCLEO PURO: el costo de mano de obra de una ventana, abierto por obra.
 *
 * `factorCargas` se aplica SOLO si viene un numero finito mayor o igual a cero. No tiene valor por
 * omision a proposito: un recargo de cargas sociales que aparece por default es exactamente el
 * numero que despues nadie puede rastrear. Sin factor, `cargas` queda en null y el total es el
 * jornal solo.
 */
export function costoPorObra(grid, { desde, hasta, mapa, factorCargas = null, anio = 2026 } = {}) {
  const conCargas = typeof factorCargas === 'number' && Number.isFinite(factorCargas) && factorCargas >= 0
  const { filas, huecos, enVentana } = valuarVentana(grid, { desde, hasta, anio, mapa, conCargas, factorCargas })
  const { dias, fechasDuplicadas, personasRepetidas } = solapes(enVentana, filas)
  const deClase = (clase) => filas.filter((f) => f.clase === clase)
  const listas = {
    porObra: agruparPorObra(filas, conCargas),
    sinObra: deClase(CLASE.NO_ES_CLIENTE).map((f) => ({
      persona: f.persona, rotulo: f.rotuloCliente, motivo: f.motivo, horas: f.horas, jornal: f.jornal, costo: f.costo,
    })),
    desconocidos: deClase(CLASE.DESCONOCIDO).map((f) => ({
      persona: f.persona, rotulo: f.rotuloCliente, fila: f.fila, jornal: f.jornal,
    })),
    // LA LISTA QUE FALTABA. Una fila sin nada escrito en CLIENTE tiene horas, tiene valor hora y
    // tiene plata: sin esta lista esa plata desaparecia del informe sin una sola marca.
    sinRotulo: deClase(CLASE.SIN_ROTULO).map((f) => ({
      persona: f.persona, fila: f.fila, bloque: f.bloque, horas: f.horas, jornal: f.jornal,
    })),
    noVerificables: deClase(CLASE.NO_VERIFICABLE).map((f) => ({
      persona: f.persona, rotulo: f.rotuloCliente, fila: f.fila, jornal: f.jornal,
    })),
  }
  const jornalTotal = filas.reduce((a, f) => a + (f.jornal ?? 0), 0)
  const cuadre = cuadreDeLoPublicado(jornalTotal, listas)

  return {
    ventana: { desde, hasta, diasEnVentana: dias, bloques: enVentana.map((e) => e.bloque.fila1) },
    filas,
    // Las mismas listas que se le pasaron al cuadre: si el informe publicara otra cosa que la
    // que se controló, el control no estaría controlando el informe.
    ...listas,
    fechasDuplicadas,
    personasRepetidas,
    huecos,
    factorCargas: conCargas ? factorCargas : null,
    control: {
      verificable: mapa?.leido === true,
      personas: filas.length,
      celdasIlegibles: huecos.filter((h) => h.tipo === HUECO.CELDA_ILEGIBLE).length,
      personasSinValuar: filas.filter((f) => f.jornal == null).length,
      jornalTotal: cuadre.total,
      // Los cinco subtotales salen de LAS LISTAS PUBLICADAS, no de recorrer las clases otra vez: si
      // salieran de otro lado, el cuadre estaria controlando un numero distinto del que se informa.
      jornalAtribuido: cuadre.publicado.porObra,
      jornalSinObra: cuadre.publicado.sinObra,
      jornalDesconocido: cuadre.publicado.desconocidos,
      jornalSinRotulo: cuadre.publicado.sinRotulo,
      jornalNoVerificable: cuadre.publicado.noVerificables,
      residuo: cuadre.residuo,
      cuadra: cuadre.cuadra,
      // La ventana es consistente cuando ningun dia y ninguna persona se cuenta dos veces. Si es
      // false, los totales de arriba estan inflados y no se pueden presentar como el costo.
      ventanaConsistente: fechasDuplicadas.length === 0 && personasRepetidas.length === 0,
    },
  }
}
