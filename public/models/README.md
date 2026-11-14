# Figurmodeller

De fyra figurerna (`smoker`, `woman`, `waiter`, `loner`) kommer från
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) och är
släppta under MIT-licens – se `LICENSE-Rocketbox.md`.

| Fil | Rocketbox-figur | Ändringar |
|---|---|---|
| `smoker.glb` | Business_Male_02 | – |
| `loner.glb` | Male_Adult_03 | – |
| `waiter.glb` | Medical_Male_01 | håret tonat blont, namnskylten borttagen |
| `woman.glb` | Female_Adult_11 | klänning och hår färgade röda |

Konverteringen görs med skripten i `tools/rocketbox` (kräver Blender och
Python med Pillow och NumPy):

1. `python3 tools/rocketbox/textures.py <nedladdade figurer> <arbetsmapp>`
2. `blender --background --factory-startup --python tools/rocketbox/convert.py -- <fbx> <arbetsmapp/figur> public/models/<figur>.glb`
