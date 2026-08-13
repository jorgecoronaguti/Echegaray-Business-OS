#!/usr/bin/env node
// ¿EN QUÉ ESTADO ESTÁ AFIPSDK, AHORA MISMO Y SIN GASTAR NADA?
//
// Contesta las dos preguntas que el sync se hace antes de bajar comprobantes, por separado y con la
// evidencia a la vista:
//
//   1. CUOTA      — GET /api/v1/projects con el ACCOUNT_TOKEN: las automatizaciones reales del
//                   proveedor y el período de facturación. Un GET no crea nada.
//   2. CREDENCIAL — POST /api/v1/automations con el ACCESS_TOKEN y cuerpo vacío: la misma llamada que
//                   hace la descarga. Sin el campo `automation` el servidor rechaza en validación y no
//                   crea ninguna automatización, así que NO CONSUME CUOTA.
//
// Existe porque del 03/08 al 13/08 el sync abortó diez días diciendo "la credencial no sirve" con un
// token sano, y no había forma barata de contradecirlo: la única prueba disponible era correr el sync
// entero y gastar 2 de las 10 automatizaciones del mes.
//
//   node scripts/arca/chequear-afipsdk.mjs
//
// NUNCA imprime un token. Sale 0 si se puede sincronizar, 1 si no.
import { leerCredenciales, presupuesto, credencialAceptada } from '../../orquestador/lib/afipsdk-presupuesto.mjs'

const PEDIDO = 2 // una corrida completa = libro R + libro E

const cred = await leerCredenciales()
console.log('[afipsdk] credenciales presentes:'
  + ` ACCESS_TOKEN ${cred.accessToken ? 'sí' : 'NO'} ·`
  + ` ACCOUNT_TOKEN ${cred.accountToken ? 'sí' : 'NO'} ·`
  + ` PROJECT_ID ${cred.projectId ? 'sí' : 'NO'}`)

const cuota = await presupuesto({ pedido: PEDIDO, accountToken: cred.accountToken, projectId: cred.projectId })
console.log(`[afipsdk] cuota ${cuota.ventana} [fuente: ${cuota.fuente}]: ${cuota.motivo}`)
console.log(`[afipsdk] corridas completas que entran (${PEDIDO} automatizaciones c/u): ${Math.max(0, Math.floor(cuota.disponible / PEDIDO))}`)

const sonda = await credencialAceptada({ token: cred.accessToken })
console.log(`[afipsdk] credencial: ${sonda.motivo}`)

const puede = cuota.ok && sonda.ok
console.log(puede
  ? `[afipsdk] SE PUEDE SINCRONIZAR${sonda.verificada ? '' : ' (la credencial no quedó verificada: seguí, pero mirá el motivo)'}`
  : '[afipsdk] NO SE PUEDE SINCRONIZAR — ver los motivos de arriba')
process.exit(puede ? 0 : 1)
