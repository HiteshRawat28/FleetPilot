import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'api_client.dart';

class SessionController extends ChangeNotifier {
  SessionController(this._api);

  static const _tokenKey = 'transitops_token';
  final ApiClient _api;

  AppUser? user;
  bool busy = false;
  String? error;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final savedToken = prefs.getString(_tokenKey);
    if (savedToken == null) return;
    _api.token = savedToken;
    try {
      final data = await _api.get('/auth/me') as Map<String, dynamic>;
      user = AppUser.fromJson(data['user'] as Map<String, dynamic>);
    } catch (_) {
      _api.token = null;
      await prefs.remove(_tokenKey);
    }
  }

  Future<bool> login({
    required String email,
    required String password,
    required UserRole role,
  }) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      final data =
          await _api.post('/auth/login', {
                'email': email.trim().toLowerCase(),
                'password': password,
                'role': role.apiValue,
              })
              as Map<String, dynamic>;
      _api.token = data['token'] as String;
      user = AppUser.fromJson(data['user'] as Map<String, dynamic>);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, _api.token!);
      return true;
    } catch (exception) {
      error = exception.toString();
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    _api.token = null;
    user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    notifyListeners();
  }
}
