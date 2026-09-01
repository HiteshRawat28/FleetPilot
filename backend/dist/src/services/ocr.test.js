"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ocr_1 = require("./ocr");
(0, vitest_1.describe)('parseReceiptText', () => {
    (0, vitest_1.it)('extracts a toll receipt total, date, and category', () => {
        const result = (0, ocr_1.parseReceiptText)('FASTAG TOLL PLAZA\nDATE 31/08/2026\nTOTAL AMOUNT RS 475.50', 91.4);
        (0, vitest_1.expect)(result.amount).toBe(475.5);
        (0, vitest_1.expect)(result.expenseType).toBe('TOLL');
        (0, vitest_1.expect)(result.date).toBe('2026-08-31T00:00:00.000Z');
        (0, vitest_1.expect)(result.confidence).toBe(91);
    });
    (0, vitest_1.it)('classifies workshop bills as repair expenses', () => {
        const result = (0, ocr_1.parseReceiptText)('HIGHWAY WORKSHOP\nSPARE PARTS\nNET TOTAL 3200', 77);
        (0, vitest_1.expect)(result.amount).toBe(3200);
        (0, vitest_1.expect)(result.expenseType).toBe('REPAIR');
    });
});
