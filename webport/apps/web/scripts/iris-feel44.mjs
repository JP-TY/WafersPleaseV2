/**
 * Iris GL feel capture 44 — quiet traveler/+X clutter (mute/push); keep Day1 free-standing SMIF gaps; chemBand 0.15–0.30 neonHot≈0.
 * chemBand ~0.15–0.30, neonHot≈0; Day1 polish over darkDelta micro-tune.
 * launchPersistentContext + unique --user-data-dir (Iris Xe; no WebGL pageerror).
 * Recipe: LIBGL_ALWAYS_SOFTWARE=0, MESA_LOADER_DRIVER_OVERRIDE=iris,
 * --use-gl=angle --use-angle=gl --enable-gpu --disable-software-rasterizer
 * --ignore-gpu-blocklist --disable-gpu-sandbox.
 */
import { chromium } from '/home/jpty/Wafers-Please-V2/node_modules/playwright/index.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let PNG;
const pngCandidates = [
  '/home/jpty/oki-app/node_modules/.pnpm/pngjs@3.4.0/node_modules/pngjs/lib/png.js',
  '/home/jpty/WafersPleaseV2/webport/node_modules/pngjs/lib/png.js',
];
for (const p of pngCandidates) {
  try {
    if (fs.existsSync(p)) {
      PNG = require(p).PNG;
      break;
    }
  } catch {}
}
if (!PNG) {
  try {
    PNG = require('pngjs').PNG;
  } catch {
    PNG = null;
  }
}
console.log('PNG_OK', !!PNG);

const port = Number(process.env.WP_SMOKE_PORT || 4320);
const out = '/home/jpty/WafersPleaseV2/webport/apps/web';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-iris-'));
console.log('userDataDir', userDataDir);

// Playwright forbids --user-data-dir on launch(); unique dir must use launchPersistentContext.
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: '/usr/sbin/chromium',
  viewport: { width: 1280, height: 800 },
  env: {
    ...process.env,
    LIBGL_ALWAYS_SOFTWARE: '0',
    MESA_LOADER_DRIVER_OVERRIDE: 'iris',
    GALLIUM_DRIVER: 'iris',
  },
  args: [
    '--use-gl=angle',
    '--use-angle=gl',
    '--enable-gpu',
    '--enable-webgl',
    '--enable-webgl2',
    '--disable-software-rasterizer',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,800',
  ],
});

const pageErrors = [];
const page = context.pages()[0] || (await context.newPage());
page.on('pageerror', (e) => {
  pageErrors.push(e.message);
  console.log('pageerror:', e.message);
});

await page.goto(`http://127.0.0.1:${port}/?props=0&t=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForFunction(() => !!window.__WP?.session, { timeout: 60000 });
await page.waitForTimeout(2000);

const glInfo = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { ok: false, reason: 'no-webgl-context' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const engineGl = window.__WP?.engine?._gl;
  let engineRenderer = null;
  if (engineGl) {
    const ed = engineGl.getExtension('WEBGL_debug_renderer_info');
    engineRenderer = ed
      ? engineGl.getParameter(ed.UNMASKED_RENDERER_WEBGL)
      : engineGl.getParameter(engineGl.RENDERER);
  }
  return {
    ok: true,
    vendor,
    renderer,
    engineRenderer,
    webgl2: !!c.getContext('webgl2'),
  };
});
console.log('glInfo', JSON.stringify(glInfo));

const rendererStr = `${glInfo.renderer || ''} ${glInfo.engineRenderer || ''}`.toLowerCase();
const isSwift = /swiftshader|llvmpipe|softpipe|software/i.test(rendererStr);
const isIris = /iris|intel|mesa/i.test(rendererStr) && !isSwift;
if (!glInfo.ok || isSwift || pageErrors.some((m) => /webgl not supported/i.test(m))) {
  console.error('RENDERER_FAIL', JSON.stringify({ glInfo, pageErrors, isSwift, isIris }));
  await context.close();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
  process.exit(2);
}
console.log('RENDERER_OK', JSON.stringify({ isIris, isSwift, renderer: glInfo.renderer, engineRenderer: glInfo.engineRenderer }));

function scorePng(buf) {
  if (!PNG) return null;
  const png = PNG.sync.read(buf);
  const { width: w, height: h, data } = png;
  const lum = (i) => {
    const o = i * 4;
    return (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722) / 255;
  };
  const bandH = Math.max(8, Math.floor(h * 0.18));
  let hepaSum = 0,
    hepaN = 0;
  for (let y = 0; y < bandH; y++) {
    for (let x = 0; x < w; x++) {
      hepaSum += lum(y * w + x);
      hepaN++;
    }
  }
  const hepa = 1 - hepaSum / hepaN;

  const lx1 = Math.floor(w * 0.06);
  const y0 = Math.floor(h * 0.25),
    y1 = Math.floor(h * 0.7);
  let tan = 0,
    tn = 0,
    dark = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < lx1; x++) {
      const o = (y * w + x) * 4;
      const r = data[o],
        g = data[o + 1],
        b = data[o + 2];
      const L = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      tn++;
      if (L < 0.35) dark++;
      if (r > 140 && g > 120 && b > 90 && r + g > b * 2.1 && L > 0.45) tan++;
    }
  }
  const leftTanFrac = tan / tn;
  const leftDarkFrac = dark / tn;

  const nx0 = Math.floor(w * 0.28),
    nx1 = Math.floor(w * 0.72);
  const ny0 = Math.floor(h * 0.12),
    ny1 = Math.floor(h * 0.42);
  let nSum = 0,
    nSum2 = 0,
    nn = 0;
  for (let y = ny0; y < ny1; y++) {
    for (let x = nx0; x < nx1; x++) {
      const L = lum(y * w + x);
      nSum += L;
      nSum2 += L * L;
      nn++;
    }
  }
  const nMean = nSum / nn;
  const nicheStd = Math.sqrt(Math.max(0, nSum2 / nn - nMean * nMean));

  const by0 = Math.floor(h * 0.32),
    by1 = Math.floor(h * 0.58);
  const bx0 = Math.floor(w * 0.22),
    bx1 = Math.floor(w * 0.78);
  let chem = 0,
    cn = 0,
    fullChem = 0,
    neon = 0,
    fn = w * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const r = data[o],
        g = data[o + 1],
        b = data[o + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx - mn;
      const isChem = sat > 55 && mx > 90 && (r > 140 || g > 140 || b > 140);
      if (isChem) fullChem++;
      if (mx > 220 && sat > 90) neon++;
      if (y >= by0 && y < by1 && x >= bx0 && x < bx1) {
        cn++;
        if (isChem) chem++;
      }
    }
  }
  // darkDelta — center column vs chem annulus (RCA wet depth cue).
  const cx0 = Math.floor(w * 0.42),
    cx1 = Math.floor(w * 0.58);
  const cy0 = Math.floor(h * 0.36),
    cy1 = Math.floor(h * 0.55);
  let cSum = 0,
    cN = 0,
    rSum = 0,
    rN = 0;
  for (let y = cy0; y < cy1; y++) {
    for (let x = Math.floor(w * 0.22); x < Math.floor(w * 0.78); x++) {
      const L = lum(y * w + x);
      const inC = x >= cx0 && x < cx1;
      if (inC) {
        cSum += L;
        cN++;
      } else if (y >= by0 && y < by1) {
        rSum += L;
        rN++;
      }
    }
  }
  const centerL = cN ? cSum / cN : 0;
  const ringL = rN ? rSum / rN : 0;
  const darkDelta = +(ringL - centerL).toFixed(4);

  return {
    hepa: +hepa.toFixed(3),
    leftTanFrac: +leftTanFrac.toFixed(4),
    leftDarkFrac: +leftDarkFrac.toFixed(4),
    nicheStd: +nicheStd.toFixed(3),
    chemBand: +(chem / cn).toFixed(4),
    chemFull: +(fullChem / fn).toFixed(4),
    neonHot: +(neon / fn).toFixed(4),
    darkDelta,
    centerL: +centerL.toFixed(4),
    ringL: +ringL.toFixed(4),
    w,
    h,
  };
}

async function shot(pathOut, openFn, label) {
  await openFn();
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    window.__WP?.engine?.resize?.();
    for (let i = 0; i < 140; i++) window.__WP?.scene?.render?.();
  });
  await page.waitForTimeout(400);
  const result = await page.evaluate(() => {
    const cam = window.__WP.scene.activeCamera;
    const c = window.__WP.engine.getRenderingCanvas();
    let hepaGl = null;
    try {
      const gl =
        window.__WP.engine._gl || c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        const w = c.width,
          h = c.height;
        const bandH = Math.max(8, Math.floor(h * 0.18));
        const buf = new Uint8Array(w * bandH * 4);
        gl.readPixels(0, h - bandH, w, bandH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let sum = 0;
        const n = w * bandH;
        for (let i = 0; i < n; i++) {
          const o = i * 4;
          sum += (buf[o] * 0.2126 + buf[o + 1] * 0.7152 + buf[o + 2] * 0.0722) / 255;
        }
        hepaGl = 1 - sum / n;
      }
    } catch {
      hepaGl = -1;
    }
    const cab = !!window.__WP.scene.getMeshByName('rcaCab')?.isEnabled?.();
    const skirt = !!window.__WP.scene.getMeshByName('rcaSkirtFace')?.isEnabled?.();
    const mono = !!window.__WP.scene.getMeshByName('rcaMonoSkirt')?.isEnabled?.();
    const side = !!window.__WP.scene.getMeshByName('rcaSidePlenum1')?.isEnabled?.();
    return {
      phase: window.__WP.session.uiPhase,
      r: cam.radius,
      b: cam.beta,
      a: cam.alpha,
      fov: cam.fov,
      pos: Array.from(cam.position.asArray()),
      tgt: Array.from(cam.getTarget().asArray()),
      data: c.toDataURL('image/png'),
      hepaGl,
      rca: window.__WP.scene.getTransformNodeByName('rcaBench')?.isEnabled?.(),
      wafer: !!window.__WP.scene.getMeshByName('waferDisk')?.isEnabled(),
      foup: !!window.__WP.scene.getMeshByName('foupBody')?.isEnabled(),
      cabOn: cab,
      skirtOn: skirt,
      monoOn: mono,
      sideOn: side,
      leftSeal: !!window.__WP.scene.getMeshByName('leftCamSeal'),
      mouthL: !!window.__WP.scene.getMeshByName('inspectNicheMouthL'),
      midBulk: !!window.__WP.scene.getMeshByName('bayMidBulk'),
      midHead: !!window.__WP.scene.getMeshByName('bayMidHead'),
      midSpine: !!window.__WP.scene.getMeshByName('bayMidSpine'),
      midSpineFace: !!window.__WP.scene.getMeshByName('bayMidSpineFace'),
      midSpineWingL: !!window.__WP.scene.getMeshByName('bayMidSpineWingL'),
      // feel41 — residual midSpine / WallGap / opaque slab must be parked (gaps open to bay wall).
      midSpineParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidSpine');
        return !!m && m.isEnabled?.() === false;
      })(),
      midSpineFaceParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidSpineFace');
        return !!m && m.isEnabled?.() === false;
      })(),
      midOpaqueFaceParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidOpaqueFace');
        return !!m && m.isEnabled?.() === false;
      })(),
      midBulkFaceParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidBulkFace');
        return !!m && m.isEnabled?.() === false;
      })(),
      midFabWallGapParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidFabWallGap_0');
        return !!m && m.isEnabled?.() === false;
      })(),
      midFabWallGapFaceParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidFabWallGapFace_0');
        return !!m && m.isEnabled?.() === false;
      })(),
      midFabEndCapLParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidFabEndCapL');
        return !!m && m.isEnabled?.() === false;
      })(),
      midFabEndCapRParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidFabEndCapR');
        return !!m && m.isEnabled?.() === false;
      })(),
      midFabBackdropParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidFabBackdrop');
        return !!m && m.isEnabled?.() === false;
      })(),
      midBulkParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidBulk');
        return !!m && m.isEnabled?.() === false;
      })(),
      midFabPocketParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidFabPocket_0_0');
        return !!m && m.isEnabled?.() === false;
      })(),
      conduitParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayConduitRun');
        return !!m && m.isEnabled?.() === false;
      })(),
      midHeadParked: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidHead');
        return !!m && m.isEnabled?.() === false;
      })(),
      foupWindow: !!window.__WP.scene.getMeshByName('foupWindow'),
      stampReject: !!window.__WP.scene.getMeshByName('stamp_Reject'),
      cabBlob: !!window.__WP.scene.getMeshByName('bayMidFabCabBlob_0_0'),
      cabPlinthSlim: (() => {
        const m = window.__WP.scene.getMeshByName('bayMidFabCabPlinth_0_0');
        if (!m?.getBoundingInfo) return false;
        const sy = m.getBoundingInfo().boundingBox.extendSizeWorld.y * 2;
        return sy > 0 && sy < 0.06;
      })(),
      travelerX: window.__WP.scene.getTransformNodeByName('traveler')?.position?.x ?? null,
      travelerQuiet: (() => {
        const tr = window.__WP.scene.getTransformNodeByName('traveler');
        return !!tr && tr.position.x >= 1.0 && (tr.scaling?.x ?? 1) <= 0.85;
      })(),
      ipaFar: (() => {
        const m = window.__WP.scene.getMeshByName('ipaBottle');
        return !!m && m.position.x >= 1.1;
      })(),
      midFabCas_0_0: !!window.__WP.scene.getMeshByName('bayMidFabCas_0_0'),
      midFabCas_0_1: !!window.__WP.scene.getMeshByName('bayMidFabCas_0_1'),
      midFabCas_1_2: !!window.__WP.scene.getMeshByName('bayMidFabCas_1_2'),
      gapConsole: !!window.__WP.scene.getMeshByName('bayGapConsole'),
      absorb: !!window.__WP.scene.getMeshByName('sc1_absorb'),
      poolSurf: !!window.__WP.scene.getMeshByName('sc1_poolSurf'),
      glowRim: !!window.__WP.scene.getMeshByName('sc1_glowRim'),
      skimGone: !window.__WP.scene.getMeshByName('sc1_skim'),
      meniscusHiGone: !window.__WP.scene.getMeshByName('sc1_meniscusHi'),
      poolKick: !!window.__WP.scene.getLightByName?.('rcaPoolKick') || !!window.__WP.scene.lights?.some?.((l) => l.name === 'rcaPoolKick'),
      rimKick: !!window.__WP.scene.getLightByName?.('rcaRimKick') || !!window.__WP.scene.lights?.some?.((l) => l.name === 'rcaRimKick'),
      gapCassette: !!window.__WP.scene.getMeshByName('bayGapCassette_0'),
      gapTier: !!window.__WP.scene.getMeshByName('bayGapConsoleTier'),
      gapCart: !!window.__WP.scene.getMeshByName('bayGapCartStub'),
      gapCasFrame: !!window.__WP.scene.getMeshByName('bayGapCasFrame'),
      midFabBackdrop: !!window.__WP.scene.getMeshByName('bayMidFabBackdrop'),
      midFabCas: !!window.__WP.scene.getMeshByName('bayMidFabCas_0_0'),
      midFabCasFace: !!window.__WP.scene.getMeshByName('bayMidFabCasFace_0_0'),
      midFabCasWin: !!window.__WP.scene.getMeshByName('bayMidFabCasWin_0_0'),
      midFabCasTag: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasTag_\d+_\d+$/.test(m.name)),
      midFabCasTagBody: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasTag_\d+_\d+Body$/.test(m.name)),
      midFabCasTagStep: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasTag_\d+_\d+Step$/.test(m.name)),
      midFabCasShellBevel: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasShellBevel_/.test(m.name)),
      midFabCasDoorFrame: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasDoorFrame_/.test(m.name)),
      midFabCasLatch: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasLatch_/.test(m.name)),
      midFabEndCapLNose: !!window.__WP.scene.getMeshByName('bayMidFabEndCapLNose'),
      midFabEndCapRNose: !!window.__WP.scene.getMeshByName('bayMidFabEndCapRNose'),
      midFabCasTagBevel: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasTag_\d+_\d+Bevel/.test(m.name)),
      midFabCasTagWell: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasTag_\d+_\d+Well$/.test(m.name)),
      midFabCasHandle: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasHandle_/.test(m.name)),
      midFabCasVent: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasVent_/.test(m.name)),
      midFabCasBarcode: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasBarcode_\d+_\d+$/.test(m.name)),
      midFabCasBarcodeBody: !!window.__WP.scene.meshes?.some?.((m) => /^bayMidFabCasBarcode_\d+_\d+Body$/.test(m.name)),
      midFabEndCapL: !!window.__WP.scene.getMeshByName('bayMidFabEndCapL'),
      midFabEndCapR: !!window.__WP.scene.getMeshByName('bayMidFabEndCapR'),
      midFabPocketDark: !!window.__WP.scene.getMaterialByName?.('bayMidFabPocketDarkMat'),
      midOpaqueFace: !!window.__WP.scene.getMeshByName('bayMidOpaqueFace'),
      // feel41 — free-standing SMIF cabinets + OPEN bay-wall gaps (WallGap parked; no upright/shelf lattice).
      midFabWallGap: !!window.__WP.scene.getMeshByName('bayMidFabWallGap_0'),
      midFabCabPlinth: !!window.__WP.scene.getMeshByName('bayMidFabCabPlinth_0_0'),
      midFabCabCrown: !!window.__WP.scene.getMeshByName('bayMidFabCabCrown_0_0'),
      midFabCasCount: (window.__WP.scene.meshes || []).filter((m) => /^bayMidFabCas_\d+_\d+$/.test(m.name)).length,
      midFabWallGapCount: (window.__WP.scene.meshes || []).filter((m) => /^bayMidFabWallGap_\d+$/.test(m.name)).length,
      midFabWallGapEnabledCount: (window.__WP.scene.meshes || []).filter(
        (m) => /^bayMidFabWallGap_\d+$/.test(m.name) && m.isEnabled?.() !== false,
      ).length,
      midFabUprightGone: !window.__WP.scene.getMeshByName('bayMidFabUpright_0'),
      midFabShelfGone: !window.__WP.scene.getMeshByName('bayMidFabShelf_0'),
      lotTagCount: (window.__WP.scene.meshes || []).filter((m) => /^bayMidFabCasTag_\d+_\d+$/.test(m.name)).length,
      lotBodyCount: (window.__WP.scene.meshes || []).filter((m) => /^bayMidFabCasTag_\d+_\d+Body$/.test(m.name)).length,
      wellWall: !!window.__WP.scene.getMeshByName('sc1_wellWall0'),
      collar: !!window.__WP.scene.getMeshByName('sc1_collar'),
      cupWell: !!window.__WP.scene.getMeshByName('sc1_well'),
      wallBand: !!window.__WP.scene.getMeshByName('sc1_wallBand'),
      chemDisc: !!window.__WP.scene.getMeshByName('sc1_chemDisc'),
      liquid: !!window.__WP.scene.getMeshByName('sc1_liquid'),
      midFabDoorGone: !window.__WP.scene.getMeshByName('bayMidGapDoor')?.isEnabled?.(),
    };
  });
  const png = Buffer.from(result.data.split(',')[1], 'base64');
  fs.writeFileSync(pathOut, png);
  const scored = scorePng(png);
  const { data, ...meta } = result;
  console.log(label, JSON.stringify({ ...meta, scored, bytes: fs.statSync(pathOut).size, mtime: fs.statSync(pathOut).mtimeMs }));
  return scored;
}

const insp = await shot(
  `${out}/smoke-inspection-iris.png`,
  async () => {
    await page.evaluate(() => {
      const s = window.__WP.session;
      try {
        s.harness({ type: 'skipOnboarding' });
      } catch {}
      try {
        s.harness({ type: 'begin' });
      } catch {}
      try {
        s.harness({ type: 'loadFoup' });
      } catch {}
    });
  },
  'inspection',
);

const rca = await shot(
  `${out}/smoke-rca.png`,
  async () => {
    await page.evaluate(() => {
      window.__WP.session.harness({ type: 'forceOpenRework', defectType: null });
    });
  },
  'rca',
);

await page.evaluate(() => {
  try {
    window.__WP.session.harness({ type: 'forceCloseRework' });
  } catch {}
  try {
    window.__WP.session.harness({ type: 'skipOnboarding' });
  } catch {}
});
await page.waitForTimeout(600);

const juice = await page.evaluate(async () => {
  const notes = [];
  const s = window.__WP.session;
  const scene = window.__WP.scene;
  const pick = (name) => scene.getMeshByName(name);
  try {
    s.harness({ type: 'begin' });
    notes.push('begin:ok');
  } catch {
    notes.push('begin:fail');
  }
  for (let i = 0; i < 20; i++) scene.render();
  await new Promise((r) => setTimeout(r, 350));
  try {
    s.harness({ type: 'loadFoup' });
    notes.push('foup:ok');
  } catch {
    notes.push('foup:fail');
  }
  for (let i = 0; i < 30; i++) scene.render();
  await new Promise((r) => setTimeout(r, 500));
  try {
    s.harness({ type: 'stamp', action: 'Reject' });
    notes.push('stamp:ok');
  } catch {
    notes.push('stamp:fail');
  }
  for (let i = 0; i < 8; i++) scene.render();
  const stampMesh = pick('stamp_Reject') || pick('stamp_Accept');
  const em = stampMesh?.material?.emissiveColor;
  const maxCh = em ? Math.max(em.r ?? 0, em.g ?? 0, em.b ?? 0) : 0;
  const stampLitMeta = !!(stampMesh?.metadata?.stampLit || window.__WP_STAMP_LIT);
  const stampLit = stampLitMeta || maxCh > 0.35;
  notes.push(`emMax=${maxCh.toFixed(3)}`);
  notes.push(`stampLit=${stampLit}`);
  notes.push(`phase=${s.uiPhase}`);
  return notes;
});
console.log('juice_playtest', JSON.stringify(juice));
console.log(
  'SUMMARY',
  JSON.stringify({
    insp,
    rca,
    pageErrors,
    glInfo,
    camOk:
      insp &&
      rca &&
      true,
  }),
);

await context.close();
try {
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {}

if (pageErrors.some((m) => /webgl not supported/i.test(m))) {
  process.exit(3);
}
