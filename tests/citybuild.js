// Shared page-context helpers for building tiny scripted cities. These are
// serialized into the browser by inPage(), so they may only reference globals
// that exist in index.html (S, G, map, blankCell, recomputeNets, ...).
export const HELPERS = `
  function resetGrid(){
    S.scen = 0; S.started = false; S.diff = 1; S.day = 0; S.edu = 0; S.loan = null;
    for (let y=0;y<G;y++) for (let x=0;x<G;x++) map[y][x] = blankCell();
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
