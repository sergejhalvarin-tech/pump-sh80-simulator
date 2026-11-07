// The equipment chosen for the hangar and what follows from it: the line's balance, the power, the bund round the base
// oil tanks and the fire load that settles the fire hazard category. Typical specifications of each kind of machine,
// not a particular maker's; the brands are picked at purchase.

export const OILQ = {rho: 0.885, heat: 43}; // t/m³; lower heat of combustion of mineral oil, MJ/kg (СП 12.13130 tables)

export const EQUIP = [
  // zone, name, count, key data, kW each
  {zone: 'raw', name: 'Резервуар базового масла вертикальный, сталь', n: 4, spec: 'Ø2,2 × 3,2 м, 12 м³, электроподогрев днища', kw: 3, oil: 12},
  {zone: 'raw', name: 'Насосный агрегат приёмки Ш80-2,5 с фильтром', n: 1, spec: '37,5 м³/ч, АИР160S6 через ПЧ (тот же, что на налив)', kw: 11},
  {zone: 'raw', name: 'Поддон-ловушка с бочками присадок', n: 2, spec: '4 бочки × 200 л, ёмкость поддона 220 л', kw: 0, oil: 1.6},
  {zone: 'mix', name: 'Реактор-смеситель с рубашкой и мешалкой', n: 2, spec: '5 м³, нагрев до +70 °С, рубашка с маслом-теплоносителем', kw: 15 + 4, oil: 5},
  {zone: 'mix', name: 'Дозатор присадок на весах', n: 1, spec: 'ёмкость 200 л, насос-дозатор, точность 0,1 %', kw: 0.75, oil: 0.2},
  {zone: 'mix', name: 'Насос перекачивающий шестерённый + мешочный фильтр', n: 1, spec: '10 м³/ч, фильтр 25 мкм', kw: 4},
  {zone: 'fill', name: 'Расходная ёмкость готового масла', n: 1, spec: '2 м³, с мешалкой', kw: 1.1, oil: 2},
  {zone: 'fill', name: 'Линия розлива полуавтомат: конвейер, дозатор 4 головки, укупорка, этикетировщик', n: 1, spec: 'канистры 1–20 л, до 600 шт/ч (5 л)', kw: 4.5},
  {zone: 'fill', name: 'Пост налива бочек и IBC на весах', n: 1, spec: 'бочки 200 л и IBC 1000 л, 15 бочек/ч', kw: 1.5},
  {zone: 'store', name: 'Стеллажи паллетные, 3 ряда × 3 секции × 4 уровня', n: 1, spec: '108 паллетомест, 1 т на место', kw: 0, oil: 108 * 0.6},
  {zone: 'ship', name: 'Паллетообмотчик с весами', n: 1, spec: 'стретч-плёнка, платформа Ø1,65 м', kw: 1.5},
  {zone: 'ship', name: 'Весы паллетные', n: 1, spec: 'до 2 т', kw: 0.1},
  {zone: 'aisle', name: 'Погрузчик электрический + зарядное устройство', n: 1, spec: '1,6 т, подъём 4,8 м', kw: 3},
  {zone: 'aisle', name: 'Тележка гидравлическая', n: 2, spec: '2,5 т', kw: 0},
  {zone: 'tech', name: 'Компрессор винтовой + ресивер', n: 1, spec: '0,8 м³/мин, 8 бар, ресивер 500 л', kw: 7.5},
  {zone: 'lab', name: 'Лаборатория ОТК: вискозиметр, плотномер, прибор вспышки, вытяжной шкаф', n: 1, spec: 'контроль каждой партии', kw: 3},
];

export const EQ = (() => {
  const kw = EQUIP.reduce((s, e) => s + e.n * e.kw, 0);
  // the line's balance per 8-hour shift
  const mixBatch = 5 * 0.9; // m³ a batch, 90 % fill
  const mixCycle = 3.5; // h: load 0.5, heat to 60–70 °C 1.5, mix with the additives 1, sample and test 0.5
  const mixShift = 2 * Math.floor(7.5 / mixCycle) * mixBatch; // two reactors
  const canRate = 600 * 5 / 1000; // m³/h in 5-l cans
  const drumRate = 15 * 0.2;
  const fillShift = 7 * (0.6 * canRate + 0.4 * drumRate); // 60 % of the volume to cans, 40 % to drums and IBCs
  const shift = Math.min(mixShift, fillShift);
  // the bund round the base oil tanks: the largest tank's volume in the area left between the tanks (+ 10 %)
  const bundArea = 9.2 * 5.3 - 4 * Math.PI * 1.1 * 1.1;
  const bundH = (12 * 1.1) / bundArea;
  // the fire load per zone, СП 12.13130 Б.2: q = G·Q / S, MJ/m², and its category (В1 above 2200, В2 1401–2200, В3
  // 181–1400, В4 1–180)
  const zoneLoad = (zone, area) => {
    const t = EQUIP.filter((e) => e.zone === zone).reduce((s, e) => s + e.n * (e.oil || 0), 0) * OILQ.rho;
    return {t, q: (t * 1000 * OILQ.heat) / area};
  };
  const load = {raw: zoneLoad('raw', 49), mix: zoneLoad('mix', 51), fill: zoneLoad('fill', 41), store: zoneLoad('store', 75)};
  const cat = (q) => (q > 2200 ? 'В1' : q > 1400 ? 'В2' : q > 180 ? 'В3' : 'В4');
  return {kw, mixBatch, mixCycle, mixShift, canRate, drumRate, fillShift, shift, month: shift * 22, bundArea, bundH, load, cat};
})();
