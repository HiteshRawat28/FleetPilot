import 'package:flutter_test/flutter_test.dart';
import 'package:transi_ops_app/models/models.dart';

void main() {
  test('parses a backend vehicle response', () {
    final vehicle = Vehicle.fromJson({
      'id': 'vehicle-1',
      'registrationNo': 'GJ01AB1234',
      'name': 'Tata Prima',
      'type': 'Truck',
      'capacityKg': 16000,
      'odometerKm': 42000.5,
      'acquisitionCost': 2800000,
      'status': 'AVAILABLE',
      'region': 'West',
    });

    expect(vehicle.name, 'Tata Prima');
    expect(vehicle.capacityKg, 16000);
    expect(vehicle.status, 'AVAILABLE');
  });

  test('maps every API role to a user-facing label', () {
    expect(UserRole.fromApi('OWNER').label, 'Company Owner');
    expect(UserRole.fromApi('ADMIN').label, 'Administrator');
    expect(UserRole.fromApi('FLEET_MANAGER').label, 'Fleet Manager');
    expect(UserRole.fromApi('DISPATCHER').label, 'Dispatcher');
    expect(UserRole.fromApi('SAFETY_OFFICER').label, 'Safety Officer');
    expect(UserRole.fromApi('FINANCIAL_ANALYST').label, 'Financial Analyst');
    expect(UserRole.fromApi('DRIVER').label, 'Driver');
  });

  test('round-trips the cached driver session', () {
    final user = AppUser.fromJson({
      'id': 'user-1',
      'name': 'Raven Kumar',
      'email': 'driver@transitops.in',
      'role': 'DRIVER',
      'organizationId': 'org-1',
      'organizationName': 'TransitOps',
      'driverId': 'driver-1',
      'onboardingStatus': 'VERIFIED',
      'mustChangePassword': false,
    });

    final restored = AppUser.fromJson(user.toJson());

    expect(restored.role, UserRole.driver);
    expect(restored.driverId, 'driver-1');
    expect(restored.onboardingStatus, 'VERIFIED');
  });

  test('reports a clear error when a required account field is missing', () {
    expect(
      () => AppUser.fromJson({
        'name': 'Raven Kumar',
        'email': 'driver@transitops.in',
        'role': 'DRIVER',
      }),
      throwsA(
        isA<FormatException>().having(
          (error) => error.message,
          'message',
          contains('id'),
        ),
      ),
    );
  });
}
