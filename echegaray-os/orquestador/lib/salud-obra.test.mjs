#!/usr/bin/env node
// Test de armarSalud (core de la capacidad-decisión salud_obra). Hermético, 0 DB.
// Verifica la LECTURA del CFO y, sobre todo, la HONESTIDAD: sin ingreso NO inventa margen.
import { armarSalud } from './salud-obra.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

const obra = { nombre: 'San Francisco', estado: 'activa', tipo: 'obra' }
const costo = { total: 66646796, n: 118, por_categoria: [{ nombre: 'Materiales', total: 40000000 }], por_proveedor: [{ nombre: 'Acme', total: 20000000 }] }

// 1) Caso real HOY: costo sí, presupuesto no, certificación no → margen NO calculable, honesto
const s1 = armarSalud({ obra, costo, presupuesto: null, ingresoCertificado: null })
check('sin ingreso: margen NO calculable', s1.margen.calculable === false)
check('sin ingreso: no inventa un valor de margen', s1.margen.valor === undefined)
check('lista faltantes (presupuesto + certificación)', s1.faltantes.includes('presupuesto cargado') && s1.faltantes.includes('certificación (ingreso devengado)'))
check('costo_real es HECHO', s1.evidencia.costo_real.clase === 'HECHO' && s1.costo_real.total === 66646796)
check('lectura avisa que falta para el margen', /No se puede cerrar el margen/i.test(s1.lectura))
check('siguiente paso apunta a cargar presupuesto', /presupuesto|contrato/i.test(s1.siguiente_paso))

// 2) Con presupuesto pero sin ingreso → consumo %, margen aún no calculable
const s2 = armarSalud({ obra, costo, presupuesto: { monto: 80000000, margen_esperado: 0.25 }, ingresoCertificado: null })
check('consumo presupuesto ~83%', Math.round(s2.consumo_presupuesto_pct * 100) === 83)
check('con presupuesto: falta solo certificación', s2.faltantes.length === 1 && s2.faltantes[0].includes('certificación'))
check('margen esperado se reporta como esperado (no real)', s2.margen.calculable === false && s2.margen.margen_esperado === 0.25)

// 3) Con ingreso certificado > costo → margen real positivo (CÁLCULO)
const s3 = armarSalud({ obra, costo, presupuesto: { monto: 80000000, margen_esperado: 0.25 }, ingresoCertificado: 90000000 })
check('con ingreso: margen calculable', s3.margen.calculable === true)
check('margen real = 90M - 66.6M', s3.margen.valor === 90000000 - 66646796)
check('margen es CÁLCULO', s3.margen.clase === 'CÁLCULO')
check('recomendación positiva', /positivo|sostener/i.test(s3.recomendacion))

// 4) Con ingreso < costo → margen negativo, recomendación de alerta
const s4 = armarSalud({ obra, costo, presupuesto: null, ingresoCertificado: 50000000 })
check('margen negativo', s4.margen.valor < 0)
check('recomendación alerta sobrecosto', /negativo|frenar|sobrecosto/i.test(s4.recomendacion))

console.log(`\nsalud-obra.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
