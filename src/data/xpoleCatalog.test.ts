import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cmToFeetAndInches,
  exportXPoleQuoteToCSV,
  feetAndInchesToCm,
  formatUsdExact,
  generateXPoleQuote,
  resolveXPoleConfiguration,
  XPOLE_CATALOG,
} from './xpoleCatalog';
import type { PoleFinishId, PoleInstance } from '../types/pole';

test('XPOLE_CATALOG matches build-a-pole-price-v2.json structure verbatim', () => {
  assert.equal(XPOLE_CATALOG.parts.length, 21);
  assert.deepEqual(
    XPOLE_CATALOG.finishes.map((f) => f.key),
    ['chrome', 'stainless', 'powder', 'silicone', 'brass']
  );
  assert.deepEqual(
    XPOLE_CATALOG.inputs.diameters.map((d) => d.mm),
    [40, 45]
  );
  assert.deepEqual(XPOLE_CATALOG.alwaysIncluded, ['Mount', 'Top insert', 'Base', 'Tool Pouch']);
  assert.deepEqual(XPOLE_CATALOG.materialMixFinishes, ['stainless']);
});

test('resolveXPoleConfiguration auto-selects exact part and retail/wholesale20/wholesale30 prices', () => {
  // 2740mm (9'0") -> part '125' (2717-2820mm)
  const chrome9ft = resolveXPoleConfiguration(2740, 'chrome', 'retail');
  assert.equal(chrome9ft.available, true);
  assert.equal(chrome9ft.part.id, '125');
  assert.equal(chrome9ft.unitPriceUsd, 782.93);
  assert.deepEqual(chrome9ft.includedHardware, ['Mount', 'Top insert', 'Base', 'Tool Pouch', 'X-Joint']);

  const chrome9ftW20 = resolveXPoleConfiguration(2740, 'chrome', 'wholesale20');
  assert.equal(chrome9ftW20.unitPriceUsd, 613.55);
  assert.equal(chrome9ftW20.savingsUsd, Number((782.93 - 613.55).toFixed(2)));

  const chrome9ftW30 = resolveXPoleConfiguration(2740, 'chrome', 'wholesale30');
  assert.equal(chrome9ftW30.unitPriceUsd, 536.86);

  // 2680mm -> 'only A pole' (no X-Joint)
  const brassBase = resolveXPoleConfiguration(2680, 'brass', 'retail');
  assert.equal(brassBase.part.id, 'only A pole');
  assert.equal(brassBase.unitPriceUsd, 983.95);
  assert.deepEqual(brassBase.includedHardware, ['Mount', 'Top insert', 'Base', 'Tool Pouch']);
  assert.ok(brassBase.notes.some((n) => n.includes('Extend top insert')));

  // 4300mm -> 'CX1600'
  const stainlessMax = resolveXPoleConfiguration(4300, 'stainless', 'wholesale30');
  assert.equal(stainlessMax.part.id, 'CX1600');
  assert.equal(stainlessMax.available, true);
  assert.equal(stainlessMax.unitPriceUsd, 740.56);
});

test('resolveXPoleConfiguration handles overlapping height bands cleanly (prefers available & non-CX)', () => {
  // 3400mm overlaps CX700 (3327-3429, brass=null) and 750 (3378-3480, brass=1135.93)
  const brass3400 = resolveXPoleConfiguration(3400, 'brass', 'retail');
  assert.equal(brass3400.available, true);
  assert.equal(brass3400.part.id, '750');
  assert.equal(brass3400.unitPriceUsd, 1135.93);

  // 3680mm overlaps 1000 (non-CX, $858.93) and CX1000 (CX, $869.93) -> prefers non-CX 1000
  const chrome3680 = resolveXPoleConfiguration(3680, 'chrome', 'retail');
  assert.equal(chrome3680.part.id, '1000');
  assert.equal(chrome3680.unitPriceUsd, 858.93);

  // 3780mm overlaps NS B/PX B (non-CX, powder $838.93) and CX1100 (CX, powder $869.93) -> prefers NS B/PX B
  const powder3780 = resolveXPoleConfiguration(3780, 'powder', 'retail');
  assert.equal(powder3780.part.id, 'NS B/PX B');
  assert.equal(powder3780.unitPriceUsd, 838.93);
});

test('resolveXPoleConfiguration flags materialMix on 300/400 stainless and null finish unavailability', () => {
  // 3000mm -> part '300' (2921-3023mm): stainless has materialMix = true, powder/silicone/brass are null
  const stainless300 = resolveXPoleConfiguration(3000, 'stainless', 'retail');
  assert.equal(stainless300.available, true);
  assert.equal(stainless300.part.id, '300');
  assert.equal(stainless300.hasMaterialMixNotice, true);
  assert.equal(stainless300.unitPriceUsd, 948.93);

  const unavailableFinishes: PoleFinishId[] = ['powder', 'silicone', 'brass'];
  for (const fin of unavailableFinishes) {
    const res = resolveXPoleConfiguration(3000, fin, 'retail');
    assert.equal(res.available, false, `Expected ${fin} to be unavailable at 3000mm`);
    assert.equal(res.unitPriceUsd, 0);
    assert.deepEqual(res.availableFinishesAtHeight, ['chrome', 'stainless']);
  }

  // 4300mm (CX1600): powder/silicone/brass are null, chrome & stainless available
  const powderMax = resolveXPoleConfiguration(4300, 'powder', 'retail');
  assert.equal(powderMax.available, false);
  assert.deepEqual(powderMax.availableFinishesAtHeight, ['chrome', 'stainless']);
});

test('resolveXPoleConfiguration supports standard heights below 2641mm using base PX A-Pole pricing', () => {
  const short8ft = resolveXPoleConfiguration(2438, 'chrome', 'retail');
  assert.equal(short8ft.available, true);
  assert.equal(short8ft.belowCatalogMin, true);
  assert.equal(short8ft.part.id, 'only A pole');
  assert.equal(short8ft.unitPriceUsd, 749.95);
});

test('generateXPoleQuote sums multi-pole quotes across tiers and exports clean CSV', () => {
  const poles: PoleInstance[] = [
    {
      id: 'pole-1',
      label: 'Pole 1',
      finish: 'chrome',
      diameterMm: 45,
      heightCm: 274,
      cushionPlacement: 'top',
      isSpinning: true,
      spinRpm: 18,
      x: -1.1,
      z: 0,
    },
    {
      id: 'pole-2',
      label: 'Pole 2',
      finish: 'powder',
      powderTone: 'white',
      diameterMm: 40,
      heightCm: 318,
      cushionPlacement: 'top',
      isSpinning: false,
      spinRpm: 18,
      x: 1.1,
      z: 0,
    },
  ];

  const retailQuote = generateXPoleQuote(poles, {
    priceTier: 'retail',
    ceilingType: 'flat',
    ceilingHeightCm: 318,
    roomWidthM: 5.4,
    roomDepthM: 5.2,
  });
  // Pole 1 (2740mm chrome -> 125 = 782.93) + Pole 2 (3180mm powder -> 500 = 846.93) = 1629.86
  assert.equal(retailQuote.totalUsd, 1629.86);
  assert.equal(retailQuote.allAvailable, true);
  assert.equal(retailQuote.lines[1].finishLabel, 'Powder Coated White');

  const w30Quote = generateXPoleQuote(poles, {
    priceTier: 'wholesale30',
    ceilingType: 'vaulted',
    ceilingHeightCm: 318,
    roomWidthM: 5.4,
    roomDepthM: 5.2,
  });
  // 536.86 + 581.66 = 1118.52
  assert.equal(w30Quote.totalUsd, 1118.52);
  assert.equal(w30Quote.savingsUsd, Number((1629.86 - 1118.52).toFixed(2)));

  const csv = exportXPoleQuoteToCSV(w30Quote);
  assert.ok(csv.includes('Auto-Selected PX Part/Ext'));
  assert.ok(csv.includes('"125"'));
  assert.ok(csv.includes('"500"'));
  assert.ok(csv.includes('"1118.52"'));
});

test('imperial/metric height helpers round-trip cleanly', () => {
  const fi = cmToFeetAndInches(274);
  assert.equal(fi.feet, 9);
  assert.equal(fi.inches, 0);
  assert.equal(feetAndInchesToCm(9, 0), 274);
  assert.equal(formatUsdExact(1118.52), '$1,118.52');
});
