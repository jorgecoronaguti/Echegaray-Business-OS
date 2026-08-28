// LA PLANILLA COMO PLANILLA — celdas en error, fórmulas que apuntan a una celda rota, y renglones
// que no multiplican.
//
// ═══ QUÉ MIRA ACÁ QUE NO MIRABA NINGUNA OTRA REGLA ═══
//
// `hallazgos-cotizacion.mjs` mira la plantilla de ECSAS: el cierre de la oferta, el rótulo de GG, la
// columna COEF. AJUSTE. Eso deja afuera el 90 % del libro. Una `#REF!` en la hoja Análisis no rompe
// ninguna de esas reglas y sin embargo se propaga: el costo de la partida sale mal, el presupuesto
// la suma igual, y la oferta cierra con un número que nadie puede reconstruir.
//
// ═══ UN 0 NO ES UN ERROR Y UN NULL NO ES UN 0 ═══
//
// `renglonesIncoherentes` sólo compara cuando los TRES operandos son números finitos. Una cantidad
// vacía no vale 0: vale «no se sabe», y un control que la lea como 0 denuncia como incoherente todo
// renglón sin cantidad. Los renglones que no se pudieron comparar NO desaparecen — salen contados
// en `coberturaDeRenglones()`, porque un renglón que no se miró no es un renglón sin defecto.
import { refCelda } from './cotizacion-ecsas.mjs'
import { esErrorDeCelda, textoDelError } from './celda.mjs'
import { GRAVEDAD, TIPO, hallazgo, toleranciaDe } from './hallazgo.mjs'

/** Cuántas celdas rotas se citan antes de pasar a contarlas. Una planilla con 400 `#REF!` produce
 *  un hallazgo ilegible si se listan todas, y el dato que decide es CUÁNTAS y EN QUÉ HOJA. */
export const MAX_CITAS = 8

/** Las hojas que ve el cliente. Una celda rota acá es de gravedad ALTA aunque sea una sola: está en
 *  el documento que se manda por mail. */
export const HOJAS_QUE_VE_EL_CLIENTE = Object.freeze(['OFERTA'])

/**
 * TODAS LAS CELDAS EN ERROR DE UNA PLANILLA LEÍDA, POR HOJA. PURA.
 *
 * Entra el `hojas` que devuelve `leerPlanilla` —arrays de arrays donde una celda en error viaja
 * envuelta y nunca como su valor cacheado— y sale sólo lo que está roto. Se guarda esto y no las
 * hojas enteras: el inventario de errores de un libro de 3,5 MB son unas decenas de renglones.
 */
export function celdasRotasDe(hojas = {}) {
  const salida = {}
  for (const [nombre, filas] of Object.entries(hojas)) {
    const rotas = []
    for (let f = 0; f < filas.length; f++) {
      const fila = filas[f] ?? []
      for (let c = 0; c < fila.length; c++) {
        if (!esErrorDeCelda(fila[c])) continue
        rotas.push({ celda: refCelda(c, f), texto: textoDelError(fila[c]) })
      }
    }
    if (rotas.length) salida[nombre] = rotas
  }
  return salida
}

/** ¿Esta cotización trae el inventario de celdas rotas? Sin él el control NO MIRÓ, que no es lo
 *  mismo que «no encontró». PURA. */
export const tieneInventarioDeCeldas = (c) => Boolean(c?.celdasRotas) && typeof c.celdasRotas === 'object'

const cuentaPorTexto = (rotas) => {
  const por = {}
  for (const r of rotas) por[r.texto] = (por[r.texto] ?? 0) + 1
  return Object.entries(por).sort((a, b) => b[1] - a[1])
}

/**
 * CELDAS EN ERROR EN CUALQUIER HOJA — `#REF!`, `#N/A`, `#NAME?`, `#DIV/0!`, `#VALUE!`, `#NUM!`.
 *
 * Va UN hallazgo por cotización con el inventario adentro, y no uno por celda: una planilla con 300
 * celdas rotas produciría 300 renglones de gravedad media que tapan los dos de gravedad alta, y lo
 * que hay que ver es la planilla, no cada celda.
 */
export function celdasEnError(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    if (!tieneInventarioDeCeldas(c)) continue
    const hojas = Object.entries(c.celdasRotas).filter(([, r]) => r.length)
    if (!hojas.length) continue
    const total = hojas.reduce((a, [, r]) => a + r.length, 0)
    const alCliente = hojas.filter(([h]) => HOJAS_QUE_VE_EL_CLIENTE.includes(h))
    const todas = hojas.flatMap(([h, r]) => r.map((x) => ({ ...x, hoja: h })))
    salida.push(hallazgo({
      tipo: TIPO.CELDA_EN_ERROR,
      gravedad: alCliente.length ? GRAVEDAD.ALTA : GRAVEDAD.MEDIA,
      clave: `${c.id}.celdas_en_error`,
      afirmacion: `«${c.obra}» tiene ${total} celda(s) en error de fórmula repartidas en ${hojas.length} hoja(s) (${cuentaPorTexto(todas).map(([t, n]) => `${t}: ${n}`).join(', ')})`,
      evidencia: todas.slice(0, MAX_CITAS).map((x) => ({ cita: `${x.celda} = ${x.texto}`, ubicacion: `${c.nombre} · hoja ${x.hoja} · ${x.celda}` })),
      porQue: alCliente.length
        ? `${alCliente.reduce((a, [, r]) => a + r.length, 0)} de esas celdas están en la hoja que ve el cliente`
        : 'una celda rota no se queda quieta: todo lo que la sume o la multiplique arrastra el error, y el número final se sigue viendo como un número',
    }))
  }
  return salida
}

/** Hasta dónde llega una columna y una fila reales de Excel. Sirve para no leer `LOG10` como si
 *  fuera la celda LOG10 de una hoja. */
const MAX_COLUMNA = 16384
const MAX_FILA = 1048576

/** Una referencia de celda o de rango dentro del texto de una fórmula, con su hoja si la nombra. */
const REFERENCIA = /(?:(?:'([^']+)'|([A-Za-zÀ-ÿ0-9_.]+))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g

const columnaANumero = (letras) => [...letras].reduce((a, l) => a * 26 + (l.charCodeAt(0) - 64), 0)

/** Las referencias que menciona una fórmula, ya normalizadas a rangos. PURA. */
export function referenciasDe(formula, { hojaPropia = null } = {}) {
  const texto = String(formula ?? '')
  const salida = []
  REFERENCIA.lastIndex = 0
  let m = REFERENCIA.exec(texto)
  while (m) {
    const antes = texto[m.index - 1]
    const despues = texto[m.index + m[0].length]
    // `SUM(` y `LOG10(` matchean como si fueran celdas. Una referencia nunca lleva un paréntesis
    // pegado atrás, y nunca arranca pegada a otra letra o a otro dígito.
    const esFuncion = despues === '('
    const pegada = antes && /[A-Za-z0-9_$]/.test(antes)
    const c1 = columnaANumero(m[3])
    const f1 = Number(m[4])
    if (!esFuncion && !pegada && c1 <= MAX_COLUMNA && f1 <= MAX_FILA) {
      const c2 = m[5] ? columnaANumero(m[5]) : c1
      const f2 = m[6] ? Number(m[6]) : f1
      salida.push({
        hoja: m[1] ?? m[2] ?? hojaPropia,
        desde: { columna: Math.min(c1, c2), fila: Math.min(f1, f2) },
        hasta: { columna: Math.max(c1, c2), fila: Math.max(f1, f2) },
      })
    }
    m = REFERENCIA.exec(texto)
  }
  return salida
}

const dentroDe = (ref, celda) => {
  const m = /^([A-Z]{1,3})(\d+)$/.exec(celda)
  if (!m) return false
  const c = columnaANumero(m[1])
  const f = Number(m[2])
  return c >= ref.desde.columna && c <= ref.hasta.columna && f >= ref.desde.fila && f <= ref.hasta.fila
}

/**
 * LA FÓRMULA QUE DEPENDE DE UNA CELDA ROTA.
 *
 * Es el mecanismo por el que un `#REF!` en una hoja perdida termina en el precio: la fórmula que lo
 * referencia devuelve el mismo error, la de arriba también, y el error viaja hasta el cierre. El
 * hallazgo apunta a la fórmula, no a la celda rota, porque la fórmula es el eslabón que propaga.
 */
export function formulasSobreCeldaRota(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    if (!tieneInventarioDeCeldas(c) || !c.formulas) continue
    const rotasPorHoja = c.celdasRotas
    const afectadas = []
    for (const [hoja, formulas] of Object.entries(c.formulas)) {
      for (const [celda, formula] of Object.entries(formulas ?? {})) {
        // Una celda rota cuya PROPIA fórmula la rompe ya sale en `celdasEnError`. Lo que se busca
        // acá es la sana que se apoya en una rota: esa todavía muestra un número.
        if ((rotasPorHoja[hoja] ?? []).some((r) => r.celda === celda)) continue
        for (const ref of referenciasDe(formula, { hojaPropia: hoja })) {
          const rota = (rotasPorHoja[ref.hoja] ?? []).find((r) => dentroDe(ref, r.celda))
          if (!rota) continue
          afectadas.push({ hoja, celda, formula, apuntaA: `${ref.hoja}!${rota.celda}`, texto: rota.texto })
          break
        }
      }
    }
    if (!afectadas.length) continue
    salida.push(hallazgo({
      tipo: TIPO.FORMULA_SOBRE_CELDA_ROTA,
      gravedad: afectadas.some((a) => HOJAS_QUE_VE_EL_CLIENTE.includes(a.hoja)) ? GRAVEDAD.ALTA : GRAVEDAD.MEDIA,
      clave: `${c.id}.formulas_sobre_celda_rota`,
      afirmacion: `en «${c.obra}» ${afectadas.length} fórmula(s) se apoyan en una celda que está en error: el error se propaga a todo lo que las use`,
      evidencia: afectadas.slice(0, MAX_CITAS).map((a) => ({
        cita: `${a.celda} = ${a.formula} → apunta a ${a.apuntaA} que vale ${a.texto}`,
        ubicacion: `${c.nombre} · hoja ${a.hoja} · ${a.celda}`,
      })),
      porQue: 'la celda rota se ve; la fórmula que la usa muestra un número hasta que Excel recalcula, y ese número es el que entra al precio',
    }))
  }
  return salida
}

/** Los tres números de un renglón, y de dónde salen. `esperado` es lo que la multiplicación da. */
const RENGLONES = Object.freeze([
  {
    hoja: 'OFERTA', gravedad: GRAVEDAD.ALTA, de: (c) => (c.oferta?.ok ? c.oferta.items : null),
    operandos: (i) => [i.cantidad, i.precioUnitario], declarado: (i) => i.subtotal,
    nombre: (i) => i.tarea, comoSeArma: 'CANT × PRECIO UNITARIO',
  },
  {
    hoja: 'Presupuesto', gravedad: GRAVEDAD.MEDIA, de: (c) => (c.presupuesto?.ok ? c.presupuesto.items : null),
    operandos: (i) => [i.cantidad, i.costoUnitario, i.coeficienteAjuste], declarado: (i) => i.subtotal,
    nombre: (i) => `${i.codigo ?? 's/código'} «${i.tarea}»`, comoSeArma: 'CANT × COSTO U TOTAL × COEF. AJUSTE',
  },
])

const finitos = (xs) => xs.every((x) => typeof x === 'number' && Number.isFinite(x))

/**
 * EL RENGLÓN QUE NO MULTIPLICA — precio, cantidad y coeficiente que no dan el subtotal que declara.
 *
 * No usa `!==`: sobre decenas de millones el propio Excel deja diferencias de coma flotante, y un
 * control que las denuncie produce ruido con forma de auditoría. `toleranciaDe` pone el piso en un
 * peso y arriba de eso es relativo.
 */
export function renglonesIncoherentes(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    for (const r of RENGLONES) {
      const items = r.de(c)
      if (!items?.length) continue
      const malos = []
      for (const i of items) {
        const ops = r.operandos(i)
        const dec = r.declarado(i)
        if (!finitos([...ops, dec])) continue
        const esperado = ops.reduce((a, x) => a * x, 1)
        if (Math.abs(dec - esperado) <= toleranciaDe(esperado)) continue
        malos.push({ i, esperado, dec })
      }
      if (!malos.length) continue
      salida.push(hallazgo({
        tipo: TIPO.RENGLON_INCOHERENTE, gravedad: r.gravedad,
        clave: `${c.id}.${r.hoja.toLowerCase()}.renglones_incoherentes`,
        afirmacion: `en «${c.obra}» ${malos.length} renglón(es) de la hoja ${r.hoja} declaran un subtotal que no es ${r.comoSeArma}`,
        monto: malos.reduce((a, m) => a + Math.abs(m.dec - m.esperado), 0),
        evidencia: malos.slice(0, MAX_CITAS).map((m) => ({
          cita: `${r.nombre(m.i)}: declara ${m.dec} y ${r.comoSeArma} da ${m.esperado}`,
          ubicacion: `${c.nombre} · hoja ${r.hoja} · fila ${m.i.fila + 1}`,
        })),
        porQue: 'o el subtotal está tipeado encima de la fórmula, o alguno de los tres números se cambió después: en los dos casos el renglón dejó de ser reconstruible',
      }))
    }
  }
  return salida
}

/**
 * CUÁNTOS RENGLONES SE PUDIERON MIRAR Y CUÁNTOS NO. PURA.
 *
 * Es el control inverso, y sin él «0 renglones incoherentes» no significa nada: puede ser que
 * estén todos bien o que ninguno tuviera los tres números. Un renglón sin cantidad no es un
 * renglón sano — es un renglón que este control NO PUDO MIRAR, y así sale declarado.
 *
 * ═══ POR QUÉ EL CONTEO VIENE TAMBIÉN POR HOJA ═══
 *
 * El total no alcanza para decidir si el control corrió: 40 renglones mirados en Presupuesto y 0 en
 * OFERTA dan `mirados: 40` y esconden que la hoja que ve el cliente quedó sin mirar. `porHoja` es lo
 * que consume la cobertura de `renglon-que-no-multiplica` en `controles-cotizacion.mjs`.
 */
export function coberturaDeRenglones(cotizaciones = []) {
  let mirados = 0
  let salteados = 0
  const motivos = {}
  const porHoja = Object.fromEntries(RENGLONES.map((r) => [r.hoja, { mirados: 0, salteados: 0 }]))
  for (const c of cotizaciones) {
    for (const r of RENGLONES) {
      const items = r.de(c)
      if (!items) { motivos[`${r.hoja}: la hoja no se pudo leer`] = (motivos[`${r.hoja}: la hoja no se pudo leer`] ?? 0) + 1; continue }
      for (const i of items) {
        if (finitos([...r.operandos(i), r.declarado(i)])) { mirados += 1; porHoja[r.hoja].mirados += 1; continue }
        salteados += 1
        porHoja[r.hoja].salteados += 1
        const k = `${r.hoja}: al renglón le falta alguno de los números de ${r.comoSeArma} o el subtotal`
        motivos[k] = (motivos[k] ?? 0) + 1
      }
    }
  }
  return { mirados, salteados, motivos, porHoja }
}
