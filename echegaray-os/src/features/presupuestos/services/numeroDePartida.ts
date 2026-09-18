import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'

// EL NÚMERO QUE SE TECLEA EN UNA PARTIDA — puro, para poder probarlo sin servidor.
//
// «1.500» ES MIL QUINIENTOS (auditoría, 18/09/2026). `Number(t.replace(',', '.'))` cambia la coma y deja el
// punto, así que en San Juan —donde el punto separa miles— «1.500» se guardaba 1,5: un factor de mil en la
// cantidad de una partida, sin error y sin aviso. Se lee con `leerNumeroEsAR`, el mismo lector que usa el deshacer
// para comparar: dos lectores del mismo número discrepaban también ahí («la celda la cambió otra persona» sobre
// una celda que nadie tocó). Límite del lector, dicho: un punto seguido de EXACTAMENTE tres dígitos es de miles,
// así que «0.500» se lee 500; en es-AR eso se escribe «0,500».

export function aNumeroOpcional(v: FormDataEntryValue | null): number | null | 'error' {
  const t = String(v ?? '').trim()
  if (t === '') return null
  const l = leerNumeroEsAR(t)
  return l.ok && l.valor != null && l.valor >= 0 ? l.valor : 'error'
}
