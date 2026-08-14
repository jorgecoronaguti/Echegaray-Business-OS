// CÓMO SE PAGA LA QUINCENA: LA INSTRUCCIÓN DE PAGO, PERSONA POR PERSONA.
//
// ═══ POR QUÉ EXISTE (14/08, cuarta vez que el dueño pide lo mismo) ═══
//
// *"HOY QUIERO CERRAR LA QUINCENA Y NO SE EXACTAMENTE CUANTO TENGO Q PAGAR A LOS OBREROS POR BANCO Y
// CUANTO POR EFECTIVO"* y, después: *"te he dicho q el acuerdo es 50 y 50 todas las quincenas y asi y
// todo no se entiende nada"*.
//
// La pestaña medía el canal REAL del histórico (15,8% por banco) y publicaba la brecha contra el
// acuerdo: "faltan $39.335.228 por banco · 8 de 14 quincenas con banco en $0". Eso es una AUDITORÍA DE
// INCUMPLIMIENTO, y el dueño no está auditando: está pagando. El 50/50 no es una métrica a comparar,
// es LA REGLA DE PAGO — se calcula, se publica y se opera.
//
// ═══ LA IDENTIDAD QUE TIENE QUE CERRAR ═══
//
// Es la del payroll register estándar (bruto → deducciones → neto), con el split de pago DESPUÉS del
// neto y nunca mezclado con la liquidación:
//
//     TOTAL − ADELANTO ENTREGADO = NETO A PAGAR
//     POR BANCO   + EN EFECTIVO  = NETO A PAGAR
//
// El adelanto ya salió del cajón durante la quincena: es plata entregada, no una deducción contable.
// Por eso baja el EFECTIVO y no el banco — el 50% bancarizado se transfiere entero igual.
//
// ═══ EL EFECTIVO NEGATIVO NO SE CLAVA EN CERO ═══
//
// Medido en la quincena 03/08→15/08: Tello Juan adelantó $240.000 contra un 50% de $236.500. Su
// efectivo da −$3.500 y TIENE que verse: es plata que la empresa le adelantó de más y que se
// compensa en la quincena que viene. Un `MAX(0;…)` la haría desaparecer del cuadro y del sobre, y el
// total de billetes a juntar quedaría $3.500 arriba de lo que hay que entregar.

/**
 * EL ACUERDO DEL DUEÑO, DECLARADO UNA SOLA VEZ.
 *
 * No es un supuesto de proyección ni un promedio medido: es la política de pago que él fijó y repitió
 * cuatro veces. Vive acá —y no adentro de una fórmula— para que el día que cambie, cambie en un lugar.
 */
export const ACUERDO_BANCO = 0.5

/**
 * LAS COLUMNAS DEL ESPEJO `_J_OBREROS`, DECLARADAS UNA SOLA VEZ.
 *
 * Verificadas el 14/08 sobre `'_J_OBREROS'!B497:AB511`. Escribir "X" adentro de una fórmula y "la
 * columna de banco" en un comentario es cómo se llega a que las dos digan cosas distintas: es el mismo
 * defecto que `colDe` resuelve del lado de la pestaña.
 */
export const COL_ESPEJO = {
  nombre: 'B', horas: 'V', hora: 'W', banco: 'X', adelanto: 'Y', recibo: 'Z', total: 'AA',
}

/**
 * NÚCLEO PURO: el reparto de UNA persona.
 *
 * `banco` es lo que la planilla tiene CARGADO en su columna BANCO. Cuando está en cero nadie lo cargó
 * —hoy es el caso de toda la quincena— y el 50% se calcula; cuando tiene plata, ese dato manda. La
 * bandera `bancoCalculado` es lo que deja que la pestaña lo DIGA en vez de publicar un cálculo como si
 * fuera un dato real.
 *
 * @param {{total?:number, adelanto?:number, banco?:number}} p
 * @returns {{total:number, adelanto:number, neto:number, banco:number, efectivo:number, bancoCalculado:boolean}}
 */
export function repartoPersona({ total = 0, adelanto = 0, banco = 0 } = {}) {
  const t = Number(total) || 0
  const a = Number(adelanto) || 0
  const cargado = Number(banco) || 0
  const bancoCalculado = !(cargado > 0)
  const b = bancoCalculado ? t * ACUERDO_BANCO : cargado
  const neto = t - a
  // SIN `MAX(0; …)`: un efectivo negativo es un adelanto de más y es información, no un error a tapar.
  return { total: t, adelanto: a, neto, banco: b, efectivo: neto - b, bancoCalculado }
}

/**
 * NÚCLEO PURO: el reparto de la quincena entera, con lo que hay que declarar al lado.
 *
 * Devuelve los tres números que el dueño opera (transferencia, billetes, adelantado) y las dos cosas
 * que condicionan su lectura: cuántas líneas llevan el 50% calculado porque BANCO está sin cargar, y
 * cuántas personas quedaron con efectivo negativo.
 *
 * @param {Array<{total?:number, adelanto?:number, banco?:number}>} personas
 */
export function repartoQuincena(personas = []) {
  const filas = (personas ?? []).map(repartoPersona)
  const suma = (k) => filas.reduce((a, f) => a + f[k], 0)
  return {
    personas: filas.length,
    total: suma('total'),
    adelanto: suma('adelanto'),
    neto: suma('neto'),
    banco: suma('banco'),
    efectivo: suma('efectivo'),
    calculadas: filas.filter((f) => f.bancoCalculado).length,
    negativos: filas.filter((f) => f.efectivo < 0).length,
    filas,
  }
}

/**
 * NÚCLEO PURO: las filas del espejo que son PERSONAS dentro de un bloque de quincena.
 *
 * Un bloque tiene filas numeradas que no son gente: la fila de totales, alguna intermedia con importes
 * y sin nombre. El criterio es el mismo que `personasDelBloque` usa para contarlas —hay nombre en la
 * columna B— y tiene que ser el mismo, o el cuadro publicaría más renglones que personas cuenta el
 * registro de abajo.
 *
 * @param {any[][]} grid   el espejo completo, tal como lo devuelve readSheetValues
 * @param {{inicio:number, fin:number}} bloque filas 1-based
 * @returns {number[]} las filas 1-based del espejo que tienen una persona
 */
export function filasDePersonas(grid = [], bloque) {
  if (!bloque) return []
  const out = []
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    if (String((grid[r - 1] ?? [])[1] ?? '').trim()) out.push(r)
  }
  return out
}

/**
 * NÚCLEO PURO: la fila de fórmulas de una persona en el cuadro de pago.
 *
 * Todo sale del espejo por referencia y nada se copia: el día que la planilla corrija una hora, la
 * pestaña se corrige sola. Las dos únicas celdas que no citan al espejo son las dos que cierran la
 * identidad —el neto y el efectivo—, y se escriben como RESTAS de la propia fila para que el cuadro se
 * pueda auditar leyéndolo.
 *
 * `D${f}/2` y no `0,5*D${f}`: un literal decimal escrito por API viaja en el locale del archivo
 * (es_AR, coma decimal) y ahí se convierte en un #ERROR que no hace falta correr para producir.
 *
 * @param {{hoja:string, filaEspejo:number, fila:number}} p
 * @returns {string[]} las ocho celdas, en el orden de COLS_PAGO
 */
export function filaPagoPersona({ hoja = '_J_OBREROS', filaEspejo, fila }) {
  const E = `'${hoja}'!`
  const c = (k) => `${E}${COL_ESPEJO[k]}${filaEspejo}`
  return [
    `=${c('nombre')}`,
    `=${c('horas')}`,
    `=${c('hora')}`,
    `=${c('total')}`,
    `=${c('adelanto')}`,
    `=D${fila}-E${fila}`,
    // EL DATO CARGADO LE GANA AL CÁLCULO. Mientras BANCO esté en cero manda el acuerdo; en cuanto
    // alguien cargue la transferencia real de esa persona, la celda pasa a publicar el hecho.
    `=IF(N(${c('banco')})>0;${c('banco')};D${fila}/2)`,
    `=F${fila}-G${fila}`,
  ]
}

/**
 * NÚCLEO PURO: el aviso de que el 50/50 lo está calculando la pestaña.
 *
 * NO ES UNA ALERTA DE INCUMPLIMIENTO — eso es exactamente lo que el dueño rechazó. Es trazabilidad: de
 * dónde sale el número que está leyendo. Y se apaga solo el día que la planilla cargue el canal.
 */
export function avisoBancoCalculado({ hoja = '_J_OBREROS', r0, r1 }) {
  const rg = (k) => `'${hoja}'!${COL_ESPEJO[k]}${r0}:${COL_ESPEJO[k]}${r1}`
  const cargadas = `SUMPRODUCT(--(N(${rg('banco')})>0))`
  const conTotal = `SUMPRODUCT(--(N(${rg('total')})>0))`
  return `=IF(${conTotal}=0;"";IF(${cargadas}=0;"⊘ 50/50 calculado — BANCO sin cargar";`
    + `IF(${cargadas}>=${conTotal};"";"⊘ 50/50 calculado en "&(${conTotal}-${cargadas})&" de "&${conTotal})))`
}

/**
 * NÚCLEO PURO: el aviso de que faltan horas por cargar, atado al ESTADO de la quincena.
 *
 * Las dos condiciones son necesarias. Sólo con «horas reales < previstas» el aviso quedaría encendido
 * para siempre en una quincena cerrada con ausentismo, diciendo "el total va a subir" cuando ya no
 * sube. Sólo con «en curso» avisaría incluso con las horas completas. Juntas, el aviso se apaga solo
 * por cualquiera de los dos caminos: se termina de cargar, o la quincena cierra.
 *
 * @param {{fila:number, previstas:string, reales:string, estado:string}} p letras del registro
 */
export function avisoHorasIncompletas({ fila, previstas, reales, estado }) {
  return `=IF($${estado}$${fila}<>"en curso";"";IF(N($${reales}$${fila})>=N($${previstas}$${fila});"";`
    + `"▲ Horas "&TEXT($${reales}$${fila};"#,##0")&" de "&TEXT($${previstas}$${fila};"#,##0")&" — el total sube"))`
}

/**
 * NÚCLEO PURO: el aviso de que alguien adelantó más que su mitad y quedó en negativo.
 *
 * SE MIDE SOBRE EL ESPEJO, NO SOBRE LA PESTAÑA. El cuadro de pago publica tres filas —una por
 * nómina— y ahí el negativo de una persona se compensa con el positivo de otra y desaparece. La
 * pregunta es por persona aunque el cuadro no las liste, así que la cuenta va contra la planilla.
 */
export function avisoEfectivoNegativo({ hoja = '_J_OBREROS', r0, r1 } = {}) {
  if (!r0 || !r1) return ''
  const rango = (c) => `N('${hoja}'!$${c}$${r0}:$${c}$${r1})`
  const total = rango(COL_ESPEJO.total)
  // Con banco cargado el reparto es el dato, no el acuerdo: ahí el negativo no puede existir por esta
  // vía. Por eso la condición sólo cuenta a quien todavía se reparte por el 50%.
  // `/2`, no `*0,5`: el literal decimal viaja en locale es_AR y ahí la coma separa argumentos.
  const n = `SUMPRODUCT((${rango(COL_ESPEJO.adelanto)}>${total}/2)`
    + `*(${total}>0)*(${rango(COL_ESPEJO.banco)}=0))`
  return `=IF(${n}=0;"";"▲ "&${n}&" con adelanto mayor a su 50% — efectivo negativo")`
}
