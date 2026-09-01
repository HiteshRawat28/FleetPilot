"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const chat_1 = require("./chat");
(0, vitest_1.describe)('FleetPilot Copilot role tools', () => {
    (0, vitest_1.it)('gives owners the full read-only tool set', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.OWNER)).toHaveLength(8);
    });
    (0, vitest_1.it)('limits dispatchers to operational and assignment data', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.DISPATCHER)).toEqual([
            'get_fleet_summary', 'search_vehicles', 'search_drivers', 'search_trips', 'get_analytics', 'check_assignment'
        ]);
    });
    (0, vitest_1.it)('does not expose finance or trip tools to safety officers', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.SAFETY_OFFICER)).toEqual([
            'get_fleet_summary', 'search_drivers', 'get_analytics'
        ]);
    });
    (0, vitest_1.it)('limits financial analysts to summary, finance, and approved analytics', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.FINANCIAL_ANALYST)).toEqual([
            'get_fleet_summary', 'get_finance_summary', 'get_analytics'
        ]);
    });
});
