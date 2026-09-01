"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const chat_1 = require("./chat");
(0, vitest_1.describe)('FleetPilot Copilot role tools', () => {
    (0, vitest_1.it)('gives organization owners and administrators the guarded trip creation tool', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.OWNER)).toContain('prepare_draft_trip');
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.ADMIN)).toContain('prepare_draft_trip');
        for (const role of [client_1.Role.FLEET_MANAGER, client_1.Role.DISPATCHER, client_1.Role.SAFETY_OFFICER, client_1.Role.FINANCIAL_ANALYST])
            (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(role)).not.toContain('prepare_draft_trip');
    });
    (0, vitest_1.it)('limits dispatchers to operational and assignment data', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.DISPATCHER)).toEqual([
            'get_fleet_summary', 'search_vehicles', 'search_drivers', 'search_trips', 'check_assignment', 'recommend_assignment', 'guide_trip_assignment'
        ]);
    });
    (0, vitest_1.it)('does not expose finance or trip tools to safety officers', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.SAFETY_OFFICER)).toEqual([
            'get_fleet_summary', 'search_drivers'
        ]);
    });
    (0, vitest_1.it)('limits financial analysts to summary, finance, and approved analytics', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.FINANCIAL_ANALYST)).toEqual([
            'get_fleet_summary', 'get_finance_summary', 'get_analytics', 'get_weekly_operations_report', 'get_utilization_diagnostics', 'prepare_fuel_entry'
        ]);
    });
    (0, vitest_1.it)('keeps guided form preparation aligned with the existing module permissions', () => {
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.FLEET_MANAGER)).toEqual(vitest_1.expect.arrayContaining(['guide_trip_assignment', 'prepare_maintenance', 'prepare_fuel_entry']));
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.DISPATCHER)).not.toContain('prepare_maintenance');
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.DISPATCHER)).not.toContain('prepare_fuel_entry');
        (0, vitest_1.expect)((0, chat_1.toolNamesForRole)(client_1.Role.SAFETY_OFFICER)).not.toContain('prepare_fuel_entry');
    });
});
(0, vitest_1.describe)('Groq response text extraction', () => {
    (0, vitest_1.it)('uses the aggregate output_text field when present', () => {
        (0, vitest_1.expect)((0, chat_1.extractResponseText)({ output_text: ' Fleet status is ready. ' })).toBe('Fleet status is ready.');
    });
    (0, vitest_1.it)('reads output_text content from raw Responses API message items', () => {
        (0, vitest_1.expect)((0, chat_1.extractResponseText)({ output: [
                { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Internal reasoning must stay hidden.' }] },
                { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'No active trips today.' }] }
            ] })).toBe('No active trips today.');
    });
});
(0, vitest_1.describe)('Deterministic guided workflow routing', () => {
    (0, vitest_1.it)('routes every supported workflow without depending on model intent selection', () => {
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Help me assign this unassigned trip')?.name).toBe('guide_trip_assignment');
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Find a replacement driver for trip TRP0008')).toMatchObject({ name: 'guide_trip_assignment', args: { tripQuery: 'TRP0008' } });
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Which vehicle can safely carry 4,000 kg?')).toMatchObject({ name: 'recommend_assignment', args: { cargoWeightKg: 4000 } });
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Prepare maintenance for vehicles due for service')?.name).toBe('prepare_maintenance');
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Show licence renewals required this month')?.name).toBe('search_drivers');
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Build a weekly operations report')?.name).toBe('get_weekly_operations_report');
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Explain why fleet utilization decreased')?.name).toBe('get_utilization_diagnostics');
        (0, vitest_1.expect)((0, chat_1.guidedWorkflowForMessage)('Prepare a fuel entry for vehicle Truck A with 50 L and cost ₹5,000')).toMatchObject({ name: 'prepare_fuel_entry', args: { vehicleQuery: 'Truck A', liters: 50, cost: 5000 } });
    });
});
(0, vitest_1.describe)('Groq error sanitization', () => {
    (0, vitest_1.it)('returns a retryable message without provider account details for rate limits', () => {
        const error = (0, chat_1.groqFailure)(429);
        (0, vitest_1.expect)(error.status).toBe(429);
        (0, vitest_1.expect)(error.message).toBe('Copilot is temporarily rate-limited by the AI provider. Wait a few seconds and try again.');
    });
    (0, vitest_1.it)('turns authentication failures into a configuration error', () => {
        const error = (0, chat_1.groqFailure)(401);
        (0, vitest_1.expect)(error.status).toBe(503);
        (0, vitest_1.expect)(error.message).toContain('backend API key');
    });
});
(0, vitest_1.describe)('Copilot action-claim validation', () => {
    (0, vitest_1.it)('replaces a model-invented confirmation button for administrators', () => {
        (0, vitest_1.expect)((0, chat_1.validateActionClaim)('Please click **[Confirm & Create Draft Trip]** below.', client_1.Role.ADMIN)).toContain('No secure trip proposal');
    });
    (0, vitest_1.it)('does not alter ordinary answers or responses backed by a signed action', () => {
        (0, vitest_1.expect)((0, chat_1.validateActionClaim)('The truck is available.', client_1.Role.ADMIN)).toBe('The truck is available.');
        (0, vitest_1.expect)((0, chat_1.validateActionClaim)('Click the confirmation button.', client_1.Role.ADMIN, [{}])).toBe('Click the confirmation button.');
    });
});
