import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../widgets/common.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await context.read<SessionController>().changePassword(
      currentPassword: _current.text,
      newPassword: _next.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return Scaffold(
      appBar: GlassAppBar(
        title: const Text('Secure your account'),
        actions: [
          TextButton(
            onPressed: session.busy ? null : session.logout,
            child: const Text('Sign out'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: GlassCard(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Icon(
                          Icons.password_rounded,
                          size: 42,
                          color: AppColors.orange,
                        ),
                        const SizedBox(height: 18),
                        Text(
                          'Change your temporary password',
                          style: Theme.of(context).textTheme.headlineSmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Your company created this account. Choose a private password before adding personal documents.',
                          textAlign: TextAlign.center,
                        ),
                        if (session.error != null) ...[
                          const SizedBox(height: 16),
                          Text(
                            session.error!,
                            style: const TextStyle(
                              color: AppColors.red,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        const SizedBox(height: 24),
                        TextFormField(
                          controller: _current,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Temporary password',
                            prefixIcon: Icon(Icons.lock_outline),
                          ),
                          validator: (value) => (value?.length ?? 0) < 8
                              ? 'Enter your temporary password'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _next,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'New password',
                            prefixIcon: Icon(Icons.security),
                          ),
                          validator: (value) {
                            final password = value ?? '';
                            if (password.length < 10) {
                              return 'Use at least 10 characters';
                            }
                            if (!RegExp(r'[A-Z]').hasMatch(password)) {
                              return 'Add one uppercase letter';
                            }
                            if (!RegExp(r'[0-9]').hasMatch(password)) {
                              return 'Add one number';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _confirm,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Confirm new password',
                            prefixIcon: Icon(Icons.verified_user_outlined),
                          ),
                          validator: (value) => value != _next.text
                              ? 'Passwords do not match'
                              : null,
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
                              : const Icon(Icons.arrow_forward),
                          label: const Text('Continue to driver profile'),
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
