// LA SOLAPA «COSTO A LA OBRA»: el costo real de la hora (pantalla 5) y la quincena cargada a la obra
// (pantalla 6), una debajo de la otra. Las dos pantallas nacieron con props `{ quincena, hoy }`
// (registro-costo.ts) antes de que existiera el registro común de solapas (`index.ts`, props
// `{ quincenaPedida, hoy, … }`): este archivo es el puente, para que el registro tenga UNA forma y
// las pantallas no se reescriban.
//
// PRODUCTIVIDAD (pantalla 7) VA TERCERA Y NO ES UNA SOLAPA PROPIA: la obra primero ve cuánto le
// costó la quincena y recién después si esas horas produjeron. Sacarla a la barra rompería esa
// secuencia y dejaría la pregunta cara —«¿rindió?»— a un clic de distancia de su respuesta.
import type { PropsDeSolapa } from './index'
import { SolapaCostoHora } from './costo-hora'
import { SolapaCostoObra } from './costo-obra'
import { SolapaProductividad } from './productividad'
import { quincenaDe } from '../../../services/quincena'

export async function SolapaCosto(props: PropsDeSolapa) {
  const quincena = quincenaDe(props.quincenaPedida ?? props.hoy)
  return (
    <div style={{ display: 'grid', gap: 32 }}>
      {await SolapaCostoHora({ quincena, hoy: props.hoy })}
      {await SolapaCostoObra({ quincena, hoy: props.hoy })}
      {await SolapaProductividad({ quincenaPedida: props.quincenaPedida, hoy: props.hoy })}
    </div>
  )
}
