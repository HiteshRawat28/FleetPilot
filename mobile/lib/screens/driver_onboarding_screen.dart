import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import 'driver_dashboard_screen.dart';

class DriverOnboardingScreen extends StatefulWidget {
  const DriverOnboardingScreen({super.key});

  @override
  State<DriverOnboardingScreen> createState() => _DriverOnboardingScreenState();
}

class _DriverOnboardingScreenState extends State<DriverOnboardingScreen> {
  final _picker = ImagePicker();
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _contact = TextEditingController();
  final _licenseNo = TextEditingController();
  final _expiry = TextEditingController();
  DriverProfile? _profile;
  XFile? _profilePhoto;
  XFile? _licenseFront;
  XFile? _licenseBack;
  String _category = 'LMV';
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _licenseNo.dispose();
    _expiry.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data =
          await context.read<ApiClient>().get('/driver/me')
              as Map<String, dynamic>;
      final profile = DriverProfile.fromJson(data);
      _applyProfile(profile);
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _applyProfile(DriverProfile profile) {
    _profile = profile;
    _name.text = profile.name;
    _contact.text = profile.contact;
    _licenseNo.text = profile.licenseNo;
    if (['LMV', 'HMV', 'MCWG'].contains(profile.licenseCategory)) {
      _category = profile.licenseCategory;
    }
    _expiry.text = profile.licenseExpiry == null
        ? ''
        : DateFormat('yyyy-MM-dd').format(profile.licenseExpiry!);
    if (mounted) setState(() {});
  }

  Future<ImageSource?> _source() => showModalBottomSheet<ImageSource>(
    context: context,
    builder: (context) => SafeArea(
      child: Wrap(
        children: [
          ListTile(
            leading: const Icon(Icons.camera_alt_outlined),
            title: const Text('Take photo'),
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

  Future<void> _pick(void Function(XFile file) assign) async {
    try {
      final source = await _source();
      if (source == null) return;
      final file = await _picker.pickImage(
        source: source,
        imageQuality: 88,
        maxWidth: 2200,
      );
      if (file != null) setState(() => assign(file));
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'The photo picker could not open. Close the app completely and launch it again.';
        });
      }
    }
  }

  Future<void> _upload() async {
    if (_profilePhoto == null || _licenseFront == null) {
      setState(
        () => _error =
            'Add your profile photo and the front of your driving licence.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data =
          await context.read<ApiClient>().multipart(
                '/driver/me/onboarding',
                files: {
                  'profilePhoto': _profilePhoto!.path,
                  'licenseFront': _licenseFront!.path,
                  if (_licenseBack != null) 'licenseBack': _licenseBack!.path,
                },
              )
              as Map<String, dynamic>;
      final ocr = LicenseOcrResult.fromJson(
        data['ocr'] as Map<String, dynamic>,
      );
      _applyProfile(
        DriverProfile.fromJson(data['profile'] as Map<String, dynamic>),
      );
      if (ocr.name?.isNotEmpty ?? false) _name.text = ocr.name!;
      if (ocr.licenseNo?.isNotEmpty ?? false) _licenseNo.text = ocr.licenseNo!;
      if (['LMV', 'HMV', 'MCWG'].contains(ocr.licenseCategory)) {
        _category = ocr.licenseCategory!;
      }
      if (ocr.licenseExpiry != null) {
        _expiry.text = DateFormat('yyyy-MM-dd').format(ocr.licenseExpiry!);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              ocr.confidence > 0
                  ? 'Documents uploaded. Check the scanned details before submitting.'
                  : 'Documents uploaded. Enter the licence details before submitting.',
            ),
          ),
        );
      }
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _chooseExpiry() async {
    final initial =
        DateTime.tryParse(_expiry.text) ??
        DateTime.now().add(const Duration(days: 365));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().add(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 20)),
    );
    if (picked != null) {
      setState(() => _expiry.text = DateFormat('yyyy-MM-dd').format(picked));
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data =
          await context
                  .read<ApiClient>()
                  .post('/driver/me/onboarding/confirm', {
                    'name': _name.text.trim(),
                    'contact': _contact.text.trim(),
                    'licenseNo': _licenseNo.text.trim(),
                    'licenseCategory': _category,
                    'licenseExpiry': _expiry.text,
                  })
              as Map<String, dynamic>;
      _applyProfile(DriverProfile.fromJson(data));
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _profile?.onboardingStatus;
    final awaiting = status == 'NEEDS_REVIEW';
    final verified = status == 'VERIFIED';
    if (verified) {
      return DriverDashboardScreen(initialProfile: _profile!);
    }
    return Scaffold(
      appBar: GlassAppBar(
        title: const Text('Driver account'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: _busy ? null : context.read<SessionController>().logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: _profile == null && _busy
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
                children: [
                  PageHeader(
                    eyebrow: 'TransitOps driver',
                    title: _profile?.name ?? 'Driver profile',
                    description:
                        'Your identity and licence details follow the same company approval flow as the website.',
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          color: AppColors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  if (awaiting || verified)
                    _StatusCard(profile: _profile!, verified: verified)
                  else ...[
                    if (status == 'REJECTED')
                      GlassCard(
                        margin: const EdgeInsets.only(bottom: 14),
                        child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Changes requested',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.red,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _profile?.reviewNote ??
                                    'Your company asked you to review and resubmit these details.',
                              ),
                            ],
                          ),
                        ),
                      ),
                    GlassCard(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              '1. Upload documents',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Photos are stored privately. Profile photo and licence front are required.',
                            ),
                            const SizedBox(height: 16),
                            _FileTile(
                              label: 'Profile photo',
                              file: _profilePhoto,
                              icon: Icons.person_outline,
                              onTap: () =>
                                  _pick((file) => _profilePhoto = file),
                            ),
                            _FileTile(
                              label: 'Licence front',
                              file: _licenseFront,
                              icon: Icons.badge_outlined,
                              onTap: () =>
                                  _pick((file) => _licenseFront = file),
                            ),
                            _FileTile(
                              label: 'Licence back (optional)',
                              file: _licenseBack,
                              icon: Icons.flip_to_back,
                              onTap: () => _pick((file) => _licenseBack = file),
                            ),
                            const SizedBox(height: 10),
                            FilledButton.icon(
                              onPressed: _busy ? null : _upload,
                              icon: const Icon(Icons.cloud_upload_outlined),
                              label: Text(
                                _busy
                                    ? 'Uploading…'
                                    : 'Upload and scan licence',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    GlassCard(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                '2. Check your details',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'Correct anything the licence scan did not read accurately.',
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: _name,
                                decoration: const InputDecoration(
                                  labelText: 'Full name',
                                ),
                                validator: (value) =>
                                    (value?.trim().length ?? 0) < 2
                                    ? 'Enter your full name'
                                    : null,
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _contact,
                                keyboardType: TextInputType.phone,
                                decoration: const InputDecoration(
                                  labelText: 'Contact number',
                                ),
                                validator: (value) =>
                                    (value?.trim().length ?? 0) < 7
                                    ? 'Enter a valid contact number'
                                    : null,
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _licenseNo,
                                textCapitalization:
                                    TextCapitalization.characters,
                                decoration: const InputDecoration(
                                  labelText: 'Driving licence number',
                                ),
                                validator: (value) =>
                                    (value?.trim().length ?? 0) < 3
                                    ? 'Enter your licence number'
                                    : null,
                              ),
                              const SizedBox(height: 12),
                              DropdownButtonFormField<String>(
                                key: ValueKey(_category),
                                initialValue: _category,
                                decoration: const InputDecoration(
                                  labelText: 'Licence category',
                                ),
                                items: ['LMV', 'HMV', 'MCWG']
                                    .map(
                                      (value) => DropdownMenuItem(
                                        value: value,
                                        child: Text(value),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (value) =>
                                    setState(() => _category = value ?? 'LMV'),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _expiry,
                                readOnly: true,
                                onTap: _chooseExpiry,
                                decoration: const InputDecoration(
                                  labelText: 'Licence expiry',
                                  suffixIcon: Icon(
                                    Icons.calendar_today_outlined,
                                  ),
                                ),
                                validator: (value) => (value?.isEmpty ?? true)
                                    ? 'Choose the licence expiry date'
                                    : null,
                              ),
                              const SizedBox(height: 18),
                              FilledButton.icon(
                                onPressed: _busy ? null : _submit,
                                icon: const Icon(Icons.fact_check_outlined),
                                label: const Text(
                                  'Submit for company approval',
                                ),
                              ),
                            ],
                          ),
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

class _FileTile extends StatelessWidget {
  const _FileTile({
    required this.label,
    required this.file,
    required this.icon,
    required this.onTap,
  });
  final String label;
  final XFile? file;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(padding: const EdgeInsets.all(12)),
      child: Row(
        children: [
          if (file != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                File(file!.path),
                width: 48,
                height: 48,
                fit: BoxFit.cover,
              ),
            )
          else
            Icon(icon, size: 28, color: AppColors.orange),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label),
                Text(
                  file?.name ?? 'Tap to add photo',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Icon(
            file == null ? Icons.add_a_photo_outlined : Icons.check_circle,
            color: file == null ? AppColors.muted : AppColors.green,
          ),
        ],
      ),
    ),
  );
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.profile, required this.verified});
  final DriverProfile profile;
  final bool verified;
  @override
  Widget build(BuildContext context) => GlassCard(
    child: Padding(
      padding: const EdgeInsets.all(22),
      child: Column(
        children: [
          Icon(
            verified ? Icons.verified_rounded : Icons.hourglass_top_rounded,
            size: 52,
            color: verified ? AppColors.green : AppColors.orange,
          ),
          const SizedBox(height: 14),
          Text(
            verified ? 'Profile approved' : 'Waiting for company approval',
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            verified
                ? 'Your driver identity and licence have been verified.'
                : 'Your fleet manager can now review the information and private documents from the TransitOps website.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 18),
          StatusBadge(profile.onboardingStatus),
          const SizedBox(height: 18),
          ...profile.documents.map(
            (document) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.description_outlined),
              title: Text(document.originalName),
              subtitle: Text(prettyStatus(document.type)),
              trailing: const Icon(Icons.lock_outline, size: 18),
            ),
          ),
        ],
      ),
    ),
  );
}
