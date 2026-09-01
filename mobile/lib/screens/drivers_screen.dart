import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class DriversScreen extends StatefulWidget {
  const DriversScreen({super.key});
  @override
  State<DriversScreen> createState() => _DriversScreenState();
}

class _DriversScreenState extends State<DriversScreen> {
  List<Driver>? _drivers;
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final raw =
          await context.read<ApiClient>().get('/drivers') as List<dynamic>;
      if (mounted) {
        setState(
          () => _drivers = raw
              .map((item) => Driver.fromJson(item as Map<String, dynamic>))
              .toList(),
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _edit([Driver? driver]) async {
    final saved = await showAppSheet<bool>(context, DriverForm(driver: driver));
    if (saved == true) {
      await _load();
      if (mounted) {
        showMessage(
          context,
          driver == null ? 'Driver added' : 'Driver updated',
        );
      }
    }
  }

  Future<void> _delete(Driver driver) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete driver?'),
        content: Text('${driver.name} will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.read<ApiClient>().delete('/drivers/${driver.id}');
      await _load();
      if (mounted) showMessage(context, 'Driver deleted');
    } catch (error) {
      if (mounted) showMessage(context, error.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<SessionController>().user!.role;
    final canEdit =
        role.hasAdministrativeAccess ||
        role == UserRole.fleetManager ||
        role == UserRole.safetyOfficer;
    final canDelete =
        role.hasAdministrativeAccess || role == UserRole.fleetManager;
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_drivers == null) return const LoadingView();
    final needle = _query.toLowerCase();
    final filtered = _drivers!
        .where(
          (driver) =>
              driver.name.toLowerCase().contains(needle) ||
              driver.licenseNo.toLowerCase().contains(needle),
        )
        .toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          PageHeader(
            eyebrow: 'Safety & compliance',
            title: 'Drivers',
            description:
                '${_drivers!.length} driver profiles and license status.',
            action: canEdit
                ? IconButton.filled(
                    tooltip: 'Add driver',
                    onPressed: () => _edit(),
                    icon: const Icon(Icons.add),
                  )
                : null,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: TextField(
              onChanged: (value) => setState(() => _query = value),
              decoration: const InputDecoration(
                hintText: 'Search name or license',
                prefixIcon: Icon(Icons.search),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: filtered.isEmpty
                ? const EmptyView(
                    label: 'No matching drivers',
                    icon: Icons.badge_outlined,
                  )
                : Column(
                    children: filtered
                        .map(
                          (driver) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: GlassCard(
                              child: Padding(
                                padding: const EdgeInsets.all(15),
                                child: Column(
                                  children: [
                                    Row(
                                      children: [
                                        Container(
                                          width: 46,
                                          height: 46,
                                          decoration: BoxDecoration(
                                            color: Colors.white.withValues(
                                              alpha: .46,
                                            ),
                                            borderRadius: BorderRadius.circular(
                                              7,
                                            ),
                                          ),
                                          child: const Icon(
                                            Icons.person_outline,
                                            color: AppColors.blue,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                driver.name,
                                                style: Theme.of(
                                                  context,
                                                ).textTheme.titleMedium,
                                              ),
                                              Text(
                                                '${driver.licenseNo} · ${driver.licenseCategory}',
                                              ),
                                            ],
                                          ),
                                        ),
                                        StatusBadge(
                                          driver.licenseExpired
                                              ? 'EXPIRED'
                                              : driver.status,
                                        ),
                                      ],
                                    ),
                                    const Divider(height: 24),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: _DriverDetail(
                                            label: 'License expiry',
                                            value: dateFormat.format(
                                              driver.licenseExpiry,
                                            ),
                                          ),
                                        ),
                                        Expanded(
                                          child: _DriverDetail(
                                            label: 'Safety score',
                                            value: '${driver.safetyScore}/100',
                                          ),
                                        ),
                                        if (canEdit)
                                          PopupMenuButton<String>(
                                            tooltip: 'Driver actions',
                                            onSelected: (value) =>
                                                value == 'edit'
                                                ? _edit(driver)
                                                : _delete(driver),
                                            itemBuilder: (_) => [
                                              const PopupMenuItem(
                                                value: 'edit',
                                                child: ListTile(
                                                  leading: Icon(
                                                    Icons.edit_outlined,
                                                  ),
                                                  title: Text('Edit'),
                                                  contentPadding:
                                                      EdgeInsets.zero,
                                                ),
                                              ),
                                              if (canDelete)
                                                const PopupMenuItem(
                                                  value: 'delete',
                                                  child: ListTile(
                                                    leading: Icon(
                                                      Icons.delete_outline,
                                                      color: AppColors.red,
                                                    ),
                                                    title: Text('Delete'),
                                                    contentPadding:
                                                        EdgeInsets.zero,
                                                  ),
                                                ),
                                            ],
                                          ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

class _DriverDetail extends StatelessWidget {
  const _DriverDetail({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: Theme.of(context).textTheme.bodySmall),
      Text(
        value,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
      ),
    ],
  );
}

class DriverForm extends StatefulWidget {
  const DriverForm({super.key, this.driver});
  final Driver? driver;
  @override
  State<DriverForm> createState() => _DriverFormState();
}

class _DriverFormState extends State<DriverForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name, _license, _contact, _score;
  late String _category, _status;
  late DateTime _expiry;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final driver = widget.driver;
    _name = TextEditingController(text: driver?.name);
    _license = TextEditingController(text: driver?.licenseNo);
    _contact = TextEditingController(text: driver?.contact);
    _score = TextEditingController(text: '${driver?.safetyScore ?? 100}');
    _category = driver?.licenseCategory ?? 'LMV';
    _status = driver?.status ?? 'AVAILABLE';
    _expiry =
        driver?.licenseExpiry ?? DateTime.now().add(const Duration(days: 365));
  }

  Future<void> _pickDate() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: _expiry,
      firstDate: DateTime(2020),
      lastDate: DateTime(2040),
    );
    if (selected != null) setState(() => _expiry = selected);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = {
      'name': _name.text.trim(),
      'licenseNo': _license.text.trim().toUpperCase(),
      'licenseCategory': _category,
      'licenseExpiry': _expiry.toUtc().toIso8601String(),
      'contact': _contact.text.trim(),
      'safetyScore': int.parse(_score.text),
      'status': _status,
    };
    try {
      final api = context.read<ApiClient>();
      if (widget.driver == null) {
        await api.post('/drivers', body);
      } else {
        await api.put('/drivers/${widget.driver!.id}', body);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.all(20),
    child: Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.driver == null
                ? 'Create driver profile'
                : 'Edit driver profile',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 6),
          const Text('Identity, license compliance and safety readiness.'),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.red)),
          ],
          const SizedBox(height: 20),
          TextFormField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Full name'),
            validator: requiredText,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _contact,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Contact number'),
            validator: (value) =>
                (value?.length ?? 0) < 7 ? 'Enter a valid contact' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _license,
            decoration: const InputDecoration(labelText: 'License number'),
            validator: requiredText,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(labelText: 'License category'),
            items: ['LMV', 'HMV', 'MCWG']
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) => _category = value!,
          ),
          const SizedBox(height: 12),
          InkWell(
            onTap: _pickDate,
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'License expiry',
                suffixIcon: Icon(Icons.calendar_month_outlined),
              ),
              child: Text(dateFormat.format(_expiry)),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _score,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Safety score'),
            validator: (value) {
              final score = int.tryParse(value ?? '');
              return score == null || score < 0 || score > 100
                  ? 'Enter a score from 0 to 100'
                  : null;
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: ['AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'SUSPENDED']
                .map(
                  (value) => DropdownMenuItem(
                    value: value,
                    child: Text(prettyStatus(value)),
                  ),
                )
                .toList(),
            onChanged: (value) => _status = value!,
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: Text(_busy ? 'Saving…' : 'Save profile'),
          ),
        ],
      ),
    ),
  );
}
