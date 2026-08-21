#!/usr/bin/env node
// ¿CUÁNTO DEL CONTRATO DE DISEÑO ESTÁ CONSTRUIDO? — se mide, no se estima.
//
//   node orquestador/scripts/conformidad-pantallas.mjs [--detalle]
//
// El contrato son 43 pantallas canónicas (28 escritorio + 9 mobile empleado + 6 mobile jefe) y su
// mapa pantalla → ruta vive en `github.md` del proyecto de diseño. Este script cruza ese mapa con
// las rutas que EXISTEN en `src/app` y devuelve el estado real.
//
// Existe porque «implementé 43 pantallas» es exactamente la frase que el pedido dice que NO hay que
// optimizar. Lo que se mide acá es la cobertura del mapa; que una ruta exista NO prueba que la
// pantalla esté terminada, y el script lo dice en su propia salida en vez de dejarlo implícito.
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DISENO = '/home/jorge/echegaray-design'
const APP = 'src/app'

// Pantalla canónica → ruta de la app. Sale del «Screen map canónico» de github.md, traducido a las
// rutas REALES de este repo (que usa /administracion, no /admin).
export const MAPA = [
  ['00 · Home Navegación',                 ''],
  ['01 · Obras Cartera',                   '(main)/obras'],
  ['02 · Obra Resumen',                    '(main)/obras/[obra]'],
  ['03 · Obra Tareas',                     '(main)/obras/[obra]'],
  ['04 · Tarea Panel lateral',             '(main)/obras/[obra]'],
  ['05 · Registrar avance',                '(main)/obras/[obra]'],
  ['06 · Avance masivo',                   '(main)/obras/[obra]'],
  ['07 · Obra Cronograma',                 '(main)/obras/[obra]'],
  ['08 · Obra Dotación y Proyección',      '(main)/obras/[obra]'],
  ['09 · Obra Personal',                   '(main)/obras/[obra]'],
  ['10 · Obra Subcontratistas',            '(main)/obras/[obra]'],
  ['11 · Obra Operación',                  '(main)/obras/[obra]'],
  ['12 · Obra Documentos',                 '(main)/obras/[obra]'],
  ['13 · Preparar Obra desde Presupuesto', '(main)/presupuestos/[presupuesto]/convertir'],
  ['14 · Presupuestos Cartera',            '(main)/presupuestos'],
  ['15 · Presupuesto Edición',             '(main)/presupuestos/[presupuesto]'],
  ['16 · Presupuesto Análisis de partida', '(main)/presupuestos/[presupuesto]/partida/[partida]'],
  ['17 · Base Maestra Tareas',             '(main)/administracion/base-maestra/tareas'],
  ['18 · Base Maestra Recursos',           '(main)/administracion/base-maestra/recursos'],
  ['19 · Personal Cartera',                '(main)/administracion/personas'],
  ['20 · Persona Ficha 360',               '(main)/administracion/personas/[id]'],
  ['21 · Cuadrillas y HH',                 '(main)/administracion/personas/cuadrillas'],
  ['22 · Proveedores Cartera',             '(main)/administracion/proveedores'],
  ['23 · Proveedor Ficha',                 '(main)/administracion/proveedores/[proveedor]'],
  ['24 · Compras',                         '(main)/control-obras/costos'],
  ['25 · Clientes Cartera',                '(main)/clientes'],
  ['26 · Cliente Ficha',                   '(main)/clientes/[cliente]'],
  ['27 · Documentos',                      '(main)/documentos'],
  ['M01 · Login',                          '(auth)/login'],
  ['M02 · Hoy',                            '(empleado)/hoy'],
  ['M03 · Mi trabajo',                     '(empleado)/mi-trabajo'],
  ['M04 · Detalle tarea',                  '(empleado)/mi-trabajo/tareas/[tarea]'],
  ['M05 · Asistencia',                     '(empleado)/mi-informacion/asistencia'],
  ['M06 · Mis horas',                      '(empleado)/mi-informacion/horas'],
  ['M07 · Reportar problema',              '(empleado)/mi-trabajo/reportar'],
  ['M08 · Mis documentos y recibos',       '(empleado)/mi-informacion/documentos'],
  ['M09 · Yo',                             '(empleado)/mi-informacion'],
  ['J01 · Jefe Hoy',                       '(jefe)/obra/hoy'],
  ['J02 · Jefe Tareas',                    '(jefe)/obra/tareas'],
  ['J03 · Jefe Avance',                    '(jefe)/obra/avance'],
  ['J04 · Jefe Avance masivo',             '(jefe)/obra/avance-masivo'],
  ['J05 · Jefe Personas',                  '(jefe)/obra/personas'],
  ['J06 · Jefe Frente',                    '(jefe)/obra/frente'],
]

export function existeRuta(ruta) {
  return existsSync(join(APP, ruta, 'page.tsx'))
}

function main() {
  const detalle = process.argv.includes('--detalle')
  const canonicas = existsSync(DISENO)
    ? readdirSync(DISENO).filter((f) => f.endsWith('.dc.html') && /^(\d\d|M\d\d|J\d\d) · /.test(f))
        .map((f) => f.replace(/\.dc\.html$/, ''))
    : []

  if (canonicas.length && canonicas.length !== MAPA.length) {
    console.log(`⚠ el contrato tiene ${canonicas.length} pantallas y el mapa de este script ${MAPA.length}: alguna quedó sin mapear`)
    const enMapa = new Set(MAPA.map(([n]) => n))
    for (const c of canonicas) if (!enMapa.has(c)) console.log(`   sin mapear: ${c}`)
  }

  const filas = MAPA.map(([pantalla, ruta]) => ({ pantalla, ruta, existe: existeRuta(ruta) }))
  const con = filas.filter((f) => f.existe).length

  if (detalle) {
    for (const f of filas) {
      console.log(`  ${f.existe ? '·' : '✗'} ${f.pantalla.padEnd(40)} ${f.ruta || '(raíz)'}`)
    }
    console.log('')
  }
  const familia = (p) => (p.startsWith('M') ? 'mobile empleado' : p.startsWith('J') ? 'mobile jefe' : 'escritorio')
  for (const f of ['escritorio', 'mobile empleado', 'mobile jefe']) {
    const g = filas.filter((x) => familia(x.pantalla) === f)
    console.log(`${f.padEnd(16)} ${g.filter((x) => x.existe).length} de ${g.length} con ruta`)
  }
  console.log(`\nTOTAL ${con} de ${filas.length} pantallas tienen su ruta en la aplicación.`)
  console.log('Que la ruta EXISTA no prueba que la pantalla esté terminada: eso lo dice el DoD,')
  console.log('no este script. Lo que se mide acá es cobertura del mapa, nada más.')
}

if (import.meta.url === `file://${process.argv[1]}`) main()
