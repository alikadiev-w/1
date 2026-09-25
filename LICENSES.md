# Licenses and asset notes

## Photo-based source textures

Часть локальных текстур проекта подготовлена из фотографических CC0-образцов, входящих в `scikit-image.data`:

- `skimage.data.brick()` — фотобаза CC0Textures `Bricks25`, Creative Commons CC0; использована как основа `wall_stone_*`.
- `skimage.data.gravel()` — фотобаза CC0Textures `Gravel04`, Creative Commons CC0; использована как основа `floor_stone_*`, `ruin_stone_*`, `water_normal.jpg` и микродетали мрамора.

Normal/roughness-карты, цветовые варианты и декоративные PNG были подготовлены для этого проекта из этих локальных CC0-источников.

## Lia model

`assets/models/lia/lia.glb` и соответствующие текстуры были предоставлены пользователем для интеграции в игру. Этот репозиторий не переопределяет лицензию исходной модели; перед публичным распространением владелец репозитория должен убедиться, что условия источника модели разрешают такое использование.

## Runtime/build libraries

Статическая версия загружает библиотеки с CDN:

- Three.js `0.160.0` — MIT License.
- PeerJS `1.5.2` — MIT License.

Игровые модели и текстуры находятся локально в репозитории.
