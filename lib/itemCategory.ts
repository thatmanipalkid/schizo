import type { ItemCategory } from "./types";

export const ITEM_CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "non-veg", label: "Non-veg" },
  { value: "drink", label: "Drinks" },
  { value: "other", label: "Other / not sure" },
];

export const ITEM_CATEGORY_STYLES: Record<ItemCategory, string> = {
  veg: "border-[#D8EBDD] bg-[#F1F8F1]",
  "non-veg": "border-[#F0DDDA] bg-[#FCF2F0]",
  drink: "border-line bg-white",
  other: "border-line bg-white",
};

// Plurals (s / es) are handled by the matcher, so list singulars only.
const NON_VEG_KEYWORDS = [
  "chicken", "murgh", "mutton", "gosht", "lamb", "goat", "beef", "pork", "meat",
  "keema", "kheema", "mince", "ribs", "steak", "wing", "drumstick", "nihari", "haleem",
  "bacon", "ham", "salami", "sausage", "pepperoni", "duck", "turkey",
  "fish", "prawn", "shrimp", "crab", "lobster", "squid", "calamari", "octopus",
  "seafood", "tuna", "salmon", "anchovy", "sardine", "pomfret", "surmai", "rohu",
  "hilsa", "bhetki", "basa", "mussel", "clam", "oyster", "scallop", "roe",
  "egg", "omelette", "omelet", "bhurji",
];

const DRINK_KEYWORDS = [
  "water", "juice", "soda", "cola", "coke", "pepsi", "sprite", "fanta", "limca",
  "thums up", "mirinda", "lemonade", "nimbu pani", "shikanji", "jaljeera", "buttermilk",
  "chaas", "lassi", "tea", "coffee", "chai", "latte", "cappuccino", "espresso",
  "milkshake", "shake", "smoothie", "frappe", "mocktail", "cocktail", "mojito",
  "beer", "wine", "whisky", "whiskey", "vodka", "rum", "gin", "tequila", "breezer",
  "drink", "beverage",
];

const VEG_KEYWORDS = [
  "paneer", "aloo", "potato", "vegetable", "veggie", "veg", "vegan", "vegetarian",
  "gobi", "cauliflower", "matar", "pea", "dal", "lentil", "chana", "chole", "chickpea",
  "rajma", "tofu", "mushroom", "palak", "spinach", "cheese", "corn", "makki", "bhindi",
  "okra", "baingan", "brinjal", "soya", "soybean", "kofta", "raita", "curd", "dahi",
  "salad", "papad", "papadum", "fries", "margherita", "samosa", "dhokla", "khichdi",
  "idli", "dosa", "uttapam", "vada", "upma", "poha", "sambar", "rasam", "pav bhaji",
  "naan", "roti", "chapati", "paratha", "kulcha", "puri", "bhature",
  "gulab jamun", "jalebi", "halwa", "kheer",
];

function buildMatcher(keywords: string[]) {
  const alternation = keywords
    .map((k) => k.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .join("|");
  return new RegExp(`(?:^|[^a-z])(?:${alternation})(?:e?s)?(?![a-z])`);
}

const NON_VEG_EXPLICIT = /\bnon[\s-]?veg(?:etarian)?\b/;
const NON_VEG_MATCHER = buildMatcher(NON_VEG_KEYWORDS);
const DRINK_MATCHER = buildMatcher(DRINK_KEYWORDS);
const VEG_MATCHER = buildMatcher(VEG_KEYWORDS);

export function classifyItem(name: string): ItemCategory {
  const n = name.toLowerCase();
  if (NON_VEG_EXPLICIT.test(n) || NON_VEG_MATCHER.test(n)) return "non-veg";
  if (DRINK_MATCHER.test(n)) return "drink";
  if (VEG_MATCHER.test(n)) return "veg";
  return "other";
}

const ITEM_CATEGORY_ORDER: Record<ItemCategory, number> = {
  veg: 0,
  "non-veg": 1,
  drink: 2,
  other: 3,
};

export function sortItemsByCategory<T extends { category: ItemCategory }>(
  items: T[]
) {
  return [...items].sort(
    (first, second) =>
      ITEM_CATEGORY_ORDER[first.category] - ITEM_CATEGORY_ORDER[second.category]
  );
}

export function isItemCategory(value: unknown): value is ItemCategory {
  return value === "veg" || value === "non-veg" || value === "drink" || value === "other";
}