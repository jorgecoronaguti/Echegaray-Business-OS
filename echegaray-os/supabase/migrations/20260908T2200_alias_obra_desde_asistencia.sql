-- ALIAS DE OBRA PROBADOS POR LA PESTAÑA `ASISTENCIA` DEL SHEET DE NÓMINA.
--
-- QUÉ SE ROMPIÓ. La imputación de obra en `registros_hh` venía del import de JORNALES, cuyo rótulo
-- es de la QUINCENA de la persona, no del día. Dos rótulos concretos —«LA ESTRELLA · Cierre de Obra»
-- (106 días) y «JAVIER SANCHEZ · Mamposteria» (71 días)— caían al alias del CLIENTE (`estrella`,
-- `javier sanchez`), y así 7 personas quedaron trabajando en `la-estrella`, una obra cerrada de un
-- cliente sin obra activa, entre el 17/08 y el 08/09/2026.
--
-- POR QUÉ ESTOS ALIAS NO ARREGLAN AQUEL RÓTULO, Y NO SE INTENTA. Medido contra la planilla del
-- dueño: los 106 días de «LA ESTRELLA · Cierre de Obra» corresponden a SEIS obras distintas, y los
-- 71 de «JAVIER SANCHEZ · Mamposteria» a otras seis. Ningún alias puede mapear uno-a-muchos: darles
-- una obra sería fabricar el dato que JORNALES no tiene. La obra por día la dice `ASISTENCIA`, y ésa
-- es la fuente que hay que leer. Tampoco se toca el alias `estrella`: lo usan los egresos por área
-- para imputar gasto del cliente, y borrarlo rompería esa imputación sin arreglar ésta.
--
-- QUÉ SÍ SE AGREGA. Los pares CLIENTE+OBRA que la planilla usa textualmente y resuelven a UNA obra.
-- Ganan por especificidad (`resolutorDeObra` prueba «cliente obra» antes que «cliente» solo), así que
-- un rótulo completo ya no puede volver a caer en la obra madre.
--
-- Idempotente: `on conflict do nothing`. No borra ni reescribe ningún alias existente.

insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw) values
  ('san francisco js imotor pisos industriales', 'pisos-industriales',   'obra', 'SAN FRANCISCO - JS - IMOTOR · Pisos Industriales'),
  ('san francisco js imotor entrepiso',          'entrepiso-y-escalera', 'obra', 'SAN FRANCISCO - JS - IMOTOR · Entrepiso'),
  ('san francisco js imotor mamposteria',        'sf-mamposteria',       'obra', 'SAN FRANCISCO - JS - IMOTOR · Mamposteria'),
  ('js imotor pisos industriales',               'pisos-industriales',   'obra', 'JS - IMOTOR · Pisos Industriales'),
  ('js imotor entrepiso',                        'entrepiso-y-escalera', 'obra', 'JS - IMOTOR · Entrepiso'),
  ('js imotor mamposteria',                      'sf-mamposteria',       'obra', 'JS - IMOTOR · Mamposteria'),
  ('estrella fabrica palitos y oficinas',        'le-comedor',           'obra', 'La Estrella · Fabrica de Palitos y oficinas'),
  ('estrella galpon 9',                          'le-galpon-9',          'obra', 'La Estrella · Galpon 9'),
  ('manofacturas quimicas juan messinas bsa',    'messina-bsa',          'obra', 'Manofacturas Quimicas Juan Messinas · BSA'),
  ('franco quattropani salon comercial',         'quattropani',          'obra', 'Franco Quattropani · Salon Comercial')
on conflict (alias) do nothing;
