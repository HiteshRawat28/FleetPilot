import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController(text: 'manager@transitops.in');
  final _password = TextEditingController(text: 'Password@123');
  UserRole _role = UserRole.fleetManager;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _selectRole(UserRole? role) {
    if (role == null) return;
    setState(() {
      _role = role;
      _email.text = switch (role) {
        UserRole.fleetManager => 'manager@transitops.in',
        UserRole.dispatcher => 'dispatcher@transitops.in',
        UserRole.safetyOfficer => 'safety@transitops.in',
        UserRole.financialAnalyst => 'finance@transitops.in',
      };
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await context.read<SessionController>().login(
      email: _email.text,
      password: _password.text,
      role: _role,
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: GlassCard(
                opacity: .72,
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 46,
                              height: 46,
                              decoration: BoxDecoration(
                                color: AppColors.orange,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(
                                Icons.route,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 12),
                            const Text(
                              'TRANSITOPS',
                              style: TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.2,
                                color: AppColors.ink,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 36),
                        const Text(
                          'WELCOME BACK',
                          style: TextStyle(
                            color: AppColors.orange,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Run your fleet from anywhere.',
                          style: Theme.of(context).textTheme.headlineLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Sign in with the same operations account used on the TransitOps website.',
                          style: Theme.of(context).textTheme.bodyLarge
                              ?.copyWith(color: AppColors.muted),
                        ),
                        if (session.error != null) ...[
                          const SizedBox(height: 20),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.red.withValues(alpha: .08),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(
                                  Icons.error_outline,
                                  color: AppColors.red,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    session.error!,
                                    style: const TextStyle(
                                      color: AppColors.red,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 24),
                        TextFormField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [AutofillHints.email],
                          decoration: const InputDecoration(
                            labelText: 'Work email',
                            prefixIcon: Icon(Icons.mail_outline),
                          ),
                          validator: (value) =>
                              value == null || !value.contains('@')
                              ? 'Enter a valid email'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _password,
                          obscureText: _obscure,
                          autofillHints: const [AutofillHints.password],
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              tooltip: _obscure
                                  ? 'Show password'
                                  : 'Hide password',
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                              ),
                            ),
                          ),
                          validator: (value) => (value?.length ?? 0) < 6
                              ? 'Password must be at least 6 characters'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        DropdownButtonFormField<UserRole>(
                          initialValue: _role,
                          dropdownColor: const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(12),
                          menuMaxHeight: 260,
                          elevation: 8,
                          style: const TextStyle(
                            color: AppColors.ink,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                          decoration: const InputDecoration(
                            labelText: 'Access role',
                            prefixIcon: Icon(Icons.badge_outlined),
                          ),
                          items: UserRole.values
                              .map(
                                (role) => DropdownMenuItem(
                                  value: role,
                                  child: Text(role.label),
                                ),
                              )
                              .toList(),
                          onChanged: _selectRole,
                        ),
                        const SizedBox(height: 20),
                        FilledButton.icon(
                          onPressed: session.busy ? null : _submit,
                          icon: session.busy
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.shield_outlined),
                          label: Text(
                            session.busy ? 'Signing in…' : 'Sign in securely',
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.check_circle_outline,
                              size: 19,
                              color: AppColors.green,
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: Text(
                                'Demo password for every role: Password@123',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
