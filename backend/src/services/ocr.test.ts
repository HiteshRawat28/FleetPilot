import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './ocr';

describe('parseReceiptText', () => {
  it('extracts a toll receipt total, date, and category', () => {
    const result = parseReceiptText(
      'FASTAG TOLL PLAZA\nDATE 31/08/2026\nTOTAL AMOUNT RS 475.50',
      91.4,
    );

    expect(result.amount).toBe(475.5);
    expect(result.expenseType).toBe('TOLL');
    expect(result.date).toBe('2026-08-31T00:00:00.000Z');
    expect(result.confidence).toBe(91);
  });

  it('classifies workshop bills as repair expenses', () => {
    const result = parseReceiptText(
      'HIGHWAY WORKSHOP\nSPARE PARTS\nNET TOTAL 3200',
      77,
    );

    expect(result.amount).toBe(3200);
    expect(result.expenseType).toBe('REPAIR');
  });
});
