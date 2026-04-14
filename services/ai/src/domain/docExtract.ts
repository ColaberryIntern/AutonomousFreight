export interface BolFields {
  bolNumber: string | null;
  date: string | null;
  freightClass: string | null;
}

const BOL_RE = /\b(?:BOL|B\/L)[\s:-]*([A-Z0-9-]{4,20})\b/i;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const FREIGHT_CLASS_RE = /\b(?:freight\s*class|class)[\s:-]+(\d{2,3}(?:\.\d+)?)\b/i;

export function extractBolFields(text: string): BolFields {
  const bolMatch = BOL_RE.exec(text);
  const dateMatch = DATE_RE.exec(text);
  const fcMatch = FREIGHT_CLASS_RE.exec(text);
  return {
    bolNumber: bolMatch?.[1] ?? null,
    date: dateMatch?.[1] ?? null,
    freightClass: fcMatch?.[1] ?? null,
  };
}
