import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_theme.dart';
import '../core/session_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import 'analytics_screen.dart';
import 'finance_screen.dart';
import 'maintenance_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key, required this.user});
  final AppUser user;

  void _open(BuildContext context, Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Text(
          'More operations',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 4),
        Text(
          'Maintenance, finance, reporting and account access.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 20),
        _MenuTile(
          icon: Icons.build_outlined,
          color: AppColors.orange,
          title: 'Maintenance',
          subtitle: 'Workshop jobs and service history',
          onTap: () => _open(context, const MaintenanceScreen()),
        ),
        _MenuTile(
          icon: Icons.account_balance_wallet_outlined,
          color: AppColors.teal,
          title: 'Fuel & expenses',
          subtitle: 'Operating spend and transaction logs',
          onTap: () => _open(context, const FinanceScreen()),
        ),
        _MenuTile(
          icon: Icons.bar_chart_outlined,
          color: AppColors.blue,
          title: 'Reports & analytics',
          subtitle: 'Efficiency, cost, ROI and CSV export',
          onTap: () => _open(context, const AnalyticsScreen()),
        ),
        const SizedBox(height: 22),
        Text('Account', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: Colors.white.withValues(alpha: .62),
                      foregroundColor: AppColors.orange,
                      child: Text(
                        user.name[0].toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.name,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(user.email),
                          Text(
                            user.role.label,
                            style: const TextStyle(
                              color: AppColors.orange,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const Divider(height: 28),
                _PermissionLine(
                  label: 'Manage fleet',
                  allowed: user.role == UserRole.fleetManager,
                ),
                _PermissionLine(
                  label: 'Operate trips',
                  allowed:
                      user.role == UserRole.fleetManager ||
                      user.role == UserRole.dispatcher,
                ),
                _PermissionLine(
                  label: 'Manage driver safety',
                  allowed:
                      user.role == UserRole.fleetManager ||
                      user.role == UserRole.safetyOfficer,
                ),
                _PermissionLine(
                  label: 'Record finances',
                  allowed:
                      user.role == UserRole.fleetManager ||
                      user.role == UserRole.financialAnalyst,
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => context.read<SessionController>().logout(),
                    icon: const Icon(Icons.logout),
                    label: const Text('Sign out'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final String title, subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: GlassCard(
      child: ListTile(
        minVerticalPadding: 14,
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: color.withValues(alpha: .1),
            borderRadius: BorderRadius.circular(7),
            border: Border.all(color: color.withValues(alpha: .1)),
          ),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    ),
  );
}

class _PermissionLine extends StatelessWidget {
  const _PermissionLine({required this.label, required this.allowed});
  final String label;
  final bool allowed;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        Icon(
          allowed ? Icons.check_circle_outline : Icons.remove_circle_outline,
          size: 19,
          color: allowed ? AppColors.green : AppColors.muted,
        ),
        const SizedBox(width: 9),
        Text(label),
        const Spacer(),
        Text(
          allowed ? 'Allowed' : 'View only',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
  );
}
