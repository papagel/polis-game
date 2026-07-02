// Shared page-context helpers for building tiny scripted cities. These are
// serialized into the browser by inPage(), so they may only reference globals
// that exist in index.html (S, G, map, blankCell, recomputeNets, ...).
export const HELPERS = `
  function resetGrid(){
    S.scen = 0; S.started = false; S.diff = 1; S.day = 0; S.edu = 0; S.loan = null;
    // clear the transient sim accumulators that aren't tied to the map so two builds in one
    // page start identically (S.happyF is the smoothed-happiness state that feeds growth/decay).
    S.happyF = null; S.happy = 60; S.pop = 0; S.jobs = 0; S.demand = { r:0, c:0, i:0 };
    for (let y=0;y<G;y++) for (let x=0;x<G;x++) map[y][x] = blankCell();
    // the random boot map's elevation caches outlive the grid wipe — a stale mountain cell
    // can veto placements ("level this ground first") and flake specs. Flat world, honestly.
    EBASE = null; EHAND = null; EVERT = null; ELEVCELL = null; elevDirty = true;
  }
  function set(x,y,t){ map[y][x].t = t; return map[y][x]; }
  function hroad(y,x0,x1){ for (let x=x0;x<=x1;x++) map[y][x].t = 'road'; }
  // road at y=20 with a pump (+ power plant when 'powered') feeding a res strip.
  function build(powered){
    resetGrid();
    const ry = 20;
    hroad(ry, 10, 18);
    if (powered) set(10, ry+1, 'power');
    set(11, ry+1, 'pump');
    const lots = [[12,19],[13,19],[14,19],[15,19]];
    for (const [x,y] of lots) set(x,y,'res');
    recomputeNets();
    recomputeFields();
    return lots;
  }
`;

// Wrap a JS snippet so it runs in the page with the helpers above in scope.
export const inPage = (body) =>
  new Function(`${HELPERS}\nreturn (function(){ ${body} })();`);
