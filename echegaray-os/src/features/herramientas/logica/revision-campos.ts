// QUÉ CAMPOS LLEVA CADA REVISIÓN — puro: sin React, sin base.
//
// Antes el formulario era uno solo y sólo cambiaba algún rótulo: un seguro mostraba kilometraje y «resultado»,
// un service pedía «vence». Cada papel dice cosas distintas: la RTO trae oblea, planta y resultado; la póliza
// trae número, compañía y vigencia; el service trae lectura (km u horas), taller y la fecha del próximo.
// Lo que un tipo no lleva NO se dibuja y NO se manda: un campo oculto con un valor viejo no viaja.

import type { ClaseRevisable, ResultadoRevision, TipoRevision } from './revision.ts'

export interface CamposRevision {
  /** «Cargar RTO», «Cargar seguro»…: lo que dice el encabezado del formulario y el botón. */
  titulo: string
  guardar: string
  fecha: string
  vence: string
  /** Sin vencimiento la revisión no sirve de aviso: RTO y seguro lo exigen. */
  venceObligatorio: boolean
  lectura: string | null
  numero: string | null
  lugar: string | null
  costo: boolean
  resultado: boolean
  foto: string
}

export function camposDe(tipo: TipoRevision, clase: ClaseRevisable): CamposRevision {
  const lectura = clase === 'rodado' ? 'Kilometraje' : 'Horas del horómetro'
  switch (tipo) {
    case 'rto':
      return {
        titulo: 'Cargar RTO', guardar: 'Guardar RTO', fecha: 'Fecha de la revisión', vence: 'Vence', venceObligatorio: true,
        lectura, numero: 'N° de certificado / oblea', lugar: 'Planta de RTO', costo: true, resultado: true, foto: 'Foto del certificado',
      }
    case 'seguro':
      return {
        titulo: 'Cargar seguro', guardar: 'Guardar seguro', fecha: 'Vigente desde', vence: 'Vence la póliza', venceObligatorio: true,
        lectura: null, numero: 'N° de póliza', lugar: 'Compañía', costo: true, resultado: false, foto: 'Foto de la póliza',
      }
    case 'service':
      return {
        titulo: 'Cargar service', guardar: 'Guardar service', fecha: 'Fecha del service', vence: 'Próximo service (fecha)', venceObligatorio: false,
        lectura: `${lectura} del service`, numero: 'N° de orden o remito', lugar: 'Taller', costo: true, resultado: false, foto: 'Foto del remito o ticket',
      }
    case 'inspeccion':
      return {
        titulo: 'Cargar inspección', guardar: 'Guardar inspección', fecha: 'Fecha de la inspección', vence: 'Próxima inspección', venceObligatorio: false,
        lectura, numero: 'N° de informe', lugar: 'Quién inspeccionó', costo: false, resultado: true, foto: 'Foto del informe',
      }
  }
}

export interface ValoresRevision {
  fecha: string
  vencimiento: string
  lectura: string
  resultado: ResultadoRevision | ''
  lugar: string
  numero: string
  costo: string
  observaciones: string
}

/** Sólo lo que el tipo lleva: lo demás va vacío aunque la pantalla haya guardado algo al cambiar de tipo. */
export function valoresParaEnviar(tipo: TipoRevision, clase: ClaseRevisable, v: ValoresRevision): ValoresRevision {
  const c = camposDe(tipo, clase)
  return {
    fecha: v.fecha,
    vencimiento: v.vencimiento,
    lectura: c.lectura ? v.lectura : '',
    resultado: c.resultado ? v.resultado : '',
    lugar: c.lugar ? v.lugar : '',
    numero: c.numero ? v.numero : '',
    costo: c.costo ? v.costo : '',
    observaciones: v.observaciones,
  }
}

/** Lo que falta antes de mandar, dicho en la pantalla. `null` = se puede guardar. */
export function faltaParaGuardar(tipo: TipoRevision, clase: ClaseRevisable, v: ValoresRevision): string | null {
  const c = camposDe(tipo, clase)
  if (!v.fecha) return `Falta la ${c.fecha.toLowerCase()}.`
  if (c.venceObligatorio && !v.vencimiento) return `Falta el vencimiento: sin eso no avisa cuando se acerque.`
  if (c.resultado && v.resultado === 'condicional' && !v.vencimiento) return 'Un apto condicional lleva el plazo de la nueva verificación: cargá «Vence».'
  if (c.resultado && tipo === 'rto' && !v.resultado) return 'Elegí el resultado de la RTO: apto, apto condicional o rechazado.'
  return null
}
