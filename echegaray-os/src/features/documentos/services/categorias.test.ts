// EL DEFECTO QUE ATRAPA: que el chip de categoría y la etiqueta de la fila digan cosas distintas
// sobre el mismo archivo, y que la taxonomía se coma casos reales del Drive de la empresa.
//
//  1 · SIN PRIORIDAD, un archivo cae en dos categorías. «Certificado Afiliacion - ART.pdf» existe
//      y matchea `certificados` Y `seguros`; sin un orden, el mismo PDF aparece en dos chips y la
//      pantalla contradice a la pantalla.
//  2 · SIN LA NEGACIÓN DE LOS PATRONES ANTERIORES, el filtro de Postgres devuelve MÁS filas que las
//      que la etiqueta dice: entrarían por `certificados` archivos cuya fila dice «Seguros». Ése es
//      el bug que no se ve mirando la pantalla, porque la fila sí está bien etiquetada.
//  3 · `.dwg` ES UN PLANO, no una imagen. Son 22 archivos con mime `image/vnd.dwg` que el indexador
//      clasifica como `tipo = 'imagen'`; por eso la regla mira la extensión, no el `tipo`.
//  4 · `FACTURAS A` NO ES COMPRAS. Son 203 facturas EMITIDAS por ECSAS (el CUIT del nombre es el de
//      la empresa). Meterlas en `compras` es confundir facturación con costo.
//  5 · UNA COLUMNA VACÍA NO CLASIFICA. `NULL LIKE '%'` es NULL en SQL, no `true`; si acá devolviera
//      `true`, un archivo sin ruta caería en la primera categoría que use `path`.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORIAS, categoriaDe, coincide, esCategoria, ETIQUETA_CATEGORIA,
  patronesAnteriores, patronesDe, type ClaveCategoria,
} from './categorias.ts'

/** Un archivo como lo devuelve el índice: la ruta real y el `nombre_norm` que escribe el indexador. */
const arch = (path: string, nombre_norm: string) => ({ path, nombre_norm })

// ── ARCHIVOS QUE EXISTEN DE VERDAD EN EL DRIVE (medidos el 21/08/2026) ─────────────────────────

const REALES: [ClaveCategoria, ReturnType<typeof arch>][] = [
  ['personal', arch('administracion/PERSONAL: ALTAS - BAJAS - HM - EPP - DNI/1. ACTIVOS/ALANIZ EMANUEL/alta.pdf', 'alta')],
  ['personal', arch('libro-sueldos/2025/06 junio.pdf', 'libro sueldos junio')],
  ['seguros', arch('administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/COCHERAS/POLIZAS - CERTIFICADOS - FACTURAS/POLIZA DE CAUCION.pdf', 'poliza de caucion')],
  ['seguros', arch('administracion/Archivos GESTIÓN ECSAS/VEHICULOS/TOYOTA HILUX EEA-885/Hilux EEA885 - Seguro.pdf', 'hilux eea885 seguro')],
  ['certificados', arch('administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/certificado n 4.pdf', 'certificado n 4')],
  ['contrato', arch('administracion/Archivos GESTIÓN ECSAS/Contrato Social - Constitucion ECSAS/estatuto.pdf', 'contrato social ecsas')],
  ['compras', arch('administracion/PRESUPUESTOS - CLIENTES/MESSINA/remito 0001.pdf', 'remito 0001')],
  // El 51% del archivo. `PRESUPUESTOS - CLIENTES` y `archivo-fiscal` no son ninguna de las siete
  // categorías del canónico, y forzarlas a una haría un chip que miente a escala.
  ['otros', arch('archivo-fiscal/2025/DDJJ IVA 08-2025.pdf', 'ddjj iva 08 2025')],
]

for (const [esperada, archivo] of REALES) {
  test(`«${archivo.nombre_norm}» es ${esperada}`, () => {
    assert.equal(categoriaDe(archivo), esperada)
  })
}

test('el certificado de afiliación a la ART es un SEGURO, no un certificado', () => {
  // Existe: administracion/PRESUPUESTOS - CLIENTES/MESSINA/…/CertificadoAfiliacion ART.pdf
  const a = arch('administracion/PRESUPUESTOS - CLIENTES/MESSINA/CertificadoAfiliacion ART.pdf', 'certificadoafiliacion art')
  assert.equal(categoriaDe(a), 'seguros', 'sin prioridad, el mismo PDF sale en dos chips distintos')
})

test('lo que está en el legajo es del legajo, aunque se llame contrato o póliza', () => {
  const a = arch('administracion/PERSONAL: ALTAS - BAJAS - HM - EPP - DNI/1. ACTIVOS/GOMEZ/contrato.pdf', 'contrato')
  assert.equal(categoriaDe(a), 'personal', 'la regla estructural perdió contra la léxica')
})

test('un .dwg es un PLANO, no evidencia — aunque su mime sea image/vnd.dwg', () => {
  assert.equal(categoriaDe(arch('administracion/obra/EEA885.dwg', 'eea885')), 'planos')
  // La foto de avance sí es evidencia.
  assert.equal(categoriaDe(arch('administracion/obra/IMG_2231.jpg', 'img 2231')), 'evidencia')
})

test('las facturas EMITIDAS por ECSAS no son compras', () => {
  // 203 archivos. El 30716304643 del nombre es el CUIT de la empresa: son ventas.
  const a = arch('administracion/Archivos GESTIÓN ECSAS/FACTURAS A/30716304643_001_00001_00000129.pdf', '30716304643 001 00001 00000129')
  assert.equal(categoriaDe(a), 'otros', 'contó facturación propia como costo')
})

test('«art» sólo cuenta como palabra entera: no engancha carta, cuarto ni tarta', () => {
  assert.equal(categoriaDe(arch('x/carta documento.pdf', 'carta documento')), 'otros')
  assert.equal(categoriaDe(arch('x/cuarto piso.pdf', 'cuarto piso')), 'otros')
  assert.equal(categoriaDe(arch('x/ART.pdf', 'art')), 'seguros')
  assert.equal(categoriaDe(arch('x/ART Yeseros del Cuyo.pdf', 'art yeseros del cuyo')), 'seguros')
  assert.equal(categoriaDe(arch('x/afiliacion ART.pdf', 'afiliacion art')), 'seguros')
})

// ── LA INVARIANTE QUE ATA EL CHIP A LA FILA ────────────────────────────────────────────────────

test('los patrones anteriores de cada categoría son EXACTAMENTE los de las de mayor prioridad', () => {
  // Es la traducción del `for` de `categoriaDe` al `NOT ilike` del filtro SQL. Si alguien reordena
  // `CATEGORIAS` y esto no acompaña, el filtro devuelve filas que la tabla etiqueta de otra forma.
  for (let i = 0; i < CATEGORIAS.length; i += 1) {
    const esperados = CATEGORIAS.slice(0, i).flatMap((c) => c.patrones)
    assert.deepEqual(patronesAnteriores(CATEGORIAS[i].clave), esperados, `falló en ${CATEGORIAS[i].clave}`)
  }
  // `otros` se define por exclusión: tiene que negar TODOS los patrones y no tener ninguno propio.
  assert.deepEqual(patronesDe('otros'), [])
  assert.equal(patronesAnteriores('otros').length, CATEGORIAS.flatMap((c) => c.patrones).length)
})

test('el filtro SQL simulado devuelve lo mismo que etiqueta la fila', () => {
  // Se reproduce en TypeScript lo que arma `conCategoria`: patrones propios EN OR, patrones
  // anteriores EN NOT. Si las dos definiciones se separan, este test se pone rojo.
  const universo = REALES.map(([, a]) => a).concat([
    arch('administracion/PRESUPUESTOS - CLIENTES/MESSINA/CertificadoAfiliacion ART.pdf', 'certificadoafiliacion art'),
    arch('administracion/obra/EEA885.dwg', 'eea885'),
    arch('administracion/obra/IMG_2231.jpg', 'img 2231'),
  ])
  const claves: ClaveCategoria[] = [...CATEGORIAS.map((c) => c.clave), 'otros']

  for (const clave of claves) {
    const propios = patronesDe(clave)
    const anteriores = patronesAnteriores(clave)
    const porSql = universo.filter((a) => {
      const entra = propios.length === 0 || propios.some((p) => coincide(a[p.campo], p.patron))
      const excluido = anteriores.some((p) => coincide(a[p.campo], p.patron))
      return entra && !excluido
    })
    const porEtiqueta = universo.filter((a) => categoriaDe(a) === clave)
    assert.deepEqual(porSql, porEtiqueta, `el chip «${clave}» y la fila no coinciden`)
  }
})

// ── LOS BORDES ────────────────────────────────────────────────────────────────────────────────

test('una columna vacía no clasifica: NULL no coincide ni con «%»', () => {
  assert.equal(coincide(null, '%'), false, 'un archivo sin ruta iba a caer en la primera regla de path')
  assert.equal(categoriaDe({ path: null, nombre_norm: null }), 'otros')
})

test('el patrón se compara entero, no por pedazos', () => {
  assert.equal(coincide('libro-sueldos/2025/x.pdf', 'libro-sueldos/%'), true)
  assert.equal(coincide('otro/libro-sueldos/x.pdf', 'libro-sueldos/%'), false, 'ancló en cualquier lado')
  // El punto y el guion son literales, no comodines de expresión regular.
  assert.equal(coincide('planos/casa.dwg', '%.dwg'), true)
  assert.equal(coincide('planos/casaXdwg', '%.dwg'), false, 'el punto se leyó como «cualquier carácter»')
  assert.equal(coincide('PLANOS/CASA.DWG', '%.dwg'), true, 'ilike es insensible a mayúsculas')
})

test('sólo se acepta una clave de categoría conocida', () => {
  assert.equal(esCategoria('planos'), true)
  assert.equal(esCategoria('otros'), true)
  assert.equal(esCategoria('inventada'), false, 'una clave de la URL iba a llegar al filtro SQL')
  assert.equal(esCategoria(undefined), false)
})

test('toda categoría tiene etiqueta legible, incluida «otros»', () => {
  for (const c of CATEGORIAS) assert.equal(ETIQUETA_CATEGORIA[c.clave], c.etiqueta)
  assert.equal(ETIQUETA_CATEGORIA.otros, 'Otros')
})
