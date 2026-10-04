/**
 * Shift-end micro-quiz and the glossary tablet (GDD §12).
 *
 * Two of the three scaffolding mechanisms the GDD names, and the two that matter
 * most, because they are the only parts of the game that teach rather than test:
 *
 *  - SHIFT-END MICRO-QUIZ: "Optional interactive 3-question review boards that
 *    verify understanding of process steps ... to award permanent competency
 *    rating boosts." The GDD gives a worked example: "Why did we use Hafnium
 *    Oxide instead of Silicon Dioxide here?" A quiz is therefore drawn from the
 *    PHYSICS of the day just worked, not from trivia about the UI.
 *
 *  - FAB GLOSSARY TABLET: "A physical tablet resting beside the inspection bay
 *    containing interactive 3D crystal structure diagrams, process explanations,
 *    and field guides detailing the exact physics of 45nm innovations."
 *
 * The quizzes are content, not code, and content is where a training game is
 * usually wrong. So each question carries its own `explain` string written in the
 * GDD's register, and an incorrect answer still explains itself rather than just
 * marking the player wrong — a training tool that withholds the explanation is
 * worse than no quiz at all.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';

import { C, MONO, Panel, SANS, hline, label, plate, type PanelCtx, type PanelContext2D } from '../ui/panel.js';
import { screenFromPanel } from '../scene.js';
import { painted, steel } from '../scene/lighting.js';
import { BENCH_Y, LAYOUT } from './bay.js';
import { wrap } from '../rework/rca-view.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DayConfig } from '@wafers/data';

// ---------------------------------------------------------------------------
// Quiz content
// ---------------------------------------------------------------------------

export interface QuizOption {
  readonly text: string;
  readonly correct: boolean;
  /** Shown after this option is chosen. */
  readonly because: string;
}

export interface QuizQuestion {
  readonly prompt: string;
  readonly options: readonly QuizOption[];
  /** Days this question is relevant to; the pool is drawn from the day's defects. */
  readonly days: readonly number[];
  readonly topic: string;
}

/**
 * The question pool.
 *
 * Every question is grounded in a specific GDD §6/§7/§8 claim, and every
 * `because` explains the mechanism rather than restating the answer — "because it
 * does X" teaches, "because B is correct" does not.
 */
export const QUIZ_BANK: readonly QuizQuestion[] = [
  {
    topic: 'High-K gate dielectric',
    days: [2],
    prompt: 'Why did 45 nm replace silicon dioxide as the gate dielectric?',
    options: [
      {
        text: 'SiO₂ let tunnelling current leak through the channel',
        correct: true,
        because:
          'At 1.2 nm equivalent oxide thickness the gate is thin enough that electrons quantum-tunnelled straight through the oxide into the channel. That leakage is what drains a static charge and kills standby power. Hafnium oxide has a much higher dielectric constant, so the same capacitance needs a physically thicker film, and the thicker film stops the tunnelling.',
      },
      {
        text: 'Silicon dioxide could not be deposited below 2 nm',
        correct: false,
        because:
          'Deposition was not the limit. ALD simply had not been industrialised yet — the problem was that thinning SiO₂ to the capacitance you needed made it leak, not that you could not grow it.',
      },
      {
        text: 'Hafnium oxide conducts better than silicon dioxide',
        correct: false,
        because:
          'Backwards on both counts. A gate dielectric is an insulator, and its job is to block current. Hafnium oxide is a *worse* conductor than a metal — that is what makes it usable as a dielectric at all.',
      },
    ],
  },
  {
    topic: 'STI and CMP',
    days: [2],
    prompt: 'An STI void is an unfilled moat. What does it cost you electrically?',
    options: [
      {
        text: 'A leakage path between adjacent devices',
        correct: true,
        because:
          'The moat exists to isolate one transistor from its neighbour. An unfilled seam is a channel through that isolation, so current leaks sideways between devices that were supposed to be independent. That is a yield loss across the whole wafer, not one bad die.',
      },
      {
        text: 'An open circuit in the gate metal',
        correct: false,
        because:
          'That is a plug void, a different defect. An STI void is in the *isolation* between devices, not in the conductors above them, so it leaks rather than opening.',
      },
      {
        text: 'Nothing, if the void is small',
        correct: false,
        because:
          'A void is never benign. The whole point of the CMP endpoint check is that over-polishing dishes the isolation and under-polishing leaves voids — both push the structure outside the process window.',
      },
    ],
  },
  {
    topic: 'Work-function metals',
    days: [2, 3],
    prompt: 'Why are different work-function metals used for PMOS and NMOS?',
    options: [
      {
        text: 'They set the threshold voltage each device type needs',
        correct: true,
        because:
          'NMOS wants to turn on at a positive gate voltage and PMOS at a negative one, so each needs its own Fermi level against the channel. Titanium nitride for PMOS, titanium aluminium for NMOS — the metal is chosen for where its work function sits relative to silicon.',
      },
      {
        text: 'Titanium nitride is cheaper than titanium aluminium',
        correct: false,
        because:
          'Cost is not the reason, and TiAl was not the cheaper option. The choice is entirely about the work function and how it shifts the threshold.',
      },
      {
        text: 'They have different resistivities for the interconnect',
        correct: false,
        because:
          'That is a wire-resistance concern, not a gate concern. The work-function metal sits at the gate, and what matters there is its Fermi level, not how much current it carries.',
      },
    ],
  },
  {
    topic: 'Silicide bridging',
    days: [3],
    prompt: 'Why is a silicide stringer on the sidewall spacer catastrophic rather than parametric?',
    options: [
      {
        text: 'It shorts the gate to the source/drain contacts',
        correct: true,
        because:
          'Conductive titanium silicide crossing the spacer touches both the gate and a source/drain diffusion. That is a hard electrical short, not a degraded threshold. A parametric defect still functions; this does not.',
      },
      {
        text: 'It raises the sheet resistance of the contact',
        correct: false,
        because:
          'A stringer *adds* a parallel conduction path, which lowers resistance locally. The failure is the short, not the resistance.',
      },
      {
        text: 'It only matters if the wafer is later doped',
        correct: false,
        because:
          'It matters immediately. The bridge is metal; it shorts whether or not anything happens downstream, which is why it can be caught and stripped before anneal.',
      },
    ],
  },
  {
    topic: 'Tungsten plug voids',
    days: [3],
    prompt: 'A tungsten plug has a keyhole void in its core. What is the failure?',
    options: [
      {
        text: 'An open circuit across the backend metal',
        correct: true,
        because:
          'The plug is a vertical onramp carrying signal between layers. A void in the core breaks that path. It is uncorrectable after deposition — you cannot fill a hole that is already sealed, so the wafer is scrap.',
      },
      {
        text: 'A short between adjacent plugs',
        correct: false,
        because:
          'A void removes material rather than adding it. Voids open circuits; shorts come from material bridging where there should be none.',
      },
      {
        text: 'A parametric threshold shift',
        correct: false,
        because:
          'Parametric means the device still works, just slower or leakier. An open circuit is the opposite: the device does not work at all.',
      },
    ],
  },
  {
    topic: 'Substrate geometry',
    days: [1],
    prompt: 'Why is wafer bow unrecoverable and not a rework candidate?',
    options: [
      {
        text: 'It bends the lattice beyond high-NA lithography depth of focus',
        correct: true,
        because:
          'Bow is a geometric property of the crystal. Once the wafer is bent, every subsequent exposure is out of focus somewhere on it, and patterning blurs. No chemical bench can straighten a lattice — so it is reject, not rework.',
      },
      {
        text: 'It contaminates the cleaning baths',
        correct: false,
        because:
          'Bow has nothing to do with the baths. It is a mechanical and crystallographic condition present before any wet step.',
      },
      {
        text: 'It only affects the wafer edge',
        correct: false,
        because:
          'Bow displaces the surface vertically across the whole wafer relative to the focal plane, so the centre goes out of focus too. Edge-only would be recoverable; global bow is not.',
      },
    ],
  },
  {
    topic: 'Substrate contamination',
    days: [1],
    prompt: 'A four-point probe shows a sheet-resistance offset. What is on the wafer?',
    options: [
      {
        text: 'A conductive organic or metallic film shunting the surface',
        correct: true,
        because:
          'Four-point probing measures sheet resistance through the bulk while cancelling lead contact resistance. If it reads high, current is taking a parallel path through a film on the surface. That film is what the RCA clean exists to remove.',
      },
      {
        text: 'Bulk doping that is too light',
        correct: false,
        because:
          'Light doping would raise sheet resistance but would not show a *local* offset, and it is not removable by cleaning. The probe signature of contamination is a film, not a bulk property.',
      },
      {
        text: 'Surface roughness affecting the probe',
        correct: false,
        because:
          'Roughness does scatter the measurement a little, but it does not produce a consistent resistance offset. A systematic shift means a conducting path, not a mechanical artefact.',
      },
    ],
  },
  {
    topic: 'Silicide phase',
    days: [3],
    prompt: 'Why must the silicide etch happen while the film is still high-resistance C49?',
    options: [
      {
        text: 'C54 is conductive, so a stringer already bridges',
        correct: true,
        because:
          'C49 titanium silicide is resistant enough that stray pathway metal can still be stripped without attacking the real contacts. Once it converts to the low-resistance C54 phase, a stringer is indistinguishable from a contact — etching one takes the other with it. The window is genuinely narrow, and that is the minigame.',
      },
      {
        text: 'C49 melts at the etch temperature',
        correct: false,
        because:
          'The ultrasonic bath is not hot enough to melt anything. The constraint is electrical and chemical selectivity, not temperature.',
      },
      {
        text: 'C49 has a different colour',
        correct: false,
        because:
          'Colour is not the issue, though the sheet-resistance reading is how you tell the phases apart on the instrument. What matters is which phase you can still selectively etch.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Quiz panel
// ---------------------------------------------------------------------------

const QW = 900;
const QH = 620;

export interface QuizResult {
  readonly question: QuizQuestion;
  readonly chosen: QuizOption;
  readonly questionNumber: number;
  readonly total: number;
}

/**
 * The review board.
 *
 * Answers are chosen by clicking directly on the option rows in 3D, because GDD
 * §13 forbids menu bars and the GDD §4 VR control scheme is hand interaction —
 * a quiz you answer with a keyboard would not exist in the headset.
 */
export class QuizBoard {
  private readonly root: TransformNode;
  private readonly panel: Panel;
  private readonly screen: AbstractMesh;
  private readonly slab: AbstractMesh;

  /** Clickable option rows, in panel-pixel space. */
  private rows: Array<{ top: number; bottom: number; option: QuizOption }> = [];
  private questions: readonly QuizQuestion[] = [];
  private index = 0;
  private revealed = false;
  private boostPool = 0;
  /** Index into the current question's options of what the player picked. */
  private chosenIndex = -1;

  onAnswer: (result: QuizResult, permanentBoost: number) => void = () => {};

  constructor(scene: Scene) {
    this.root = new TransformNode('quiz-board', scene);
    this.root.position = new Vector3(LAYOUT.board.x, LAYOUT.board.y, LAYOUT.board.z);

    this.panel = new Panel('quiz-panel', { width: QW, height: QH, scale: 1.3 });

    this.slab = CreateBox('quiz-slab', { width: 1.86, height: 1.16, depth: 0.05 }, scene);
    this.slab.parent = this.root;
    this.slab.position = new Vector3(0, 0, 0.045);
    this.slab.material = painted(scene, 'quiz-slab-mat', '#232830', 0.55);

    this.screen = screenFromPanel(scene, this.panel.texture, 'quiz-screen', 1.76, 1.06);
    this.screen.parent = this.root;
    this.screen.position = new Vector3(0, 0, 0);

    this.root.setEnabled(false);

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERUP) return;
      if (!this.root.isEnabled()) return;
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === this.screen);
      if (!pick?.hit) return;
      const uv = pick.getTextureCoordinates?.();
      if (!uv) return;
      this.click((1 - uv.y) * QH);
    });
  }

  /** Open with `count` questions drawn deterministically from the day's pool. */
  open(day: DayConfig, rng: { nextInt(min: number, max: number): number }, count = 3): void {
    const pool = QUIZ_BANK.filter((q) => q.days.includes(day.dayNumber));
    if (pool.length === 0) {
      this.close();
      return;
    }
    // Deterministic sample without replacement: shuffle the pool with the day's
    // RNG stream, take the first `count`. The shift stays reproducible.
    const order = pool.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    this.questions = order.slice(0, Math.min(count, pool.length)).map((i) => pool[i]!);
    this.index = 0;
    this.revealed = false;
    this.boostPool = 0;
    this.chosenIndex = -1;
    this.root.setEnabled(true);
    this.panel.invalidate();
  }

  close(): void {
    this.root.setEnabled(false);
  }

  get isOpen(): boolean {
    return this.root.isEnabled();
  }

  /** Panel-pixel Y of a click, measured from the top. */
  private click(py: number): void {
    if (this.revealed) return;
    for (const r of this.rows) {
      if (py >= r.top && py <= r.bottom) {
        this.answer(r.option);
        return;
      }
    }
  }

  private answer(chosen: QuizOption): void {
    const q = this.questions[this.index];
    if (!q) return;
    this.chosenIndex = q.options.indexOf(chosen);
    this.revealed = true;
    // GDD §12: "award permanent competency rating boosts." One point per
    // correct answer, and the boost is permanent for the run rather than a
    // one-shift bonus, so answering well is worth something beyond this shift.
    if (chosen.correct) this.boostPool += 1;
    this.onAnswer({ question: q, chosen, questionNumber: this.index + 1, total: this.questions.length }, this.boostPool);
    this.panel.invalidate();
  }

  /**
   * Pick an option by index. Ignored until the current question is answered.
   *
   * Index-based rather than option-based so the caller can answer a quiz it never
   * inspected — which is what the headless tests do, and what a VR hand ray does.
   */
  choose(optionIndex: number): boolean {
    if (this.revealed) return false;
    const q = this.questions[this.index];
    const opt = q?.options[optionIndex];
    if (!q || !opt) return false;
    this.answer(opt);
    return true;
  }

  /** True when the current question is answered and waiting to be dismissed. */
  get awaitingAdvance(): boolean {
    return this.revealed;
  }

  /** Questions remaining, including the one on screen. */
  get remaining(): number {
    return this.questions.length - this.index;
  }

  /**
   * Move past the explanation. Returns false when the quiz is finished, and is
   * a no-op while the current question is still unanswered.
   */
  advance(): boolean {
    if (!this.revealed) return true;
    if (this.index + 1 >= this.questions.length) {
      this.close();
      return false;
    }
    this.index++;
    this.revealed = false;
    this.chosenIndex = -1;
    this.panel.invalidate();
    return true;
  }

  update(): void {
    if (!this.root.isEnabled()) return;
    this.panel.flush((c) => this.paint(c));
  }

  private paint(c: PanelCtx): void {
    plate(c, 6);
    const q = this.questions[this.index];
    if (!q) {
      label(c, 'NO REVIEW AVAILABLE FOR THIS SHIFT', c.w / 2, c.h / 2, { size: 16, color: C.textDim, align: 'center' });
      return;
    }

    // Header.
    label(c, 'SHIFT-END REVIEW', 30, 34, { size: 19, color: C.accent, weight: '800' });
    label(c, `${q.topic.toUpperCase()}  ·  ${this.index + 1}/${this.questions.length}`, c.w - 30, 34, {
      size: 13,
      color: C.textDim,
      align: 'right',
      font: MONO,
    });
    hline(c, 50, C.panelEdgeLit);

    // Prompt.
    let y = 84;
    for (const seg of wrap(q.prompt, 78)) {
      label(c, seg, 30, y, { size: 19, color: C.text, font: SANS, weight: '600' });
      y += 26;
    }

    // Options. Rows are recorded so a 3D click maps back to a choice.
    this.rows = [];
    y += 14;
    q.options.forEach((opt, oi) => {
      const top = y;
      // Row height grows once the explanation is shown, so measure it first.
      const explainLines = this.revealed ? wrap(opt.because, 76).length : 0;
      const h = 46 + explainLines * 19;

      const chosen = oi === this.chosenIndex;
      const correct = opt.correct;
      const border = this.revealed
        ? correct
          ? C.good
          : chosen
            ? C.bad
            : C.panelEdge
        : C.panelEdge;
      c.ctx.strokeStyle = border;
      c.ctx.lineWidth = this.revealed && (correct || chosen) ? 2 : 1;
      roundRectPath(c.ctx, 28, top, c.w - 58, h, 6);
      c.ctx.fillStyle = this.revealed && correct ? 'rgba(95,214,138,0.1)' : 'rgba(255,255,255,0.02)';
      c.ctx.fill();
      c.ctx.stroke();

      label(c, opt.text, 46, top + 22, { size: 15, color: C.text, weight: '600' });

      // Verdict glyph, once revealed.
      if (this.revealed && (correct || chosen)) {
        label(c, correct ? 'CORRECT' : 'NOT THIS ONE', c.w - 44, top + 22, {
          size: 12,
          color: correct ? C.good : C.bad,
          align: 'right',
          font: MONO,
          weight: '800',
        });
      }

      y = top + 44;
      if (this.revealed) {
        for (const seg of wrap(opt.because, 76)) {
          label(c, seg, 46, y, { size: 13, color: chosen || correct ? C.text : C.textDim, font: SANS });
          y += 19;
        }
      }
      y += 10;
      this.rows.push({ top, bottom: top + h, option: opt });
    });

    // Footer prompt.
    label(
      c,
      this.revealed
        ? this.index + 1 < this.questions.length
          ? 'CLICK TO CONTINUE'
          : 'CLICK TO FINISH THE REVIEW'
        : 'CLICK THE ANSWER YOU BELIEVE',
      c.w / 2,
      c.h - 26,
      { size: 12, color: this.revealed ? C.textDim : C.accent, align: 'center', font: MONO },
    );
  }
}

function roundRectPath(ctx: PanelContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Glossary tablet
// ---------------------------------------------------------------------------

interface Crystal {
  readonly title: string;
  readonly subtitle: string;
  readonly body: string;
  /** Layers, outermost first, drawn as a stack of ellipses. */
  readonly layers: ReadonlyArray<{ thickness: number; color: string; label: string }>;
}

const CRYSTALS: readonly Crystal[] = [
  {
    title: 'High-K / Metal Gate Stack',
    subtitle: 'Hafnium oxide gate dielectric, ALD',
    body:
      'Gate stack for the 45 nm node. The HfO₂ is deposited by atomic layer deposition in ~12 self-limiting cycles, giving sub-nanometre control of thickness. Titanium nitride or titanium aluminium sits on top as the work-function metal: TiN for PMOS, TiAl for NMOS. The point of HfO₂ is that its high dielectric constant lets the physical film be thick enough that electrons no longer tunnel through it.',
    layers: [
      { thickness: 0.9, color: '#c8a94a', label: 'TiAl / TiN work function' },
      { thickness: 0.5, color: '#9fb4c8', label: 'HfO₂ (ALD, EOT 1.2 nm)' },
      { thickness: 1.4, color: '#5a6470', label: 'SiO₂ interface' },
      { thickness: 3.2, color: '#3d4450', label: 'Silicon substrate' },
    ],
  },
  {
    title: 'Strain Engineered CMOS',
    subtitle: 'SiGe compressively strained PMOS channel',
    body:
      'Hole mobility in silicon is poor. Compressively straining the channel with embedded silicon germanium raises it substantially, which lets a designer use a lower threshold voltage and recover the drive current that scaling took away. NMOS gets the opposite treatment, a tensile silicon-nitride cap. The stress is engineered at the wafer level and is itself a thing to inspect, because over-stress cracks the substrate.',
    layers: [
      { thickness: 0.6, color: '#b08040', label: 'SiGe (compressively strained)' },
      { thickness: 0.8, color: '#7d8894', label: 'Tensile Si₃N₄ cap' },
      { thickness: 2.8, color: '#3d4450', label: 'Silicon substrate' },
    ],
  },
  {
    title: 'Copper Damascene Interconnect',
    subtitle: 'TaN barrier, tungsten onramp, Cu fill',
    body:
      'Copper cannot touch silicon — it diffuses into the substrate and poisons the devices. So every copper feature is wrapped in a tantalum nitride diffusion barrier and started from a tungsten onramp. The trench is filled by electroplating and the excess is polished off by CMP. Two failure modes dominate: voids in the tungsten onramp, which are open circuits, and voids left in the copper, which have the same effect one layer up.',
    layers: [
      { thickness: 0.5, color: '#c07a3a', label: 'Cu damascene' },
      { thickness: 0.4, color: '#6f7a86', label: 'TaN diffusion barrier' },
      { thickness: 0.7, color: '#9aa4b0', label: 'W onramp plug' },
      { thickness: 2.6, color: '#3d4450', label: 'Low-k dielectric' },
    ],
  },
  {
    title: 'Nickel Silicide Contact',
    subtitle: 'Titanium → C49 → C54 phase sequence',
    body:
      'Titanium is deposited over exposed silicon and annealed twice. The first anneal makes C49 titanium silicide, which is resistant and chemically selective. The second, hotter anneal converts it to C54 nickel silicide, which is conductive and makes the contact. The window between those states is where a stray pathway metal can still be stripped by an ultrasonic wet etch before it becomes a permanent bridge between gate and source/drain.',
    layers: [
      { thickness: 0.7, color: '#c9b06a', label: 'C54 NiSi (conductive)' },
      { thickness: 0.6, color: '#6a6250', label: 'C49 TiSi (resistant)' },
      { thickness: 0.4, color: '#8a8f96', label: 'Ti sputtered on Si' },
      { thickness: 2.4, color: '#3d4450', label: 'Silicon substrate' },
    ],
  },
];

/**
 * The GDD §12 "physical tablet resting beside the inspection bay".
 *
 * It shows a cross-section crystal diagram — which is what the GDD asks for,
 * "interactive 3D crystal structure diagrams" — rendered as a stack of labelled
 * layers that the player steps through. This is the reference material that
 * explains *why* the numbers on the instruments are the numbers they are.
 */
export class GlossaryTablet {
  private readonly root: TransformNode;
  private readonly screen: AbstractMesh;
  private readonly diagram: DynamicTexture;
  private index = 0;
  private layer = 0;

  constructor(scene: Scene) {
    this.root = new TransformNode('glossary-tablet', scene);
    // Between the wafer stage and the stamp bank, angled up toward the operator.
    // NOT centre bench: an earlier position sat directly in front of the wafer,
    // occluding the one thing the player has to look at.
    this.root.position = new Vector3(0.33, BENCH_Y + 0.02, -0.26);
    this.root.rotation.x = 0.62;

    const shell = CreateBox('glossary-shell', { width: 0.4, height: 0.016, depth: 0.29 }, scene);
    shell.parent = this.root;
    shell.position = new Vector3(0, -0.014, 0);
    // Matte, not glossy: at 0.4 roughness the shell caught the key light as a
    // blown-out white wedge at this viewing angle.
    shell.material = painted(scene, 'glossary-shell-mat', '#1e2229', 0.78);
    const rim = CreateBox('glossary-rim', { width: 0.41, height: 0.007, depth: 0.3 }, scene);
    rim.parent = this.root;
    rim.position = new Vector3(0, -0.004, 0);
    rim.material = steel(scene, 'glossary-rim-mat', '#6f7883');

    this.diagram = new DynamicTexture('glossary-diagram', { width: 512, height: 320 }, scene, true);

    this.screen = CreatePlane('glossary-screen', { width: 0.38, height: 0.275 }, scene);
    this.screen.parent = this.root;
    this.screen.position = new Vector3(0, 0.007, 0);
    const mat = screenFromPanel(scene, this.diagram, 'glossary-screen-mat', 1, 1).material;
    if (mat) this.screen.material = mat;

    this.paint();
  }

  /** Cycle to the next crystal diagram. */
  next(): void {
    this.index = (this.index + 1) % CRYSTALS.length;
    this.layer = 0;
    this.paint();
  }

  /** Step down through the layers of the current cross-section. */
  peel(): void {
    const c = CRYSTALS[this.index]!;
    this.layer = (this.layer + 1) % c.layers.length;
    this.paint();
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  /** True while the tablet is up, so the shift loop knows to route input to it. */
  get isOpen(): boolean {
    return this.root.isEnabled();
  }

  private paint(): void {
    const ctx = this.diagram.getContext() as CanvasRenderingContext2D;
    const w = 512;
    const h = 320;
    const c = CRYSTALS[this.index]!;

    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, w, h);

    // Title block.
    ctx.fillStyle = '#5ec8d8';
    ctx.font = '700 19px monospace';
    ctx.fillText(c.title.toUpperCase(), 18, 32);
    ctx.fillStyle = '#7d8b9c';
    ctx.font = '500 13px monospace';
    ctx.fillText(c.subtitle, 18, 52);

    // Cross-section: layers stacked bottom-up, the substrate deepest. Each layer
    // is a slab with a callout, which is how an interface stack is actually
    // drawn in a process cross-section.
    const maxT = c.layers.reduce((a, l) => a + l.thickness, 0);
    const x0 = 40;
    const width = 150;
    let y = h - 34;
    c.layers.forEach((layer, i) => {
      const lh = ((h - 100) * layer.thickness) / maxT;
      y -= lh;
      ctx.fillStyle = layer.color;
      ctx.fillRect(x0, y, width, lh - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeRect(x0, y, width, lh - 2);

      // Callout line + label for the layer the player has peeled to, or all of
      // them faintly.
      const active = i === this.layer;
      ctx.strokeStyle = active ? '#5ec8d8' : 'rgba(140,160,185,0.4)';
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x0 + width, y + lh / 2);
      ctx.lineTo(x0 + width + (active ? 40 : 24), y + lh / 2);
      ctx.stroke();

      ctx.fillStyle = active ? '#d7e2ee' : 'rgba(160,180,205,0.75)';
      ctx.font = `${active ? '700' : '500'} 12px monospace`;
      ctx.fillText(layer.label, x0 + width + (active ? 46 : 30), y + lh / 2 + 4);
    });

    // Active layer callout.
    const active = c.layers[this.layer]!;
    ctx.fillStyle = '#e8b552';
    ctx.font = '700 12px monospace';
    ctx.fillText(`▸ ${active.label}  ·  ${active.thickness.toFixed(1)} rel`, 18, h - 14);

    // Body text, wrapped.
    ctx.fillStyle = '#a8b6c6';
    ctx.font = '500 11px monospace';
    let ty = 78;
    let line = '';
    for (const word of c.body.split(/\s+/)) {
      if ((line + ' ' + word).length > 44) {
        ctx.fillText(line, 240, ty);
        ty += 15;
        line = word;
        if (ty > h - 20) break;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    ctx.fillText(line, 240, ty);

    // Page indicator.
    ctx.fillStyle = '#4a5a6e';
    ctx.font = '600 11px monospace';
    ctx.fillText(`${this.index + 1}/${CRYSTALS.length}`, w - 46, h - 14);

    this.diagram.update();
  }
}

export { QUIZ_BANK as QUIZ_QUESTIONS, CRYSTALS as GLOSSARY_CRYSTALS };