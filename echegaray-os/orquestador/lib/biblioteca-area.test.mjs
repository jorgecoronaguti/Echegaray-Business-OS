// Test hermético del núcleo de la biblioteca por área. Sin DB, sin API.
import { resolverArea, areaMencionada, nombreArea, componerBiblioteca, formatBiblioteca, formatPanorama, AREAS } from './biblioteca-area.mjs'

let ok = 0
let falla = 0
const check = (nombre, cond) => {
  if (cond) ok++
  else {
    falla++
    console.error(`  FALLA: ${nombre}`)
  }
}

// ── resolverArea: lo que el dueño escribe realmente ──
check('las 8 claves se resuelven a sí mismas', AREAS.every((a) => resolverArea(a.clave) === a.clave))
check('los 8 nombres se resuelven', AREAS.every((a) => resolverArea(a.nombre) === a.clave))
check('"finanzas" → administracion_finanzas', resolverArea('finanzas') === 'administracion_finanzas')
check('"Admin y Finanzas" → administracion_finanzas', resolverArea('Admin y Finanzas') === 'administracion_finanzas')
check('"administración y finanzas" con tilde', resolverArea('administración y finanzas') === 'administracion_finanzas')
check('"rrhh" → personas', resolverArea('rrhh') === 'personas')
check('"jornales" → personas', resolverArea('jornales') === 'personas')
check('"cotizacion" → comercial', resolverArea('cotizacion') === 'comercial')
check('"impuestos" → contabilidad_legales', resolverArea('impuestos') === 'contabilidad_legales')
check('"proveedores" → compras', resolverArea('proveedores') === 'compras')
check('"direccion" → gestion_general (el bucket viejo)', resolverArea('direccion') === 'gestion_general')
// Lo que NO debe hacer: adivinar. Contestar con el área equivocada es peor que no contestar.
check('texto desconocido → null, no adivina', resolverArea('pepe argento') === null)
check('vacío → null', resolverArea('') === null && resolverArea(null) === null)
check('nombreArea de clave desconocida devuelve la clave', nombreArea('zzz') === 'zzz')

// ── areaMencionada: la detección que evita que el volcado general secuestre la pregunta ──
check('nombra personas en una frase', areaMencionada('¿qué sabés del área de personas y qué le falta?') === 'personas')
check('nombra finanzas en una frase', areaMencionada('mostrame la biblioteca de finanzas') === 'administracion_finanzas')
check('"administración y finanzas" completo', areaMencionada('qué le falta a administración y finanzas') === 'administracion_finanzas')
check('nombra calidad', areaMencionada('qué tenemos pendiente en calidad') === 'calidad')
// Lo que NO debe hacer: agarrar preguntas ajenas.
check('pregunta general no menciona área', areaMencionada('¿qué sabés de la empresa?') === null)
check('"cuánta caja hay" NO es el área de finanzas', areaMencionada('cuánta caja hay hoy') === null)
check('"la obra Messina" NO es el área Obras', areaMencionada('cómo viene la obra Messina') === null)
check('dos áreas nombradas → null, no elige', areaMencionada('compará compras contra personas') === null)
check('vacío → null', areaMencionada('') === null)

// ── componerBiblioteca ──
const piezas = [
  { tipo: 'afirmacion', titulo: 'Los saldos están en la pestaña Caja', confianza: '0.95', activo: true },
  { tipo: 'fuente', titulo: 'Cash Flow', confianza: 'alta', activo: true },
  { tipo: 'pregunta', titulo: '¿Cuánta caja libre hay?', activo: true },
  { tipo: 'pregunta', titulo: 'ya cerrada', activo: false },
  { tipo: 'pendiente', titulo: 'Conciliar banco', activo: true },
  { tipo: 'pendiente', titulo: 'resuelto', activo: false },
  { tipo: 'accion', titulo: 'Llamar a Messina', activo: true },
  { tipo: 'capacidad', titulo: 'Tesorería', confianza: '2', activo: true },
]
const r = componerBiblioteca({ area: 'administracion_finanzas', piezas })
check('total cuenta todas las piezas', r.total === 8)
check('nombre del área resuelto', r.area_nombre === 'Administración y Finanzas')
check('sabe trae la afirmación con su confianza', r.sabe.length === 1 && r.sabe[0].confianza === '0.95')
check('preguntas: sólo las activas', r.preguntas_abiertas.length === 1)
check('pendientes: sólo los activos', r.pendientes.length === 1)
check('acciones abiertas', r.acciones_abiertas.length === 1)
check('capacidad declarada con nivel', r.capacidad_declarada[0].nivel === '2')
// El hueco que importa: sin reportes definidos hay que decirlo aunque el área tenga datos.
check('declara el hueco de reportes', r.huecos.some((h) => h.includes('reporte')))
check('no inventa hueco de afirmaciones si las hay', !r.huecos.some((h) => h.includes('afirmación')))

// Un área vacía (Calidad, al 20/07) debe gritar, no quedar en blanco.
const vacia = componerBiblioteca({ area: 'calidad', piezas: [] })
check('área vacía: total 0', vacia.total === 0)
check('área vacía: declara los 3 huecos', vacia.huecos.length === 3)
check('área vacía: dice que no sabe nada', vacia.huecos.some((h) => h.includes('no sabe nada')))

// ── formato ──
const txt = formatBiblioteca(r)
check('formato: encabezado con el área', txt.startsWith('BIBLIOTECA — ADMINISTRACIÓN Y FINANZAS'))
check('formato: incluye la afirmación', txt.includes('pestaña Caja'))
check('formato: no muestra la pregunta cerrada', !txt.includes('ya cerrada'))
check('formato: muestra el hueco', txt.includes('⚠'))
check('formato: error se declara, no se rompe', formatBiblioteca({ error: 'x' }).includes('No pude'))

const pan = formatPanorama([
  { area: 'compras', total: 11, sabe: 1, fuentes: 1, preguntas: 1, pendientes: 0 },
  { area: 'calidad', total: 0, sabe: 0, fuentes: 0, preguntas: 0, pendientes: 0 },
  { area: null, total: 35, sabe: 0, fuentes: 0, preguntas: 0, pendientes: 31 },
])
check('panorama: lista las áreas', pan.includes('Compras'))
check('panorama: expone las sin clasificar', pan.includes('SIN CLASIFICAR: 35'))
check('panorama: marca las áreas sin afirmaciones', pan.includes('Calidad'))
check('panorama: la fila null no se imprime como área', !/\n {2}null/.test(pan))

console.log(`biblioteca-area.test: ${ok} OK, ${falla} FALLA`)
if (falla) process.exit(1)
