// LAS COLUMNAS DE «NOVEDADES PARA EL ESTUDIO», UNA SOLA VEZ: el Excel y el PDF las leen de acá.
//
// Si cada formato armara su lista, el PDF y la planilla que recibe el estudio terminarían con rótulos u orden
// distintos para la misma quincena. Acá sólo se decide QUÉ columna es y de dónde sale su valor; cómo se dibuja es
// cosa de cada formato.
//
// Obreros y oficina tienen columnas distintas porque el estudio les liquida cosas distintas: al obrero, horas por
// $/h de su categoría UOCRA; a la oficina, un mensual. Ninguna columna es un concepto ni un importe del recibo
// (dueño, 30/09/2026): eso lo liquida el estudio.

import type { AlcanceDeNovedades, FilaDeNovedades, GrupoDeNovedades, ReporteDeNovedades } from './novedadesParaElEstudio.ts'

export type Valor = string | number | null

export interface ColumnaDeSalida {
  titulo: string
  tipo: 'texto' | 'horas' | 'plata'
  valor: (f: FilaDeNovedades) => Valor
  /** Ancho relativo en el PDF: los textos largos (nombre, presentismo, observaciones) piden más. */
  peso: number
}

const col = (titulo: string, tipo: ColumnaDeSalida['tipo'], peso: number, valor: ColumnaDeSalida['valor']): ColumnaDeSalida =>
  ({ titulo, tipo, valor, peso })

const IDENTIDAD: readonly ColumnaDeSalida[] = [
  col('Legajo N.º', 'texto', 0.6, (f) => f.legajo),
  col('Apellido y nombre', 'texto', 2, (f) => f.apellidoYNombre),
  col('CUIL', 'texto', 1.1, (f) => f.cuil),
]
const NOVEDADES: readonly ColumnaDeSalida[] = [
  col('Presentismo', 'texto', 2.2, (f) => f.presentismo),
  col('Observaciones', 'texto', 2.4, (f) => f.observaciones || null),
]

const COLUMNAS: Record<GrupoDeNovedades, readonly ColumnaDeSalida[]> = {
  obreros: [
    ...IDENTIDAD,
    col('Categoría UOCRA', 'texto', 1.1, (f) => f.categoria),
    col('$/h blanco', 'plata', 0.8, (f) => f.valorHora),
    col('Hs blanco de la quincena', 'horas', 0.8, (f) => f.horasBlanco),
    ...NOVEDADES,
  ],
  oficina: [
    ...IDENTIDAD,
    col('Convenio', 'texto', 1.6, (f) => f.convenio),
    col('Categoría', 'texto', 1.1, (f) => f.categoria),
    col('Puesto', 'texto', 1.1, (f) => f.puesto),
    ...NOVEDADES,
  ],
}

export const columnasDe = (g: GrupoDeNovedades): readonly ColumnaDeSalida[] => COLUMNAS[g]

const fechaAR = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const ROTULO_ALCANCE: Record<AlcanceDeNovedades, string> = {
  todos: 'Obreros y oficina', obreros: 'Obreros (quincenales por hora)', oficina: 'Oficina (mensuales)',
}

/** Las líneas del encabezado, iguales en el Excel y en el PDF. */
export const lineasDelEncabezado = (r: ReporteDeNovedades): string[] => [
  `${r.empleador.razonSocial} · CUIT ${r.empleador.cuit}`,
  `Quincena: ${fechaAR(r.periodo.desde)} al ${fechaAR(r.periodo.hasta)} (${r.periodo.texto})`,
  `Grupo: ${ROTULO_ALCANCE[r.alcance]} · Emitido el ${fechaAR(r.emision)}`,
]
