import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});
  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  Map<String, dynamic>? _summary;
  List<AnalyticsVehicle>? _vehicles;
  String? _error;
  bool _exporting = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final data =
          await context.read<ApiClient>().get('/analytics')
              as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _summary = data['summary'] as Map<String, dynamic>;
          _vehicles = (data['byVehicle'] as List<dynamic>)
              .map(
                (item) =>
                    AnalyticsVehicle.fromJson(item as Map<String, dynamic>),
              )
              .toList();
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final csv = await context.read<ApiClient>().downloadText(
        '/analytics/export.csv',
      );
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/transitops-analytics.csv');
      await file.writeAsString(csv);
      if (!mounted) return;
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path)],
          text: 'TransitOps fleet analytics',
          sharePositionOrigin: box == null
              ? null
              : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (error) {
      if (mounted) showMessage(context, error.toString(), error: true);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: GlassAppBar(
        title: const Text('Reports & analytics'),
        actions: [
          IconButton(
            tooltip: 'Export CSV',
            onPressed: _exporting || _summary == null ? null : _export,
            icon: _exporting
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.ios_share_outlined),
          ),
        ],
      ),
      body: _error != null
          ? ErrorView(message: _error!, onRetry: _load)
          : _summary == null
          ? const LoadingView()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const PageHeader(
                    eyebrow: 'Performance intelligence',
                    title: 'Fleet analytics',
                    description:
                        'Costs, efficiency, utilization and vehicle return.',
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: GridView.count(
                      crossAxisCount: MediaQuery.sizeOf(context).width > 700
                          ? 4
                          : 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      childAspectRatio: 1.2,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      children: [
                        MetricCard(
                          label: 'Fuel efficiency',
                          value:
                              '${number(_summary!['fuelEfficiency']).toStringAsFixed(1)} km/L',
                          icon: Icons.local_gas_station_outlined,
                          color: AppColors.blue,
                        ),
                        MetricCard(
                          label: 'Fleet utilization',
                          value:
                              '${number(_summary!['fleetUtilization']).toStringAsFixed(0)}%',
                          icon: Icons.speed_outlined,
                          color: AppColors.teal,
                        ),
                        MetricCard(
                          label: 'Operating cost',
                          value: moneyFormat.format(
                            number(_summary!['operationalCost']),
                          ),
                          icon: Icons.payments_outlined,
                          color: AppColors.orange,
                        ),
                        MetricCard(
                          label: 'Vehicle ROI',
                          value:
                              '${number(_summary!['vehicleRoi']).toStringAsFixed(1)}%',
                          icon: Icons.trending_up,
                          color: AppColors.green,
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
                    child: SectionCard(
                      title: 'Cost by vehicle',
                      subtitle: 'Operational spend and return',
                      child: _vehicles!.isEmpty
                          ? const EmptyView(label: 'No vehicle analytics yet')
                          : Column(
                              children: _vehicles!
                                  .map(
                                    (vehicle) => _VehicleAnalytics(
                                      vehicle: vehicle,
                                      maxCost: _vehicles!.fold<double>(
                                        1,
                                        (max, item) =>
                                            item.operationalCost > max
                                            ? item.operationalCost
                                            : max,
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _VehicleAnalytics extends StatelessWidget {
  const _VehicleAnalytics({required this.vehicle, required this.maxCost});
  final AnalyticsVehicle vehicle;
  final double maxCost;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    vehicle.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  Text(
                    vehicle.registrationNo,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  moneyFormat.format(vehicle.operationalCost),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  '${vehicle.roi.toStringAsFixed(1)}% ROI',
                  style: TextStyle(
                    color: vehicle.roi >= 0 ? AppColors.green : AppColors.red,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: LinearProgressIndicator(
            value: vehicle.operationalCost / maxCost,
            minHeight: 7,
            backgroundColor: Colors.white.withValues(alpha: .46),
            color: AppColors.orange,
          ),
        ),
      ],
    ),
  );
}
