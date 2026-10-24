Car models for Midnight Pursuit
===============================
concept.glb is bundled (CC BY 4.0, see CREDITS.txt) and is used for the Kestrel GT, Nightfall SV
and Phantom X with different proportions. Other cars use the built-in procedural models.
You can add your own glTF binary (.glb) files here; a file named after a car replaces its model.

File names:
  kestrel.glb  vanta.glb  brigand.glb  tundra.glb  nightfall.glb  phantom.glb   - player cars
  cop.glb                                                                      - police cars
  traffic-sedan.glb  traffic-hatch.glb  traffic-suv.glb  traffic-van.glb  traffic-coupe.glb

How to export from Blender:
  - Car faces +Y in Blender (glTF export converts to +Z forward, Y up). Apply all transforms.
  - File > Export > glTF 2.0, format "glTF Binary (.glb)", include materials.
  - Keep it light: ideally under 100k triangles and 2K textures per car.
  - Name the body paint material with "paint" or "body" so players can repaint it.
  - Name the wheel objects WheelFrontL, WheelFrontR, WheelRearL, WheelRearR so they spin and steer.
The game scales each model to the right length and puts it on the ground automatically.
Only use models you have the rights to use.
