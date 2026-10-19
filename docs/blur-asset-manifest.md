# Blur (2010) Visual Overhaul — 3D Asset & Material Manifest

All 3D vehicle models, HDRI environment maps, ambient occlusion decals, and Draco decompression binaries listed below have been downloaded and integrated locally into `public/models/`, `public/textures/`, and `public/draco/`.

---

## 1. 3D Vehicle Models (`public/models/`)

| In-Game Vehicle ID & Name | Class | Local Asset Path | Original Model & Author | Source URL | License | Preparation & Material Integration |
|---|---|---|---|---|---|---|
| `vortex-gt` — **VORTEX GT-R** | Balanced Sports Coupe | `public/models/porsche911.glb` (3.46 MB) | **Porsche 911 Carrera 4S (992)** by Karol Miklas (optimized via `glTF-Transform`) | `https://raw.githubusercontent.com/TotoroZuo/3d-car-showcase/master/public/911.glb` | CC-BY 4.0 | Normalized to `4.68m` length, grounded at `y = 0`, `paint` & `coat` materials upgraded with `MeshPhysicalMaterial` metallic clearcoat tinted to player/rival livery color; `glass`/`window` set to tinted automotive glass; `lights` wired to dynamic brake/headlight emission. |
| `kuro-rs` — **KURO RX-9 DRIFT** | Street Tuner Sedan | `public/models/sedan_car.glb` (0.83 MB) | **Sports Tuner Coupe w/ Aero Wing** (`Boguszera/CarFactory`) | `https://raw.githubusercontent.com/Boguszera/CarFactory/main/public/car_model.glb` | MIT | Normalized to `4.62m` length, grounded at `y = 0`, `body` & `spoiler` materials re-tinted to livery clearcoat paint, `backlamps` wired to brake light intensity, `frontlamps` wired to Xenon headlight emission, `wheels` linked for speed-based rotation. |
| `titan-v8` — **TITAN V8 BRAWLER** | Widebody Classic / Muscle | `public/models/gt_supercar.glb` (12.81 MB) | **1975 Porsche 911 (930) Widebody Turbo** by Lionsharp Studios | `https://raw.githubusercontent.com/Faraz-Portfolio/demo-2025-car-paint/main/public/car.glb` | CC-BY 4.0 | Normalized to `4.72m` length, grounded at `y = 0`, `paint` material dynamically tinted with high-gloss clearcoat, `930_chromes` & `930_rim` set to polished alloy, `930_tire` set to rough dark rubber, `930_lights` wired to emissive brake/headlight state. |
| `spectre-x` — **SPECTRE V10** | High-Speed Supercar | `public/models/ferrari.glb` (1.68 MB) | **Ferrari 458 Italia** by vicent091036 (Three.js Official Example) | `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb` | CC-BY 3.0 | Normalized to `4.78m` length, grounded at `y = 0`, `Body_Color` re-tinted per racer with physical clearcoat, `Glass_Gray` set to tinted automotive glass showing detailed interior, `Taillight_Glass` wired to dynamic brake glow, `wheel_fl`/`fr`/`rl`/`rr` animated for speed and steering. |
| `aegis-4x4` — **AEGIS INTERCEPTOR** | Heavy Exotic / Combat GT | `public/models/aventador.glb` (13.04 MB) | **Lamborghini Aventador LP700-4** (`rendercodeninja/automotive-configurator`) | `https://raw.githubusercontent.com/rendercodeninja/automotive-configurator/main/src/static/assets/aventador/model.glb` | MIT | Normalized to `4.86m` length, grounded at `y = 0`, `Mt_Body` dynamically tinted with metallic clearcoat, `Mt_WindScreens` & `Mt_Glass_Translucent` configured as dark automotive glass, `Mt_AlloyWheels` & `Mt_BrakeCaliper` preserved, `Mt_Reflector_RL` & `Mt_Light_Emissive` wired to lights. |
| `omega-zero` — **OMEGA HYPERION** | Apex Hypercar | `public/models/mclaren.glb` (12.39 MB) | **McLaren P1** by DAVID.3D.ART | `https://raw.githubusercontent.com/pantchayan/threejs-car-configurator/main/static/models/Car/mcLaren-car-model.glb` | CC-BY-NC 4.0 | Normalized to `4.82m` length, grounded at `y = 0`, `Carpaint` dynamically tinted with hypercar clearcoat finish, `WHEEL_LF`/`RF`/`LR`/`RR` linked to wheel rotation & front steering, `Taillights` & `Headlights` wired to emissive states. |

---

## 2. Environment Maps, Contact Shadows & Decompression Libraries

| Asset | Local Path | Source URL | License | Purpose |
|---|---|---|---|---|
| **Urban Night Overpass HDRI** (`pedestrian_overpass_1k.hdr`) | `public/textures/pedestrian_overpass_1k.hdr` (1.51 MB) | `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/pedestrian_overpass_1k.hdr` | CC0 (Poly Haven) | Primary Image-Based Lighting (IBL) environment map for nighttime/urban circuits, providing authentic warm/cool reflections across car clearcoat paint, glass, and wet asphalt. |
| **Twilight Sunset HDRI** (`venice_sunset_1k.hdr`) | `public/textures/venice_sunset_1k.hdr` (1.40 MB) | `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr` | CC0 (Poly Haven) | Dusk/twilight environment map for coastal/sunset tracks (`Pacific Bay Overpass`). |
| **Night Sky HDRI** (`dikhololo_night_1k.hdr`) | `public/textures/dikhololo_night_1k.hdr` (1.75 MB) | `https://raw.githubusercontent.com/pmndrs/drei-assets/master/hdri/dikhololo_night_1k.hdr` | CC0 (Poly Haven) | High-contrast night environment map for industrial harbor reflections (`Iron Harbor Docks`). |
| **Vehicle Contact Shadow AO Map** (`ferrari_ao.png`) | `public/models/ferrari_ao.png` (21 KB) | `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari_ao.png` | MIT / Three.js | Soft ambient occlusion contact shadow decal placed underneath vehicles to ground tires and chassis to the asphalt. |
| **Draco Mesh Decoder (WASM/JS)** | `public/draco/draco_decoder.wasm`, `draco_wasm_wrapper.js`, `draco_decoder.js` | Bundled from `three/examples/jsm/libs/draco/gltf/` | Apache 2.0 | Local zero-latency decompression of Draco-encoded `.glb` vehicle geometries. |

---

## 3. Procedural PBR Surface & Architecture Generators

To complement the real 3D vehicle models and HDRI environment lighting without repeating simple solid-color cubes:
- **High-Resolution Normal-Mapped Asphalt (`TrackBuilder.ts`)**: Multi-layer procedural diffuse, roughness, and normal maps (`1024×1024`) featuring coarse tarmac aggregate, tire-polished racing lane grooves, crisp white solid shoulder lines, dashed lane dividers, and painted road arrows matching `Blur_screenshot_011.jpg`.
- **Concrete Retaining Walls, Armco Guardrails & Curbs**: Beveled red/white & grey/white concrete curbs, weathered concrete walls with vertical water-stain variation (`Blur_screenshot_004.jpg`), metallic Armco corrugated guardrails (`Blur_screenshot_012.jpg`), and illuminated corner chevron boards (`<<<` / `>>>` from `Blur_screenshot_002.jpg`).
- **Detailed Multi-Tier Urban & Industrial Scenery**: Multi-material architectural blocks with recessed window frames, ground-floor illuminated storefronts (`Blur_screenshot_002.jpg`), steel bridge trusses, high-voltage transmission towers (`Blur_screenshot_004.jpg`), roadside trees/foliage, overhead highway gantries, and dual-sided sodium/LED streetlamps with volumetric light cones.
- **Canonical Blur Hologram Power-Up Tablets**: Floating translucent rounded-square neon hologram billboards (`Blur_screenshot_002.jpg`, `Power-up_Intro_Screen.png`) with crisp vector icons for **Nitro**, **Shunt (Missile)**, **Bolt**, **Barge (Shockwave)**, **Mine**, **Shield**, and **Repair**.
