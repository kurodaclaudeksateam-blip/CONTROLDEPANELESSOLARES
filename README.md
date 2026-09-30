# ☀️ Control de Paneles Solares

Aplicación web para registrar el **consumo** y el **rendimiento** de una instalación de paneles solares.
Es 100 % estática (HTML + CSS + JavaScript): no necesita servidor ni base de datos; los datos se guardan en el navegador (`localStorage`).

## Funciones

- **Multiempresa**: registra varias **razones sociales** y sus **sucursales**; cada sucursal tiene su propia potencia instalada y HSP.
- **Filtros** por razón social, sucursal y periodo en el Panel y el Historial.
- **Modo claro / oscuro / automático** (botón 🖥️/☀️/🌙) y **6 paletas de color** (botón 🎨): Solar, Verde, Azul, Morado, Rosa y Turquesa.
- **Panel (dashboard)**: KPIs de energía generada, consumida, autosuficiencia, rendimiento (Performance Ratio), ahorro económico y CO₂ evitado.
- **Gráficas**: generación vs. consumo diario, PR diario, comparativo multicolor por sucursal, participación por razón social y balance mensual (Chart.js).
- **Comparativo por sucursal**: kWp, energía, autosuficiencia, PR y ahorro de cada sucursal.
- **Alertas automáticas**: detecta días soleados con bajo rendimiento, caída sostenida del PR (posible suciedad) y déficit de generación.
- **Registro** de lecturas diarias: kWh generados, kWh consumidos, horas de sol pico (HSP), clima y notas.
- **Historial** con edición, eliminación, exportación e importación en **CSV**.
- **Empresas**: alta, edición y baja de razones sociales (con ID fiscal) y sucursales (ubicación, paneles, W por panel, HSP); parámetros generales de tarifa, moneda y CO₂.
- **Datos de ejemplo**: 2 razones sociales, 4 sucursales y 90 días de lecturas simuladas.
- **CSV** con columnas `fecha,razon_social,sucursal,generada_kwh,consumida_kwh,hsp,clima,notas`; al importar se crean automáticamente las razones sociales y sucursales que no existan.

## Cómo se calcula el rendimiento

```
Potencia instalada (kWp) = paneles × W por panel / 1000
Energía teórica (kWh)    = kWp × HSP del día
Performance Ratio (%)    = energía generada / energía teórica × 100
Autosuficiencia (%)      = Σ min(generada, consumida) / Σ consumida × 100
```

Un PR saludable suele estar entre **75 % y 85 %**.

## Uso local

Abre `index.html` en tu navegador, o sirve la carpeta:

```bash
npx serve .
```

## Publicar con GitHub Pages

1. En el repositorio ve a **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. La app quedará en `https://kurodaclaudeksateam-blip.github.io/CONTROLDEPANELESSOLARES/`.

## Estructura

```
index.html      Interfaz (Panel, Registro, Historial, Empresas)
css/styles.css  Estilos, modo claro/oscuro y paletas de color
js/app.js       Lógica, cálculos, gráficas y almacenamiento
ejemplo.csv     Datos de muestra para importar
```
