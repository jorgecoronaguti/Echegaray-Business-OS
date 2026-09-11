-- ═══ EL DESGLOSE DEL CONTRATO DE LAS OBRAS EN CURSO, LEÍDO DE SUS PAPELES (11/09/2026) ═════════
--
-- Dueño: «si quedan vacías es porque no estás leyendo OBRAS, Cobranzas y las carpetas de Drive de
-- cada una». Se leyeron. En siete de las ocho obras de Messina y San Francisco el precio es 100 %
-- mano de obra: la cotización de Echegaray que antecede a cada OC dice, textual, «La cotización
-- contempla solo mano de obra» y lista en su Nota 2 los materiales que el CLIENTE provee. Por eso
-- `materiales = 0` con su cita: no es un hueco, es lo que dice el papel. BSA no tiene ningún papel
-- que separe mano de obra de materiales (precios por tarea, «Computo de materiales: -») y NO se
-- carga: inventarle un desglose sería fabricar el dato. Dilución de ácido es la única donde el
-- «sólo mano de obra» es inferencia por patrón y no cita textual, y la nota lo dice.
--
-- Importes NETOS. Las OC de Messina traen un renglón único («SERVICIOS DE TERCEROS FCA»): el
-- desglose sale siempre de la cotización, y la OC confirma el importe.

insert into public.obra_contrato
  (obra_id, mano_obra, mano_obra_moneda, materiales, materiales_moneda, fuente_tipo,
   fuente_drive_id, fuente_nombre, cita, nota, cargado_por)
values
  ('entrepiso-y-escalera', 7728254.47, 'ARS', 0, 'ARS', 'presupuesto',
   '1UMA2kA4xDIxNs4DlDkUQ_zSLqk8G4Xio', 'Presupuesto - Entrepiso y escalera.pdf',
   'Nota 1: La cotizacion contempla solo mano de obra. SUB TOTAL 7.728.254,47',
   'Los materiales los provee el cliente. Sin IVA: obras de San Francisco en efectivo (decisión del dueño).',
   'Claude Code · lectura del PDF 11/09/2026'),
  ('instalacion-electrica', 40000000, 'ARS', 0, 'ARS', 'presupuesto',
   '1xpd76tH7zdXc7Rz4D8PpsMcZM932E9LE', 'Presupuesto - Instalacion Electrica.pdf',
   'Nota 1: La cotizacion contempla solo mano de obra. SUB TOTAL 42.876.310,34',
   'Precio pactado $ 40.000.000 (dueño 25/08: «se dejó en 40M») sobre una cotización de $ 42.876.310,34, 100 % mano de obra. Existe «Computo de materiales.pdf» (1SCadzG3vwKhybExBiDnqEWBlJCfp54xj) sin precios: los materiales los compra el cliente.',
   'Claude Code · lectura del PDF 11/09/2026'),
  ('pisos-industriales', 47590271.50, 'ARS', 0, 'ARS', 'presupuesto',
   '1zrfIORKMItqqyHp2GjIVp8ZsYIkJ9DIW', 'PRESUPUESTO - PISOS TOTALES 9:6:26.pdf',
   'Nota 1: La cotizacion contempla solo mano de obra. SUB TOTAL 47.590.271,50',
   'Los materiales los provee el cliente.',
   'Claude Code · lectura del PDF 11/09/2026'),
  ('messina-adicional-tercer-muro', 10000000, 'ARS', 0, 'ARS', 'oc',
   '15QUCmWc1KGfcQqiX-UPo3VDklfNEjqjz', 'OC_32_0000200002256.pdf',
   'OC 2256: Subtotal $10,000,000.00 / I.V.A. $2,100,000.00 / Total $12,100,000.00. Cotización «ADICIONAL MURO.pdf» (1muaFF3Po-POSiVmofxOqVNxGKvl6pLJ0, 27/08/2026): Nota 1: El presupuesto solo contempla mano de obra.',
   'La OC negoció $ 10.000.000 sobre una cotización de $ 10.940.587. Materiales a cargo de Messina.',
   'Claude Code · lectura de OC y cotización 11/09/2026'),
  ('messina-pisos-120-rampa', 9463141.93, 'ARS', 0, 'ARS', 'presupuesto',
   '1d-u515rso_v01m8csfy8-Df2g1-fR5Pz', 'COTIZACION PISOS 120m2 - 11:6.pdf + Rampa 19:2.pdf',
   'Pisos: SUB TOTAL 7.108.886,54 (OC 2097). Rampa: SUB TOTAL 2.354.255,39 (OC 2226). En las dos: Nota 1: La cotizacion contempla solo mano de obra.',
   'Rampa: cotización 1QioaEfc-FDbareikGjc2W0TzJ8wPclWr (19/08/2026). Nota 2 de cada cotización lista mallas, H17, cuarzo y cemento que provee Messina.',
   'Claude Code · lectura de cotizaciones y OC 11/09/2026'),
  ('messina-playon-azufre', 102500000, 'ARS', 0, 'ARS', 'presupuesto',
   '1jV2w0MnqX_YC4N51Idgk2q2rB6cekTZD', 'PLATEA DE HORMIGON - AGOSTO 2026.pdf',
   'SUB TOTAL 105.354.758,10. Nota 1: El presupuesto solo contempla mano de obra. OC 2173: Subtotal $65,000,000.00 (blanco).',
   'Contratado $ 102.500.000 = $ 65.000.000 con OC 2173 + $ 37.500.000 sin OC (nota firmada por Rodrigo Echegaray 10/09/2026). Materiales a cargo de Messina.',
   'Claude Code · lectura de cotización y OC 11/09/2026'),
  ('messina-playon-dilucion-acido', 20090867.83, 'ARS', 0, 'ARS', 'presupuesto',
   '16y2ktLDluPOmx3SVJT-hZ2r0fSi6BShz', 'Cotizacion - Playon para dilución de ácido.pdf',
   'SUB TOTAL 20.090.867,83 (OC 2266: Subtotal $20,090,867.83). Nota 2 lista los materiales que aporta Messina (mallas Ø8 y Ø10, H-8, H21, cuarzo, fondo de junta).',
   'INFERENCIA: esta cotización NO dice «solo mano de obra» en forma textual; se infiere del patrón de las otras cuatro y de la Nota 2. El dueño marcó la obra para recotizar (alcance cambiado 03–08/09). Confirmar con Rodrigo antes de facturar.',
   'Claude Code · lectura de cotización y OC 11/09/2026')
on conflict (obra_id) do nothing;
