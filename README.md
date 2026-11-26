# Huangxiangru's Lab Westlake University

[**Open the plant growth studio ↗**](https://raconiy.github.io/westlake-plant-growth-studio/)

**The Garden Hours** follows four gardens from dawn to dusk. Its 80-second edition includes the measured rose camera replay and the original chamber score *When the Garden Turns*. [Watch the film](https://raconiy.github.io/westlake-plant-growth-studio/garden-hours.html)

[**Explore the interactive rose**](https://raconiy.github.io/westlake-plant-growth-studio/rose-camera.html). Use the arrow keys or touch controls to orbit and change distance, press Space to pause growth, or scrub the bloom slider. The browser reconstructs the selected pose from native 1024 × 480 samples of the studio renderer. It uses a 45-degree camera arc and 41 growth stages. The view and growth clock respond independently on the visitor’s device.

A rose opens in a sunlit cottage border, a peony grows in a walled courtyard, a daffodil rises beneath apple trees, and a crocus flowers between slate and moss. Each study pairs a native **1280 × 720** growth film with its animated 3D plant.

[![Rose, peony, daffodil, and crocus at leaf and bloom stages](growth.jpg)](https://raconiy.github.io/westlake-plant-growth-studio/)

## Explore a plant

- **Scrub the film.** Drag along the filmstrip or jump straight to the sprout, leaves, bud, or open flower.
- **Move the bloom.** Slide the opening time earlier or later to preview a different rhythm. The browser remaps the frames of the existing film immediately.
- **Turn the model.** Switch to **4D model** and drag to rotate the plant at the current frame. **Control pass** shows the image sequence supplied to the video model.

## Watch the films

[Rose](media/rose/film.mp4) · [Peony](media/peony/film.mp4) · [Daffodil](media/daffodil/film.mp4) · [Crocus](media/crocus/film.mp4)

Each film contains 65 native frames and plays at 8 fps. A procedural plant defines the geometry, camera, and growth schedule. A Wan2.1-VACE-1.3B video model with a LoRA trained on paired footage renders the plant against a generated environment. All four examples use seed 43.

The garden determines the direction, softness, and color of the light on the plant. The renderer uses the animated mesh to shade leaf folds and veins, transmit light through thin petals, and cast shadows onto the ground. [Compare the lighting on all four plants.](media/light-comparison.mp4)

In the rose study, the shoot opens a narrow seam in the soil. Individual aggregates rotate, collide, and settle under gravity. The comparison holds the original garden, camera path, plant, and seed fixed. Its second pass follows two grains through the opening. [Watch the half-speed rose comparison.](media/rose/emergence-comparison.mp4)

The public studio plays the rendered films and draws their animated meshes locally. The lab's GPU service handles new prompt-based renders.

## Run locally

From this branch, run `python3 -m http.server 8000` and open [the local studio](http://localhost:8000/).
