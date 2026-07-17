#!/usr/bin/env node
// Test de schedule-intent (lib/schedule-intent.mjs): detección de agenda + parseo de cadencia,
// 0 API. La cadencia debe salir en el formato de computeNextRun. exit 0 = OK, 1 = falla.
import { parseScheduleRequest, parseCadence } from './schedule-intent.mjs'

let ok = 0, fail = 0
const eq = (nombre, got, exp) => { if (got === exp) ok++; else { fail++; console.error(`FALLA: ${nombre} → dio ${JSON.stringify(got)}, esperaba ${JSON.stringify(exp)}`) } }
const truthy = (nombre, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${nombre}`) } }

// --- parseCadence: frecuencia + hora → formato computeNextRun ---
eq('diaria default 08', parseCadence('todos los días revisá caja')?.cadence, 'daily:08:00')
eq('diaria con hora', parseCadence('todos los días a las 9 revisá caja')?.cadence, 'daily:09:00')
eq('diaria hora:min', parseCadence('cada día a las 08:30 mandame el resumen')?.cadence, 'daily:08:30')
eq('semanal lunes', parseCadence('todos los lunes a las 8 revisá cobranzas')?.cadence, 'weekly:lun:08:00')
eq('semanal viernes', parseCadence('cada viernes mandame el avance')?.cadence, 'weekly:vie:08:00')
eq('semanal miércoles acento', parseCadence('todos los miércoles a las 10 revisá compras')?.cadence, 'weekly:mie:10:00')
eq('semanal genérico → lunes', parseCadence('cada semana revisá el pipeline')?.cadence, 'weekly:lun:08:00')
eq('mensual día N', parseCadence('el día 5 de cada mes revisá el F931')?.cadence, 'monthly:5:08:00')
eq('mensual genérico → día 1', parseCadence('todos los meses mandame el P&L')?.cadence, 'monthly:1:08:00')
eq('pm 6 → 18', parseCadence('todos los días a las 6 pm cerrá caja')?.cadence, 'daily:18:00')
eq('sin frecuencia → null', parseCadence('revisá la caja ahora'), null)

// --- parseScheduleRequest: acción CREATE + directiva extraída ---
{
  const r = parseScheduleRequest('todos los lunes a las 8 revisá cobranzas y avisame')
  eq('create action', r?.action, 'create')
  eq('create cadence', r?.cadence, 'weekly:lun:08:00')
  truthy('create directiva sin la parte temporal', /revis[aá] cobranzas/i.test(r?.directive || '') && !/lunes|a las 8/i.test(r?.directive || ''))
}
{
  const r = parseScheduleRequest('programá que cada día a las 9 me mandes los vencimientos de la semana')
  eq('create con verbo programá', r?.action, 'create')
  eq('create cadence diaria', r?.cadence, 'daily:09:00')
  truthy('directiva sin "programá"', !/program/i.test(r?.directive || ''))
}
// create sin frecuencia clara → pide (cadence null)
{
  const r = parseScheduleRequest('programame una tarea para revisar cobranzas')
  eq('create sin cadencia → action create', r?.action, 'create')
  eq('create sin cadencia → cadence null', r?.cadence, null)
}

// --- LIST ---
eq('list: mis tareas programadas', parseScheduleRequest('mostrame mis tareas programadas')?.action, 'list')
eq('list: qué tengo agendado', parseScheduleRequest('qué tengo agendado')?.action, 'list')

// --- STOP ---
{
  const r = parseScheduleRequest('pará la tarea de cobranzas')
  eq('stop action', r?.action, 'stop')
  truthy('stop target', /cobranzas/.test(r?.targetName || ''))
}

// --- NO es agenda ---
eq('lectura normal no es agenda', parseScheduleRequest('cuánto tengo en caja hoy'), null)
eq('acción puntual no es agenda', parseScheduleRequest('revisá cobranzas'), null)
// Pregunta con "todos los días" NO es agenda (falso positivo real).
eq('pregunta con todos los días no es agenda', parseScheduleRequest('cuánto gasto todos los días en combustible'), null)
// Pero con verbo explícito, sí (aunque parezca pregunta).
eq('programá explícito sí es agenda', parseScheduleRequest('programá que todos los días me digas cuánto gasté')?.action, 'create')

console.log(`\nschedule-intent.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
