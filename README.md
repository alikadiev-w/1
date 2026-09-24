# WRATH OF OLYMPUS — v19 Auto-Rig Project

Многофайловая версия браузерного arena-FPS. Текущая игровая логика сохранена, но визуальный слой больше не генерирует материалы пола/стен/мрамора через Canvas во время запуска: они загружаются из `assets/textures/` как обычные JPG/PNG.

## Быстрый запуск

Из-за ES-модулей игру лучше открывать через локальный HTTP-сервер, а не двойным кликом по `index.html`.

### Windows
1. Запусти `start_server.bat`.
2. Открой `http://localhost:8080`.

### macOS / Linux
```bash
chmod +x start_server.sh
./start_server.sh
```
Затем открой `http://localhost:8080`.

Или вручную:
```bash
python3 -m http.server 8080
```

## Структура

```text
wrath_of_olympus_project/
├─ index.html
├─ css/
│  └─ style.css
├─ js/
│  ├─ main.js          # игровая логика
│  ├─ assets.js        # загрузка JPG/PNG
│  └─ materials.js     # PBR-материалы Three.js
├─ assets/
│  ├─ textures/        # реальные файловые текстуры и карты
│  ├─ models/          # место под GLB/GLTF
│  ├─ audio/           # место под WAV/OGG
│  └─ ui/              # место под отдельные UI-изображения
├─ scripts/
└─ LICENSES.md
```

## Как заменить текстуру

Например, чтобы поставить свою текстуру стены, замени файлы:

```text
assets/textures/wall_stone_diffuse.jpg
assets/textures/wall_stone_normal.jpg
assets/textures/wall_stone_roughness.jpg
```

Имена файлов менять не нужно — игра автоматически возьмёт новые изображения.

То же самое для пола:

```text
floor_stone_diffuse.jpg
floor_stone_normal.jpg
floor_stone_roughness.jpg
```

и мрамора:

```text
marble_diffuse.jpg
marble_normal.jpg
marble_roughness.jpg
```

## Материалы

Three.js использует:
- `map` — цвет поверхности;
- `normalMap` — микрорельеф;
- `roughnessMap` — степень матовости/блеска;
- `metalness` — отдельно для золота и бронзы.

Все коэффициенты собраны в `js/materials.js`, поэтому их можно крутить независимо от геймплея.

## Вода бассейна

`assets/textures/water_normal.jpg` используется как normal map. UV медленно сдвигаются в `main.js`, поэтому вода движется, но сама картинка является обычным файлом.

## Что логично делать дальше

Следующий технический этап — вынести из `main.js` системы врагов, оружия, UI и сети в отдельные модули и заменить примитивные модели на GLB/GLTF. Папки для моделей и звуков уже добавлены.

## Ксантиппа — полноценная 3D-модель
В `assets/models/xanthippe/` находится модель `xanthippe.glb` и исходные карты тела, лица, глаз, волос, одежды и обуви. Игра загружает её через `GLTFLoader`; старая примитивная модель используется только как fallback при ошибке загрузки.

Модель экспортирована без skeletal animation (`animations: 0`, `skins: 0`), поэтому текущие движения персонажа выполняются перемещением/поворотом всей модели. Для полноценной ходьбы руками и ногами нужен rigged GLB с костями/анимациями.

## v19 — Xanthippe auto-rig animation

The supplied `xanthippe.glb` contains no embedded skin or animation clips, so v19 builds a lightweight procedural skeleton at load time. The model is flattened from the original MAX export transforms, auto-skinned from its T-pose, and animated in Three.js.

Current procedural states:
- idle / breathing;
- walk;
- run;
- panic / flee;
- trip / fall pose;
- flip / trick pose.

The original primitive companion remains only as a loading/error fallback. The GLB itself and all supplied textures remain unchanged in `assets/models/xanthippe/`.
