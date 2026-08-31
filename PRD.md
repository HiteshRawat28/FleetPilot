# Product Requirements - TransitOps

## Overview

TransitOps is a responsive, single-organization transport operations platform for managing vehicles, drivers, trips, maintenance, fuel, expenses, and operational reporting. It replaces spreadsheets and manual logbooks with one rule-driven workflow that prevents invalid dispatches and keeps operational status synchronized.

The v1 target is a reliable hackathon demonstration completed by a three-person team in eight hours. Mandatory workflows take priority over visual extras and speculative automation.

## Goals

- Demonstrate the complete vehicle and driver lifecycle from registration through dispatch, completion, maintenance, and reporting.
- Prevent every invalid assignment named in the problem statement through server-side enforcement.
- Give each role a focused, permission-aware view of fleet operations.
- Produce dashboard and report values that can be reconciled against seeded demo data.
- Keep the application usable on mobile, tablet, and desktop widths.

## Non-goals

- GPS tracking, maps, navigation, or route optimization.
- Native mobile applications or offline synchronization.
- Multi-organization tenancy, subscriptions, billing, payroll, invoicing, or payments.
- Telematics, fuel-card, ERP, or third-party logistics integrations.
- Production-scale audit infrastructure, high availability, or advanced identity administration.
- Predictive maintenance, smart dispatch recommendations, email reminders, document storage, PDF export, dark mode, and advanced charts in mandatory v1.

## Target users

### Fleet Manager

- Needs to manage vehicle records, lifecycle state, maintenance, and fleet availability.
- Has broad operational visibility and control over vehicles and maintenance.

### Trip Operator

- Needs to create, dispatch, complete, and cancel trips using eligible vehicles and drivers.
- The source brief labels this user "Driver," although the described duties are dispatcher-like. The UI label remains a decision to confirm; the proposed internal role key is `dispatcher`.

### Safety Officer

- Needs to maintain driver compliance data, licence validity, safety score, and suspension state.

### Financial Analyst

- Needs to record fuel and expenses and review cost, efficiency, utilization, ROI, and CSV reports.

## v1 requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| V1-AUTH-001 | Email/password authentication | Valid users can sign in and out. All application pages and data operations reject unauthenticated access, and invalid credentials do not reveal whether an account exists. |
| V1-AUTH-002 | Role-based access control | Fleet Manager, Trip Operator, Safety Officer, and Financial Analyst permissions are enforced both in visible controls and at the server/database boundary. Direct requests cannot bypass role restrictions. |
| V1-UI-001 | Responsive interface | Login, dashboard, vehicle, driver, trip, maintenance, fuel/expense, and report workflows remain usable at 360 px, 768 px, and 1280 px without page-level horizontal overflow or inaccessible actions. |
| V1-VEH-001 | Vehicle registry CRUD | Authorized users can list, create, view, update, and soft-delete/archive vehicles with registration, model, type, capacity, odometer, acquisition cost, region, and status. Registration is required and unique after normalization. Archiving preserves trip history and removes the vehicle from active lists and dispatch. |
| V1-DRV-001 | Driver management CRUD | Authorized users can list, create, view, update, and soft-delete/archive drivers with name, licence details, expiry, contact, safety score, and status. Allowed statuses are Available, On Trip, Off Duty, and Suspended. Archiving preserves trip history and removes the driver from active lists and dispatch. |
| V1-TRIP-001 | Draft trip creation | A draft can capture source, destination, vehicle, driver, cargo weight, planned distance, and revenue. Selectors expose only currently eligible resources, while submission still performs authoritative validation. |
| V1-TRIP-002 | Validated dispatch | Dispatch rechecks vehicle/driver availability, maintenance/retirement state, licence validity, suspension, duplicate assignment, and capacity. Success atomically changes the trip to Dispatched and both resources to On Trip; failure changes nothing and explains why. |
| V1-TRIP-003 | Trip lifecycle | Draft can become Dispatched or Cancelled. Dispatched can become Completed or Cancelled. Completion records a non-decreasing final odometer and returns both resources to Available. Cancelling a dispatched trip also releases both resources. Terminal trips cannot transition again. |
| V1-MNT-001 | Maintenance workflow | Opening maintenance for an eligible vehicle atomically creates an active log, sets the vehicle to In Shop, and removes it from dispatch. Closing it restores Available unless the vehicle is Retired. On Trip vehicles and duplicate active logs are rejected. |
| V1-COST-001 | Fuel and expense tracking | Authorized users can manage fuel entries with litres, cost, vehicle, optional trip, and date, plus maintenance/toll/other expenses with amount and date. Negative values are rejected, and maintenance cost has one canonical expense record. |
| V1-DASH-001 | Operational dashboard | The dashboard shows Active Vehicles, Available Vehicles, Vehicles in Maintenance, Active Trips, Pending Trips, Drivers On Duty, and Fleet Utilization. Type, status, and region filters update relevant values consistently after state changes. |
| V1-AN-001 | Analytics | Per-vehicle reporting shows fuel efficiency, required operational cost, and ROI using the definitions below. Division-by-zero and missing-data cases display N/A instead of misleading numbers. |
| V1-EXP-001 | CSV export | An authorized user can download the currently filtered report as a valid CSV whose headers and rows match the visible data. |

## Role permission baseline

| Capability | Fleet Manager | Trip Operator | Safety Officer | Financial Analyst |
|---|---:|---:|---:|---:|
| View dashboard and operational records | Yes | Yes | Yes | Yes |
| Manage vehicles and maintenance | Yes | Read | Read | Read |
| Manage driver compliance | Read | Read eligible drivers | Yes | Read |
| Create and transition trips | Read | Yes | Read | Read |
| Record fuel at trip completion | Yes | Yes | Read | Yes |
| Manage expenses and export reports | Read | Read | Read | Yes |

The Fleet Manager may be granted emergency full access for the demo only if that decision is recorded before implementation.

## Mandatory business rules

| ID | Rule |
|---|---|
| BR-001 | Vehicle registration is unique after trimming and case normalization. |
| BR-002 | In Shop and Retired vehicles never appear in dispatch eligibility and never pass dispatch validation. |
| BR-003 | Drivers with expired licences or Suspended status cannot be dispatched. An expiry date equal to the dispatch date is still valid. |
| BR-004 | An On Trip vehicle or driver cannot be assigned to another dispatched trip. |
| BR-005 | Cargo weight cannot exceed the selected vehicle's maximum load. |
| BR-006 | Dispatch updates the trip, vehicle, and driver in one atomic operation. |
| BR-007 | Completion releases both assigned resources and updates the vehicle odometer atomically. |
| BR-008 | Cancelling a dispatched trip releases both assigned resources atomically. |
| BR-009 | Active maintenance sets a vehicle to In Shop and makes it undispatchable. |
| BR-010 | Closing maintenance restores Available unless the vehicle is Retired. |
| BR-011 | Eligibility is rechecked at mutation time; UI filtering is never trusted as enforcement. |
| BR-012 | Final odometer cannot be lower than the trip start or current vehicle odometer. |

## Calculation definitions

- Active Vehicles = all non-archived vehicles except Retired.
- Available Vehicles = vehicles with status Available.
- Vehicles in Maintenance = vehicles with status In Shop.
- Active Trips = trips with status Dispatched.
- Pending Trips = trips with status Draft.
- Drivers On Duty = drivers with status On Trip.
- Fleet Utilization = On Trip vehicles / non-archived, non-Retired vehicles x 100; show N/A when the denominator is zero.
- Fuel Efficiency = completed-trip actual distance / fuel litres linked to completed trips; show N/A when litres are zero.
- Required Operational Cost = fuel cost + Maintenance-category expenses. Toll and Other expenses remain visible separately.
- Vehicle ROI = (completed-trip revenue - fuel cost - maintenance expenses) / acquisition cost; show N/A when acquisition cost is zero.

## Key user flows

1. User signs in -> role and session are verified -> permitted navigation and actions appear.
2. Fleet Manager registers a vehicle -> Safety Officer registers a compliant driver -> both become eligible when Available.
3. Trip Operator creates a draft -> system previews eligibility -> dispatch command revalidates all rules -> trip and resources change together.
4. Trip Operator completes or cancels a dispatched trip -> system atomically releases the vehicle and driver.
5. Fleet Manager opens maintenance -> vehicle becomes In Shop and disappears from dispatch -> closing maintenance restores it unless Retired.
6. Authorized user records fuel and expenses -> dashboard/report values refresh -> Financial Analyst exports the filtered report as CSV.

## Non-functional requirements

- Security: use managed password authentication, least-privilege RBAC, row-level data protection, server-side validation, and no browser exposure of privileged keys.
- Integrity: lifecycle commands must be transactional and safe against concurrent dispatch attempts.
- Accessibility: target WCAG 2.2 AA for keyboard access, focus visibility, semantics, contrast, error association, and status communication.
- Reliability: preserve form values after validation/network errors, prevent duplicate submissions, and provide retryable failure states.
- Performance: the seeded hackathon dataset should render primary pages and KPI feedback without noticeable delay under normal demo connectivity.
- Privacy: store only the operational fields required by v1; never commit credentials or personal secrets.

## Constraints and assumptions

- Constraint: delivery is planned for an eight-hour hackathon by three people.
- Constraint: the repository is greenfield and currently has no verified setup, test, lint, build, or deployment commands.
- Assumption: v1 serves one organization and uses manually entered data.
- Assumption: `region` is added to Vehicle because the dashboard requires a region filter.
- Assumption: `revenue` is added to Trip because the required ROI formula otherwise has no input.
- Assumption: Supabase and Vercel internet access are available; local migrations and seed data remain the fallback.
- Assumption: the architecture stack is proposed and may be changed only during Phase 0 before contracts freeze.
- Assumption: CRUD deletion is implemented as soft archive so historical trips and reports keep valid references.

## Success measures

- The mandatory demo flow completes without manual database repair.
- Every BR rule has a passing automated or documented manual check.
- Seeded KPI, cost, efficiency, ROI, and CSV values reconcile with expected calculations.
- All four roles demonstrate correct allowed and denied actions.
- The integrated production build passes and the core flow works at desktop and mobile widths.

## Later scope

- Explainable smart dispatch recommendations using capacity, eligibility, safety, efficiency, and maintenance risk.
- Proactive licence-expiry and maintenance alerts.
- Vehicle profitability ranking and richer charts.
- Vehicle documents, email reminders, PDF export, dark mode, GPS, maps, and external integrations.

## Open decisions

- Confirm whether the user-facing role should remain Driver or be renamed Dispatcher/Trip Operator - resolve in Phase 0.
- Map the three real team members to Seat A, Seat B, and Seat C in `Team.md` - resolve before any parallel edits.
- Confirm or replace the proposed Next.js/Supabase/Vercel stack - resolve before the Phase 0 contract freeze.
- Decide whether Fleet Manager has full demo access or only the baseline matrix permissions - resolve before RBAC policies are written.
