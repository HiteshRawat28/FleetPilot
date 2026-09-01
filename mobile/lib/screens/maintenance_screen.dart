import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class MaintenanceScreen extends StatefulWidget {
  const MaintenanceScreen({super.key});
  @override
  State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends State<MaintenanceScreen> {
  List<MaintenanceRecord>? _records;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final raw =
          await context.read<ApiClient>().get('/maintenance') as List<dynamic>;
      if (mounted) {
        setState(
          () => _records = raw
              .map(
                (item) =>
                    MaintenanceRecord.fromJson(item as Map<String, dynamic>),
              )
              .toList(),
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _create() async {
    final saved = await showAppSheet<bool>(context, const MaintenanceForm());
    if (saved == true) {
      await _load();
      if (mounted) showMessage(context, 'Vehicle moved into maintenance');
    }
  }

  Future<void> _close(MaintenanceRecord record) async {
    try {
      await context.read<ApiClient>().post('/maintenance/${record.id}/close');
      await _load();
      if (mounted) showMessage(context, 'Service closed and vehicle released');
    } catch (error) {
      if (mounted) showMessage(context, error.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canManage =
        context.watch<SessionController>().user!.role == UserRole.fleetManager;
    return Scaffold(
      appBar: const GlassAppBar(title: Text('Maintenance control')),
      body: _error != null
          ? ErrorView(message: _error!, onRetry: _load)
          : _records == null
          ? const LoadingView()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  PageHeader(
                    eyebrow: 'Fleet health',
                    title: 'Service records',
                    description:
                        '${_records!.where((record) => record.status == 'ACTIVE').length} active workshop jobs.',
                    action: canManage
                        ? IconButton.filled(
                            tooltip: 'Log service',
                            onPressed: _create,
                            icon: const Icon(Icons.add),
                          )
                        : null,
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                    child: _records!.isEmpty
                        ? const EmptyView(
                            label: 'No maintenance records',
                            icon: Icons.build_outlined,
                          )
                        : Column(
                            children: _records!
                                .map(
                                  (record) => Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: GlassCard(
                                      child: Padding(
                                        padding: const EdgeInsets.all(15),
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Container(
                                                  width: 44,
                                                  height: 44,
                                                  decoration: BoxDecoration(
                                                    color: AppColors.orangeSoft
                                                        .withValues(alpha: .72),
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          7,
                                                        ),
                                                  ),
                                                  child: const Icon(
                                                    Icons.build_outlined,
                                                    color: AppColors.orange,
                                                  ),
                                                ),
                                                const SizedBox(width: 12),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Text(
                                                        record.vehicle.name,
                                                        style: Theme.of(
                                                          context,
                                                        ).textTheme.titleMedium,
                                                      ),
                                                      Text(
                                                        record
                                                            .vehicle
                                                            .registrationNo,
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                                StatusBadge(record.status),
                                              ],
                                            ),
                                            const SizedBox(height: 14),
                                            Text(
                                              record.serviceType,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w700,
                                                color: AppColors.ink,
                                              ),
                                            ),
                                            if ((record.description ?? '')
                                                .isNotEmpty)
                                              Text(record.description!),
                                            const Divider(height: 24),
                                            Row(
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    dateFormat.format(
                                                      record.startDate,
                                                    ),
                                                  ),
                                                ),
                                                Text(
                                                  moneyFormat.format(
                                                    record.cost,
                                                  ),
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    color: AppColors.ink,
                                                  ),
                                                ),
                                                if (canManage &&
                                                    record.status ==
                                                        'ACTIVE') ...[
                                                  const SizedBox(width: 10),
                                                  OutlinedButton.icon(
                                                    onPressed: () =>
                                                        _close(record),
                                                    icon: const Icon(
                                                      Icons.check,
                                                      size: 17,
                                                    ),
                                                    label: const Text('Close'),
                                                  ),
                                                ],
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
            ),
    );
  }
}

class MaintenanceForm extends StatefulWidget {
  const MaintenanceForm({super.key});
  @override
  State<MaintenanceForm> createState() => _MaintenanceFormState();
}

class _MaintenanceFormState extends State<MaintenanceForm> {
  final _formKey = GlobalKey<FormState>();
  final _service = TextEditingController(),
      _description = TextEditingController(),
      _cost = TextEditingController();
  List<Vehicle>? _vehicles;
  String? _vehicleId, _error;
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    _loadVehicles();
  }

  Future<void> _loadVehicles() async {
    try {
      final raw =
          await context.read<ApiClient>().get('/vehicles/available')
              as List<dynamic>;
      if (mounted) {
        setState(
          () => _vehicles = raw
              .map((item) => Vehicle.fromJson(item as Map<String, dynamic>))
              .toList(),
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<ApiClient>().post('/maintenance', {
        'vehicleId': _vehicleId,
        'serviceType': _service.text.trim(),
        'description': _description.text.trim(),
        'cost': double.parse(_cost.text),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _vehicles == null
      ? const SizedBox(height: 340, child: LoadingView())
      : SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Create maintenance record',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Starting service immediately marks the vehicle In Shop.',
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: AppColors.red)),
                ],
                const SizedBox(height: 20),
                DropdownButtonFormField<String>(
                  initialValue: _vehicleId,
                  decoration: const InputDecoration(
                    labelText: 'Available vehicle',
                  ),
                  items: _vehicles!
                      .map(
                        (vehicle) => DropdownMenuItem(
                          value: vehicle.id,
                          child: Text(
                            '${vehicle.name} · ${vehicle.registrationNo}',
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => _vehicleId = value,
                  validator: (value) =>
                      value == null ? 'Select a vehicle' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _service,
                  decoration: const InputDecoration(labelText: 'Service type'),
                  validator: requiredText,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _cost,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Estimated cost',
                  ),
                  validator: (value) => double.tryParse(value ?? '') == null
                      ? 'Enter a number'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _description,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Description (optional)',
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy || _vehicles!.isEmpty ? null : _save,
                  child: Text(_busy ? 'Starting…' : 'Start service'),
                ),
              ],
            ),
          ),
        );
}
