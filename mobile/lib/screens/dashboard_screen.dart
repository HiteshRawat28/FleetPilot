import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result =
          await context.read<ApiClient>().get('/dashboard')
              as Map<String, dynamic>;
      if (mounted) setState(() => _data = result);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_data == null) return const LoadingView();
    final kpis = _data!['kpis'] as Map<String, dynamic>;
    final recent = (_data!['recentTrips'] as List<dynamic>)
        .map((item) => Trip.fromJson(item as Map<String, dynamic>))
        .toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const PageHeader(
            eyebrow: 'Operations command',
            title: 'Fleet overview',
            description: 'Live readiness, assignments and operating status.',
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: GridView.count(
              crossAxisCount: MediaQuery.sizeOf(context).width > 700 ? 4 : 2,
              childAspectRatio: 1.2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                MetricCard(
                  label: 'Active vehicles',
                  value: '${kpis['activeVehicles']}',
                  icon: Icons.local_shipping_outlined,
                  color: AppColors.blue,
                ),
                MetricCard(
                  label: 'Available now',
                  value: '${kpis['availableVehicles']}',
                  icon: Icons.check_circle_outline,
                  color: AppColors.green,
                ),
                MetricCard(
                  label: 'Active trips',
                  value: '${kpis['activeTrips']}',
                  icon: Icons.route_outlined,
                  color: AppColors.orange,
                ),
                MetricCard(
                  label: 'Utilization',
                  value: '${kpis['fleetUtilization']}%',
                  icon: Icons.speed_outlined,
                  color: AppColors.teal,
                ),
                MetricCard(
                  label: 'In maintenance',
                  value: '${kpis['inMaintenance']}',
                  icon: Icons.build_outlined,
                  color: AppColors.red,
                ),
                MetricCard(
                  label: 'Pending trips',
                  value: '${kpis['pendingTrips']}',
                  icon: Icons.schedule_outlined,
                  color: AppColors.orange,
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: SectionCard(
              title: 'Recent trips',
              subtitle: 'Latest dispatch activity across the network',
              child: recent.isEmpty
                  ? const EmptyView(
                      label: 'No trip activity yet',
                      icon: Icons.route_outlined,
                    )
                  : Column(
                      children: recent
                          .map((trip) => _TripLine(trip: trip))
                          .toList(),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TripLine extends StatelessWidget {
  const _TripLine({required this.trip});
  final Trip trip;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 12),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: AppColors.line)),
    ),
    child: Row(
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .46),
            borderRadius: BorderRadius.circular(7),
          ),
          child: const Icon(Icons.route, color: AppColors.blue),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${trip.source} → ${trip.destination}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              Text(
                '${trip.tripNo} · ${trip.vehicle.name}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        StatusBadge(trip.status),
      ],
    ),
  );
}
