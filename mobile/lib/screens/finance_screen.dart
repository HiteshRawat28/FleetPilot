import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});
  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  List<FuelLog>? _fuel;
  List<Expense>? _expenses;
  List<Vehicle> _vehicles = [];
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final api = context.read<ApiClient>();
      final results = await Future.wait([
        api.get('/finance'),
        api.get('/vehicles'),
      ]);
      final data = results[0] as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _fuel = (data['fuelLogs'] as List<dynamic>)
              .map((item) => FuelLog.fromJson(item as Map<String, dynamic>))
              .toList();
          _expenses = (data['expenses'] as List<dynamic>)
              .map((item) => Expense.fromJson(item as Map<String, dynamic>))
              .toList();
          _vehicles = (results[1] as List<dynamic>)
              .map((item) => Vehicle.fromJson(item as Map<String, dynamic>))
              .toList();
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _add(bool fuel) async {
    final saved = await showAppSheet<bool>(
      context,
      FinanceForm(fuel: fuel, vehicles: _vehicles),
    );
    if (saved == true) {
      await _load();
      if (mounted) {
        showMessage(context, fuel ? 'Fuel log saved' : 'Expense saved');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<SessionController>().user!.role;
    final canManage =
        role.hasAdministrativeAccess ||
        role == UserRole.fleetManager ||
        role == UserRole.financialAnalyst;
    if (_error != null) {
      return Scaffold(
        appBar: const GlassAppBar(title: Text('Fuel & expenses')),
        body: ErrorView(message: _error!, onRetry: _load),
      );
    }
    if (_fuel == null || _expenses == null) {
      return Scaffold(
        appBar: const GlassAppBar(title: Text('Fuel & expenses')),
        body: const LoadingView(),
      );
    }
    final fuelTotal = _fuel!.fold<double>(0, (sum, item) => sum + item.cost);
    final expenseTotal = _expenses!.fold<double>(
      0,
      (sum, item) => sum + item.amount,
    );
    return Scaffold(
      appBar: const GlassAppBar(title: Text('Fuel & expenses')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            PageHeader(
              eyebrow: 'Financial operations',
              title: 'Operating spend',
              description:
                  '${_fuel!.length + _expenses!.length} recorded transactions.',
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(
                    child: _Summary(
                      label: 'Fuel',
                      value: moneyFormat.format(fuelTotal),
                      icon: Icons.local_gas_station_outlined,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Summary(
                      label: 'Other',
                      value: moneyFormat.format(expenseTotal),
                      icon: Icons.receipt_long_outlined,
                    ),
                  ),
                ],
              ),
            ),
            if (canManage)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => _add(true),
                        icon: const Icon(Icons.local_gas_station_outlined),
                        label: const Text('Fuel log'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _add(false),
                        icon: const Icon(Icons.add),
                        label: const Text('Expense'),
                      ),
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
              child: Text(
                'Recent fuel logs',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            if (_fuel!.isEmpty)
              const EmptyView(label: 'No fuel logs')
            else
              ..._fuel!.map(
                (item) => _LedgerLine(
                  icon: Icons.local_gas_station_outlined,
                  title: item.vehicle.name,
                  subtitle:
                      '${item.liters.toStringAsFixed(1)} L · ${dateFormat.format(item.date)}',
                  amount: item.cost,
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
              child: Text(
                'Other expenses',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            if (_expenses!.isEmpty)
              const EmptyView(label: 'No other expenses')
            else
              ..._expenses!.map(
                (item) => _LedgerLine(
                  icon: Icons.receipt_long_outlined,
                  title: prettyStatus(item.type),
                  subtitle:
                      '${item.vehicle.name} · ${item.description ?? dateFormat.format(item.date)}',
                  amount: item.amount,
                ),
              ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.label,
    required this.value,
    required this.icon,
  });
  final String label, value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => GlassCard(
    child: Padding(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.orange),
          const SizedBox(height: 16),
          Text(
            value,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          Text(label),
        ],
      ),
    ),
  );
}

class _LedgerLine extends StatelessWidget {
  const _LedgerLine({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.amount,
  });
  final IconData icon;
  final String title, subtitle;
  final double amount;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 20),
    padding: const EdgeInsets.symmetric(vertical: 13),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: AppColors.line)),
    ),
    child: Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .46),
            borderRadius: BorderRadius.circular(7),
          ),
          child: Icon(icon, color: AppColors.blue, size: 20),
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
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
        Text(
          moneyFormat.format(amount),
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            color: AppColors.ink,
          ),
        ),
      ],
    ),
  );
}

class FinanceForm extends StatefulWidget {
  const FinanceForm({super.key, required this.fuel, required this.vehicles});
  final bool fuel;
  final List<Vehicle> vehicles;
  @override
  State<FinanceForm> createState() => _FinanceFormState();
}

class _FinanceFormState extends State<FinanceForm> {
  final _formKey = GlobalKey<FormState>();
  final _first = TextEditingController(),
      _second = TextEditingController(),
      _description = TextEditingController(),
      _odometer = TextEditingController();
  String? _vehicleId, _error;
  String _type = 'TOLL';
  bool _busy = false;
  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = widget.fuel
        ? {
            'vehicleId': _vehicleId,
            'liters': double.parse(_first.text),
            'cost': double.parse(_second.text),
            if (_odometer.text.isNotEmpty)
              'odometerKm': double.parse(_odometer.text),
          }
        : {
            'vehicleId': _vehicleId,
            'type': _type,
            'amount': double.parse(_first.text),
            'description': _description.text.trim(),
          };
    try {
      await context.read<ApiClient>().post(
        widget.fuel ? '/fuel' : '/expenses',
        body,
      );
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
            widget.fuel ? 'Add fuel log' : 'Add fleet expense',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 6),
          Text(
            widget.fuel
                ? 'Capture volume, cost and optional odometer.'
                : 'Record non-fuel operating spend.',
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.red)),
          ],
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            initialValue: _vehicleId,
            decoration: const InputDecoration(labelText: 'Vehicle'),
            items: widget.vehicles
                .map(
                  (vehicle) => DropdownMenuItem(
                    value: vehicle.id,
                    child: Text(vehicle.name),
                  ),
                )
                .toList(),
            onChanged: (value) => _vehicleId = value,
            validator: (value) => value == null ? 'Select a vehicle' : null,
          ),
          if (widget.fuel) ...[
            const SizedBox(height: 12),
            TextFormField(
              controller: _first,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Liters'),
              validator: positiveNumber,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _second,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Total cost'),
              validator: positiveNumber,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _odometer,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Odometer (optional)',
              ),
            ),
          ] else ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'Expense type'),
              items: ['TOLL', 'REPAIR', 'INSURANCE', 'OTHER']
                  .map(
                    (value) => DropdownMenuItem(
                      value: value,
                      child: Text(prettyStatus(value)),
                    ),
                  )
                  .toList(),
              onChanged: (value) => _type = value!,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _first,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Amount'),
              validator: positiveNumber,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _description,
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy || widget.vehicles.isEmpty ? null : _save,
            child: Text(_busy ? 'Saving…' : 'Save transaction'),
          ),
        ],
      ),
    ),
  );
}
