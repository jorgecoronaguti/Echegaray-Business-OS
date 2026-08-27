#!/usr/bin/env node
// AUDITORÍA DE RUTEO POR ÁREA — ¿el chat carga al experto correcto ante las preguntas REALES que
// hace el dueño? Determinístico, 0 API, corre en un segundo.
//
// Por qué existe: "las skills están" no es una afirmación verificable. Esto la vuelve medible. Cada
// pregunta declara qué skill DEBE aparecer; si no aparece, es un hueco concreto con nombre, no una
// sensación. Nació de un caso real (2026-07-20): "cómo debería estar armado el flujo de fondos"
// —la primera pregunta que el dueño dijo que iba a hacer— NO cargaba la skill de Sheets.
//
// Uso:  node orquestador/scripts/auditar-ruteo-areas.mjs
//       node orquestador/scripts/auditar-ruteo-areas.mjs --area "Administración y Finanzas"
import { classifyDirectiveMulti } from '../lib/classify-directive.mjs'
import { skillsSegunProfundidad } from '../lib/skill-map.mjs'

// El vocabulario es el REAL del dueño (voseo, sin tildes a veces, abreviado), no español de manual.
// `debe` = skills que tienen que estar sí o sí. `criterio` = es consulta de asesoría (carga hasta 4).
// Se EXPORTA porque es el único corpus de pedidos REALES del dueño que vive en el repo (52 casos
// con su skill esperada). `xsas-ruteo-medir.mjs` mide la política de ruteo contra él: inventar un
// benchmark sintético mediría el benchmark, no el OS.
export const AREAS = {
  'Administración y Finanzas': [
    ['como deberia estar armado el flujo de fondos', ['finanzas-tesoreria-construccion', 'google-sheets-business-systems'], true],
    ['cuanta caja tengo hoy', ['finanzas-tesoreria-construccion'], false],
    ['que tengo vencido', ['finanzas-tesoreria-construccion'], false],
    ['mejorame la pestaña de cobranzas', ['finanzas-tesoreria-construccion', 'google-sheets-business-systems'], false],
    ['puedo cerrar el mes?', ['administracion-operativa-construccion'], false],
    ['que me falta en administracion', ['administracion-operativa-construccion'], false],
    ['a quien le debo plata', ['finanzas-tesoreria-construccion'], false],
    ['cuando cobro de la estrella', ['finanzas-tesoreria-construccion'], false],
    ['conviene tomar el descuento por pago contado del proveedor', ['finanzas-tesoreria-construccion'], true],
    ['como proyecto la caja de los proximos 3 meses', ['finanzas-tesoreria-construccion'], true],
    ['tengo que pedir un adelanto al banco?', ['finanzas-tesoreria-construccion'], true],
    ['armame el resumen de egresos por proveedor', ['finanzas-tesoreria-construccion'], false],
  ],
  'Contabilidad': [
    ['como viene el p&l del mes', ['contabilidad-constructoras'], false],
    ['cual fue el ebitda de junio', ['contabilidad-constructoras'], false],
    ['que margen bruto tuvimos', ['contabilidad-constructoras'], false],
    ['como imputo un anticipo de obra contablemente', ['contabilidad-constructoras'], true],
  ],
  'Impuestos': [
    ['cuanto pago de iva este mes', ['impuestos-construccion'], false],
    ['me conviene facturar ahora o el mes que viene', ['impuestos-construccion'], true],
    ['que retencion le hago a este proveedor', ['impuestos-construccion'], true],
    ['como esta ingresos brutos en san juan', ['impuestos-construccion'], true],
  ],
  'Obras / Producción': [
    ['como viene la obra de arcor', ['direccion-obra', 'planificacion-produccion'], false],
    ['que avance fisico tiene san francisco', ['planificacion-produccion', 'direccion-obra'], false],
    ['la obra messina esta parada?', ['direccion-obra', 'planificacion-produccion'], false],
    ['cuanto costo real llevo en la estrella', ['costos-presupuestacion', 'planificacion-produccion', 'direccion-obra'], false],
    ['como replanifico si me atraso dos semanas', ['planificacion-produccion'], true],
  ],
  'Comercial / Cotización': [
    ['que le cotizamos a arcor', ['costos-presupuestacion'], false],
    ['cuanto salio cotizar vs lo que costo realmente', ['costos-presupuestacion'], false],
    ['como armo el precio unitario de hormigon', ['costos-presupuestacion'], true],
    ['me conviene tomar esta obra?', ['gestion-empresarial-riesgos'], true],
  ],
  'Compras': [
    ['a que proveedor le compre mas', ['compras-abastecimiento-subcontratacion'], false],
    ['conviene comprar o alquilar el andamio', ['compras-abastecimiento-subcontratacion'], true],
    ['que pedidos de material hay pendientes', ['compras-abastecimiento-subcontratacion'], false],
    ['como evaluo un subcontratista', ['compras-abastecimiento-subcontratacion'], true],
  ],
  'Personas': [
    ['a quien le falta el apto medico', ['derecho-laboral-construccion'], false],
    ['cuanto pague de jornales la quincena', ['derecho-laboral-construccion'], false],
    ['me llego un telegrama de un obrero, que hago', ['derecho-laboral-construccion'], true],
    ['como liquido el fondo de cese', ['derecho-laboral-construccion'], true],
    ['que categoria uocra le corresponde', ['derecho-laboral-construccion'], true],
  ],
  'Seguridad e Higiene': [
    ['tuvimos un accidente en obra, que hago', ['seguridad-higiene-art'], true],
    ['a quien le falta epp', ['seguridad-higiene-art'], false],
    ['que necesito para entrar a planta de arcor', ['seguridad-higiene-art'], true],
  ],
  'Calidad': [
    ['que no conformidades tengo abiertas', ['calidad-obra'], false],
    ['el cliente reclama una fisura, como respondo', ['calidad-obra'], true],
  ],
  'Equipos y Flota': [
    ['que vehiculos tienen la rto vencida', ['equipos-flota-construccion'], false],
    ['cuanto me cuesta tener la camioneta', ['equipos-flota-construccion'], true],
  ],
  'Legal / Contratos': [
    ['puedo reclamar este adicional?', ['derecho-construccion-contratos'], true],
    ['el cliente me quiere aplicar una multa por atraso', ['derecho-construccion-contratos'], true],
  ],
  'Gestión General': [
    ['como venimos como empresa', ['gestion-empresarial-riesgos'], false],
    ['cual es hoy mi mayor riesgo', ['gestion-empresarial-riesgos'], true],
  ],
}

const filtroArea = (() => {
  const i = process.argv.indexOf('--area')
  return i > -1 ? process.argv[i + 1] : null
})()

/** Corre la auditoría e imprime el detalle. Devuelve la cantidad de huecos. */
export function auditarRuteo() {
  let total = 0
  let fallas = 0
  const huecos = []

  for (const [area, casos] of Object.entries(AREAS)) {
    if (filtroArea && area !== filtroArea) continue
    const lineas = []
    for (const [pregunta, debe, criterio] of casos) {
      total++
      const caps = classifyDirectiveMulti(pregunta)
      const skills = skillsSegunProfundidad(caps, pregunta, { asesoria: !!criterio })
      const faltan = debe.filter((d) => !skills.includes(d))
      // Una skill "debe" satisfecha alcanza con que aparezca UNA de las alternativas cuando el caso
      // lista varias equivalentes (ej. obra puede resolverse por dirección o por planificación).
      const cumple = debe.length > 1 ? debe.some((d) => skills.includes(d)) : faltan.length === 0
      if (!cumple) {
        fallas++
        huecos.push({ area, pregunta, esperaba: debe, cargo: skills, caps })
        lineas.push(`  ✖ ${pregunta}\n      esperaba: ${debe.join(' | ')}\n      cargó:    ${skills.join(', ') || '(NADA — cae a general)'}`)
      } else {
        lineas.push(`  ✔ ${pregunta} → ${skills.join(', ')}`)
      }
    }
    console.log(`\n=== ${area} ===`)
    console.log(lineas.join('\n'))
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`RUTEO POR ÁREA: ${total - fallas}/${total} correctas, ${fallas} huecos`)
  if (huecos.length) {
    console.log('\nHUECOS (cada uno es una pregunta real que el dueño va a hacer y el OS contesta sin el experto):')
    for (const h of huecos) console.log(`  [${h.area}] "${h.pregunta}" → caps=${JSON.stringify(h.caps)}`)
  }
  return fallas

}

// Sólo audita cuando se lo invoca como programa: importarlo (para reusar el corpus) no puede
// imprimir 52 líneas ni cortar el proceso del que lo importa.
if (import.meta.url === `file://${process.argv[1]}`) process.exit(auditarRuteo() ? 1 : 0)
