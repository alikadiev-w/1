# WRATH OF OLYMPUS v22 — GitHub Pages Static

Эта версия специально сделана так, чтобы GitHub Pages мог отдавать проект **как обычную статику без Vite/npm build**.

## Самый простой вариант публикации

1. Загрузите **содержимое этой папки** в корень репозитория.
2. GitHub → **Settings → Pages**.
3. Можно выбрать либо:
   - **Deploy from a branch** → `main` → `/ (root)`, либо
   - **GitHub Actions** (workflow уже лежит в `.github/workflows/pages.yml`).
4. Подождите публикацию и откройте адрес Pages.

## Почему эта версия исправляет ошибку `Failed to resolve module specifier "three"`

В `index.html` есть browser `importmap`, который явно сопоставляет:

- `three` → Three.js 0.160.0
- `three/addons/` → addons Three.js 0.160.0

Поэтому браузер умеет открыть `js/main.js` напрямую, без bundler.

PeerJS подключается отдельным browser-скриптом и нужен только сетевому режиму. Одиночная игра не импортирует `peerjs` как npm-модуль.

## Ассеты

Все игровые файлы лежат прямо в `assets/`:

- `assets/models/xanthippe/xanthippe.glb`
- `assets/models/xanthippe/textures/`
- `assets/textures/`

Это важно: при прямом GitHub Pages-деплое больше нет различия между `public/assets` и `/assets`.

## Локальный запуск

Не открывайте `index.html` через `file://`.

Запустите любой HTTP-server, например Python:

```bash
python -m http.server 8080
```

и откройте:

```text
http://localhost:8080/
```

## Внешние зависимости

Three.js и PeerJS загружаются через `unpkg.com`, поэтому для запуска нужен интернет. Все модели и текстуры игры находятся в репозитории локально.
