import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _jobTitle = TextEditingController();
  final _picker = ImagePicker();
  AppUser? _profile;
  bool _busy = true;
  String? _error;
  String? _message;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _jobTitle.dispose();
    super.dispose();
  }

  void _apply(Map<String, dynamic> json) {
    final profile = AppUser.fromJson(json);
    _profile = profile;
    _name.text = profile.name;
    _phone.text = profile.phone ?? '';
    _jobTitle.text = profile.jobTitle ?? '';
    context.read<SessionController>().updateProfile(profile);
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final json =
          await context.read<ApiClient>().get('/profile')
              as Map<String, dynamic>;
      if (mounted) _apply(json);
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<ImageSource?> _chooseSource() => showModalBottomSheet<ImageSource>(
    context: context,
    builder: (context) => SafeArea(
      child: Wrap(
        children: [
          ListTile(
            leading: const Icon(Icons.camera_alt_outlined),
            title: const Text('Take a photo'),
            onTap: () => Navigator.pop(context, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from photos'),
            onTap: () => Navigator.pop(context, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );

  Future<void> _changeAvatar() async {
    final api = context.read<ApiClient>();
    XFile? photo;
    try {
      final source = await _chooseSource();
      if (source == null) return;
      photo = await _picker.pickImage(
        source: source,
        imageQuality: 88,
        maxWidth: 1600,
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'The photo picker could not open. Close the app completely and launch it again.';
        });
      }
      return;
    }
    if (photo == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      final json =
          await api.multipart('/profile/avatar', files: {'avatar': photo.path})
              as Map<String, dynamic>;
      if (mounted) {
        _apply(json);
        _message = 'Profile photo updated';
      }
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      final json =
          await context.read<ApiClient>().patch('/profile', {
                'name': _name.text.trim(),
                'phone': _phone.text.trim(),
                'jobTitle': _jobTitle.text.trim(),
              })
              as Map<String, dynamic>;
      if (mounted) {
        _apply(json);
        _message = 'Personal details saved';
      }
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    return Scaffold(
      appBar: const GlassAppBar(title: Text('Personal settings')),
      body: profile == null && _busy
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
                children: [
                  const PageHeader(
                    eyebrow: 'Account identity',
                    title: 'My profile',
                    description:
                        'Manage the same personal details and profile photo used on the TransitOps website.',
                  ),
                  if (_error != null)
                    _FeedbackMessage(
                      message: _error!,
                      color: AppColors.red,
                      icon: Icons.error_outline,
                    ),
                  if (_message != null)
                    _FeedbackMessage(
                      message: _message!,
                      color: AppColors.green,
                      icon: Icons.check_circle_outline,
                    ),
                  if (profile != null) ...[
                    GlassCard(
                      child: Padding(
                        padding: const EdgeInsets.all(22),
                        child: Column(
                          children: [
                            Semantics(
                              button: true,
                              label: 'Change profile photo',
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: _busy ? null : _changeAvatar,
                                child: Stack(
                                  clipBehavior: Clip.none,
                                  children: [
                                    ProfileAvatar(
                                      name: profile.name,
                                      avatarUrl: profile.avatarUrl,
                                      radius: 52,
                                    ),
                                    Positioned(
                                      right: -3,
                                      bottom: -3,
                                      child: Container(
                                        width: 34,
                                        height: 34,
                                        decoration: BoxDecoration(
                                          color: AppColors.orange,
                                          shape: BoxShape.circle,
                                          border: Border.all(
                                            color: Colors.white,
                                            width: 3,
                                          ),
                                        ),
                                        child: const Icon(
                                          Icons.camera_alt,
                                          size: 16,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            Text(
                              profile.name,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 4),
                            Text(profile.email),
                            const SizedBox(height: 8),
                            TextButton.icon(
                              onPressed: _busy ? null : _changeAvatar,
                              icon: const Icon(Icons.add_a_photo_outlined),
                              label: Text(
                                _busy ? 'Please wait…' : 'Change profile photo',
                              ),
                            ),
                            Text(
                              'JPG, PNG, WebP or HEIC · maximum 20 MB · stored privately',
                              style: Theme.of(context).textTheme.bodySmall,
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    GlassCard(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Personal details',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: _name,
                                decoration: const InputDecoration(
                                  labelText: 'Full name',
                                  prefixIcon: Icon(Icons.person_outline),
                                ),
                                validator: (value) =>
                                    (value?.trim().length ?? 0) < 2
                                    ? 'Enter your full name'
                                    : null,
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                initialValue: profile.email,
                                readOnly: true,
                                decoration: const InputDecoration(
                                  labelText: 'Work email',
                                  prefixIcon: Icon(Icons.mail_outline),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _phone,
                                keyboardType: TextInputType.phone,
                                decoration: const InputDecoration(
                                  labelText: 'Phone number',
                                  prefixIcon: Icon(Icons.phone_outlined),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _jobTitle,
                                decoration: const InputDecoration(
                                  labelText: 'Job title',
                                  prefixIcon: Icon(Icons.work_outline),
                                ),
                              ),
                              const SizedBox(height: 18),
                              FilledButton.icon(
                                onPressed: _busy ? null : _save,
                                icon: const Icon(Icons.save_outlined),
                                label: const Text('Save personal details'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    GlassCard(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Allowed modules',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 12),
                            ...profile.allowedModules.map(
                              (module) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(
                                  Icons.check_circle_outline,
                                  color: AppColors.green,
                                ),
                                title: Text(module),
                                trailing: const Text('Allowed'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _FeedbackMessage extends StatelessWidget {
  const _FeedbackMessage({
    required this.message,
    required this.color,
    required this.icon,
  });
  final String message;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: TextStyle(color: color, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
