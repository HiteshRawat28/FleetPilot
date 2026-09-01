import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

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

  Future<void> delete(String path) async => _send('DELETE', path);

  Future<String> downloadText(String path) async {
    final response = await _http.get(
      Uri.parse('$baseUrl$path'),
      headers: {
        'Accept': 'text/csv',
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
      if (token != null) 'Authorization': 'Bearer $token',
    };

    http.Response response;
    try {
      response = switch (method) {
        'POST' => await _http.post(
          uri,
          headers: headers,
          body: jsonEncode(body ?? {}),
        ),
        'PUT' => await _http.put(uri, headers: headers, body: jsonEncode(body)),
        'DELETE' => await _http.delete(uri, headers: headers),
        _ => await _http.get(uri, headers: headers),
      };
    } on SocketException {
      throw ApiException(
        'Cannot reach TransitOps API at $baseUrl. Start the backend or check the device API address.',
      );
    } on http.ClientException {
      throw ApiException(
        'Cannot reach TransitOps API at $baseUrl. Check the backend and network connection.',
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      var message = 'Request failed (${response.statusCode})';
      try {
        final decoded = jsonDecode(response.body) as Map<String, dynamic>;
        message = decoded['message']?.toString() ?? message;
      } catch (_) {}
      throw ApiException(message, statusCode: response.statusCode);
    }
    if (response.statusCode == 204 || response.body.isEmpty) return null;
    return jsonDecode(response.body);
  }
}
