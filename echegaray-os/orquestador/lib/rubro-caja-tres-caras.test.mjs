// LAS TRES CARAS DE LA REGLA, COMPARADAS SOBRE LAS MISMAS FILAS.
//
// La regla que dice qué es cada gasto está escrita tres veces —JS, fórmula del Sheet, SQL del
// núcleo— y hasta hoy nada verificaba que dieran lo MISMO. Los tests que había comparaban texto:
// que el rubro apareciera en la fórmula, que el archivo de la migración coincidiera con su
// generador. Las dos cosas pueden estar perfectas con las tres caras diciendo cosas distintas.
//
// QUÉ SE ROMPE CUANDO SE DESINCRONIZAN. La cara JS la usan el Libro y los cuadros del OS; la del
// Sheet escribe la columna AC de Compras, de la que cuelga TODO el cash flow; la SQL es la que ven
// la web y el chat. Una fila que el JS llama "Servicios recurrentes" y el Sheet llama "Materiales
// Civil" no da ningún error: da dos verdades sobre la misma plata, que es el defecto que este
// repositorio ya pagó varias veces.
//
// EL CASO QUE LO PIDIÓ (07/08/2026). El dueño: "no noto q se hayan actualizado las pestañas de
// recurrentes y ahi mismo agregar a mass consultora q se pago aca comprobante". Agregarla obligó a
// escribir una excepción —recurrente AUNQUE la fila diga una unidad de obra— en las tres gramáticas,
// cada una con su forma de negar y su precedencia. Ahí es donde se cuela el paréntesis.
import test from 'node:test'
import assert from 'node:assert/strict'
import { REGLAS, SIN_CLASIFICAR, rubroDeCaja } from './rubro-caja.mjs'
import { rubroSegun } from './regla-tres-caras.mjs'

// Los valores REALES de la planilla: proveedores de Compras, las seis unidades de negocio, los
// clientes que existen y los conceptos que ya decidieron un rubro alguna vez.
const PROVEEDORES = ['', 'SAC', 'ARCA', 'Sueldos', 'UOCRA', 'FCL', 'IERIC', 'FODECO', 'Sindicatos', 'Banco',
  'Movistar', 'RSV', 'MASS CONSULTORA', 'Robles Jose Maria', 'Sanitarios OD S.A.S.', 'Ruviño Matias Esteban',
  'Meglioli Facundo Fabian', 'Corralon Progreso', 'Alumetal']
const UNIDADES = ['', 'Civil', 'CIVIL', 'Mantenimiento', 'Estructura', 'Impuestos', 'Financiero']
const CLIENTES = ['', 'Administracion', 'La Estrella', 'San Francisco', 'F931', 'Plan de pago', 'IERIC',
  'Credito prendario', 'Arcor', 'Imotor']
const CONCEPTOS = ['', 'TELEFONIA', 'Higiene y Seguridad', 'Deuda Previcional - 931 Dic 25', 'IVA junio',
  'JUNIO Financiación - Cuota 1 1° Venc — Plan F931 W303094', 'Acciones y Participaciones']

function* casos() {
  for (const proveedor of PROVEEDORES) {
    for (const unidad of UNIDADES) {
      for (const cliente of CLIENTES) {
        for (const concepto of CONCEPTOS) yield { proveedor, unidad, cliente, concepto }
      }
    }
  }
}

const rubros = (f) => ({
  js: rubroSegun(REGLAS, 'js', f, SIN_CLASIFICAR),
  sheet: rubroSegun(REGLAS, 'sheet', f, SIN_CLASIFICAR),
  sql: rubroSegun(REGLAS, 'sql', f, SIN_CLASIFICAR),
})

test('las tres caras clasifican IGUAL las 9.310 combinaciones de la planilla', () => {
  let n = 0
  for (const f of casos()) {
    const r = rubros(f)
    n++
    assert.equal(r.sheet, r.js, `la FÓRMULA no dice lo mismo que el JS en ${JSON.stringify(f)}`)
    assert.equal(r.sql, r.js, `el SQL no dice lo mismo que el JS en ${JSON.stringify(f)}`)
    assert.equal(r.js, rubroDeCaja(f), `rubroDeCaja() no respeta el orden de REGLAS en ${JSON.stringify(f)}`)
  }
  assert.equal(n, PROVEEDORES.length * UNIDADES.length * CLIENTES.length * CONCEPTOS.length)
})

test('EL CANARIO: si una cara se queda atrás, la comparación lo ve', () => {
  // Exactamente el error posible al agregar 'mass consultora': se actualiza el JS y la excepción por
  // unidad no llega a la fórmula del Sheet. Si este test no rompiera, el de arriba no probaría nada.
  const desincronizadas = REGLAS.map((r) => (r.rubro !== 'Servicios recurrentes' ? r : {
    ...r,
    sheet: `(REGEXMATCH(LOWER($E$4:$E&"");"^(mass consultora|rsv)$")*(LOWER($I$4:$I)<>"civil")*(LOWER($I$4:$I)<>"mantenimiento")>0)`,
  }))
  const fila = { proveedor: 'MASS CONSULTORA', unidad: 'Civil', cliente: 'Administracion', concepto: 'Higiene y Seguridad' }
  assert.equal(rubroSegun(desincronizadas, 'js', fila, SIN_CLASIFICAR), 'Servicios recurrentes')
  assert.equal(rubroSegun(desincronizadas, 'sheet', fila, SIN_CLASIFICAR), 'Materiales Civil',
    'la fórmula vieja mandaba la fila a Materiales Civil — eso es lo que el comparador tiene que ver')
})

test('MASS CONSULTORA es recurrente aunque la unidad diga una obra, y en las tres caras', () => {
  // La fila real (Compras 818, 07/08/2026): unidad "Civil", cliente "Administracion", concepto
  // "Higiene y Seguridad", $230.000. Antes venía partida en dos de $115.000 contra "San Francisco" y
  // "LA ESTRELLA": las tres formas tienen que caer en el mismo rubro o el mes cambia de línea según
  // quién lo mire. Lo declaró el dueño el 07/08: factura todos los meses aunque el servicio se
  // preste en obra, así que la exclusión por unidad —pensada para el baño químico, que se termina
  // con la obra— no le aplica.
  for (const cliente of ['Administracion', 'LA ESTRELLA', 'San Francisco']) {
    const r = rubros({ proveedor: 'MASS CONSULTORA', unidad: 'Civil', cliente, concepto: 'Higiene y Seguridad' })
    assert.deepEqual(r, { js: 'Servicios recurrentes', sheet: 'Servicios recurrentes', sql: 'Servicios recurrentes' },
      `cliente ${cliente}`)
  }
})

test('RSV con la unidad tipeada "Civil" no desaparece del cuadro', () => {
  // El GPS de RSV es de la flota. Un mes vino cargado con unidad "Civil" y ese mes se cayó del rubro
  // —y de la pestaña Recurrentes— sin que nada avisara: el cuadro mostraba un hueco donde hubo gasto.
  for (const unidad of ['Civil', 'CIVIL', 'Mantenimiento', 'Estructura', '']) {
    const r = rubros({ proveedor: 'RSV', unidad, cliente: 'Administracion', concepto: 'GPS' })
    assert.deepEqual(r, { js: 'Servicios recurrentes', sheet: 'Servicios recurrentes', sql: 'Servicios recurrentes' },
      `unidad ${unidad || '(vacía)'}`)
  }
})

test('la excepción es SÓLO para los dos declarados: el baño químico de obra sigue siendo de la obra', () => {
  // Es la contracara y vale $4.186.497: baños, agua e higiene facturados a una obra son costo de esa
  // obra. Proyectarlos como gasto fijo mensual inventa caja que no se va a usar.
  for (const proveedor of ['Sanitarios OD S.A.S.', 'Ruviño Matias Esteban', 'Movistar', 'Robles Jose Maria']) {
    const r = rubros({ proveedor, unidad: 'Civil', cliente: 'La Estrella', concepto: 'baños' })
    assert.deepEqual(r, { js: 'Materiales Civil', sheet: 'Materiales Civil', sql: 'Materiales Civil' }, proveedor)
    // Y los mismos proveedores, contra la estructura, sí son recurrentes.
    const e = rubros({ proveedor, unidad: 'Estructura', cliente: 'Administracion', concepto: 'servicio' })
    assert.deepEqual(e, { js: 'Servicios recurrentes', sheet: 'Servicios recurrentes', sql: 'Servicios recurrentes' }, proveedor)
  }
})

test('cada regla trae sus tres caras: una sin SQL rompe la migración del núcleo', () => {
  for (const r of REGLAS) {
    assert.equal(typeof r.js, 'function', `${r.rubro} no tiene cara JS`)
    assert.ok(r.sheet, `${r.rubro} no tiene fórmula de Sheet`)
    assert.ok(r.sql, `${r.rubro} no tiene traducción a SQL`)
  }
})

// ═══ LÍMITE CONOCIDO, MEDIDO Y NO CORREGIDO ACÁ ═══
//
// Las tres caras coinciden en las 9.310 combinaciones de arriba, pero NO coinciden cuando la celda
// trae espacios de sobra: `norm()` recorta en JS y ni `LOWER()` ni `lower()` recortan.
//   {proveedor: " SAC "}                        → JS "Nómina · SAC"           · Sheet y SQL "SIN CLASIFICAR"
//   {proveedor: "Movistar ", unidad:"Estructura"} → JS "Servicios recurrentes" · Sheet y SQL "Estructura"
//   {unidad: " Civil"}                          → JS "Materiales Civil"       · Sheet y SQL "SIN CLASIFICAR"
// No se arregla en este cambio a propósito: emparejarlas exige TRIM() en la fórmula, btrim() en el
// SQL y reescribir la columna AC de Compras en el Sheet real — una escritura que hoy está frenada.
// Cambiar sólo dos de las tres caras crearía la divergencia que este archivo vino a detectar. Y no
// son equivalentes: TRIM() de Sheets además colapsa los espacios internos y btrim() no, así que el
// arreglo completo toca también a `norm()`. Queda declarado, no cerrado.
