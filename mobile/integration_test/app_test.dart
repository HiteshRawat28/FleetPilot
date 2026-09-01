import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:transi_ops_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('manager signs in and sees live fleet data', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await app.main();
    await tester.pumpAndSettle();

    expect(find.text('Run your fleet from anywhere.'), findsOneWidget);
    await tester.ensureVisible(find.text('Sign in securely'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in securely'));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle(const Duration(milliseconds: 500));

    expect(find.text('Fleet overview'), findsOneWidget);
    expect(find.text('Active vehicles'), findsOneWidget);

    await tester.tap(find.text('Fleet'));
    await tester.pumpAndSettle();
    expect(find.text('Vehicles'), findsOneWidget);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('More operations'), findsOneWidget);
    expect(find.text('Connected API'), findsNothing);
  });
}
