import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/app_theme.dart';
import 'core/session_controller.dart';
import 'screens/app_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final session = SessionController(api);
  await session.restore();
  runApp(TransitOpsApp(api: api, session: session));
}

class TransitOpsApp extends StatelessWidget {
  const TransitOpsApp({super.key, required this.api, required this.session});

  final ApiClient api;
  final SessionController session;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: session),
      ],
      child: MaterialApp(
        title: 'TransitOps',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        builder: (_, child) => AppBackdrop(child: child ?? const SizedBox()),
        home: Consumer<SessionController>(
          builder: (_, state, _) =>
              state.user == null ? const LoginScreen() : const AppShell(),
        ),
      ),
    );
  }
}
