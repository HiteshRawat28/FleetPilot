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

class DriverDashboardScreen extends StatefulWidget {
  const DriverDashboardScreen({super.key, required this.initialProfile});

  final DriverProfile initialProfile;

  @override
  State<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends State<DriverDashboardScreen> {
  DriverDashboard? _dashboard;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data =
          await context.read<ApiClient>().get('/driver/me/dashboard')
              as Map<String, dynamic>;
      if (mounted) {
        setState(() => _dashboard = DriverDashboard.fromJson(data));
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addExpense() async {
    final trips = _dashboard?.trips ?? const <Trip>[];
    if (trips.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'A trip assignment is required before adding expenses.',
          ),
        ),
      );
      return;
    }
    final result = await showModalBottomSheet<_ExpenseUploadResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ReceiptExpenseSheet(trips: trips),
    );
    if (result == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Receipt scanned: ${NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0).format(result.amount)} added to expenses.',
        ),
      ),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final dashboard = _dashboard;
    final profile = dashboard?.profile ?? widget.initialProfile;
    final activeTrip = dashboard?.trips
        .where((trip) => trip.status == 'DISPATCHED')
        .firstOrNull;
    return Scaffold(
      appBar: GlassAppBar(
        title: const Text('Driver workspace'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: _busy ? null : context.read<SessionController>().logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
          children: [
            PageHeader(
              eyebrow: 'Verified driver',
              title: 'Hello, ${profile.name}',
              description:
                  'View assigned work and send receipt expenses directly to your company portal.',
            ),
            if (_error != null) _InlineError(message: _error!, onRetry: _load),
            if (dashboard == null && _busy)
              const Padding(
                padding: EdgeInsets.all(48),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              _TripCard(trip: activeTrip),
              const SizedBox(height: 16),
              GlassCard(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Icon(
                        Icons.receipt_long_outlined,
                        size: 40,
                        color: AppColors.orange,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Add trip expense',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Take a clear receipt photo. OCR reads the total and date, then adds it automatically to Fuel & expenses.',
                      ),
                      const SizedBox(height: 18),
                      FilledButton.icon(
                        onPressed: _busy ? null : _addExpense,
                        icon: const Icon(Icons.document_scanner_outlined),
                        label: const Text('Scan expense receipt'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text(
                'Recent submissions',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 10),
              if (dashboard?.expenses.isEmpty ?? true)
                const GlassCard(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Text('No driver expenses submitted yet.'),
                  ),
                )
              else
                ...dashboard!.expenses.map((expense) => _ExpenseTile(expense)),
            ],
          ],
        ),
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({this.trip});

  final Trip? trip;

  @override
  Widget build(BuildContext context) => GlassCard(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: trip == null
          ? const Row(
              children: [
                Icon(Icons.route_outlined, color: AppColors.muted),
                SizedBox(width: 12),
                Expanded(child: Text('No active trip currently assigned.')),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.local_shipping_outlined),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Active trip ${trip!.tripNo}',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    const StatusBadge('DISPATCHED'),
                  ],
                ),
                const SizedBox(height: 14),
                Text('${trip!.source} → ${trip!.destination}'),
                const SizedBox(height: 5),
                Text(
                  '${trip!.vehicle.name} · ${trip!.vehicle.registrationNo}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
    ),
  );
}

class _ExpenseTile extends StatelessWidget {
  const _ExpenseTile(this.expense);

  final Expense expense;

  @override
  Widget build(BuildContext context) => GlassCard(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      leading: const CircleAvatar(
        backgroundColor: Color(0xFFFFE8CF),
        child: Icon(Icons.receipt_outlined, color: AppColors.orange),
      ),
      title: Text('${prettyStatus(expense.type)} · ${expense.vehicle.name}'),
      subtitle: Text(DateFormat('dd MMM yyyy').format(expense.date)),
      trailing: Text(
        NumberFormat.currency(
          locale: 'en_IN',
          symbol: '₹',
          decimalDigits: 0,
        ).format(expense.amount),
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
  );
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: AppColors.red.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      children: [
        const Icon(Icons.cloud_off_outlined, color: AppColors.red),
        const SizedBox(width: 10),
        Expanded(child: Text(message)),
        TextButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    ),
  );
}

class _ReceiptExpenseSheet extends StatefulWidget {
  const _ReceiptExpenseSheet({required this.trips});

  final List<Trip> trips;

  @override
  State<_ReceiptExpenseSheet> createState() => _ReceiptExpenseSheetState();
}

class _ReceiptExpenseSheetState extends State<_ReceiptExpenseSheet> {
  final _picker = ImagePicker();
  final _description = TextEditingController();
  XFile? _receipt;
  late String _vehicleId;
  String _type = 'OTHER';
  bool _busy = false;
  String? _error;

  List<Vehicle> get _vehicles {
    final vehicles = <String, Vehicle>{};
    for (final trip in widget.trips) {
      vehicles[trip.vehicle.id] = trip.vehicle;
    }
    return vehicles.values.toList();
  }

  @override
  void initState() {
    super.initState();
    final active = widget.trips
        .where((trip) => trip.status == 'DISPATCHED')
        .firstOrNull;
    _vehicleId = (active ?? widget.trips.first).vehicle.id;
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    try {
      final file = await _picker.pickImage(
        source: source,
        imageQuality: 92,
        maxWidth: 2600,
      );
      if (file == null) return;
      if (await file.length() > 20 * 1024 * 1024) {
        setState(() => _error = 'Receipt image must be 20 MB or smaller.');
        return;
      }
      setState(() {
        _receipt = file;
        _error = null;
      });
    } catch (_) {
      setState(
        () => _error = 'The camera could not open. Check app permissions.',
      );
    }
  }

  Future<void> _submit() async {
    if (_receipt == null) {
      setState(() => _error = 'Take or choose a receipt photo first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response =
          await context.read<ApiClient>().multipart(
                '/driver/me/expenses/receipt',
                files: {'receipt': _receipt!.path},
                fields: {
                  'vehicleId': _vehicleId,
                  'type': _type,
                  if (_description.text.trim().isNotEmpty)
                    'description': _description.text.trim(),
                },
              )
              as Map<String, dynamic>;
      final expense = response['expense'] as Map<String, dynamic>;
      if (mounted) {
        Navigator.pop(context, _ExpenseUploadResult(number(expense['amount'])));
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      12,
      20,
      20 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.muted.withValues(alpha: .35),
                borderRadius: BorderRadius.circular(9),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Scan expense receipt',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 6),
          const Text(
            'OCR will read the total and add the transaction automatically.',
          ),
          const SizedBox(height: 18),
          if (_receipt != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(
                File(_receipt!.path),
                height: 180,
                fit: BoxFit.cover,
              ),
            ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _pick(ImageSource.camera),
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Camera'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _pick(ImageSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Gallery'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _vehicleId,
            decoration: const InputDecoration(labelText: 'Assigned vehicle'),
            items: _vehicles
                .map(
                  (vehicle) => DropdownMenuItem(
                    value: vehicle.id,
                    child: Text('${vehicle.name} · ${vehicle.registrationNo}'),
                  ),
                )
                .toList(),
            onChanged: _busy
                ? null
                : (value) => setState(() => _vehicleId = value ?? _vehicleId),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Expense category'),
            items: const ['TOLL', 'REPAIR', 'INSURANCE', 'OTHER']
                .map(
                  (type) => DropdownMenuItem(
                    value: type,
                    child: Text(prettyStatus(type)),
                  ),
                )
                .toList(),
            onChanged: _busy
                ? null
                : (value) => setState(() => _type = value ?? 'OTHER'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            enabled: !_busy,
            decoration: const InputDecoration(
              labelText: 'Note (optional)',
              prefixIcon: Icon(Icons.notes_outlined),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(
                color: AppColors.red,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.document_scanner_outlined),
            label: Text(_busy ? 'Scanning receipt…' : 'Scan and add expense'),
          ),
        ],
      ),
    ),
  );
}

class _ExpenseUploadResult {
  const _ExpenseUploadResult(this.amount);

  final double amount;
}
