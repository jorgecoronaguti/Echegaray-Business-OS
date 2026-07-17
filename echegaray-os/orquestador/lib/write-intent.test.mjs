#!/usr/bin/env node
// Test de WRITE_INTENT_RE (lib/write-intent.mjs). Guard de COSTO: un falso positivo manda
// un READ barato (haiku) a sonnet. Hermético, 0 API. exit 0 = OK, 1 = falla.
import { isWriteIntent } from './write-intent.mjs'

let ok = 0, fail = 0
const yes = (t) => { if (isWriteIntent(t)) ok++; else { fail++; console.error(`FALLA: "${t}" → esperaba WRITE, dio false`) } }
const no = (t) => { if (!isWriteIntent(t)) ok++; else { fail++; console.error(`FALLA: "${t}" → esperaba NO-write, dio true`) } }

// REGRESIÓN (fuga real 2026-07-16): el participio "cargado" es un DATO, no una orden.
no('decime el último saldo cargado, sólo el número y la fecha')
no('cuál es el presupuesto cargado de la obra')
no('mostrame los comprobantes cargados este mes')
no('la factura ya está cargada?')

// La ORDEN de cargar SÍ es escritura (no romper el caso real).
yes('cargá el saldo de hoy en la pestaña Caja')
yes('cargar los movimientos del extracto')
yes('cargámelo en el Cash Flow')
yes('carguen las horas de la cuadrilla')
yes('estoy cargando el remito, agregá la fila')

// Otras raíces de acción siguen matcheando (no colateral).
yes('registrá el pago a Corralón')
yes('agregá una fila en Compras')
yes('actualizá el avance de la obra')
yes('rehacé la planilla de sueldos')
yes('armá el presupuesto')
yes('borrá la fila duplicada')
yes('poné la fórmula en la columna F')

// Lecturas/charla puras → NO write.
no('cuánto tengo en caja hoy')
no('qué obras tengo activas')
no('hola, cómo va todo')
no('cuáles son los cheques pendientes a proveedores')

console.log(`\nwrite-intent.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
