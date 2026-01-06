import 'package:flutter_test/flutter_test.dart';
import 'package:shrimp_ai_guard/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const ShrimpAIGuardApp());

    // Verify that the app title is shown in the app bar
    expect(find.text('Shrimp AI Guard'), findsAtLeastNWidgets(1));
    
    // Verify that the welcome text is shown
    expect(find.text('Welcome to Shrimp AI Guard'), findsOneWidget);
  });
}
