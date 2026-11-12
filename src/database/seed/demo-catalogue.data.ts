/**
 * ⚠️ FICTIONAL DEMO DATA — DEVELOPMENT ONLY.
 *
 * Brands, models, prices, warranties and dimensions below are invented and are
 * copied from the frontend's preview mocks (volten/src/mocks). None of it
 * describes a real manufacturer or product. The seed refuses to run when
 * NODE_ENV=production.
 */

export interface DemoBrand {
  name: string;
  description: string;
}

export interface DemoCategory {
  slug: string;
  name: string;
  description: string;
  visual: string;
  parentSlug?: string;
  sortOrder: number;
}

export type DemoStock = 'in-stock' | 'low-stock' | 'out-of-stock' | 'preorder';

export interface DemoProduct {
  slug: string;
  kind: 'battery' | 'inverter' | 'combo';
  brand: string;
  modelNumber: string;
  name: string;
  tagline?: string;
  category: string;
  technology?: string;
  capacityAh?: number;
  ratingVa?: number;
  warrantyMonths?: number;
  dimensionsMm?: { length: number; width: number; height: number };
  weightKg?: number;
  /** Current price in rupees (sale price when compareAt is set). */
  priceRupees: number;
  /** List price in rupees, when the product is on sale. */
  compareAtRupees?: number;
  stock: DemoStock;
  featured?: boolean;
  bestSeller?: boolean;
}

export const DEMO_BRANDS: DemoBrand[] = [
  { name: 'Northwatt', description: 'Fictional demo manufacturer.' },
  { name: 'Arcline', description: 'Fictional demo manufacturer.' },
  { name: 'Sunvale', description: 'Fictional demo manufacturer.' },
  { name: 'Helio Grid', description: 'Fictional demo manufacturer.' },
];

export const DEMO_CATEGORIES: DemoCategory[] = [
  { slug: 'batteries', name: 'Inverter batteries', description: 'Tall tubular, short tubular and flat plate.', visual: 'tall-tubular', sortOrder: 1 },
  { slug: 'inverters', name: 'Inverters', description: 'Pure sine wave, from 700 to 3500 VA.', visual: 'inverter', sortOrder: 2 },
  { slug: 'combos', name: 'Combos', description: 'Matched inverter and battery pairs.', visual: 'combo', sortOrder: 3 },
  { slug: 'lithium', name: 'Lithium', description: 'Compact, fast-charging, no topping-up.', visual: 'lithium-ion', sortOrder: 4 },
  { slug: 'tall-tubular', name: 'Tall tubular', description: 'Long-life tubular batteries.', visual: 'tall-tubular', parentSlug: 'batteries', sortOrder: 1 },
  { slug: 'short-tubular', name: 'Short tubular', description: 'Low-profile tubular batteries.', visual: 'short-tubular', parentSlug: 'batteries', sortOrder: 2 },
  { slug: 'flat-plate', name: 'Flat plate', description: 'Value flat plate batteries.', visual: 'flat-plate', parentSlug: 'batteries', sortOrder: 3 },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: 'demo-northwatt-tt-150',
    kind: 'battery',
    brand: 'Northwatt',
    modelNumber: 'NW-TT150',
    name: 'TT 150 Tall Tubular',
    tagline: 'Long backup for frequent power cuts',
    category: 'tall-tubular',
    technology: 'tall-tubular',
    capacityAh: 150,
    warrantyMonths: 60,
    dimensionsMm: { length: 510, width: 190, height: 265 },
    weightKg: 41,
    priceRupees: 14490,
    compareAtRupees: 17200,
    stock: 'in-stock',
    featured: true,
    bestSeller: true,
  },
  {
    slug: 'demo-northwatt-tt-200',
    kind: 'battery',
    brand: 'Northwatt',
    modelNumber: 'NW-TT200',
    name: 'TT 200 Tall Tubular',
    tagline: 'For larger homes and heavier loads',
    category: 'tall-tubular',
    technology: 'tall-tubular',
    capacityAh: 200,
    warrantyMonths: 72,
    dimensionsMm: { length: 520, width: 210, height: 280 },
    weightKg: 52,
    priceRupees: 18990,
    compareAtRupees: 21500,
    stock: 'low-stock',
    featured: true,
  },
  {
    slug: 'demo-northwatt-li-100',
    kind: 'battery',
    brand: 'Northwatt',
    modelNumber: 'NW-LI100',
    name: 'Li 100 Lithium Home',
    tagline: 'Compact, fast-charging, zero topping-up',
    category: 'lithium',
    technology: 'lithium-ion',
    capacityAh: 100,
    warrantyMonths: 84,
    dimensionsMm: { length: 440, width: 180, height: 230 },
    weightKg: 12,
    priceRupees: 38900,
    stock: 'in-stock',
    featured: true,
  },
  {
    slug: 'demo-arcline-sw-1100',
    kind: 'inverter',
    brand: 'Arcline',
    modelNumber: 'AL-SW1100',
    name: 'Sine 1100 Inverter',
    tagline: 'Pure sine wave for sensitive electronics',
    category: 'inverters',
    ratingVa: 1100,
    warrantyMonths: 24,
    dimensionsMm: { length: 380, width: 220, height: 150 },
    weightKg: 6.5,
    priceRupees: 7290,
    compareAtRupees: 8600,
    stock: 'in-stock',
    featured: true,
    bestSeller: true,
  },
  {
    slug: 'demo-sunvale-st-120',
    kind: 'battery',
    brand: 'Sunvale',
    modelNumber: 'SV-ST120',
    name: 'ST 120 Short Tubular',
    tagline: 'Fits tight spaces under stairs',
    category: 'short-tubular',
    technology: 'short-tubular',
    capacityAh: 120,
    warrantyMonths: 48,
    dimensionsMm: { length: 410, width: 175, height: 235 },
    weightKg: 38,
    priceRupees: 11250,
    compareAtRupees: 12400,
    stock: 'in-stock',
    bestSeller: true,
  },
  {
    slug: 'demo-helio-home-combo-1100-150',
    kind: 'combo',
    brand: 'Helio Grid',
    modelNumber: 'HG-C1100T150',
    name: 'Home Combo 1100 + TT 150',
    tagline: 'Inverter, battery and trolley in one order',
    category: 'combos',
    technology: 'tall-tubular',
    capacityAh: 150,
    ratingVa: 1100,
    warrantyMonths: 60,
    dimensionsMm: { length: 520, width: 300, height: 420 },
    weightKg: 48,
    priceRupees: 20990,
    compareAtRupees: 25800,
    stock: 'in-stock',
    bestSeller: true,
  },
  {
    slug: 'demo-sunvale-fp-100',
    kind: 'battery',
    brand: 'Sunvale',
    modelNumber: 'SV-FP100',
    name: 'FP 100 Flat Plate',
    tagline: 'Value backup for occasional outages',
    category: 'flat-plate',
    technology: 'flat-plate',
    capacityAh: 100,
    warrantyMonths: 36,
    dimensionsMm: { length: 330, width: 172, height: 215 },
    weightKg: 30,
    priceRupees: 8490,
    stock: 'out-of-stock',
    bestSeller: true,
  },
  {
    slug: 'demo-arcline-sw-2500',
    kind: 'inverter',
    brand: 'Arcline',
    modelNumber: 'AL-SW2500',
    name: 'Sine 2500 Heavy Duty',
    tagline: 'Runs two batteries for whole-home backup',
    category: 'inverters',
    ratingVa: 2500,
    warrantyMonths: 36,
    dimensionsMm: { length: 460, width: 250, height: 190 },
    weightKg: 14,
    priceRupees: 15990,
    compareAtRupees: 17900,
    stock: 'in-stock',
    bestSeller: true,
  },
  {
    slug: 'demo-helio-tt-150-eco',
    kind: 'battery',
    brand: 'Helio Grid',
    modelNumber: 'HG-TT150E',
    name: 'TT 150 Tall Tubular Eco',
    tagline: 'Economy tall tubular with a shorter warranty',
    category: 'tall-tubular',
    technology: 'tall-tubular',
    capacityAh: 150,
    warrantyMonths: 48,
    dimensionsMm: { length: 510, width: 190, height: 262 },
    weightKg: 40,
    priceRupees: 13490,
    compareAtRupees: 15000,
    stock: 'in-stock',
  },
  {
    slug: 'demo-helio-li-50',
    kind: 'battery',
    brand: 'Helio Grid',
    modelNumber: 'HG-LI50',
    name: 'Li 50 Lithium Compact',
    tagline: 'Light enough to mount on a wall',
    category: 'lithium',
    technology: 'lithium-ion',
    capacityAh: 50,
    warrantyMonths: 60,
    dimensionsMm: { length: 340, width: 160, height: 190 },
    weightKg: 7,
    priceRupees: 21990,
    stock: 'preorder',
  },
  {
    slug: 'demo-arcline-sw-700',
    kind: 'inverter',
    brand: 'Arcline',
    modelNumber: 'AL-SW700',
    name: 'Sine 700 Compact',
    tagline: 'Small home backup for lights and fans',
    category: 'inverters',
    ratingVa: 700,
    warrantyMonths: 12,
    dimensionsMm: { length: 330, width: 200, height: 130 },
    weightKg: 4,
    priceRupees: 4590,
    stock: 'low-stock',
  },
];

/** Combo composition: combo slug → component slug and quantity. */
export const DEMO_COMBO_ITEMS: { combo: string; component: string; quantity: number }[] = [
  { combo: 'demo-helio-home-combo-1100-150', component: 'demo-arcline-sw-1100', quantity: 1 },
  { combo: 'demo-helio-home-combo-1100-150', component: 'demo-northwatt-tt-150', quantity: 1 },
];

/** Stock quantities for each stock state, so the demo catalogue shows every availability state. */
export const DEMO_STOCK_QUANTITY: Record<DemoStock, number> = {
  'in-stock': 40,
  'low-stock': 3,
  'out-of-stock': 0,
  preorder: 0,
};

export const DEMO_TESTIMONIALS: { author: string; location: string; rating: number; body: string; productSlug: string }[] = [
  {
    author: 'Sample reviewer A',
    location: 'Hyderabad',
    rating: 5,
    body: 'Placeholder review text about installation day: the technician arrived on time, explained the setup and took the old battery away.',
    productSlug: 'demo-northwatt-tt-150',
  },
  {
    author: 'Sample reviewer B',
    location: 'Pune',
    rating: 5,
    body: 'Placeholder review text about backup during an evening outage, with the fridge and fans running.',
    productSlug: 'demo-helio-home-combo-1100-150',
  },
  {
    author: 'Sample reviewer C',
    location: 'Vijayawada',
    rating: 4,
    body: 'Placeholder review text about using the battery finder to pick a capacity and comparing two models before ordering.',
    productSlug: 'demo-northwatt-li-100',
  },
];
