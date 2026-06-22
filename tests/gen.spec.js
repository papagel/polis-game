import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = 'file://' + path.join(ROOT, 'generator.html');
const INDEX = 'file://' + path.join(ROOT, 'index.html');

const CONFIGS = [
  { size:32,  waterShape:'river', waterPct:14, mtnPct:10, mtnSteep:55, targetPop:1500,   cond:'wellrun',    seed:101, cityName:'Aria' },
  { size:64,  waterShape:'coast', waterPct:22, mtnPct:18, mtnSteep:70, targetPop:25000,  cond:'thriving',   seed:202, cityName:'Brio' },
  { size:64,  waterShape:'lake',  waterPct:10, mtnPct:5,  mtnSteep:30, targetPop:8000,   cond:'struggling', seed:303, cityName:'Cole' },
  { size:128, waterShape:'river', waterPct:18, mtnPct:25, mtnSteep:90, targetPop:120000, cond:'average',    seed:404, cityName:'Dune' },
  { size:64,  waterShape:'none',  waterPct:0,  mtnPct:0,  mtnSteep:0,  targetPop:600,    cond:'declining',  seed:505, cityName:'Echo' },
  // edge cases
  { size:32,  waterShape:'river', waterPct:20, mtnPct:15, mtnSteep:80, targetPop:80000,  cond:'wellrun',    seed:606, cityName:'Flux'  }, // far over capacity for a tiny map
  { size:128, waterShape:'coast', waterPct:30, mtnPct:45, mtnSteep:100,targetPop:250000, cond:'thriving',   seed:707, cityName:'Gale'  }, // max everything
  { size:64,  waterShape:'lake',  waterPct:5,  mtnPct:2,  mtnSteep:10, targetPop:200,     cond:'average',    seed:808, cityName:'Hale'  }, // minimum population
];

test('generator codes load into the game and stay stable', async ({ browser }) => {
  test.setTimeout(180000);

  // 1) generate codes in generator.html
  const gp = await browser.newPage();
  const genErrors = [];
  gp.on('pageerror', e => genErrors.push(e.message));
  await gp.goto(GEN);
  const results = [];
  for (const cfg of CONFIGS) {
    const r = await gp.evaluate(c => {
      const res = generate(c);
      return { code: res.code, pop: res.pop, jobs: res.jobs, plants: res.plants, name: res.cityName, dbg: res.dbg };
    }, cfg);
    results.push({ cfg, ...r });
  }
  expect(genErrors, 'generator threw: ' + genErrors.join(' | ')).toEqual([]);

  // 2) load each code into the real game and tick it
  const ip = await browser.newPage();
  const gameErrors = [];
  ip.on('pageerror', e => gameErrors.push(e.message));
  await ip.goto(INDEX);
  await ip.evaluate(() => { S.speed = 0; });

  const report = [];
  for (const r of results) {
    const out = await ip.evaluate(({ code }) => {
      loadSave(code);                 // must not throw
      S.started = true;
      // one tick derives the true population/jobs from the cells
      simTick();
      const pop0 = S.pop, jobs0 = S.jobs;
      const cap = S.powerCap, use = S.powerUse, wcap = S.waterCap, wuse = S.waterUse;
      const d0 = {r:Math.round(S.demand.r*100), c:Math.round(S.demand.c*100), i:Math.round(S.demand.i*100)};
      const happy0 = S.happy, cong0 = S.congested;
      // run a season and make sure it doesn't collapse
      for (let i = 0; i < 120; i++) simTick();
      const pop1 = S.pop;
      const d1 = {r:Math.round(S.demand.r*100), c:Math.round(S.demand.c*100), i:Math.round(S.demand.i*100)};
      const happy1 = S.happy, cong1 = S.congested;
      // service / road tallies for realism checks
      let nPolice=0,nFire=0,nSchool=0,nHosp=0,nRoad=0,nAve=0,deadEnds=0;
      const isR=t=>t==='road'||t==='avenue';
      for (let y=0;y<G;y++) for (let x=0;x<G;x++){
        const t=map[y][x].t;
        if(t==='police')nPolice++; else if(t==='fire')nFire++;
        else if(t==='school'||t==='highschool')nSchool++; else if(t==='hospital'||t==='clinic'||t==='medcenter')nHosp++;
        else if(t==='road')nRoad++; else if(t==='avenue')nAve++;
        if(isR(t)){ let deg=0; for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy; if(nx>=0&&ny>=0&&nx<G&&ny<G&&isR(map[ny][nx].t))deg++;} if(deg<=1)deadEnds++; }
      }
      // count any cell stuck unpowered while developed (a connectivity bug)
      let devUnpowered = 0, devLots = 0;
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        const c = map[y][x];
        if ((c.t === 'res' || c.t === 'com' || c.t === 'ind') && c.lv > 0 && !c.part) {
          devLots++; if (!c.pw) devUnpowered++;
        }
      }
      // round-trip the loaded city back out
      const re = makeSave();
      return { pop0, jobs0, pop1, cap, use, wcap, wuse, devLots, devUnpowered, reLen: re.length, d0, d1, happy0, happy1, cong0, cong1, nPolice, nFire, nSchool, nHosp, nRoad, nAve, deadEnds };
    }, r);
    report.push({ name: r.name, gen: { pop: r.pop, jobs: r.jobs, plants: r.plants }, dbg: r.dbg, game: out });
  }

  console.log('\n===== GENERATED CITY VALIDATION =====');
  for (const r of report) {
    const g = r.game;
    console.log(`\n${r.name}  gen.pop=${r.gen.pop}  game.pop(1tick)=${g.pop0}  pop(120ticks)=${g.pop1}  (${Math.round(100*g.pop1/g.pop0)}%)`);
    console.log(`  jobs gen=${r.gen.jobs} game=${g.jobs0} | power ${g.use}/${g.cap} | water ${g.wuse}/${g.wcap} | devLots=${g.devLots} unpowered=${g.devUnpowered}`);
    console.log(`  demand t0 r${g.d0.r} c${g.d0.c} i${g.d0.i} -> t1 r${g.d1.r} c${g.d1.c} i${g.d1.i} | happy ${g.happy0}->${g.happy1} | congested ${g.cong0}->${g.cong1}`);
    const d=r.dbg; console.log(`  dbg R=${d.R} | svc police=${g.nPolice} fire=${g.nFire} school=${g.nSchool} health=${g.nHosp} | roads ${g.nRoad} av=${g.nAve} (${Math.round(100*g.nAve/(g.nRoad+g.nAve))}%) deadEnds=${g.deadEnds} | cong ${g.cong0}->${g.cong1} happy ${g.happy0}->${g.happy1}`);
  }
  console.log('=====================================\n');

  expect(gameErrors, 'game threw on load/tick: ' + gameErrors.join(' | ')).toEqual([]);

  for (const r of report) {
    const g = r.game;
    // generator's pop estimate should match the game's recompute closely
    if (r.gen.pop > 0) {
      expect(Math.abs(g.pop0 - r.gen.pop) / r.gen.pop, `${r.name} pop mismatch`).toBeLessThan(0.06);
    }
    // city must have power & water capacity for its demand
    expect(g.cap, `${r.name} no power capacity`).toBeGreaterThanOrEqual(g.use);
    expect(g.wcap, `${r.name} no water capacity`).toBeGreaterThanOrEqual(g.wuse);
    // almost everything developed should be powered (allow a few fringe lots)
    if (g.devLots > 0) {
      expect(g.devUnpowered / g.devLots, `${r.name} too many unpowered lots`).toBeLessThan(0.1);
    }
    // it should ship near equilibrium, not bleed population over a season
    if (g.pop0 > 200) {
      expect(g.pop1, `${r.name} city is unstable (${g.pop0}->${g.pop1})`).toBeGreaterThan(g.pop0 * 0.78);
    }
  }
});
