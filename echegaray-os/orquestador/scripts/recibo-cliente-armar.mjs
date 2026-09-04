#!/usr/bin/env node
// ARMA EL ESTADO DE CUENTA DE UN CLIENTE DESDE COBRANZAS, PARA DIBUJARLO COMO RECIBO.
//
// Los recibos 2 a 17 de este cliente son un Excel exportado a PDF. Intente continuarlos leyendo el
// 17 con `find_tables` y la extraccion no recupera la grilla: celdas fusionadas, columnas corridas.
// Continuar un documento a partir de una lectura que no cierra seria poner numeros sin verificar
// delante de un cliente.
//
// Cobranzas SI es fuente de verdad, la mantiene el dueno y cada renglon de este PDF sale de una
// fila suya. El documento lo dice en el pie, que es lo que lo hace auditable.
//
//   node orquestador/scripts/recibo-cliente-armar.mjs <cobranzas.json> <salida.json>
import { readFileSync, writeFileSync } from 'node:fs'
const SC = '/tmp/claude-1001/-home-jorge-echegaray-os-app-echegaray-os/ef6cc10d-e589-4e62-8064-63ad36e54836/scratchpad'
const filas = JSON.parse(readFileSync(SC + '/sf-cobranzas.json', 'utf8'))

const util = filas.filter((f) => !/cancelar/i.test(f.estado) && (f.total || f.concepto))
const cobrado = util.filter((f) => /cobrado/i.test(f.estado)).sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')))
const pendiente = util.filter((f) => !/cobrado/i.test(f.estado)).sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')))
const suma = (a) => a.reduce((s, f) => s + f.total, 0)

// Las dos filas que el pago del 04/09 movió.
const ESTE_PAGO = new Set([91, 94])
const rot = (f) => f.concepto || 'Cobro a cuenta'

const datos = {
  numero: '18',
  fecha: '2026-09-04',
  cliente: 'JAVIER SÁNCHEZ · SAN FRANCISCO · IMOTOR',
  cuit_cliente: '30-71647696-7',
  pago: {
    forma: 'en efectivo',
    monto: 10000000,
    aplica: [
      { concepto: 'Entrepiso y Escaleras · 1ª de 2 cuotas', monto: 1932063.5 },
      { concepto: 'Pisos Industriales · saldo del anticipo · 1ª de 2 cuotas (parcial)', monto: 8067936.5 },
    ],
  },
  secciones: [
    { titulo: 'Cobrado', total: suma(cobrado),
      filas: cobrado.map((f) => ({ fecha: f.fecha, concepto: rot(f), forma: f.forma, monto: f.total, nuevo: ESTE_PAGO.has(f.fila) })) },
    { titulo: 'Pendiente de cobro', total: suma(pendiente),
      filas: pendiente.map((f) => ({ fecha: f.fecha, concepto: rot(f), forma: f.forma, monto: f.total })) },
  ],
  saldo: suma(pendiente),
  pie: 'Estado de cuenta al 04/09/2026, generado desde la pestaña Cobranzas del Flujo de Caja de Echegaray Construcciones. Cada renglón corresponde a una fila de esa planilla.',
}
writeFileSync(SC + '/recibo18.json', JSON.stringify(datos, null, 1))
console.log('cobrado', suma(cobrado).toLocaleString('es-AR'), '| pendiente', suma(pendiente).toLocaleString('es-AR'), '| filas', cobrado.length + pendiente.length)
