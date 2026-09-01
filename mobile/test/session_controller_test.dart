import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:transi_ops_app/core/api_client.dart';
import 'package:transi_ops_app/core/session_controller.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('stores a mobile session returned by login', () async {
    final api = ApiClient(
      httpClient: MockClient(
        (_) async => http.Response(
          '{"token":"mobile-token","user":{"id":"user-1","name":"Raven Kumar","email":"driver@transitops.in","role":"DRIVER","organizationId":"org-1","organizationName":"TransitOps","mustChangePassword":false}}',
          200,
        ),
      ),
    );
    final session = SessionController(api);

    expect(
      await session.login(email: 'driver@transitops.in', password: 'password'),
      isTrue,
    );
    expect(api.token, 'mobile-token');
    expect(session.user?.name, 'Raven Kumar');
  });

  test(
    'explains a missing mobile token instead of throwing a type cast',
    () async {
      final session = SessionController(
        ApiClient(
          httpClient: MockClient(
            (_) async => http.Response(
              '{"user":{"id":"user-1","name":"Raven Kumar","email":"driver@transitops.in","role":"DRIVER"}}',
              200,
            ),
          ),
        ),
      );

      expect(
        await session.login(
          email: 'driver@transitops.in',
          password: 'password',
        ),
        isFalse,
      );
      expect(session.error, contains('mobile session token'));
      expect(session.error, isNot(contains("type 'Null'")));
    },
  );
}
