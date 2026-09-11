# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

La audiencia primaria son **desarrolladores y clientes potenciales** evaluando el
trabajo: Extracto se usa como demo y pieza de portafolio técnico. Quien la abre llega
sin contexto, sube un documento suyo y decide en un par de minutos si la máquina de
debajo es seria.

La escena secundaria —y la que la interfaz debe hacer creíble— es la de alguien que
archiva sus propias facturas, recibos y contratos: sube el documento, revisa lo que el
modelo leyó, corrige lo que esté mal y lo guarda.

## Product Purpose

Convertir un documento (imagen o PDF, incluidos escaneos) en datos estructurados
revisados por una persona, guardados en tablas consultables y con su texto indexado
para poder preguntarle cosas después.

Éxito es que un visitante suba un documento propio, vea el JSON correcto, entienda de
un vistazo qué se validó y qué no, y acabe preguntándole algo al archivo.

## Positioning

Tres cosas que un extractor genérico no puede copiar sin construirlas:

1. **La validación es del dominio, no del formato.** Cada tipo de documento tiene su
   propio esquema Zod: una factura exige número, partes y que `subtotal + impuestos =
   total`; un recibo no exige receptor; un contrato exige objeto y vigencia. Las fechas
   deben existir en el calendario.
2. **El humano corrige antes de confirmar.** Lo extraído es un borrador editable con
   los campos inválidos señalados; solo lo válido pasa a las tablas. Nada se guarda
   como definitivo sin una revisión.
3. **Dos caminos para preguntar.** Las preguntas de cálculo se responden con SQL
   generado sobre las tablas; las de contenido, con búsqueda semántica sobre los
   embeddings. Ambas citan el documento de origen.

## Operating Context

El ciclo completo, y el orden en que ocurre:

1. Subir (arrastrar o elegir) una imagen o PDF de hasta 20 MB.
2. Analizar: el modelo de visión clasifica el documento, extrae sus campos y transcribe
   su texto.
3. Revisar y corregir en un formulario, con los campos inválidos marcados.
4. Confirmar: los datos pasan a tablas relacionales y el texto se indexa como
   embeddings.
5. Consultar: la lista de documentos guardados y un chat que responde citando fuentes.

Los documentos son españoles y europeos: NIF/CIF, IVA, euros, fechas `AAAA-MM-DD`,
importes con coma decimal.

## Capabilities and Constraints

- Formatos: PNG, JPG, WebP, GIF y PDF; 20 MB por archivo. Los PDF escaneados pasan por
  OCR, así que también se leen.
- Tipos: factura, recibo, contrato y otro.
- El archivo original se guarda en la base y se sirve para la vista previa.
- El análisis tarda entre 10 y 20 segundos; el chat de cálculo encadena dos llamadas al
  modelo y puede acercarse al medio minuto. La espera es parte de la interfaz, no una
  excepción.
- El modelo se equivoca: deja campos en null, normaliza fechas y a veces confunde
  precio unitario con importe. Anota sus dudas en «notas», y esas notas son contenido
  de primera, no ruido.
- Sin cuentas ni permisos: quien abre la página ve todos los documentos.
- Stack: Next.js 16 (App Router), React 19, Tailwind 4, PostgreSQL 16 con pgvector,
  modelos vía OpenRouter. Desplegado en Seenode.

## Brand Commitments

- Nombre: **Extracto**.
- Todo el producto está en español, incluidos los datos extraídos.
- No hay logo, paleta ni tipografía comprometidos: el rediseño los decide.
- **Preferencia declarada por el usuario (2026-09-11):** el producto debe seguir el
  estándar de la categoría ejecutado a plena fidelidad, no una dirección de autor. La
  vara de medir del acabado son **Stripe, Mercury y Ramp**: cifras tabulares
  impecables, jerarquía tranquila, mucho blanco, estados de validación explícitos y un
  color de marca que aparece poco pero con autoridad. Esta preferencia es duradera:
  futuras rondas de dirección no deben proponer un mundo de autor salvo que el usuario
  lo pida.

## Evidence on Hand

- Documentos reales de prueba generados para la demo (factura, recibo y contrato
  escaneado) en el directorio de trabajo temporal de la sesión.
- Extracciones verdaderas ya guardadas en producción, con sus casos interesantes: una
  factura correcta, un recibo cuyo subtotal impreso no cuadra con la suma de líneas, un
  contrato con cláusulas.
- 136 tests que cubren esquemas, rutas y seguridad del SQL generado.
- URL pública: https://extracto.seenode.app
- No hay clientes, testimonios, métricas de uso ni precios: nada de eso puede
  aparecer inventado en la interfaz.

## Product Principles

1. **El documento manda.** Todo dato mostrado debe poder contrastarse con el original a
   la vista; nunca se pide confiar a ciegas en el modelo.
2. **Lo dudoso se dice.** Campos vacíos, cuentas que no cuadran y notas del modelo se
   muestran, no se disimulan.
3. **Confirmar es un acto deliberado.** Hay una frontera visible entre borrador y dato
   guardado, y solo se cruza con la validación limpia.
4. **Cada respuesta trae su fuente.** Ninguna cifra del chat aparece sin el documento
   del que sale.
5. **La espera se explica.** El trabajo del modelo es lento y visible; el producto
   cuenta qué está haciendo en vez de fingir instantaneidad.

## Accessibility & Inclusion

Sin requisito formal establecido. Restricciones reales del producto: el estado de
validación no puede comunicarse solo con color (hay daltónicos revisando cifras), y el
formulario debe ser recorrible con teclado, porque corregir campos es su uso principal.
