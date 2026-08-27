#!/usr/bin/env node
// PRUEBA `generar_imagen` CONTRA EL MUNDO REAL. La evidencia es del efecto, no del intento.
//
// Los tests prueban el circuito con dobles y eso alcanza para el código. Lo que NO pueden probar es
// si el proveedor de imágenes contesta hoy, en esta VM, con estas credenciales. Este script existe
// para que quien NO escribió el módulo pueda comprobarlo sin leer una línea.
//
//   node orquestador/scripts/verificar-generar-imagen.mjs
//       Sondea el proveedor y NO escribe nada. Dice si genera o qué falta exactamente.
//
//   node orquestador/scripts/verificar-generar-imagen.mjs --guardar [--publicar] [--carpeta ID]
//       Circuito COMPLETO: genera, sube a Drive y —con --publicar— publica y verifica que la URL
//       devuelva bytes de imagen sin credenciales (que es como la baja Google Slides).
//
// `--guardar` deja un archivo en el Drive del dueño: es un efecto real y por eso NO es el default.

import { validarPedido } from '../lib/imagen/contrato.mjs'
import { producirImagen } from '../lib/imagen/motor.mjs'

const args = process.argv.slice(2)
const tiene = (f) => args.includes(f)
const valor = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }

const PEDIDO = {
  tipo: 'diagrama',
  pedido: 'tres cajas rectangulares encadenadas por flechas horizontales sobre fondo blanco',
  objetivo: 'sonda de verificación del proveedor de imágenes: la escena más simple posible',
  publicar_para_slides: tiene('--publicar'),
  carpeta_id: valor('--carpeta') || undefined,
  correlation_id: `verificacion-${new Date().toISOString()}`,
}

async function clienteGoogle() {
  if (!tiene('--guardar')) return null
  const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  return makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
}

const r = await producirImagen(await clienteGoogle(), validarPedido(PEDIDO).pedido)

if (!r.ok) {
  console.log('✖ NO se pudo generar la imagen.')
  console.log(`  falta:     ${r.falta}`)
  console.log(`  motivo:    ${r.motivo}`)
  console.log(`  qué hacer: ${r.que_hacer}`)
  for (const i of r.intentos ?? []) console.log(`  · ${i.proveedor}: ${i.falta ?? '—'} ${i.status ?? ''} ${String(i.motivo).slice(0, 120)}`)
  process.exit(1)
}

console.log('✔ el proveedor generó la imagen.')
console.log(`  proveedor:  ${r.proveedor} · modelo: ${r.modelo}${r.fallback_de ? ` (fallback de ${r.fallback_de})` : ''}`)
console.log(`  bytes:      ${r.bytes} · formato: ${r.mime} · medidas: ${JSON.stringify(r.control_de_calidad.medidas)}`)
console.log(`  QA:         ${r.control_de_calidad.hallazgos.length ? r.control_de_calidad.hallazgos.join(' · ') : 'sin hallazgos'}`)
console.log(`  procedencia:${r.procedencia_sello.procedencia} · evidencia real: ${r.procedencia_sello.es_evidencia_real}`)
if (r.guardada) console.log(`  Drive:      ${r.drive_url} (${r.archivo.nombre})`)
else console.log(`  Drive:      NO se guardó — ${r.motivo_no_guardada}`)
if (r.publicada) console.log(`  para Slides:${r.imagen_url ?? 'NO utilizable'} · verificada: ${r.verificacion_url?.verificada}`)
if (r.aviso_slides) console.log(`  aviso:      ${r.aviso_slides}`)
