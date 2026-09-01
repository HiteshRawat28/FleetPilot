import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? httpClient}) : _http = httpClient ?? http.Client();

  final http.Client _http;
  String? token;
  static const _requestTimeout = Duration(seconds: 30);
  static const _uploadTimeout = Duration(minutes: 2);

  static String get baseUrl {
    const configured = String.fromEnvironment('API_BASE_URL');
    if (configured.isNotEmpty) return configured.replaceAll(RegExp(r'/$'), '');
    if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:4000/api';
    return 'http://localhost:4000/api';
  }

  Future<dynamic> get(String path) => _send('GET', path);

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      _send('POST', path, body: body);

  Future<dynamic> put(String path, Map<String, dynamic> body) =>
      _send('PUT', path, body: body);

  Future<dynamic> patch(String path, Map<String, dynamic> body) =>
      _send('PATCH', path, body: body);

  Future<void> delete(String path) async => _send('DELETE', path);

  Future<dynamic> multipart(
    String path, {
    required Map<String, String> files,
    Map<String, String> fields = const {},
  }) async {
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'))
      ..headers.addAll({
        'Accept': 'application/json',
        'X-TransitOps-Client': 'mobile',
        'ngrok-skip-browser-warning': 'transitops-mobile',
        if (token != null) 'Authorization': 'Bearer $token',
      })
      ..fields.addAll(fields);
    for (final entry in files.entries) {
      request.files.add(
        await http.MultipartFile.fromPath(
          entry.key,
          entry.value,
          contentType: _imageContentType(entry.value),
        ),
      );
    }
    try {
      final streamed = await _http.send(request).timeout(_uploadTimeout);
      final response = await http.Response.fromStream(streamed);
      return _decodeJson(response);
    } on TimeoutException {
      throw const ApiException(
        'The upload timed out. Check your mobile data or Wi-Fi and try again.',
      );
    } on SocketException catch (error) {
      throw _networkException(error);
    } on http.ClientException catch (error) {
      throw _networkException(error);
    }
  }

  MediaType? _imageContentType(String path) {
    final extension = path.toLowerCase().split('.').last;
    return switch (extension) {
      'jpg' || 'jpeg' => MediaType('image', 'jpeg'),
      'png' => MediaType('image', 'png'),
      'webp' => MediaType('image', 'webp'),
      'heic' => MediaType('image', 'heic'),
      'heif' => MediaType('image', 'heif'),
      _ => null,
    };
  }

  Future<String> downloadText(String path) async {
    final response = await _http.get(
      Uri.parse('$baseUrl$path'),
      headers: {
        'Accept': 'text/csv',
        'X-TransitOps-Client': 'mobile',
        'ngrok-skip-browser-warning': 'transitops-mobile',
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException('Export failed (${response.statusCode})');
    }
    return response.body;
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-TransitOps-Client': 'mobile',
      'ngrok-skip-browser-warning': 'transitops-mobile',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    http.Response? response;
    for (var attempt = 0; attempt < (method == 'GET' ? 2 : 1); attempt++) {
      try {
        response = await switch (method) {
          'POST' => _http.post(
            uri,
            headers: headers,
            body: jsonEncode(body ?? {}),
          ),
          'PUT' => _http.put(uri, headers: headers, body: jsonEncode(body)),
          'PATCH' => _http.patch(uri, headers: headers, body: jsonEncode(body)),
          'DELETE' => _http.delete(uri, headers: headers),
          _ => _http.get(uri, headers: headers),
        }.timeout(_requestTimeout);
        break;
      } on TimeoutException catch (error) {
        if (attempt == 0 && method == 'GET') {
          await Future<void>.delayed(const Duration(milliseconds: 500));
          continue;
        }
        throw _networkException(error);
      } on SocketException catch (error) {
        if (attempt == 0 && method == 'GET') {
          await Future<void>.delayed(const Duration(milliseconds: 500));
          continue;
        }
        throw _networkException(error);
      } on http.ClientException catch (error) {
        if (attempt == 0 && method == 'GET') {
          await Future<void>.delayed(const Duration(milliseconds: 500));
          continue;
        }
        throw _networkException(error);
      }
    }

    return _decodeJson(response!);
  }

  dynamic _decodeJson(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      var message = 'Request failed (${response.statusCode})';
      try {
        final decoded = jsonDecode(response.body) as Map<String, dynamic>;
        message = decoded['message']?.toString() ?? message;
      } catch (_) {}
      throw ApiException(message, statusCode: response.statusCode);
    }
    if (response.statusCode == 204 || response.body.isEmpty) return null;
    try {
      return jsonDecode(response.body);
    } on FormatException {
      throw ApiException(
        'The API returned an unexpected response. Verify the ngrok tunnel and try again.',
        statusCode: response.statusCode,
      );
    }
  }

  ApiException _networkException(Object error) => ApiException(
    'Cannot reach TransitOps right now. Check that the ngrok tunnel is running and that this phone has internet access. (${error.runtimeType})',
  );
}
