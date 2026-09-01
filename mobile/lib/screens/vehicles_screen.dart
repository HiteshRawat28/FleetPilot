import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({super.key});
  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  List<Vehicle>? _vehicles;
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
          await context.read<ApiClient>().get('/vehicles') as List<dynamic>;
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

  Future<void> _edit([Vehicle? vehicle]) async {
    final saved = await showAppSheet<bool>(
      context,
      VehicleForm(vehicle: vehicle),
    );
    if (saved == true) {
      await _load();
      if (mounted) {
        showMessage(
          context,
          vehicle == null ? 'Vehicle added' : 'Vehicle updated',
        );
      }
    }
  }

  Future<void> _delete(Vehicle vehicle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete vehicle?'),
        content: Text(
          '${vehicle.name} (${vehicle.registrationNo}) will be permanently removed.',
        ),
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
      await context.read<ApiClient>().delete('/vehicles/${vehicle.id}');
      await _load();
      if (mounted) showMessage(context, 'Vehicle deleted');
    } catch (error) {
      if (mounted) showMessage(context, error.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canManage =
        context.watch<SessionController>().user!.role ==
            UserRole.fleetManager ||
        context.watch<SessionController>().user!.role.hasAdministrativeAccess;
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_vehicles == null) return const LoadingView();
    final filtered = _vehicles!.where((vehicle) {
      final needle = _query.toLowerCase();
      return vehicle.name.toLowerCase().contains(needle) ||
          vehicle.registrationNo.toLowerCase().contains(needle);
    }).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          PageHeader(
            eyebrow: 'Fleet registry',
            title: 'Vehicles',
            description:
                '${_vehicles!.length} fleet assets with live readiness.',
            action: canManage
                ? IconButton.filled(
                    tooltip: 'Add vehicle',
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
                hintText: 'Search name or registration',
                prefixIcon: Icon(Icons.search),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: filtered.isEmpty
                ? const EmptyView(
                    label: 'No matching vehicles',
                    icon: Icons.local_shipping_outlined,
                  )
                : Column(
                    children: filtered
                        .map(
                          (vehicle) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _VehicleCard(
                              vehicle: vehicle,
                              canManage: canManage,
                              onEdit: () => _edit(vehicle),
                              onDelete: () => _delete(vehicle),
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

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({
    required this.vehicle,
    required this.canManage,
    required this.onEdit,
    required this.onDelete,
  });
  final Vehicle vehicle;
  final bool canManage;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) => GlassCard(
    child: Padding(
      padding: const EdgeInsets.all(15),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppColors.orangeSoft.withValues(alpha: .72),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Icon(
                  Icons.local_shipping_outlined,
                  color: AppColors.orange,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      vehicle.name,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text('${vehicle.registrationNo} · ${vehicle.type}'),
                  ],
                ),
              ),
              StatusBadge(vehicle.status),
            ],
          ),
          const Divider(height: 24),
          Row(
            children: [
              Expanded(
                child: _Detail(
                  label: 'Capacity',
                  value: '${vehicle.capacityKg.toStringAsFixed(0)} kg',
                ),
              ),
              Expanded(
                child: _Detail(
                  label: 'Odometer',
                  value: '${vehicle.odometerKm.toStringAsFixed(0)} km',
                ),
              ),
              Expanded(
                child: _Detail(label: 'Region', value: vehicle.region),
              ),
              if (canManage)
                PopupMenuButton<String>(
                  tooltip: 'Vehicle actions',
                  onSelected: (value) =>
                      value == 'edit' ? onEdit() : onDelete(),
                  itemBuilder: (_) => const [
                    PopupMenuItem(
                      value: 'edit',
                      child: ListTile(
                        leading: Icon(Icons.edit_outlined),
                        title: Text('Edit'),
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: ListTile(
                        leading: Icon(
                          Icons.delete_outline,
                          color: AppColors.red,
                        ),
                        title: Text('Delete'),
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _Detail extends StatelessWidget {
  const _Detail({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: Theme.of(context).textTheme.bodySmall),
      Text(
        value,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
      ),
    ],
  );
}

class VehicleForm extends StatefulWidget {
  const VehicleForm({super.key, this.vehicle});
  final Vehicle? vehicle;
  @override
  State<VehicleForm> createState() => _VehicleFormState();
}

class _VehicleFormState extends State<VehicleForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _registration;
  late final TextEditingController _name;
  late final TextEditingController _capacity;
  late final TextEditingController _odometer;
  late final TextEditingController _cost;
  late final TextEditingController _region;
  late String _type;
  late String _status;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final vehicle = widget.vehicle;
    _registration = TextEditingController(text: vehicle?.registrationNo);
    _name = TextEditingController(text: vehicle?.name);
    _capacity = TextEditingController(
      text: vehicle?.capacityKg.toStringAsFixed(0),
    );
    _odometer = TextEditingController(
      text: vehicle?.odometerKm.toStringAsFixed(0) ?? '0',
    );
    _cost = TextEditingController(
      text: vehicle?.acquisitionCost.toStringAsFixed(0),
    );
    _region = TextEditingController(text: vehicle?.region ?? 'Central');
    _type = vehicle?.type ?? 'Truck';
    _status = vehicle?.status ?? 'AVAILABLE';
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = {
      'registrationNo': _registration.text.trim().toUpperCase(),
      'name': _name.text.trim(),
      'type': _type,
      'capacityKg': double.parse(_capacity.text),
      'odometerKm': double.parse(_odometer.text),
      'acquisitionCost': double.parse(_cost.text),
      'status': _status,
      'region': _region.text.trim(),
    };
    try {
      final api = context.read<ApiClient>();
      if (widget.vehicle == null) {
        await api.post('/vehicles', body);
      } else {
        await api.put('/vehicles/${widget.vehicle!.id}', body);
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
            widget.vehicle == null ? 'Add fleet vehicle' : 'Edit vehicle',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 6),
          const Text('Vehicle identity, capacity and operating details.'),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.red)),
          ],
          const SizedBox(height: 20),
          TextFormField(
            controller: _registration,
            decoration: const InputDecoration(labelText: 'Registration number'),
            validator: requiredText,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _name,
            decoration: const InputDecoration(
              labelText: 'Vehicle name / model',
            ),
            validator: requiredText,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Vehicle type'),
            items: ['Truck', 'Van', 'Mini Truck', 'Trailer']
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) => _type = value!,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _capacity,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Capacity (kg)'),
                  validator: positiveNumber,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _odometer,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Odometer (km)'),
                  validator: (value) => double.tryParse(value ?? '') == null
                      ? 'Enter a number'
                      : null,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _cost,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Acquisition cost'),
            validator: (value) =>
                double.tryParse(value ?? '') == null ? 'Enter a number' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _region,
            decoration: const InputDecoration(labelText: 'Region'),
            validator: requiredText,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: ['AVAILABLE', 'ON_TRIP', 'IN_SHOP', 'RETIRED']
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
            child: Text(_busy ? 'Saving…' : 'Save vehicle'),
          ),
        ],
      ),
    ),
  );
}
