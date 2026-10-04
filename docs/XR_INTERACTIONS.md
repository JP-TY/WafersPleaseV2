# Wafers Please — XR & Input Interactions

## Interaction Model
The game supports three input modes with full parity:

| Action | Desktop (KB+M) | VR Hand-Tracked | VR Controller |
|--------|---------------|----------------|---------------|
| Tilt/rotate wafer | Click+drag | Grab wafer with hand | Grab with controller |
| Select metrology tool | Hotkey 1-4 | Touch instrument panel | Ray pointer + trigger |
| Read instrument data | Mouse hover | Gaze / hand proximity | Ray pointer |
| Adjust lighting | Click+drag dials | Grab + twist dials | Grab + twist |
| Stamp decision | Click stamp | Physical stamp gesture | Trigger stamp |
| Open traveler | Click clipboard | Grab clipboard | Grab clipboard |
| Open glossary | Click tablet | Grab tablet | Grab tablet |
| Move (teleport) | WASD (optional) | Joystick teleport | Joystick teleport |

## Desktop Input Details

### Mouse
- **Left-click + drag on wafer** → tilt/rotate (screen-space delta mapped to wafer angles)
- **Click instrument panel** → activates metrology tool
- **Click stamp** → triggers stamp animation → applies disposition
- **Click clipboard/tablet** → opens diegetic overlay
- **Hover over instrument** → shows readout tooltip

### Keyboard
| Key | Action |
|-----|--------|
| 1 | Stylus Profilometer |
| 2 | Spectroscopic Ellipsometry |
| 3 | X-ray Refractometry |
| 4 | Electron Microscope |
| A/D | Rotate wafer left/right |
| W/S | Tilt wafer forward/back |
| Space | Confirm stamp (after clicking) |
| Tab | Toggle traveler page |
| Escape | Open in-world pause menu |

## VR Hand-Tracked Input

### Grab System
- **Near interactions**: Use `XRDirectInteractor` (poke near interactable) for objects in arm's reach
- **Far interactions**: Use `XRRayInteractor` for instrument panels, overhead display
- **Wafer handling**: Wafer is a `XRGrabInteractable` with two-handed grab support
- **Stamps**: Each stamp is a grabbable object with attach transform for stamping pose

### Gesture Mapping
| Real Gesture | Game Action |
|-------------|-------------|
| Pinch (thumb + index) | Grab small object (knob, stamp) |
| Grab (full hand) | Grab larger object (wafer, tool) |
| Point (index) | Ray pointer for distant UI |
| Tap | Press button / confirm |
| Twist (wrist rotation) | Turn knob / dial |

### Hand Poses
Each interactable defines a `Pose` for hand alignment:
- **Wafer Hold**: Fingers spread slightly under wafer edge (pincer grip)
- **Stamp Grasp**: Full palm grip, thumb on top
- **Knob Twist**: Pinch grip on knob edge
- **Panel Touch**: Extended index finger poke

## Controller Input (Fallback)

### Common Mapping (Quest 2/3/Pro)
| Controller Action | Game Action |
|-------------------|-------------|
| Trigger (index) | Select / grab |
| Grip (middle) | Grab large object |
| Thumbstick | Teleport movement |
| A/X button | Switch tool mode |
| B/Y button | Toggle traveler |
| Menu button | Pause |

## Interaction Layers

| Layer | Contains | Collides With |
|-------|----------|--------------|
| Default | Environment, workbench, walls | Everything |
| Interactable | Wafer, stamps, knobs, tools | Ray, Direct interactors |
| UI | Instrument panels, shift board | Ray interactor only |
| Teleport | Floor area | Teleport ray |

## Desktop ↔ VR Parity
The `IInputAdapter` interface ensures identical game logic regardless of input mode:
- Desktop: `DesktopInputAdapter` — translates mouse/keyboard events
- VR: `VRInputAdapter` — translates XR controller/hand events
- Both emit same `IInputAdapter` events → game systems are input-agnostic
