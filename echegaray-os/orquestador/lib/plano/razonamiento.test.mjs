// EL RAZONAMIENTO DEL COTIZADOR — cada test protege una trampa que ya costó plata en otro lado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { rolDe, ROL, seccionDe, razonar, textoDeRazonamiento, pasoExcavaciones, pasoVigasFundacion, pasoSuperficies } from './razonamiento.mjs'
import { validarGrilla, validarLamina } from './interpretar.mjs'

test('rolDe: lo específico ANTES que lo general — un muerto no es una base, una VF no es viga de carga', () => {
  assert.equal(rolDe({ id: 'MA1', nombre: 'Muerto de anclaje MA1' }), ROL.MUERTO)
  assert.equal(rolDe({ id: 'B0', nombre: 'Base B0 hormigón' }), ROL.BASE)
  assert.equal(rolDe({ id: 'Z1', nombre: 'Zapata aislada' }), ROL.BASE)
  assert.equal(rolDe({ id: 'VF10', nombre: 'Viga de fundación VF10' }), ROL.VIGA_FUNDACION)
  assert.equal(rolDe({ id: 'V1', nombre: 'Viga de carga V1' }), ROL.VIGA_CARGA)
  assert.equal(rolDe({ id: 'T1', nombre: 'Tensor cruz de San Andrés' }), ROL.ARRIOSTRAMIENTO)
  assert.equal(rolDe({ id: 'EN1', nombre: 'Viga de encadenado superior' }), ROL.ENCADENADO)
  assert.equal(rolDe({ id: 'C1', nombre: 'Columna C1(30-50)' }), ROL.COLUMNA)
  assert.equal(rolDe({ id: 'EXC', nombre: 'Excavación de zanjas', sistema: 'movimiento_suelo' }), ROL.EXCAVACION)
  assert.equal(rolDe({ id: 'PORTON', nombre: 'Portón corredizo' }), ROL.OTRO)
})

test('seccionDe: primero las dimensiones citadas; después el texto del plano; sin cita, null (nunca una típica)', () => {
  assert.equal(seccionDe({ dimensiones: { ancho_m: 0.3, alto_m: 0.5 } }).texto, '30×50 cm')
  const t = seccionDe({ dimensiones: {}, nombre: 'Columna C1(30-50)' })
  assert.match(t.texto, /30-50/)
  assert.equal(seccionDe({ dimensiones: {}, nombre: 'Columna C1' }), null)
})

test('excavaciones: SIN profundidad no hay m³ y el faltante sale con nombre; CON las tres medidas, volumen en banco', () => {
  const sin = pasoExcavaciones([{ id: 'EXC-B', nombre: 'Excavación de bases', dimensiones: { ancho_m: 0.8, largo_m: 0.8 }, cantidadElementos: 10 }])
  assert.equal(sin.conVolumen.length, 0)
  assert.match(sin.faltan[0], /EXC-B: falta la PROFUNDIDAD/)
  const con = pasoExcavaciones([{ id: 'EXC-B', nombre: 'Excavación de bases', dimensiones: { ancho_m: 1, largo_m: 1, profundidad_m: 1.2 }, cantidadElementos: 10 }])
  assert.equal(con.conVolumen.length, 1)
  assert.equal(con.conVolumen[0].volumenBanco, 12, '1×1×1,2 × 10 elementos = 12 m³ en banco')
  assert.match(con.conVolumen[0].nota, /sobreancho/)
})

test('sísmica: si ninguna lámina la nombra es DESCONOCIDO (no «no tiene»); si la nombra, sale la cita', () => {
  const sinNada = pasoVigasFundacion([], [{ elementos: [], proyecto: { notas_generales: [] } }])
  assert.equal(sinNada.sismica.declarada, false)
  assert.match(sinNada.sismica.nota, /DESCONOCIDO/)
  const declarada = pasoVigasFundacion([], [{ elementos: [{ especificacion: 'según CIRSOC 103 zona sísmica 4', evidencia: {} }] }])
  assert.equal(declarada.sismica.declarada, true)
  assert.match(declarada.sismica.cita, /CIRSOC 103/)
})

test('superficies: sólo las declaradas con cita; la impronta sale como CÁLCULO con sus entradas', () => {
  const laminas = [{
    archivo: 'a.pdf', lamina: { codigo: 'A-01' },
    proyecto: { superficie_cubierta_m2: 191.92 },
    grilla: validarGrilla({ largo_total_m: 20, ancho_total_m: 10, superficies_declaradas: [
      { que: 'salón', area_m2: 191.92, texto_literal: 'Salon 191.92m²' },
      { que: 'inventada', area_m2: 50 }, // sin cita NO entra
    ] }),
  }]
  const s = pasoSuperficies(laminas)
  assert.equal(s.cubiertaDeclarada.area, 191.92)
  assert.equal(s.declaradas.length, 1, 'una superficie sin texto literal no existe')
  assert.equal(s.improntas[0].area, 200)
  assert.match(s.improntas[0].calculo, /20 m × 10 m/)
  assert.match(s.faltan.join(' '), /semicubierta/, 'lo no declarado se nombra')
})

test('validarLamina CONSERVA la grilla (antes se tiraba) y la valida', () => {
  const l = validarLamina({
    lamina: { codigo: 'E-01' },
    grilla: { largo_total_m: 30, ancho_total_m: -5, luces_entre_ejes_m: [5, 'seis', 6.1], texto_literal: 'ejes 1-7 c/5m' },
    elementos: [],
  }, { archivo: 'e.pdf', archivoId: 'x' })
  assert.equal(l.grilla.largoTotal, 30)
  assert.equal(l.grilla.anchoTotal, null, 'un ancho negativo no es un ancho')
  assert.deepEqual(l.grilla.lucesEntreEjes, [5, 6.1])
  assert.equal(l.grilla.textoLiteral, 'ejes 1-7 c/5m')
})

test('el texto del razonamiento contesta los 7 pasos y nombra lo que falta', () => {
  const r = {
    laminas: [{
      archivo: 'e.pdf', lamina: { codigo: 'E-01', vistas: ['PLANTA'] },
      proyecto: {},
      grilla: validarGrilla({ largo_total_m: 20, ancho_total_m: 10, luces_entre_ejes_m: [5, 5, 5], texto_literal: 'ejes A-E' }),
      elementos: [],
    }],
    computo: { items: [
      { id: 'B0', nombre: 'Base B0', cantidadElementos: 4, dimensiones: { ancho_m: 0.6, alto_m: 0.6 }, lamina: 'E-01', faltan: [] },
      { id: 'B1', nombre: 'Base B1', cantidadElementos: 6, dimensiones: {}, lamina: 'E-01', faltan: [] },
      { id: 'MA1', nombre: 'Muerto de anclaje', cantidadElementos: 2, dimensiones: {}, lamina: 'E-01', faltan: [] },
      { id: 'C1', nombre: 'Columna C1(30-50)', cantidadElementos: 8, dimensiones: {}, lamina: 'E-01', faltan: [] },
      { id: 'VF10', nombre: 'Viga de fundación VF10', cantidadElementos: null, dimensiones: {}, lamina: 'E-01', faltan: ['largo'] },
      { id: 'EXC', nombre: 'Excavación de bases', sistema: 'movimiento_suelo', dimensiones: { ancho_m: 1, largo_m: 1 }, cantidadElementos: 4, faltan: [] },
    ] },
    documentos: { planos: { noLegibles: [{ name: 'galpon.dwg' }] } },
  }
  const texto = textoDeRazonamiento(razonar(r), { proyecto: 'demo' })
  assert.match(texto, /B0=4 · sección 60×60 cm/)
  assert.match(texto, /B1=6 · sección sin cita/)
  assert.match(texto, /muertos de anclaje: MA1=2/)
  assert.match(texto, /columnas: C1=8 · sección .*30-50/)
  assert.match(texto, /VF10=\? \(cantidad incompleta: largo\)/)
  assert.match(texto, /impronta \(CÁLCULO\): 200\.0 m²/)
  assert.match(texto, /E-01: 5 · 5 · 5 m/)
  assert.match(texto, /NO legibles: galpon\.dwg/)
  assert.match(texto, /EXC: falta la PROFUNDIDAD/)
  assert.match(texto, /sísmica: la documentación leída no menciona/)
})
