-- Development/demo seed outline for TransitOps.
-- Schema statements belong in migrations, not this file.
-- No login credentials or production data belong here.
-- P1-C1 should add local login-capable users through the approved Auth seeding
-- workflow, then insert matching public.profiles rows for all four roles.

insert into public.vehicles (
  id,
  registration_number,
  name_model,
  type,
  max_load_kg,
  odometer_km,
  acquisition_cost,
  region,
  status
)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'Van-05',
    'Tata Ace',
    'Van',
    500,
    10120,
    800000,
    'North',
    'available'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'Truck-11',
    'Ashok Leyland 1920',
    'Truck',
    12000,
    88000,
    3200000,
    'West',
    'in_shop'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'Van-01',
    'Mahindra Supro',
    'Van',
    750,
    142000,
    650000,
    'South',
    'retired'
  );

insert into public.drivers (
  id,
  name,
  license_number,
  license_category,
  license_expiry_date,
  contact_number,
  safety_score,
  status
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Alex',
    'DL-ALEX-001',
    'LMV',
    '2027-12-31',
    '+91-9000000001',
    94,
    'available'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Sam',
    'DL-SAM-002',
    'HMV',
    '2025-12-31',
    '+91-9000000002',
    86,
    'available'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'Priya',
    'DL-PRIYA-003',
    'LMV',
    '2028-06-30',
    '+91-9000000003',
    62,
    'suspended'
  );

insert into public.trips (
  id,
  source,
  destination,
  vehicle_id,
  driver_id,
  cargo_weight_kg,
  planned_distance_km,
  start_odometer_km,
  final_odometer_km,
  actual_distance_km,
  revenue,
  status,
  dispatched_at,
  completed_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'Gurugram',
    'Delhi',
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    300,
    120,
    10000,
    10120,
    120,
    30000,
    'completed',
    '2026-08-29T04:00:00Z',
    '2026-08-29T08:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Delhi',
    'Noida',
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    450,
    45,
    null,
    null,
    null,
    8000,
    'draft',
    null,
    null
  );

insert into public.maintenance_logs (
  id,
  vehicle_id,
  maintenance_type,
  description,
  status,
  opened_at,
  closed_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Oil Change',
    'Completed routine oil and filter change.',
    'closed',
    '2026-08-20T04:00:00Z',
    '2026-08-20T06:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'Brake Inspection',
    'Active maintenance used to verify dispatch exclusion.',
    'active',
    '2026-08-30T04:00:00Z',
    null
  );

insert into public.fuel_logs (
  id,
  vehicle_id,
  trip_id,
  liters,
  cost,
  logged_date
)
values (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  15,
  1500,
  '2026-08-29'
);

insert into public.expenses (
  id,
  vehicle_id,
  maintenance_log_id,
  category,
  amount,
  expense_date,
  description
)
values (
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'maintenance',
  900,
  '2026-08-20',
  'Oil and filter service.'
);
