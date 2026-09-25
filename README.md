# WRATH OF OLYMPUS — v21 GitHub Pages Build

Версия проекта, подготовленная специально под GitHub Pages. Исходники собираются Vite через GitHub Actions; Three.js и PeerJS ставятся как npm-зависимости и попадают в итоговый build, поэтому игра больше не зависит от `unpkg`/другого CDN при обычном запуске опубликованной страницы.

## Самый быстрый способ опубликовать

1. Создай пустой GitHub-репозиторий.
2. Загрузи **содержимое этой папки** в корень репозитория. Не загружай ZIP как один файл — сначала распакуй его.
3. В GitHub открой `Settings → Pages`.
4. В `Build and deployment → Source` выбери **GitHub Actions**.
5. Сделай push/commit в ветку `main` или `master`.
6. Открой вкладку `Actions` и дождись зелёного workflow `Deploy WRATH OF OLYMPUS to GitHub Pages`.
7. Адрес опубликованной игры появится в `Settings → Pages` и в завершённом workflow.

Файл `.github/workflows/pages.yml` уже включён. Он сам выполняет:

```text
npm install
npm run build
upload dist/
deploy GitHub Pages
```

## Почему эта версия подходит для Pages

- Vite настроен с `base: './'`, поэтому проект работает и по адресу вида `https://USER.github.io/REPO/`, и на custom domain.
- Все игровые JPG/PNG/GLB лежат в `public/assets/` и копируются в build без изменения имён.
- Пути к текстурам и Ксантиппе вычисляются относительно опубликованной страницы, а не относительно домена.
- В HTML нет блокирующего CDN-скрипта PeerJS.
- Three.js, GLTFLoader и PeerJS собираются npm/Vite в итоговые локальные JS chunks.
- Добавлен экран загрузки с прогрессом и сообщением об ошибке, если модуль игры не стартовал.
- Добавлен `.nojekyll`.

## Локальный запуск для разработки

Нужен Node.js LTS.

### Windows

Запусти:

```text
start_dev.bat
```

### macOS / Linux

```bash
./start_dev.sh
```

Или вручную:

```bash
npm install
npm run dev
```

Vite покажет локальный адрес, обычно `http://localhost:5173/`.

Для проверки production-build:

```bash
npm run build
npm run preview
```

## Структура проекта

```text
wrath-of-olympus/
├─ .github/
│  └─ workflows/
│     └─ pages.yml              # автоматический deploy GitHub Pages
├─ public/
│  ├─ .nojekyll
│  └─ assets/
│     ├─ textures/              # игровые JPG/PNG
│     ├─ models/
│     │  └─ xanthippe/
│     │     ├─ xanthippe.glb
│     │     └─ textures/
│     ├─ audio/
│     └─ ui/
├─ css/
│  └─ style.css
├─ js/
│  ├─ main.js
│  ├─ assets.js
│  ├─ materials.js
│  └─ xanthippe.js
├─ index.html
├─ package.json
├─ vite.config.js
├─ start_dev.bat
├─ start_dev.sh
└─ LICENSES.md
```

## Ксантиппа

В игре используется присланная модель `public/assets/models/xanthippe/xanthippe.glb` и её отдельные карты тела, головы, глаз, волос, одежды и обуви.

Исходный GLB не содержит собственного skeleton/animation clips, поэтому `js/xanthippe.js` строит auto-rig во время загрузки и использует процедурные состояния:

- idle;
- walk;
- run;
- nervous;
- panic / flee;
- trip / fall;
- flip / trick.

Старая low-poly Ксантиппа остаётся fallback-моделью, если GLB не загрузился.

## Текстуры

Основные наборы находятся в `public/assets/textures/`:

```text
floor_stone_diffuse.jpg
floor_stone_normal.jpg
floor_stone_roughness.jpg

wall_stone_diffuse.jpg
wall_stone_normal.jpg
wall_stone_roughness.jpg

marble_diffuse.jpg
marble_normal.jpg
marble_roughness.jpg

ruin_stone_diffuse.jpg
ruin_stone_normal.jpg
ruin_stone_roughness.jpg
```

Чтобы заменить материал своим, достаточно заменить соответствующий файл с тем же именем и сделать новый commit.

## Сетевая игра

Сам JavaScript PeerJS теперь входит в build и не загружается с CDN. Но сетевой режим по определению использует интернет: PeerJS Cloud для сигналинга и STUN-серверы для WebRTC. Одиночная игра после загрузки build-ассетов от этих сетевых сервисов не зависит.

## Важное про GitHub Pages

Если после push открывается старая версия, сначала проверь вкладку `Actions`: Pages обновляется только после успешной сборки. При ошибке workflow открой красный job — там будет точный лог `npm install` или `npm run build`.
