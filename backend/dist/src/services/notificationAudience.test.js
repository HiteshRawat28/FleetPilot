"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const notificationAudience_1 = require("./notificationAudience");
(0, vitest_1.describe)('trip notification audience', () => {
    (0, vitest_1.it)('notifies every non-driver access role', () => {
        for (const role of [client_1.Role.OWNER, client_1.Role.ADMIN, client_1.Role.FLEET_MANAGER, client_1.Role.DISPATCHER, client_1.Role.SAFETY_OFFICER, client_1.Role.FINANCIAL_ANALYST]) {
            (0, vitest_1.expect)((0, notificationAudience_1.receivesTripNotification)(role, null, 'driver-1')).toBe(true);
        }
    });
    (0, vitest_1.it)('only notifies the assigned driver', () => {
        (0, vitest_1.expect)((0, notificationAudience_1.receivesTripNotification)(client_1.Role.DRIVER, 'driver-1', 'driver-1')).toBe(true);
        (0, vitest_1.expect)((0, notificationAudience_1.receivesTripNotification)(client_1.Role.DRIVER, 'driver-2', 'driver-1')).toBe(false);
        (0, vitest_1.expect)((0, notificationAudience_1.receivesTripNotification)(client_1.Role.DRIVER, 'driver-1', null)).toBe(false);
    });
});
