import {
  BodyType,
  FuelType,
  Transmission,
} from './entities/car-sub-model.entity';

export interface ParsedSubModel {
  trimName: string | null;
  generation: string | null;
  horsePower: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  fuelType: FuelType | null;
  transmission: Transmission | null;
  bodyType: BodyType | null;
}

const HP_RE = /\((\d{2,4})(?:\s*\/\s*\d{2,4})?\s*(?:bg|hp|ps)\)/i;
const YEAR_RANGE_RE = /((?:19|20)\d{2})\s*[-–]\s*((?:19|20)\d{2})\s*$/;
const YEAR_SINGLE_RE = /((?:19|20)\d{2})\s*$/;

function clean(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[\s·,-]+|[\s·,-]+$/g, '')
    .trim();
}

/**
 * "Egea (356) · 1.3 Multijet II (95 bg) 2016 - 2019" + model "Egea" →
 * trimName "1.3 Multijet II", generation "356", hp 95, 2016–2019.
 * Kasa / yakıt / şanzıman ad içindeki anahtar kelimelerden tahmin edilir;
 * tahmin edilemiyorsa null.
 */
export function parseSubModelName(
  name: string,
  modelName: string,
): ParsedSubModel {
  const parts = name.split(' · ');
  const spec = parts.length > 1 ? parts[parts.length - 1] : name;
  const prefix = parts.length > 1 ? parts.slice(0, -1).join(' · ') : '';

  // --- generation ---
  let generation: string | null = null;
  if (prefix) {
    let rest = prefix.trim();
    if (rest.toLowerCase().startsWith(modelName.toLowerCase())) {
      rest = rest.slice(modelName.length).trim();
    }
    const paren = rest.match(/\(([^)]*)\)/);
    if (paren) generation = clean(paren[1]) || null;
    else generation = clean(rest) || null;
  }

  // --- horse power ---
  const hpMatch = spec.match(HP_RE);
  const horsePower = hpMatch ? parseInt(hpMatch[1], 10) : null;

  // --- years ---
  let yearFrom: number | null = null;
  let yearTo: number | null = null;
  let withoutYears = spec;
  const range = spec.match(YEAR_RANGE_RE);
  if (range) {
    yearFrom = parseInt(range[1], 10);
    yearTo = parseInt(range[2], 10);
    withoutYears = spec.slice(0, range.index);
  } else {
    const single = spec.match(YEAR_SINGLE_RE);
    if (single) {
      yearFrom = parseInt(single[1], 10);
      yearTo = null; // devam eden üretim
      withoutYears = spec.slice(0, single.index);
    }
  }

  // --- trim ---
  const trimName = clean(withoutYears.replace(HP_RE, ' ')) || null;

  return {
    trimName,
    generation,
    horsePower,
    yearFrom,
    yearTo,
    fuelType: inferFuelType(spec),
    transmission: inferTransmission(spec),
    bodyType: inferBodyType(`${modelName} ${prefix}`),
  };
}

export function inferFuelType(spec: string): FuelType | null {
  const s = ` ${spec.toLowerCase()} `;
  if (
    /kwh|\belectric\b|\bbev\b|\bev\b|e-tron\b|electro|\bzero emission/.test(s)
  ) {
    return 'electric';
  }
  if (
    /hybrid|\bhev\b|\bphev\b|e-tech|e-power|ehybrid|\betsi\b|e-cvt|e-hybrid|\bhybride?\b/.test(
      s,
    )
  ) {
    return 'hybrid';
  }
  if (
    /\blpg\b|\bgpl\b|\bcng\b|autogas|bi-?fuel|ecofuel|\bmetano?\b|natural power|turbo natural/.test(
      s,
    )
  ) {
    return 'lpg';
  }
  if (
    /multijet|\bm-?jet\b|\b\d{2,3}d\b|\d\.\dd\b|\bdti\b|\bd-?tec\b|\btdv\d\b|\bjtdm?\b|\btdi\b|\bd-?cat\b|\bdci\b|\bcdi\b|\bhdi\b|bluehdi|\bcrdi\b|d-4d|\btdci\b|\bcdti\b|\bdiesel\b|\btd\b|\bsdi\b|bluetec|ecoblue|\bddis\b|di-d|\bdtec\b|skyactiv-d|\bd[2-6]\b|\bd\b|\btdv6\b|\btdv8\b|turbodiesel|\bcrd\b|\bddi\b|\btd[46]\b|\bsd4\b|\bjtd\b|\bd-id\b|\bdi\b|\bdt\b|\bcdi\b|\bbluemotion\b|\bgreenline\b|\bturbo d\b|\bdid\b|\bd4d\b|\bmzr-cd\b|\bcdx\b|\bdtci\b/.test(
      s,
    )
  ) {
    return 'diesel';
  }
  if (
    /\d\.\d|\b\d{3,4}\b|\btsi\b|\btfsi\b|\bfsi\b|\bmpi\b|\bgdi\b|t-gdi|\btce\b|\bsce\b|\bvti\b|\bthp\b|puretech|firefly|\bfire\b|twinair|twin air|ecoboost|turbo|\bi\b|16v|8v|12v|\bv6\b|\bv8\b|\bv10\b|\bv12\b|\bgti\b|petrol|benzin|skyactiv-g|vvt|\bvtec\b|\bi-vtec\b|\bdohc\b|\bgsi\b|\bts\b|\bie\b|\bi\.e\.\b/.test(
      s,
    )
  ) {
    return 'gasoline';
  }
  return null;
}

export function inferTransmission(spec: string): Transmission | null {
  const s = ` ${spec.toLowerCase()} `;
  if (
    /dualogic|easytronic|semi-?automatic|\bamt\b|robot|\bmta\b|selespeed|sensodrive|\bmmt\b|\bsmg\b|\basg\b|\bemt\b|automated manual|\bstopshift\b|\b2-tronic\b|\bsmt\b|\bcmt\b|\bgm2\b/.test(
      s,
    )
  ) {
    return 'semi-automatic';
  }
  if (
    /\bimt\b|\bmanual\b|\bmt\b|\b[456]mt\b|\b[456]-speed manual\b|\bschaltgetriebe\b/.test(
      s,
    )
  ) {
    return 'manual';
  }
  if (
    /automatic|\bauto\b|\bautomatik\b|\bdsg\b|\bdct\b|\bcvt\b|e-cvt|tiptronic|s[- ]tronic|steptronic|multitronic|\bedc\b|\bat\b|\baut\.?\b|powershift|\bpdk\b|hydra-matic|powerflite|torqueflite|shiftronic|geartronic|xtronic|\bivt\b|multidrive|\bdat\b|[79]g-tronic|speedshift|sportshift|\bmct\b|\bautostick\b|\btct\b|\bagr\b|\b[456789]at\b|\bautom\b|\bmultimode\b|\bmulti-mode\b|\bzf\b|\bautotronic\b|\bsport-?matic\b|\bbvm\b|\bbva\b|\bcoupe-?matic\b|\bselectshift\b|\bsmg\b/.test(
      s,
    )
  ) {
    return 'automatic';
  }
  return null;
}

export function inferBodyType(nameWithoutSpec: string): BodyType | null {
  const s = ` ${nameWithoutSpec.toLowerCase()} `;
  if (
    /cabrio|cabriolet|convertible|roadster|spider|spyder|targa|drophead|\bcc\b|volante|\bbarchetta\b/.test(
      s,
    )
  ) {
    return 'cabrio';
  }
  if (
    /pickup|pick-up|\bute\b|double cab|single cab|crew cab|\bhilux\b|\bnavara\b|\bl200\b|\branger\b|\bamarok\b|\bd-max\b|\bfrontier\b|\btacoma\b|\btundra\b|f-150|silverado|\bdakota\b|\bbt-50\b|\btriton\b|\bmusso\b|\bgladiator\b|\bactyon sports\b|\bisuzu d\b/.test(
      s,
    )
  ) {
    return 'pickup';
  }
  if (
    /\bmpv\b|multivan|\bvan\b|minivan|spacetourer|zafira|sharan|touran|caravelle|sc[eé]nic|picasso|\bverso\b|carens|galaxy|s-max|c-max|b-max|espace|kangoo|caddy|dobl[oò]|berlingo|partner|rifter|combo|tourneo|transit|\bvito\b|viano|v-klasse|v-class|odyssey|sienna|alhambra|carnival|sedona|minibus|\bbus\b|\bmultipla\b|\bulysse\b|\bqubak\b|\bqubo\b|\bfiorino\b|\bbipper\b|\bnemo\b|\bexpert\b|\bjumpy\b|\btrafic\b|\bvivaro\b|\btalento\b|\bproace\b|\bstaria\b|\bh-1\b|\bstarex\b|\bmeriva\b|\bagila\b|\bnote\b|\bmusa\b|\bidea\b|\bmodus\b|\bvento\b|\bfusion\b|\bix20\b|\bvenga\b|\bsoul\b|\bspace star\b|\bgrand c4\b|\bcitan\b|\bb-class\b|\bb-klasse\b|\bb-serisi\b/.test(
      s,
    )
  ) {
    return 'mpv';
  }
  if (
    /\bsw\b|station wagon|estate|touring sports|\btouring\b|variant|\bavant\b|\bkombi\b|\bbreak\b|\btourer\b|sportbrake|\bwagon\b|\bcaravan\b|sports tourer|shooting brake|t-modell|allroad|alltrack|cross country|sportwagon|sportcombi|\bst\b|\bweekend\b|\bmarea weekend\b|\bgrandtour\b|\bgrand tour\b|\bcombi\b|\bfamiliale\b|\bvariante\b|\bturnier\b|\bclipper\b|\bnevada\b/.test(
      s,
    )
  ) {
    return 'station-wagon';
  }
  if (/coup[eé]|\bfastback\b|\bgran coupe\b|\bgran coup[eé]\b/.test(s)) {
    return 'coupe';
  }
  if (
    /\bsuv\b|crossover|\bcross\b|\b4x4\b|x-trail|qashqai|tucson|santa fe|\bkona\b|sportage|sorento|\brav4\b|c-hr|land cruiser|tiguan|touareg|t-roc|t-cross|taigo|tayron|\b[235]008\b|captur|kadjar|koleos|austral|arkana|duster|\bjuke\b|\bq[2-8]\b|\bx[1-7]\b|\bglc\b|\bgle\b|\bgls\b|\bgla\b|\bglb\b|\bglk\b|\bml\b|\bxc\d{2}\b|evoque|discovery|defender|range rover|freelander|cx-\d|eclipse cross|outlander|\basx\b|forester|outback|\bxv\b|crosstrek|\byeti\b|karoq|kodiaq|kamiq|\bateca\b|\barona\b|tarraco|formentor|\bpuma\b|\bkuga\b|ecosport|explorer|escape|\bedge\b|bronco|\bmokka\b|grandland|crossland|antara|frontera|compass|renegade|cherokee|wrangler|\b500x\b|\bniro\b|seltos|stonic|xceed|\bvenue\b|\bbayon\b|\bix35\b|\bix55\b|\bcreta\b|aircross|c4 cactus|vitara|s-cross|jimny|cr-v|hr-v|zr-v|\bpilot\b|highlander|yaris cross|urban cruiser|bz4x|ioniq 5|\bev6\b|\bev9\b|enyaq|id\.4|id\.5|\bmacan\b|cayenne|\burus\b|bentayga|stelvio|tonale|levante|grecale|\bdbx\b|f-pace|e-pace|i-pace|\bnx\b|\brx\b|\bux\b|\blx\b|\bgx\b|murano|pathfinder|\bpatrol\b|terrano|\bkicks\b|\bariya\b|trailblazer|\btahoe\b|suburban|equinox|traverse|captiva|orlando|tracker|\btrax\b|escalade|\bxt[4-6]\b|\bsrx\b|navigator|aviator|nautilus|corsair|\bmkx\b|\bmkc\b|durango|journey|\bnitro\b|\baspen\b|tiggo|jaecoo|omoda|haval|jolion|\bh6\b|\btank\b|atto 3|\bzs\b|\bhs\b|\behs\b|\bmarvel r\b|\bsantafe\b|\bterracan\b|\bgalloper\b|\bgrand vitara\b|\bx-?90\b|\bpajero\b|\bmontero\b|\bshogun\b|\bfortuner\b|\b4runner\b|\bsequoia\b|\bland rover\b|\bbighorn\b|\btrooper\b|\brodeo\b|\bsportrak\b|\bferoza\b|\bterios\b|\brocky\b|\bgrand cherokee\b|\bpatriot\b|\bliberty\b|\bcommander\b|\btiguan\b|\batlas\b|\bteramont\b|\btouran\b|\bmohave\b|\bborrego\b|\bsantamo\b|\bgrand santa\b|\bveracruz\b|\bix\d{2}\b|\bnexo\b|\bcx-?[3-9]\b|\btribute\b|\bkoleos\b|\bmaverick\b|\bterritory\b|\bfreestyle\b|\bflex\b|\bexpedition\b|\bq[0-9]e?\b|\bq[0-9] e-tron\b/.test(
      s,
    )
  ) {
    return 'suv';
  }
  if (
    /hatchback|\bhatch\b|\b[35]door\b|\b[35]-door\b|\b[35]dr\b|sportback|liftback|\bgtc\b|\b[35] kapı\b|\b[35]-türer\b|\bberlina\b.*\b[35]p\b/.test(
      s,
    )
  ) {
    return 'hatchback';
  }
  if (
    /\bsedan\b|\bsaloon\b|\blimousine\b|\blimo\b|\bgran coupe\b|\b4-door\b|\b4door\b|\bnotchback\b|\b4 kapı\b|\bberline\b/.test(
      s,
    )
  ) {
    return 'sedan';
  }
  return null;
}
