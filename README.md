# ☀️ Control de Paneles Solares

Aplicación web para registrar el **consumo** y el **rendimiento** de una instalación de paneles solares.
Es 100 % estática (HTML + CSS + JavaScript): no necesita servidor ni base de datos; los datos se guardan en el navegador (`localStorage`).

## Funciones

- **Panel (dashboard)**: KPIs de energía generada, consumida, autosuficiencia, rendimiento (Performance Ratio), ahorro económico y CO₂ evitado.
- **Gráficas**: generación vs. consumo diario, PR diario y balance mensual (Chart.js).
- **Alertas automáticas**: detecta días soleados con bajo rendimiento, caída sostenida del PR (posible suciedad) y déficit de generación.
- **Registro** de lecturas diarias: kWh generados, kWh consumidos, horas de sol pico (HSP), clima y notas.
- **Historial** con edición, eliminación, exportación e importación en **CSV**.
- **Sistema**: número de paneles, potencia por panel, HSP de la zona, tarifa eléctrica, moneda y factor de CO₂.
- **Datos de ejemplo**: botón para generar 90 días de lecturas simuladas.

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
index.html      Interfaz (4 vistas)
css/styles.css  Estilos (modo claro/oscuro automático)
js/app.js       Lógica, cálculos, gráficas y almacenamiento
ejemplo.csv     Datos de muestra para importar
```
