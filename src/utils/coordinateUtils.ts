export const GMS_PLACEHOLDER = '00°00\'00,00"';

const GMS_DELIMITERS = new Set(['°', 'º', "'", '’', '′', ',', '"', '”', '¨', 'S', 'O', 'W', 'N', 'E', 's', 'o', 'w', 'n', 'e']);

const FULL_GMS_REGEX =
  /^[-+]?\s*(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['’′"]\s*(\d{1,2})(?:\s*[,.]\s*(\d+))?\s*(?:["”¨'′]{0,2})\s*([NSOWE])?$/i;

const PARSE_GMS_REGEX =
  /^([-+])?\s*(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['’′"]\s*(\d{1,2})(?:\s*[,.]\s*(\d+))?\s*(?:["”¨'′]{0,2})\s*([NSOWE])?$/i;

export function decimalToGms(val: number): string {
  if (!Number.isFinite(val)) return '';
  const absolute = Math.abs(val);
  let degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  let minutes = Math.floor(minutesFloat);
  const secondsFloat = (minutesFloat - minutes) * 60;
  let seconds = Math.floor(secondsFloat);
  let hundredths = Math.round((secondsFloat - seconds) * 100);

  if (hundredths >= 100) {
    hundredths = 0;
    seconds += 1;
  }
  if (seconds >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }

  const d = String(degrees).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  const h = String(hundredths).padStart(2, '0');

  return `${d}°${m}'${s},${h}"`;
}

export function formatDigitsAsGms(digitsInput: string): string {
  const digits = (digitsInput || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';
  let formatted = digits.slice(0, 2);
  if (digits.length > 2) formatted += '°' + digits.slice(2, 4);
  if (digits.length > 4) formatted += "'" + digits.slice(4, 6);
  if (digits.length > 6) formatted += ',' + digits.slice(6, 8);
  if (digits.length === 8) formatted += '"';
  return formatted;
}

function parseStrictDecimalCoordinate(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^[-+]?\d+(?:[.,]\d+)?$/.test(trimmed)) {
      return NaN;
    }
    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

export function normalizeCoordinateToGMS(
  value: unknown,
  decimalFallback?: number | string | null
): string {
  const parsedFallback = parseStrictDecimalCoordinate(decimalFallback);

  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value) <= 180
      ? decimalToGms(value)
      : '';
  }

  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) {
    return Number.isFinite(parsedFallback) && Math.abs(parsedFallback) <= 180
      ? decimalToGms(parsedFallback)
      : '';
  }

  const gmsMatch = str.match(FULL_GMS_REGEX);
  if (gmsMatch) {
    const degNum = parseInt(gmsMatch[1], 10);
    const minNum = parseInt(gmsMatch[2], 10);
    const secNum = parseInt(gmsMatch[3], 10);
    const hunRaw = (gmsMatch[4] || '00').slice(0, 2).padEnd(2, '0');
    const hunNum = parseInt(hunRaw, 10);

    if (
      degNum > 180 ||
      minNum >= 60 ||
      secNum >= 60 ||
      (degNum === 180 && (minNum > 0 || secNum > 0 || hunNum > 0))
    ) {
      return '';
    }

    const d = gmsMatch[1].padStart(2, '0');
    const m = gmsMatch[2].padStart(2, '0');
    const s = gmsMatch[3].padStart(2, '0');
    return `${d}°${m}'${s},${hunRaw}"`;
  }

  if (!str.includes('°') && !str.includes('º')) {
    if (/^[-+]?\s*\d{1,3}(?:[.,]\d+)?\s*[NSOWE]?$/i.test(str)) {
      const cleanNum = str.replace(/[NSOWE\s]/gi, '').replace(',', '.');
      const num = Number(cleanNum);
      const hasDecimalOrSign =
        str.includes('.') ||
        str.includes(',') ||
        str.startsWith('-') ||
        str.startsWith('+') ||
        cleanNum.length <= 3;

      if (hasDecimalOrSign && Number.isFinite(num) && Math.abs(num) <= 180) {
        return decimalToGms(num);
      }
    }
  }

  return '';
}

export function formatGmsInput(nextValue: string, prevValue = ''): string {
  if (!nextValue) return '';

  if (prevValue && nextValue.length === prevValue.length - 1) {
    let diffIdx = 0;
    while (diffIdx < nextValue.length && nextValue[diffIdx] === prevValue[diffIdx]) {
      diffIdx++;
    }
    if (
      prevValue.slice(diffIdx + 1) === nextValue.slice(diffIdx) &&
      GMS_DELIMITERS.has(prevValue[diffIdx])
    ) {
      const beforeDigits = prevValue.slice(0, diffIdx).replace(/\D/g, '');
      const afterDigits = prevValue.slice(diffIdx + 1).replace(/\D/g, '');
      if (beforeDigits.length > 0) {
        return formatDigitsAsGms(beforeDigits.slice(0, -1) + afterDigits);
      }
    }
  }

  if (nextValue.includes('°') || nextValue.includes('º')) {
    if (FULL_GMS_REGEX.test(nextValue.trim())) {
      return normalizeCoordinateToGMS(nextValue);
    }
    return formatDigitsAsGms(nextValue);
  }

  const trimmed = nextValue.trim();
  const isPaste = Math.abs(nextValue.length - prevValue.length) > 1;

  if (
    /^\s*[-+]?\d{1,3}[.,]\d{3,}\s*$/.test(trimmed) ||
    (isPaste && /^\s*[-+]?\d{1,3}[.,]\d+\s*$/.test(trimmed))
  ) {
    const num = parseFloat(trimmed.replace(',', '.'));
    if (Number.isFinite(num) && Math.abs(num) <= 180) {
      return decimalToGms(num);
    }
  }

  if (
    /^\s*[-+]\d{0,3}([.,]\d{0,2})?\s*$/.test(nextValue) ||
    /^\s*\d{1,3}\.\d{0,2}\s*$/.test(nextValue)
  ) {
    return nextValue;
  }

  return formatDigitsAsGms(nextValue);
}

export function parseGMSToDecimal(
  gms: string | number | null | undefined,
  assumeNegativeIfUnsigned = true
): number {
  if (typeof gms === 'number') {
    return Number.isFinite(gms) ? gms : NaN;
  }
  const str = (gms || '').trim();
  if (!str) return NaN;

  const match = str.match(PARSE_GMS_REGEX);
  if (match) {
    const degrees = parseInt(match[2], 10);
    const minutes = parseInt(match[3], 10);
    const seconds = parseFloat(`${match[4]}.${match[5] || '0'}`);
    const decimal = degrees + minutes / 60 + seconds / 3600;
    const signPrefix = match[1];
    const hemisphere = (match[6] || '').toUpperCase();

    if (signPrefix === '-' || hemisphere === 'S' || hemisphere === 'O' || hemisphere === 'W') {
      return -decimal;
    }
    if (signPrefix === '+' || hemisphere === 'N' || hemisphere === 'E') {
      return decimal;
    }
    return assumeNegativeIfUnsigned ? -decimal : decimal;
  }

  const val = parseFloat(str.replace(',', '.'));
  if (Number.isNaN(val)) return NaN;
  return val;
}
