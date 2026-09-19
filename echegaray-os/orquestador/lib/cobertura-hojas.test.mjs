// EL CENSO DE HOJAS, EN FRÍO — que ninguna pestaña pueda existir sin decir si su plata llega.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAPA } from './cash-flow-cobertura.mjs'
import {
  HOJAS_SIN_FLUJO_PROPIO, ORIGENES_LOGICOS, declaradasQueNoExisten, hojasSinRol,
  informeDeHojas, rolesDeclarados, verificarTablaDeHojas,
} from './cobertura-hojas.mjs'

/** Las 39 hojas reales del archivo, leídas el 06/09/2026. Es la foto contra la que se mide. */
const HOJAS_REALES = [
  'Compras', 'Jornales por Quincena', 'Nómina', 'Plantel', 'Cargas Sociales', 'Impuestos y Financieros',
  'Recurrentes', 'Estructura', 'Materiales', 'Proveedores', 'Cobranzas', 'OBRAS', 'Tarjeta de Credito',
  'Cheques Recibidos', 'Cheques Emitidos', 'CAJA', 'Cash Flow Semanal', 'Cash Flow Mensual',
  '01_Valores Iniciales', '_UOCRA_RAW', '_J_OBREROS', '_J_OFICINA', 'Parámetros', '_ARCA_RAW',
  '_F931_RAW', '_BANCO_RAW', '_IIBB_RAW', '_CHEQUES_RAW', 'Deuda viva (OS)', '_PROVEEDORES_OS',
  '_CRUCE_ARCA', '_CAJA_ANEXO', '_MOVIMIENTOS', '_PRESUPUESTO_MENSUAL', 'Calendario de Cobros',
  '_UOCRA_DDJJ_RAW', 'SUBCONTRATISTAS', '_RECIBOS_RAW', '_OBRAS_RAW',
]

test('la tabla de hojas es internamente sana: ningún rol duplicado, ninguna declaración muda', () => {
  assert.deepEqual(verificarTablaDeHojas(), [])
})

test('el archivo REAL del 06/09/2026 queda entero declarado — cero hojas sin rol', () => {
  // Antes de este archivo eran 23 hojas sin rol sobre 39, incluida SUBCONTRATISTAS ($53,5M
  // contratados). `verificarCobertura()` daba verde igual: nunca mira el archivo.
  assert.deepEqual(hojasSinRol(HOJAS_REALES), [])
  assert.deepEqual(declaradasQueNoExisten(HOJAS_REALES), [])
  assert.deepEqual(informeDeHojas(HOJAS_REALES), [])
})

test('una hoja NUEVA con plata pone el control en ROJO hasta que alguien declare su rol', () => {
  // Es la razón de ser del control: hoy una pestaña con egresos podía nacer y vivir para siempre sin
  // que ningún control la nombrara, porque el cuadro cierra consigo mismo igual.
  const r = hojasSinRol([...HOJAS_REALES, 'Anticipos a subcontratistas'])
  assert.deepEqual(r, [{ hoja: 'Anticipos a subcontratistas' }])
  assert.match(informeDeHojas([...HOJAS_REALES, 'Anticipos a subcontratistas'])[0], /no tiene rol declarado/)
})

test('renombrar una hoja declarada pone el control en ROJO: su extractor estaría leyendo vacío', () => {
  // El modo de falla silencioso: "Estructura" renombrada deja la línea del cuadro en $0 sin un solo
  // error. Nadie se entera mirando el Cash Flow — el número más chico se lee como si fuera la verdad.
  const sinEstructura = HOJAS_REALES.filter((h) => h !== 'Estructura')
  const r = declaradasQueNoExisten(sinEstructura)
  assert.deepEqual(r.map((x) => x.declarada), ['Estructura'])
  assert.match(informeDeHojas(sinEstructura).join('\n'), /NO existe como hoja del archivo/)
})

test('el origen lógico "Obras" no se reporta, y la hoja física "OBRAS" hereda su rol', () => {
  // Los dos falsos positivos que este mapeo evita: "el MAPA declara una hoja que no existe" (Obras) y
  // "la hoja OBRAS no tiene rol declarado". Los dos gritan por algo que está bien.
  assert.equal(ORIGENES_LOGICOS.Obras.hoja, 'OBRAS')
  assert.ok(rolesDeclarados().has('OBRAS'), 'la hoja física tiene que quedar declarada')
  assert.ok(!declaradasQueNoExisten(HOJAS_REALES).some((d) => d.declarada === 'Obras'))
})

test('si la hoja física del origen lógico desaparece, el control SÍ se pone rojo', () => {
  // La herencia no puede convertirse en un permiso permanente: si alguien renombra OBRAS, los
  // materiales previstos salen en cero y hay que enterarse.
  const sinObras = HOJAS_REALES.filter((h) => h !== 'OBRAS')
  assert.ok(declaradasQueNoExisten(sinObras).some((d) => d.declarada === 'Obras'),
    'sin la hoja OBRAS, el origen lógico "Obras" no tiene de dónde salir')
})

test('ninguna hoja está declarada en el MAPA y en HOJAS_SIN_FLUJO_PROPIO a la vez', () => {
  // Tendría dos roles y ganaría el que decide el orden de un `for`: el rol de una hoja no puede
  // depender de cómo se recorre una lista.
  const enMapa = new Set(MAPA.map((m) => m.pestania))
  for (const h of HOJAS_SIN_FLUJO_PROPIO) assert.ok(!enMapa.has(h.hoja), `"${h.hoja}" está en los dos`)
})
