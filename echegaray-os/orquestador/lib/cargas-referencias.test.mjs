// CADA REFERENCIA INTERNA DE «CARGAS SOCIALES» APUNTA A LA FILA QUE DICE APUNTAR.
//
// ═══ POR QUÉ EXISTE (09/09/2026, después de romper la pestaña viva) ═══
//
// Al fusionar dos cuadros y achicar el titular, TODAS las filas de la pestaña se corrieron. Las
// fórmulas se arman con números de fila calculados en la corrida, así que un error acá no da #REF!
// ni error: la fórmula apunta a la fila de al lado y devuelve un número plausible. Medido en el
// archivo vivo el 09/09: «Subtotal F931» publicó $9.982 —sólo el Seguro de Vida— contra $8.717.159,
// porque las cinco alícuotas que multiplican la remuneración leyeron una fila que no era la de la
// remuneración. Eso alimenta CARGAS_MES_F931 y de ahí el Cash Flow: son ~$23 M de cargas proyectadas
// que habrían desaparecido del calendario sin una sola celda en rojo.
//
// Ni los tests que había, ni el `--dry`, ni `auditar-pantalla` lo vieron: todos miran la grilla
// entera o la pestaña escrita, y ninguno preguntaba lo único que importa acá — «esta fórmula, ¿cita
// la fila del rótulo que necesita?».
//
// LO QUE ESTE ARCHIVO SÍ PRUEBA Y LO QUE NO. Prueba que la grilla es COHERENTE CONSIGO MISMA antes
// de escribir. NO prueba que la pestaña escrita quede bien: si la escritura deja la hoja mezclada
// (filas viejas sin pisar), las fórmulas nuevas van a leer datos viejos y esto seguiría verde. Esa
// mitad se verifica escribiendo sobre una COPIA del archivo y mirando el render — no desde acá.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla } from '../scripts/cargas-sociales-pestana.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { ROTULOS_CARGAS } from './libro-extractores-cargas.mjs'

const PERIODOS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
const CONCEPTOS = [
  { codigo: '301', rotulo: 'Aportes de Seguridad Social (301)', corto: 'Aportes de Seguridad Social' },
  { codigo: '302', rotulo: 'Aportes de Obra Social (302)', corto: 'Aportes de Obra Social' },
  { codigo: '351', rotulo: 'Contribuciones de Seguridad Social (351)', corto: 'Contribuciones de Seguridad Social' },
  { codigo: '352', rotulo: 'Contribuciones de Obra Social (352)', corto: 'Contribuciones de Obra Social' },
  { codigo: '312', rotulo: 'L.R.T. — ART (312)', corto: 'L.R.T.' },
  { codigo: '028', rotulo: 'Seguro Colectivo de Vida Obligatorio (028)', corto: 'Seguro Colectivo de Vida Obligatorio' },
]
const PS = [{
  nombre: 'Plan F931 W303094 — financiación de junio 2026', n: 3, pagadas: 0, saldo: 7484627,
  proxima: '2026-09-10', porMes: [0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0, 0],
}]
const C = { total: 'O', cliente: 'J', detalle: 'K', fecha: 'AD', rubro: 'AB', proveedor: 'E', fechaFactura: 'C', estado: 'X' }

const G = grilla({ periodos: PERIODOS, conceptos: CONCEPTOS, ps: PS, C, bloqueBase: { inicio: 559, fin: 573 } })
const rotulo = (fila) => String(G.filas[fila - 1]?.[0] ?? '').replace(VACIO, '')
const filaDe = (re) => G.filas.findIndex((f) => re.test(String(f[0] ?? ''))) + 1
const celda = (fila, col) => String(G.filas[fila - 1]?.[col] ?? '')

/** Los números de fila que una fórmula cita de ESTA pestaña (`$B$17`, `J43`, `I15`). */
function filasCitadas(formula) {
  const f = String(formula ?? '')
  if (!f.startsWith('=')) return []
  // PRIMERO SE VACÍAN LOS TEXTOS. El subtítulo dice «"DDJJ F931 al "» adentro de una fórmula, y
  // «F931» leído como referencia es la celda F931 — una fila que no existe. Un control que se pone
  // rojo por el texto de un rótulo deja de mirarse en dos días.
  const sinTexto = f.replace(/"(?:[^"]|"")*"/g, '""')
  // Y después las referencias a OTRAS pestañas (`Compras!$O$4:$O`, `_F931_RAW!$A$4`): sus números
  // no son filas de acá y contarlos daría rojos falsos.
  const propio = sinTexto.replace(/(?:'[^']+'|[A-Za-zÁÉÍÓÚÑ_][\w.ÁÉÍÓÚÑáéíóúñ]*)!\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?/g, ' ')
  // Y NO todo lo que parece `F931` es una celda: `F931_DIA_DE_PAGO` es un rango con nombre y `DATE(
  // 2026;10;…)` un año. Se exige que después del número no siga letra, guión bajo, dígito ni `(`.
  return [...propio.matchAll(/(?<![A-Za-z0-9_$])\$?([A-Z]{1,2})\$?(\d{1,3})(?![\d(_A-Za-z])/g)].map((m) => Number(m[2]))
}

test('la cadena de la proyección cita las filas de los rótulos que necesita', () => {
  // Es la cadena que publica CARGAS_MES_F931. Cada eslabón multiplica la fila de arriba: si uno cita
  // la fila equivocada, el subtotal sale plausible y equivocado — que es como se pierden $23 M.
  const fRem = filaDe(/^Remuneración declarada$/)
  const fEmp = filaDe(/^Empleados en nómina$/)
  const fRemProy = filaDe(/^Remuneración proyectada$/)
  const fDot = filaDe(/^Dotación proyectada$/)
  assert.ok(fRem && fEmp && fRemProy && fDot, 'falta una de las cuatro filas base de la cadena')

  // 1) La relación declarado/neto se mide sobre la REMUNERACIÓN DECLARADA, no sobre el vecino.
  const rel = celda(filaDe(/^Remuneración declarada ÷ jornales netos$/), 9)
  assert.ok(filasCitadas(rel).includes(fRem),
    `la relación cita ${filasCitadas(rel)} y «Remuneración declarada» está en la ${fRem}`)

  // 2) Cada concepto proyectado divide por la remuneración (o por la dotación, si es por persona) y
  //    multiplica la proyección correspondiente. Se comprueba POR RÓTULO, fila por fila.
  const porBase = [
    ['Aportes Seguridad Social', fRem, fRemProy],
    ['Aportes Obra Social', fRem, fRemProy],
    ['Contribuciones Seguridad Social', fRem, fRemProy],
    ['Contribuciones Obra Social', fRem, fRemProy],
    ['L.R.T. — ART', fRem, fRemProy],
    ['Seguro de Vida Obligatorio', fEmp, fDot],
  ]
  for (const [rot, base, proy] of porBase) {
    const f = filaDe(new RegExp(`^${rot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    assert.ok(f, `desapareció la fila «${rot}» de la proyección`)
    const cita = filasCitadas(celda(f, 9))
    assert.ok(cita.includes(base), `«${rot}» mide su alícuota sobre la fila ${cita} y su base está en la ${base} («${rotulo(base)}»)`)
    assert.ok(cita.includes(proy), `«${rot}» multiplica la fila ${cita} y debería multiplicar la ${proy} («${rotulo(proy)}»)`)
  }
})

test('los subtotales suman EXACTAMENTE sus conceptos, ni una fila más', () => {
  // Un SUM que se coma la fila del subtotal de arriba, o el rótulo de una sección, duplica o suma
  // basura sin dar error. Se comprueba contra los rótulos de las filas que quedan adentro del rango.
  const sub = (rot, esperados) => {
    const f = filaDe(new RegExp(`^${rot}`))
    const m = String(celda(f, 9)).match(/^=SUM\([A-Z]+(\d+):[A-Z]+(\d+)\)$/)
    assert.ok(m, `«${rotulo(f)}» dejó de ser un SUM sobre un rango cerrado: ${celda(f, 9)}`)
    const dentro = []
    for (let r = Number(m[1]); r <= Number(m[2]); r++) dentro.push(rotulo(r))
    assert.deepEqual(dentro, esperados)
  }
  sub(ROTULOS_CARGAS.f931, ['Aportes Seguridad Social', 'Aportes Obra Social', 'Contribuciones Seguridad Social',
    'Contribuciones Obra Social', 'L.R.T. — ART', 'Seguro de Vida Obligatorio'])
  sub(ROTULOS_CARGAS.gremiales, ['FCL', 'UOCRA', 'IERIC', 'FODECO'])
})

test('las filas de caja citan el devengado y las cuotas, no la fila de al lado', () => {
  const fProyTot = filaDe(/^⇒ Total devengado en el mes$/)
  const fCuotas = filaDe(/^⇒ Total de cuotas del año$/)
  // «Cargas que salen en el mes» es el devengado del mes ANTERIOR. El PRIMER mes proyectado es la
  // excepción y tiene que serlo: su mes anterior TIENE DDJJ, así que cita el «Total declarado» —el
  // hecho— y no la proyección. Los demás citan el total devengado.
  const fDeclTot = filaDe(new RegExp(`^${ROTULOS_CARGAS.declarado}`))
  const salen = filaDe(/^Cargas que salen en el mes$/)
  assert.deepEqual([...new Set(filasCitadas(celda(salen, 9)))], [fDeclTot],
    `el primer mes proyectado tiene que citar el declarado (fila ${fDeclTot}) y cita ${filasCitadas(celda(salen, 9))}`)
  assert.deepEqual([...new Set(filasCitadas(celda(salen, 10)))], [fProyTot],
    `los meses siguientes citan el devengado (fila ${fProyTot}) y citan ${filasCitadas(celda(salen, 10))}`)
  // Y las cuotas que vencen citan el total del cuadro 4, no un número recalculado por afuera.
  const vencen = celda(filaDe(/^Cuotas de planes de pago que vencen$/), 9)
  assert.equal(filasCitadas(vencen).join(), String(fCuotas), `«cuotas que vencen» cita ${filasCitadas(vencen)} y el total está en la ${fCuotas}`)
})

test('el titular cita el total pagado, y el «Total declarado» proyectado cita el subtotal F931', () => {
  const fPagTot = filaDe(/^⇒ Total pagado$/)
  const pagado = celda(filaDe(/^⇒ Cargas sociales pagadas en el año$/), 1)
  assert.deepEqual([...new Set(filasCitadas(pagado))], [fPagTot], `el titular cita ${filasCitadas(pagado)} y el total pagado está en la ${fPagTot}`)
  const fSub = filaDe(new RegExp(`^${ROTULOS_CARGAS.f931}`))
  const decl = celda(filaDe(new RegExp(`^${ROTULOS_CARGAS.declarado}`)), 9)
  assert.deepEqual([...new Set(filasCitadas(decl))], [fSub], `el proyectado del declarado cita ${filasCitadas(decl)} y el subtotal F931 está en la ${fSub}`)
})

test('NINGUNA fórmula de la pestaña cita una fila fuera de la grilla', () => {
  // Una referencia a una fila que la grilla no escribe lee lo que haya quedado ahí de la versión
  // anterior de la pestaña — y eso no da error: da un número viejo.
  const fuera = []
  G.filas.forEach((f, i) => (f || []).forEach((c, j) => {
    for (const r of filasCitadas(c)) {
      if (r < 1 || r > G.filas.length) fuera.push(`fila ${i + 1} col ${j}: cita la ${r} y la grilla tiene ${G.filas.length}`)
    }
  }))
  assert.deepEqual(fuera, [], fuera.join('\n'))
})

test('cada fila declarada al FORMATO es la que su declaración dice ser', () => {
  // El otro modo de romper la pestaña al mover filas: el formato se aplica por número de fila, así
  // que una declaración corrida pinta de fecha una fila de importes y de importes una de fechas.
  // Medido el 09/09 en el archivo vivo: un plan de pago mostrando «17/07/4733» y la fila de fechas
  // mostrando «$46.063».
  assert.equal(rotulo(G.titular), '⇒ Cargas sociales pagadas en el año')
  assert.deepEqual(G.fechas.map(rotulo), [ROTULOS_CARGAS.fechas])
  assert.deepEqual(G.cantidades.map(rotulo), ['Empleados en nómina', 'Dotación proyectada',
    '   ·    control: plantel de la última quincena'])
  assert.deepEqual(G.ratios.map(rotulo), ['Remuneración declarada ÷ jornales netos', '   ·    en su primer año de antigüedad'])
  assert.deepEqual(G.controles.map(rotulo), ['⇒ Diferencia — tiene que ser $0'])
  assert.deepEqual(G.proyectadas.map((p) => rotulo(p.fila)), [ROTULOS_CARGAS.declarado])
  assert.deepEqual(G.celdasFecha.map((c) => rotulo(c.fila)), ['⇒ Próximo vencimiento'])
  for (const [a, b] of G.moneda) for (let r = a; r <= b; r++) {
    assert.match(rotulo(r), /Plan F931|Deuda previsional F931/, `la fila ${r} («${rotulo(r)}») no es una cuota de plan`)
  }
})
