import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class TripsScreen extends StatefulWidget {
  const TripsScreen({super.key});
  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends State<TripsScreen> {
  List<Trip>? _trips;
  String? _error;
  String _filter = 'ALL';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final raw =
          await context.read<ApiClient>().get('/trips') as List<dynamic>;
      if (mounted) {
        setState(
          () => _trips = raw
              .map((item) => Trip.fromJson(item as Map<String, dynamic>))
              .toList(),
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _create() async {
    final saved = await showAppSheet<bool>(context, const TripForm());
    if (saved == true) {
      await _load();
      if (mounted) showMessage(context, 'Draft trip created');
    }
  }

  Future<void> _action(Trip trip, String action) async {
    if (action == 'complete') {
      final saved = await showAppSheet<bool>(
        context,
        CompleteTripForm(trip: trip),
      );
      if (saved == true) {
        await _load();
        if (mounted) showMessage(context, '${trip.tripNo} completed');
      }
      return;
    }
    if (action == 'cancel') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Cancel trip?'),
          content: Text(
            '${trip.tripNo} will be cancelled${trip.status == 'DISPATCHED' ? ' and its vehicle and driver will be released' : ''}.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep trip'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Cancel trip'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    try {
      await context.read<ApiClient>().post('/trips/${trip.id}/$action');
      await _load();
      if (mounted) {
        showMessage(
          context,
          action == 'dispatch'
              ? '${trip.tripNo} dispatched'
              : '${trip.tripNo} cancelled',
        );
      }
    } catch (error) {
      if (mounted) showMessage(context, error.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<SessionController>().user!.role;
    final canOperate =
        role.hasAdministrativeAccess ||
        role == UserRole.fleetManager ||
        role == UserRole.dispatcher;
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_trips == null) return const LoadingView();
    final shown = _filter == 'ALL'
        ? _trips!
        : _trips!.where((trip) => trip.status == _filter).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          PageHeader(
            eyebrow: 'Dispatch center',
            title: 'Trip operations',
            description:
                '${_trips!.where((trip) => trip.status == 'DISPATCHED').length} active assignments in the network.',
            action: canOperate
                ? IconButton.filled(
                    tooltip: 'Create trip',
                    onPressed: _create,
                    icon: const Icon(Icons.add),
                  )
                : null,
          ),
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              children: ['ALL', 'DRAFT', 'DISPATCHED', 'COMPLETED', 'CANCELLED']
                  .map(
                    (value) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _TripStatusFilter(
                        value: value,
                        selected: _filter == value,
                        onSelected: () => setState(() => _filter = value),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: shown.isEmpty
                ? const EmptyView(
                    label: 'No trips in this stage',
                    icon: Icons.route_outlined,
                  )
                : Column(
                    children: shown
                        .map(
                          (trip) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _TripCard(
                              trip: trip,
                              canOperate: canOperate,
                              onAction: (action) => _action(trip, action),
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

class _TripStatusFilter extends StatelessWidget {
  const _TripStatusFilter({
    required this.value,
    required this.selected,
    required this.onSelected,
  });

  final String value;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    final color = value == 'ALL' ? AppColors.orange : statusColor(value);
    return ChoiceChip(
      selected: selected,
      showCheckmark: false,
      avatar: Icon(
        value == 'ALL' ? Icons.apps_rounded : Icons.circle,
        size: value == 'ALL' ? 17 : 9,
        color: color,
      ),
      label: Text(
        prettyStatus(value),
        style: TextStyle(
          color: selected ? color : AppColors.ink,
          fontWeight: FontWeight.w800,
        ),
      ),
      backgroundColor: Colors.white.withValues(alpha: .82),
      selectedColor: color.withValues(alpha: .14),
      side: BorderSide(
        color: selected ? color.withValues(alpha: .32) : AppColors.glassBorder,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
      onSelected: (_) => onSelected(),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({
    required this.trip,
    required this.canOperate,
    required this.onAction,
  });
  final Trip trip;
  final bool canOperate;
  final ValueChanged<String> onAction;
  @override
  Widget build(BuildContext context) => GlassCard(
    child: Padding(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trip.tripNo,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      dateFormat.format(trip.createdAt),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              StatusBadge(trip.status),
            ],
          ),
          const SizedBox(height: 15),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .46),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.radio_button_checked,
                  color: AppColors.green,
                  size: 17,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    trip.source,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                const Icon(
                  Icons.arrow_forward,
                  size: 18,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    trip.destination,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 13),
          Row(
            children: [
              Expanded(
                child: _Assignment(
                  icon: Icons.local_shipping_outlined,
                  title: trip.vehicle.name,
                  subtitle: trip.vehicle.registrationNo,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Assignment(
                  icon: Icons.person_outline,
                  title: trip.driver.name,
                  subtitle: 'Score ${trip.driver.safetyScore}',
                ),
              ),
            ],
          ),
          const Divider(height: 24),
          Row(
            children: [
              Text(
                '${trip.cargoWeightKg.toStringAsFixed(0)} kg',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 16),
              Text('${trip.plannedDistanceKm.toStringAsFixed(0)} km'),
              const Spacer(),
              if (canOperate && trip.status == 'DRAFT') ...[
                TextButton(
                  onPressed: () => onAction('cancel'),
                  child: const Text('Cancel'),
                ),
                FilledButton.tonalIcon(
                  onPressed: () => onAction('dispatch'),
                  icon: const Icon(Icons.send_outlined, size: 17),
                  label: const Text('Dispatch'),
                ),
              ],
              if (canOperate && trip.status == 'DISPATCHED') ...[
                TextButton(
                  onPressed: () => onAction('cancel'),
                  child: const Text('Cancel'),
                ),
                FilledButton.tonalIcon(
                  onPressed: () => onAction('complete'),
                  icon: const Icon(Icons.check, size: 17),
                  label: const Text('Complete'),
                ),
              ],
            ],
          ),
        ],
      ),
    ),
  );
}

class _Assignment extends StatelessWidget {
  const _Assignment({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 20, color: AppColors.blue),
      const SizedBox(width: 7),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    ],
  );
}

class TripForm extends StatefulWidget {
  const TripForm({super.key});
  @override
  State<TripForm> createState() => _TripFormState();
}

class _TripFormState extends State<TripForm> {
  final _formKey = GlobalKey<FormState>();
  final _source = TextEditingController(),
      _destination = TextEditingController(),
      _cargo = TextEditingController(),
      _distance = TextEditingController(),
      _revenue = TextEditingController(text: '0');
  List<Vehicle>? _vehicles;
  List<Driver>? _drivers;
  String? _vehicleId, _driverId, _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadResources();
  }

  Future<void> _loadResources() async {
    try {
      final api = context.read<ApiClient>();
      final results = await Future.wait([
        api.get('/vehicles/available'),
        api.get('/drivers/available'),
      ]);
      if (mounted) {
        setState(() {
          _vehicles = (results[0] as List<dynamic>)
              .map((item) => Vehicle.fromJson(item as Map<String, dynamic>))
              .toList();
          _drivers = (results[1] as List<dynamic>)
              .map((item) => Driver.fromJson(item as Map<String, dynamic>))
              .toList();
        });
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
      await context.read<ApiClient>().post('/trips', {
        'source': _source.text.trim(),
        'destination': _destination.text.trim(),
        'vehicleId': _vehicleId,
        'driverId': _driverId,
        'cargoWeightKg': double.parse(_cargo.text),
        'plannedDistanceKm': double.parse(_distance.text),
        'revenue': double.parse(_revenue.text),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_vehicles == null || _drivers == null) {
      return const SizedBox(height: 360, child: LoadingView());
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Plan a new trip',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 6),
            const Text(
              'Only eligible vehicles and licensed drivers are shown.',
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.red)),
            ],
            if (_vehicles!.isEmpty || _drivers!.isEmpty) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.orangeSoft.withValues(alpha: .72),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'A trip needs at least one available vehicle and one eligible driver.',
                ),
              ),
            ],
            const SizedBox(height: 20),
            TextFormField(
              controller: _source,
              decoration: const InputDecoration(labelText: 'Source'),
              validator: requiredText,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _destination,
              decoration: const InputDecoration(labelText: 'Destination'),
              validator: requiredText,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _vehicleId,
              decoration: const InputDecoration(labelText: 'Available vehicle'),
              items: _vehicles!
                  .map(
                    (vehicle) => DropdownMenuItem(
                      value: vehicle.id,
                      child: Text(
                        '${vehicle.name} · ${vehicle.capacityKg.toStringAsFixed(0)} kg',
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (value) => _vehicleId = value,
              validator: (value) => value == null ? 'Select a vehicle' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _driverId,
              decoration: const InputDecoration(labelText: 'Eligible driver'),
              items: _drivers!
                  .map(
                    (driver) => DropdownMenuItem(
                      value: driver.id,
                      child: Text(
                        '${driver.name} · Score ${driver.safetyScore}',
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (value) => _driverId = value,
              validator: (value) => value == null ? 'Select a driver' : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _cargo,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Cargo (kg)'),
                    validator: positiveNumber,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _distance,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Distance (km)',
                    ),
                    validator: positiveNumber,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _revenue,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Expected revenue'),
              validator: (value) => double.tryParse(value ?? '') == null
                  ? 'Enter a number'
                  : null,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy || _vehicles!.isEmpty || _drivers!.isEmpty
                  ? null
                  : _save,
              child: Text(_busy ? 'Creating…' : 'Create draft'),
            ),
          ],
        ),
      ),
    );
  }
}

class CompleteTripForm extends StatefulWidget {
  const CompleteTripForm({super.key, required this.trip});
  final Trip trip;
  @override
  State<CompleteTripForm> createState() => _CompleteTripFormState();
}

class _CompleteTripFormState extends State<CompleteTripForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _odometer, _fuel;
  bool _busy = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _odometer = TextEditingController(
      text: (widget.trip.vehicle.odometerKm + widget.trip.plannedDistanceKm)
          .toStringAsFixed(0),
    );
    _fuel = TextEditingController();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context
          .read<ApiClient>()
          .post('/trips/${widget.trip.id}/complete', {
            'finalOdometerKm': double.parse(_odometer.text),
            'fuelConsumedL': double.parse(_fuel.text),
          });
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
            'Complete ${widget.trip.tripNo}',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 6),
          const Text('Closing readings release both the vehicle and driver.'),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.red)),
          ],
          const SizedBox(height: 20),
          TextFormField(
            controller: _odometer,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Final odometer (km)'),
            validator: (value) {
              final number = double.tryParse(value ?? '');
              return number == null || number < widget.trip.vehicle.odometerKm
                  ? 'Cannot be below current odometer'
                  : null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _fuel,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Fuel consumed (liters)',
            ),
            validator: positiveNumber,
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: Text(_busy ? 'Completing…' : 'Complete trip'),
          ),
        ],
      ),
    ),
  );
}
