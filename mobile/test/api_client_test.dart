import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:transi_ops_app/core/api_client.dart';

void main() {
  test('decodes a successful multipart upload as JSON', () async {
    final image = File(
      '${Directory.systemTemp.path}/transitops-upload-test.jpg',
    );
    await image.writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);
    addTearDown(() => image.deleteSync());

    final client = ApiClient(
      httpClient: MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, endsWith('/driver/me/onboarding'));
        expect(request.headers['authorization'], 'Bearer driver-token');
        expect(request.headers['x-transitops-client'], 'mobile');
        expect(
          request.headers['ngrok-skip-browser-warning'],
          'transitops-mobile',
        );
        expect(
          request.headers['content-type'],
          startsWith('multipart/form-data; boundary='),
        );
        final multipartBody = latin1.decode(request.bodyBytes);
        expect(multipartBody, contains('profilePhoto'));
        expect(multipartBody, contains('licenseFront'));
        expect(
          RegExp(
            r'content-type: image/jpeg',
            caseSensitive: false,
          ).allMatches(multipartBody),
          hasLength(2),
        );
        return http.Response(
          '{"profile":{"id":"driver-1"},"ocr":{"confidence":82}}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    )..token = 'driver-token';

    final result =
        await client.multipart(
              '/driver/me/onboarding',
              files: {'profilePhoto': image.path, 'licenseFront': image.path},
            )
            as Map<String, dynamic>;

    expect((result['ocr'] as Map<String, dynamic>)['confidence'], 82);
  });

  test(
    'identifies JSON requests as mobile and bypasses ngrok warning',
    () async {
      final client = ApiClient(
        httpClient: MockClient((request) async {
          expect(
            request.headers['ngrok-skip-browser-warning'],
            'transitops-mobile',
          );
          expect(request.headers['x-transitops-client'], 'mobile');
          return http.Response('{"status":"ok"}', 200);
        }),
      );

      final result = await client.get('/health') as Map<String, dynamic>;

      expect(result['status'], 'ok');
    },
  );
}
