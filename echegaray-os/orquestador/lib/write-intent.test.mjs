#!/usr/bin/env node
// Test de isWriteIntent (lib/write-intent.mjs). Guard de COSTO: un falso positivo manda un
// READ barato (haiku) a sonnet. Hermético, 0 API. exit 0 = OK, 1 = falla.
import { isWriteIntent } from './write-intent.mjs'

let ok = 0, fail = 0
const yes = (t) => { if (isWriteIntent(t)) ok++; else { fail++; console.error(`FALLA: "${t}" → esperaba WRITE, dio false`) } }
const no = (t) => { if (!isWriteIntent(t)) ok++; else { fail++; console.error(`FALLA: "${t}" → esperaba NO-write, dio true`) } }

// REGRESIÓN (fuga real medida 2026-07-16, probe 13/18): el PARTICIPIO/PRETÉRITO es un DATO,
// no una orden. Toda la familia de raíces que colisionaba con su -ado/-ada/-ó:
no('decime el último saldo cargado, sólo el número y la fecha')
no('está actualizado el flujo de fondos?')
no('cuál es el dato actualizado de la obra')
no('mostrame el pago registrado a Corralón')
no('el comprobante ya está registrado?')
no('cuánto es el valor agregado del mes')
no('el agregado grueso de la obra qué costo tuvo')
no('qué criterio está aplicado al IVA')
no('la fecha fue modificada?')
no('el total calculado de la certificación cuánto da')
no('hay un comprobante duplicado en compras?')
no('está duplicado ese comprobante?')
no('qué gasto fue eliminado')
no('el reporte generado de ayer qué decía')
no('cuánto se cotizó la obra el año pasado')   // pretérito -ó
no('quién aprobó el adicional')                 // pretérito -ó

// La ORDEN sí es escritura (no romper el caso real: -á / -ar / -ando / -alo / -en / -emos).
yes('cargá el saldo de hoy en la pestaña Caja')
yes('cargar los movimientos del extracto')
yes('cargámelo en el Cash Flow')
yes('carguen las horas de la cuadrilla')
yes('estoy cargando el remito, agregá la fila')
yes('registrá el pago a Corralón')
yes('agregá una fila en Compras')
yes('actualizá el avance de la obra')
yes('modificá la fecha de entrega')
yes('calculá el total de la certificación')
yes('generá el reporte de caja')
yes('eliminá la fila duplicada')                // "duplicada" se strippea, "eliminá" queda
yes('rehacé la planilla de sueldos')
yes('armá el presupuesto')
yes('borrá la fila')
yes('poné la fórmula en la columna F')
yes('reemplazá el valor de la celda B2')

// SUSTANTIVO HOMÓGRAFO separable (registro/orden) → NO write; el verbo homógrafo → SÍ.
no('mostrame ese registro de compras')
no('cuántos registros hay en la pestaña')
no('cuál es la orden de compra de Corralón')
no('las órdenes de compra pendientes')
no('la orden de pago ya salió?')
yes('registrá ese comprobante')
yes('registra el pago de hoy')          // orden sin acento = igual es orden de escribir
yes('ordená la pestaña por fecha')
yes('cargá la orden de compra en el sheet')  // "orden de" no cuenta, pero "cargá" sí
// copi/marc/carg NO se acotan (sustantivo=verbo en -a): se preserva la orden a costa de que
// "una copia"/"la marca"/"la carga" sigan yendo a sonnet (write-safety > fuga de un read).
yes('copiá la fila 5 a la 6')
yes('marcá el pedido como entregado')

// Lecturas/charla puras → NO write.
no('cuánto tengo en caja hoy')
no('qué obras tengo activas')
no('hola, cómo va todo')
no('cuáles son los cheques pendientes a proveedores')

console.log(`\nwrite-intent.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
